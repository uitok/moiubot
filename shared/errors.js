/**
 * Shared error helpers.
 *
 * Use AppError to carry an HTTP status and stable error code across services.
 */

class AppError extends Error {
  /**
   * @param {string} message
   * @param {{status?: number, code?: string, details?: any, cause?: any}} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'AppError';
    this.status = Number.isInteger(options.status) ? options.status : 500;
    this.code = options.code || 'INTERNAL_ERROR';
    this.details = options.details;

    if (options.cause) this.cause = options.cause;
  }
}

function isAppError(err) {
  return Boolean(err && typeof err === 'object' && err.name === 'AppError' && typeof err.status === 'number');
}

function badRequest(message = 'Bad Request', code = 'BAD_REQUEST', details) {
  return new AppError(message, { status: 400, code, details });
}

function unauthorized(message = 'Unauthorized', code = 'UNAUTHORIZED') {
  return new AppError(message, { status: 401, code });
}

function notFound(message = 'Not Found', code = 'NOT_FOUND') {
  return new AppError(message, { status: 404, code });
}

function assert(condition, message, code = 'BAD_REQUEST', details) {
  if (!condition) throw badRequest(message, code, details);
}

module.exports = {
  AppError,
  isAppError,
  badRequest,
  unauthorized,
  notFound,
  assert
};

