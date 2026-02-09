/**
 * 配置服务器 - 为所有 Agent 提供 rclone 配置
 */
require('dotenv').config({ path: '.env.config-server' });
const express = require('express');
const cors = require('cors');
const { createLogger } = require('../shared/logger');
const { requestLogger, notFoundHandler, errorHandler } = require('../shared/express');

// 导入路由
const configRoutes = require('./routes/config');

// 创建 Express 应用
const app = express();
const PORT = Number.parseInt(process.env.CONFIG_SERVER_PORT || '4000', 10);

// 配置日志
const logger = createLogger('config-server');

// 中间件
app.use(cors());
app.use(express.json());

// 请求日志（响应结束后记录状态码与耗时）
app.use(requestLogger(logger));

// ========== 健康检查 ==========
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      service: 'config-server',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }
  });
});

// ========== API 路由 ==========

// 配置分发
app.use('/api/config', configRoutes);

// ========== 404 处理 ==========
app.use(notFoundHandler());

// ========== 错误处理 ==========
app.use(errorHandler(logger));

// ========== 启动服务器 ==========
const server = app.listen(PORT, () => {
  logger.info(`🚀 配置服务器启动成功`);
  logger.info(`📡 监听端口: ${PORT}`);
  const apiKey = process.env.CONFIG_SERVER_API_KEY || 'sk_config_master_key';
  logger.info(`🔑 API Key: ${String(apiKey).slice(0, 10)}...`);
  logger.info(`📄 配置文件: ${process.env.RCLONE_CONFIG || '/home/admin/.config/rclone/rclone.conf'}`);
});

// 优雅退出
process.on('SIGTERM', () => {
  logger.info('收到 SIGTERM 信号，正在关闭服务器...');
  server.close(() => {
    logger.info('服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('收到 SIGINT 信号，正在关闭服务器...');
  server.close(() => {
    logger.info('服务器已关闭');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { err: { message: error.message, stack: error.stack } });
  process.exit(1);
});

module.exports = { app, logger };
