/**
 * Agent - 远程服务器 API 服务
 * 负责与 qBittorrent 和 rclone 交互
 */
require('dotenv').config({ path: '.env.agent' });
const express = require('express');
const cors = require('cors');
const { createLogger } = require('../shared/logger');
const { requestLogger, notFoundHandler, errorHandler } = require('../shared/express');
const { apiKeyAuth } = require('../shared/middleware/api-key');

// 导入路由
const qbRoutes = require('./routes/qb');
const rcloneRoutes = require('./routes/rclone');
const systemRoutes = require('./routes/system');

// 创建 Express 应用
const app = express();
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const API_KEY = process.env.API_KEY || 'sk_agent_default_key';

// 配置日志
const logger = createLogger('agent');

if (!process.env.API_KEY) {
  logger.warn('API_KEY 未设置，正在使用默认值 sk_agent_default_key。请在 .env.agent 中配置一个强随机值。');
}

// 中间件
app.use(cors());
app.use(express.json());

// 请求日志（响应结束后记录状态码与耗时）
app.use(requestLogger(logger));

// 应用认证到所有 API 路由
app.use('/api', apiKeyAuth({ apiKey: API_KEY, logger }));

// ========== 健康检查 ==========
app.get('/api/health', async (req, res) => {
  try {
    const { isQBConnected } = require('./services/qb-client');
    const qbConnected = await isQBConnected();

    res.json({
      success: true,
      data: {
        service: 'agent',
        status: 'healthy',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        qbConnected,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('健康检查失败', { err: { message: error.message, stack: error.stack } });
    res.status(500).json({ success: false, error: 'Health check failed', code: 'HEALTH_CHECK_FAILED' });
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
app.use(notFoundHandler());

// ========== 错误处理 ==========
app.use(errorHandler(logger));

// ========== 启动服务器 ==========
const server = app.listen(PORT, async () => {
  logger.info(`🚀 Agent 服务器启动成功`);
  logger.info(`📡 监听端口: ${PORT}`);
  logger.info(`🔑 API Key: ${String(API_KEY).slice(0, 10)}...`);

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
  startDownloadMonitor({ logger });
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
