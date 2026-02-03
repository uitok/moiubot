/**
 * 配置服务器 - 为所有 Agent 提供 rclone 配置
 */
require('dotenv').config({ path: '.env.config-server' });
const express = require('express');
const cors = require('cors');
const winston = require('winston');

// 导入路由
const configRoutes = require('./routes/config');

// 创建 Express 应用
const app = express();
const PORT = process.env.CONFIG_SERVER_PORT || 4000;

// 配置日志
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'logs/config-server.log' })
  ]
});

// 中间件
app.use(cors());
app.use(express.json());

// 请求日志
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

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
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    code: 'NOT_FOUND'
  });
});

// ========== 错误处理 ==========
app.use((err, req, res, next) => {
  logger.error('服务器错误:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  });
});

// ========== 启动服务器 ==========
const server = app.listen(PORT, () => {
  logger.info(`🚀 配置服务器启动成功`);
  logger.info(`📡 监听端口: ${PORT}`);
  const apiKey = process.env.CONFIG_SERVER_API_KEY || 'sk_config_master_key';
  logger.info(`🔑 API Key: ${apiKey.substring(0, 10)}...`);
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

module.exports = { app, logger };
