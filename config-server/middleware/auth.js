/**
 * API Key 认证中间件
 */
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const configServerApiKey = process.env.CONFIG_SERVER_API_KEY || 'sk_config_master_key';

  if (!apiKey || apiKey !== configServerApiKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      code: 'INVALID_API_KEY'
    });
  }

  next();
}

module.exports = { authenticateApiKey };
