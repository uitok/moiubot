/**
 * MoiuBot - qBittorrent 分布式管理 Telegram Bot
 */
require('dotenv').config({ path: '.env.bot' });
const { Telegraf } = require('telegraf');
const { initDatabase } = require('./config/database');
const { createLogger } = require('../shared/logger');
const { MESSAGES } = require('./config/constants');

const logger = createLogger('bot');

// 初始化数据库表
logger.info('📦 正在初始化数据库...');
try {
  initDatabase();
  logger.info('✅ 数据库初始化成功');
} catch (error) {
  logger.error('❌ 数据库初始化失败', { err: { message: error.message, stack: error.stack } });
  process.exit(1);
}

// 导入处理器
const { handleStart } = require('./handlers/start');
const { handleServers } = require('./handlers/servers');
const { handleStatus } = require('./handlers/status');
const {
  handleAddServer,
  handleAddServerText,
  handleRemoveServer,
  handleTestServer
} = require('./handlers/server-management');
const {
  handleList,
  handlePause,
  handleResume,
  handleDelete
} = require('./handlers/task-management');
const { startWebhookServer } = require('./webhook-server');
const {
  handleAdd,
  handleAddCallback,
  handleAddText,
  handleAddTorrent
} = require('./handlers/add');
const { userSessions } = require('./services/session-store');

// 创建 Bot 实例
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  logger.error('TELEGRAM_BOT_TOKEN 未配置，请在 .env.bot 中设置。');
  process.exit(1);
}
const bot = new Telegraf(token);

// 用户白名单
const ALLOWED_USERS = (process.env.ALLOWED_USERS || '')
  .split(',')
  .map(id => parseInt(id.trim()))
  .filter(id => !isNaN(id));

// 中间件：用户验证
bot.use((ctx, next) => {
  const telegramId = ctx.from?.id;

  if (!telegramId) {
    return ctx.reply('❌ 无法识别用户');
  }

  if (ALLOWED_USERS.length > 0 && !ALLOWED_USERS.includes(telegramId)) {
    logger.warn('未授权用户尝试访问', { telegramId, username: ctx.from.username });
    return ctx.reply('❌ 你没有权限使用此 Bot');
  }

  return next();
});

// ========== 命令处理 ==========

// /start - 开始使用
bot.start((ctx) => handleStart(ctx));

// /help - 帮助信息
bot.help((ctx) => {
  ctx.reply(MESSAGES.HELP);
});

// /servers - 服务器列表
bot.command('servers', (ctx) => handleServers(ctx));

// /status - 服务器状态
bot.command('status', (ctx) => handleStatus(ctx));

// /add_server - 添加服务器
bot.command('add_server', (ctx) => handleAddServer(ctx));

// /remove_server - 删除（禁用）服务器
bot.command('remove_server', (ctx) => handleRemoveServer(ctx));

// /test_server - 测试服务器连通性
bot.command('test_server', (ctx) => handleTestServer(ctx));

// /add - 添加种子
bot.command('add', (ctx) => handleAdd(ctx));

// /list - 列出任务
bot.command('list', (ctx) => handleList(ctx));

// /pause - 暂停任务
bot.command('pause', (ctx) => handlePause(ctx));

// /resume - 恢复任务
bot.command('resume', (ctx) => handleResume(ctx));

// /delete - 删除任务
bot.command('delete', (ctx) => handleDelete(ctx));

// /cancel - 取消操作
bot.command('cancel', (ctx) => {
  if (userSessions.has(ctx.from.id)) {
    userSessions.delete(ctx.from.id);
    ctx.reply('✅ 当前操作已取消');
  } else {
    ctx.reply('没有正在进行的操作');
  }
});

// ========== 回调处理 ==========

// 处理所有回调查询
bot.on('callback_query', async (ctx) => {
  const callbackData = ctx.callbackQuery.data;

  if (!callbackData) return;

  // 路由到不同的处理器
  if (callbackData.startsWith('add_')) {
    await handleAddCallback(ctx, callbackData);
  } else {
    await ctx.answerCbQuery('未知操作');
  }
});

// ========== 消息处理 ==========

// 处理文本消息（用于自定义路径等）
bot.on('text', async (ctx) => {
  await handleAddServerText(ctx);
  await handleAddText(ctx);
  await handleAddTorrent(ctx);
});

// 处理文档消息（.torrent 文件）
bot.on('document', (ctx) => {
  handleAddTorrent(ctx);
});

// ========== 错误处理 ==========

bot.catch((err, ctx) => {
  logger.error('Bot 错误', { err: { message: err.message, stack: err.stack } });
  ctx.reply('❌ 发生错误，请稍后重试');
});

// ========== 启动 Bot ==========

logger.info('🤖 MoiuBot 正在启动...');

let webhook = null;

// 启动轮询
bot.launch()
  .then(() => {
    logger.info('✅ MoiuBot 启动成功!');
    logger.info(`📝 允许的用户: ${ALLOWED_USERS.join(', ') || 'ALL'}`);

    // Start webhook server (Agent -> Bot) if BOT_WEBHOOK_PORT is configured.
    webhook = startWebhookServer({ bot, logger });
  })
  .catch((error) => {
    logger.error('❌ Bot 启动失败', { err: { message: error.message, stack: error.stack } });
    process.exit(1);
  });

// 优雅退出
function shutdown(signal) {
  try {
    bot.stop(signal);
  } finally {
    if (webhook?.server) {
      webhook.server.close(() => {
        logger.info('Webhook server closed');
      });
    }
  }
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

// 定期更新用户最后活跃时间
setInterval(() => {
  // 这里可以添加定期清理过期会话等逻辑
}, 300000); // 每5分钟

module.exports = bot;
