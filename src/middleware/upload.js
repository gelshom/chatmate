import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { config } from '../config.js';
import { ApiError } from './error.js';

fs.mkdirSync(config.uploadDir, { recursive: true });

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const AUDIO_TYPES = ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp4'];
const AVATAR_TYPES = IMAGE_TYPES.filter((type) => type !== 'image/svg+xml');
const FILE_TYPES = [
  'application/pdf',
  'application/zip',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/json',
  'application/x-7z-compressed',
  'application/x-rar-compressed',
  'application/x-tar',
  'application/gzip',
  'application/octet-stream',
];

const EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'audio/mpeg': '.mp3',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/webm': '.weba',
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'text/plain': '.txt',
  'application/json': '.json',
};

function extFor(file) {
  return EXT[file.mimetype] || `.${String(file.originalname || 'file').split('.').pop().toLowerCase() || 'bin'}`;
}

/** Upload "kinds" map to allowed mimetypes and per-file limits. */
const KINDS = {
  avatar: { types: AVATAR_TYPES, limit: 4 * 1024 * 1024 },
  image: { types: IMAGE_TYPES, limit: 10 * 1024 * 1024 },
  video: { types: VIDEO_TYPES, limit: 80 * 1024 * 1024 },
  audio: { types: AUDIO_TYPES, limit: 25 * 1024 * 1024 },
  file: { types: [...FILE_TYPES, ...IMAGE_TYPES, ...VIDEO_TYPES], limit: 80 * 1024 * 1024 },
};

function kindOf(req) {
  const kind = String(req.body.kind || 'file').toLowerCase();
  return KINDS[kind] || KINDS.file;
}

function fileFilter(req, file, cb) {
  const kind = kindOf(req);
  if (!kind.types.includes(file.mimetype)) {
    return cb(new ApiError(400, `File type "${file.mimetype}" is not allowed here.`));
  }
  cb(null, true);
}

export const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename(req, file, cb) {
      cb(null, `${Date.now()}-${crypto.randomUUID()}${extFor(file)}`);
    },
  }),
  fileFilter,
  limits: { fileSize: 80 * 1024 * 1024 },
});

/** Build a public, client-friendly representation of an uploaded file. */
export function fileInfo(file) {
  const kind = (file.mimetype || '').startsWith('image/')
    ? 'image'
    : (file.mimetype || '').startsWith('video/')
      ? 'video'
      : (file.mimetype || '').startsWith('audio/')
        ? 'audio'
        : 'file';
  return {
    name: file.originalname,
    url: `${config.publicUrl}/uploads/${file.filename}`,
    size: file.size,
    type: file.mimetype,
    kind,
  };
}
