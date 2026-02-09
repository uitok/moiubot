/**
 * API Key 认证中间件
 */
const { apiKeyAuth } = require('../../shared/middleware/api-key');

const authenticateApiKey = apiKeyAuth({
  apiKey: process.env.CONFIG_SERVER_API_KEY || 'sk_config_master_key'
});

module.exports = { authenticateApiKey };
