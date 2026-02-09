/**
 * Express helpers shared across services.
 */

const { isAppError } = require('./errors');

function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function requestLogger(logger) {
  return function requestLoggerMiddleware(req, res, next) {
    const start = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const msg = `${req.method} ${req.originalUrl || req.url} ${res.statusCode} ${durationMs}ms`;
      logger.info(msg, {
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        durationMs,
        ip: req.ip
      });
    });
    next();
  };
}

function notFoundHandler() {
  return function notFoundMiddleware(req, res) {
    res.status(404).json({
      success: false,
      error: 'Endpoint not found',
      code: 'NOT_FOUND'
    });
  };
}

function errorHandler(logger) {
  // eslint-disable-next-line no-unused-vars
  return function errorMiddleware(err, req, res, next) {
    const appErr = isAppError(err) ? err : null;
    const status = appErr ? appErr.status : 500;
    const code = appErr ? appErr.code : 'INTERNAL_ERROR';
    const message = appErr ? appErr.message : 'Internal server error';

    // Keep logs rich but responses conservative.
    logger.error(message, {
      code,
      status,
      path: req.originalUrl || req.url,
      method: req.method,
      err: {
        name: err?.name,
        message: err?.message,
        stack: err?.stack
      }
    });

    res.status(status).json({
      success: false,
      error: message,
      code,
      details: appErr?.details
    });
  };
}

module.exports = {
  asyncHandler,
  requestLogger,
  notFoundHandler,
  errorHandler
};

