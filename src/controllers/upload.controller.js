import { fileInfo } from '../middleware/upload.js';
import { ApiError } from '../middleware/error.js';
import { config } from '../config.js';
import fs from 'node:fs';
import path from 'node:path';

/** Upload a single file. `kind` in the body controls allowed types. */
export function uploadFile(req, res) {
  if (!req.file) throw new ApiError(400, 'No file was uploaded.');
  if (String(req.body.kind || '').toLowerCase() === 'avatar' && req.file.size > 4 * 1024 * 1024) {
    fs.unlinkSync(req.file.path);
    throw new ApiError(413, 'Profile pictures must be 4 MB or smaller.');
  }
  res.status(201).json({ ok: true, file: fileInfo(req.file) });
}

/** Upload multiple files at once. */
export function uploadFiles(req, res) {
  if (!req.files?.length) throw new ApiError(400, 'No files were uploaded.');
  res.status(201).json({ ok: true, files: req.files.map(fileInfo) });
}

/** Delete an uploaded file by name. */
export function deleteFile(req, res) {
  const { name } = req.params;
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) {
    throw new ApiError(400, 'Invalid file name.');
  }
  const filePath = path.join(config.uploadDir, name);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ ok: true, message: 'File deleted.' });
}
