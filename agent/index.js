/**
 * Agent - 远程服务器 API 服务
 * 负责与 qBittorrent 和 rclone 交互
 */
require('dotenv').config({ path: '.env.agent' });
const express = require('express');
const cors = require('cors');
const winston = require('winston');

// 导入路由
const qbRoutes = require('./routes/qb');
const rcloneRoutes = require('./routes/rclone');
const systemRoutes = require('./routes/system');

// 创建 Express 应用
const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;

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
    new winston.transports.File({ filename: 'logs/agent.log' })
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

// API Key 认证中间件
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || apiKey !== API_KEY) {
    logger.warn(`未授权的访问尝试: ${req.ip}`);
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      code: 'INVALID_API_KEY'
    });
  }

  next();
}

// 应用认证到所有 API 路由
app.use('/api/', authenticateApiKey);

// ========== 健康检查 ==========
app.get('/api/health', async (req, res) => {
  try {
    const { isQBConnected } = require('./services/qb-client');

    const qbConnected = await isQBConnected();

    res.json({
      success: true,
      data: {
        status: 'healthy',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        qbConnected,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('健康检查失败:', error);
    res.status(500).json({
      success: false,
      error: 'Health check failed'
    });
  }
});

// ========== API 路由 ==========

// qBittorrent 操作
app.use('/api/qb', qbRoutes);

// rclone 操作
app.use('/api/rclone', rcloneRoutes);

// 系统信息
app.use('/api/system', systemRoutes);

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
const server = app.listen(PORT, async () => {
  logger.info(`🚀 Agent 服务器启动成功`);
  logger.info(`📡 监听端口: ${PORT}`);
  logger.info(`🔑 API Key: ${API_KEY.substring(0, 10)}...`);

  // rclone 配置同步
  const { ensureRcloneConfig, RCLONE_SYNC_ON_START } = require('./services/rclone-sync');
  if (RCLONE_SYNC_ON_START) {
    try {
      const syncResult = await ensureRcloneConfig();
      if (syncResult.success) {
        logger.info(`[rclone-sync] 配置同步成功: ${syncResult.message || 'OK'}`);
        if (syncResult.version) {
          logger.info(`[rclone-sync] 配置版本: ${syncResult.version}`);
        }
        if (syncResult.remotes) {
          logger.info(`[rclone-sync] 可用 remotes: ${syncResult.remotes.length}`);
        }
      } else {
        logger.error(`[rclone-sync] 配置同步失败: ${syncResult.error || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error(`[rclone-sync] 配置同步异常:`, error);
    }
  }

  // 启动下载监控
  const { startDownloadMonitor } = require('./services/download-monitor');
  startDownloadMonitor();
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
