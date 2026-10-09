export class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function notFound(req, res) {
  res.status(404).json({ ok: false, message: `Route not found: ${req.method} ${req.path}` });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const uploadStatus = error.code === 'LIMIT_FILE_SIZE' ? 413 : error.name === 'MulterError' ? 400 : 0;
  const status = Number(error.statusCode || error.status) || uploadStatus || 500;
  if (status >= 500) console.error('[api]', error);
  res.status(status).json({
    ok: false,
    message: status >= 500 ? 'Internal server error.' : error.message,
    ...(error.details ? { details: error.details } : {}),
  });
}
