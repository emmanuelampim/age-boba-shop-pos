export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function badRequest(code, message) {
  return new AppError(400, code, message);
}

export function unauthorized(code = 'UNAUTHORIZED', message = 'Authentication required.') {
  return new AppError(401, code, message);
}

export function forbidden(code, message) {
  return new AppError(403, code, message);
}

export function notFound(code, message) {
  return new AppError(404, code, message);
}

export function conflict(code, message) {
  return new AppError(409, code, message);
}

export function sendError(res, err) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }
  console.error(err);
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  });
}

export function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function page(res, data, { page, limit, total }) {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return res.json({
    success: true,
    data,
    pagination: { page, limit, total, totalPages },
  });
}