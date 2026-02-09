/**
 * Lightweight webhook server for Agent -> Bot notifications.
 *
 * Agent posts events (e.g. move_complete) to BOT_WEBHOOK_URL.
 * Bot receives them here and pushes Telegram notifications to the task owner.
 */

const express = require('express');
const cors = require('cors');
const { DatabaseManager } = require('./config/database');
const { requestLogger, notFoundHandler, errorHandler, asyncHandler } = require('../shared/express');

const db = new DatabaseManager();

function optionalApiKeyAuth(options) {
  const headerName = (options?.headerName || 'x-api-key').toLowerCase();
  const apiKey = options?.apiKey;
  const logger = options?.logger;

  return function optionalApiKeyAuthMiddleware(req, res, next) {
    if (!apiKey) return next();

    const provided = req.headers[headerName];
    if (!provided || provided !== apiKey) {
      if (logger) logger.warn('Unauthorized webhook request', { ip: req.ip, path: req.originalUrl || req.url });
      return res.status(401).json({ success: false, error: 'Unauthorized', code: 'INVALID_API_KEY' });
    }
    return next();
  };
}

function startWebhookServer(options) {
  const bot = options?.bot;
  const logger = options?.logger;

  const port = Number.parseInt(process.env.BOT_WEBHOOK_PORT || '0', 10);
  if (!port) {
    if (logger) logger.info('Webhook server is disabled (BOT_WEBHOOK_PORT not set).');
    return null;
  }

  const apiKey = process.env.BOT_WEBHOOK_API_KEY || '';
  const path = process.env.BOT_WEBHOOK_PATH || '/api/webhook/agent';

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '256kb' }));

  if (logger) app.use(requestLogger(logger));

  app.get('/health', (req, res) => {
    res.json({ success: true, data: { status: 'healthy', service: 'bot-webhook' } });
  });

  app.use(path, optionalApiKeyAuth({ apiKey: apiKey || null, logger }));

  app.post(path, asyncHandler(async (req, res) => {
    const body = req.body || {};
    const type = body.type;
    const hash = body.hash;

    if (!type || !hash) {
      return res.status(400).json({ success: false, error: 'Missing type/hash', code: 'BAD_REQUEST' });
    }

    const task = db.getTaskWithUserByHash(hash);
    if (!task || !task.telegram_id) {
      if (logger) logger.warn('Webhook received but task/user not found', { type, hash });
      return res.json({ success: true, ignored: true });
    }

    if (!bot?.telegram?.sendMessage) {
      if (logger) logger.error('Bot telegram client not available; cannot push notification');
      return res.status(500).json({ success: false, error: 'Bot not ready', code: 'BOT_NOT_READY' });
    }

    if (type === 'move_complete') {
      db.updateTaskMoved(hash);

      const dest = body.dest || `${task.move_remote || ''}${task.move_dest || ''}` || '-';
      const size = typeof body.size === 'number' ? body.size : task.size;

      const text =
        `✅ 文件已归档\n\n` +
        `🖥️ 服务器: ${task.server_name || '-'}\n` +
        `📦 任务: ${body.name || task.name || '-'}\n` +
        `🔑 Hash: ${hash}\n` +
        `📁 目标: ${dest}\n` +
        (size ? `📦 大小: ${require('../shared/utils').formatBytes(size)}\n` : '');

      try {
        await bot.telegram.sendMessage(task.telegram_id, text);
      } catch (error) {
        if (logger) logger.warn('Failed to send Telegram notification', { err: { message: error.message } });
      }

      return res.json({ success: true });
    }

    if (type === 'move_error') {
      db.updateTaskStatus(hash, 'error');

      const errMsg = body.error || 'Unknown error';
      const text =
        `❌ 自动移动失败\n\n` +
        `🖥️ 服务器: ${task.server_name || '-'}\n` +
        `📦 任务: ${body.name || task.name || '-'}\n` +
        `🔑 Hash: ${hash}\n` +
        `原因: ${errMsg}`;

      try {
        await bot.telegram.sendMessage(task.telegram_id, text);
      } catch (error) {
        if (logger) logger.warn('Failed to send Telegram notification', { err: { message: error.message } });
      }

      return res.json({ success: true });
    }

    if (logger) logger.info('Webhook event ignored (unknown type)', { type, hash });
    return res.json({ success: true, ignored: true });
  }));

  app.use(notFoundHandler());
  if (logger) app.use(errorHandler(logger));

  const server = app.listen(port, () => {
    if (logger) {
      logger.info('📡 Webhook server started', { port, path, apiKeyConfigured: !!apiKey });
    }
  });

  return { app, server, port, path };
}

module.exports = { startWebhookServer };

