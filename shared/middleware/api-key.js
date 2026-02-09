/**
 * Simple API key auth middleware.
 */

const { unauthorized } = require('../errors');

function apiKeyAuth(options) {
  const headerName = (options?.headerName || 'x-api-key').toLowerCase();
  const apiKey = options?.apiKey;
  const logger = options?.logger;

  return function apiKeyAuthMiddleware(req, res, next) {
    // If no key configured, fail closed.
    if (!apiKey) {
      return next(unauthorized('API key is not configured', 'API_KEY_NOT_CONFIGURED'));
    }

    const provided = req.headers[headerName];
    if (!provided || provided !== apiKey) {
      if (logger) {
        logger.warn('Unauthorized request (invalid API key)', { ip: req.ip, path: req.originalUrl || req.url });
      }
      return next(unauthorized('Unauthorized', 'INVALID_API_KEY'));
    }

    return next();
  };
}

module.exports = { apiKeyAuth };

