import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

if (config.storeType === 'remote') {
  throw new Error('[store] Remote storage is not implemented yet. Implement a store adapter in server/src/services/store.remote.js and set STORE_TYPE=remote.' );
}

/**
 * Lightweight JSON document store.
 *
 * For production you can swap this module for PostgreSQL / MongoDB / Redis.
 * Every function keeps the same shape so the rest of the server does not care.
 */
const DATA_DIR = path.dirname(config.dbFile);

// Re-entrancy guard. All I/O here is synchronous, so a nested `update()` can
// only happen when a mutator calls `update()` itself — which would read a
// half-written snapshot. Fail loudly instead of silently corrupting the file.
let updating = false;

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

function now() {
  return new Date().toISOString();
}

/** Block the current thread for `ms` (used only for filesystem retries). */
function sleepSync(ms) {
  const shared = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(shared, 0, 0, ms);
}

/** Fresh database state — no built-in/demo users. */
function seedData() {
  return {
    users: [],
    friends: [],
    friendRequests: [],
    followers: [],
    following: [],
    blocks: [],
    chats: [],
    messages: [],
    notifications: [],
    stories: [],
    highlights: [],
    refreshTokens: [],
    resetTokens: [],
    devices: [],
    settings: {},
    presence: {},
  };
}

function read() {
  ensureDirs();
  if (!fs.existsSync(config.dbFile)) return write(seedData());
  try {
    return JSON.parse(fs.readFileSync(config.dbFile, 'utf8'));
  } catch (err) {
    console.error('[store] Corrupt DB file, re-initialising.', err.message);
    return write(seedData());
  }
}

/**
 * Atomic-ish write.
 *
 * `rename()` is the fast path, but it fails with EPERM/EBUSY/EACCES when the
 * target lives in a folder that is being scanned or locked by another process
 * (OneDrive, an indexer, an antivirus, a second dev server). Retrying briefly
 * and then falling back to a direct truncating write keeps the app usable in
 * those environments instead of returning 500 on every write.
 */
function write(data) {
  ensureDirs();
  const json = JSON.stringify(data, null, 2);
  const tmp = `${config.dbFile}.${process.pid}.tmp`;

  const cleanup = () => {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* best effort */ }
  };

  try {
    fs.writeFileSync(tmp, json, 'utf8');
  } catch (err) {
    cleanup();
    console.error('[store] Failed to stage DB write.', err.message);
    throw err;
  }

  let lastErr = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.renameSync(tmp, config.dbFile);
      return data;
    } catch (err) {
      lastErr = err;
      // EPERM / EBUSY / EACCES are transient lock errors worth retrying.
      if (!['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY'].includes(err.code)) break;
      sleepSync(20 * (attempt + 1));
    }
  }

  // Fallback: the staged content is still valid, so write it in place.
  try {
    fs.writeFileSync(config.dbFile, json, 'utf8');
    cleanup();
    console.warn('[store] Atomic rename failed (%s); fell back to a direct write.', lastErr?.code || 'unknown');
    return data;
  } catch (err) {
    cleanup();
    console.error('[store] Failed to persist DB write.', err.message);
    throw err;
  }
}

/**
 * Run `mutator` on a consistent snapshot and persist the result.
 *
 * Synchronous by design: every caller in the codebase relies on the mutator
 * having finished (and side-effect variables captured in the closure being
 * populated) by the time `update()` returns. Node runs one request at a time
 * per tick, so no lock is required to keep the file consistent.
 */
export function update(mutator) {
  if (updating) {
    throw new Error('[store] Nested update() detected — mutators must not call update().');
  }
  updating = true;
  try {
    const data = read();
    const next = mutator(structuredClone(data));
    write(next);
    return next;
  } finally {
    updating = false;
  }
}

/** Read-only snapshot. */
export function getData() {
  return read();
}

/** Create a unique id with an optional prefix. */
export function genId(prefix = 'id') {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function hashEmail(email) {
  return Buffer.from(String(email).trim().toLowerCase()).toString('base64url');
}

export { now };