/**
 * MoiuBot - qBittorrent 分布式管理 Telegram Bot
 */
require('dotenv').config({ path: '.env.bot' });
const { Telegraf } = require('telegraf');
const { DatabaseManager } = require('./config/database');

// 导入处理器
const { handleStart } = require('./handlers/start');
const { handleServers } = require('./handlers/servers');
const { handleStatus } = require('./handlers/status');
const {
  handleAdd,
  handleAddCallback,
  handleAddText,
  handleAddTorrent
} = require('./handlers/add');

// 初始化数据库
const db = new DatabaseManager();

// 创建 Bot 实例
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

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
    console.log(`未授权用户尝试访问: ${telegramId} (@${ctx.from.username})`);
    return ctx.reply('❌ 你没有权限使用此 Bot');
  }

  return next();
});

// ========== 命令处理 ==========

// /start - 开始使用
bot.start((ctx) => handleStart(ctx));

// /help - 帮助信息
bot.help((ctx) => {
  ctx.reply(
    `📖 **命令列表**\n\n` +
    `【基础命令】\n` +
    `/start - 开始使用\n` +
    `/servers - 查看所有服务器状态\n` +
    `/status <服务器名> - 查看服务器详细状态\n` +
    `/help - 显示帮助信息\n\n` +
    `【下载管理】\n` +
    `/add - 添加种子（交互式）\n` +
    `/list - 查看下载任务\n` +
    `/pause <hash> - 暂停任务\n` +
    `/resume <hash> - 恢复任务\n` +
    `/delete <hash> - 删除任务\n\n` +
    `【服务器管理】\n` +
    `/add_server - 添加服务器\n` +
    `/remove_server <名称> - 删除服务器\n` +
    `/test_server <名称> - 测试连接\n\n` +
    `【其他】\n` +
    `/categories - 管理分类\n` +
    `/logs - 查看操作日志\n` +
    `/cancel - 取消当前操作`,
    { parse_mode: 'Markdown' }
  );
});

// /servers - 服务器列表
bot.command('servers', (ctx) => handleServers(ctx));

// /status - 服务器状态
bot.command('status', (ctx) => handleStatus(ctx));

// /add - 添加种子
bot.command('add', (ctx) => handleAdd(ctx));

// /cancel - 取消操作
bot.command('cancel', (ctx) => {
  const { userSessions } = require('./handlers/add');
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

  // 解析回调数据
  const [action, ...params] = callbackData.split('_');
  const data = params.join('_');

  // 路由到不同的处理器
  if (callbackData.startsWith('add_')) {
    await handleAddCallback(ctx, callbackData, data);
  } else {
    await ctx.answerCbQuery('未知操作');
  }
});

// ========== 消息处理 ==========

// 处理文本消息（用于自定义路径等）
bot.on('text', (ctx) => {
  handleAddText(ctx);
});

// 处理文档消息（.torrent 文件）
bot.on('document', (ctx) => {
  handleAddTorrent(ctx);
});

// ========== 错误处理 ==========

bot.catch((err, ctx) => {
  console.error('Bot 错误:', err);
  ctx.reply('❌ 发生错误，请稍后重试');
});

// ========== 启动 Bot ==========

console.log('🤖 MoiuBot 正在启动...');

// 启动轮询
bot.launch()
  .then(() => {
    console.log('✅ MoiuBot 启动成功!');
    console.log(`📝 允许的用户: ${ALLOWED_USERS.join(', ')}`);
  })
  .catch((error) => {
    console.error('❌ Bot 启动失败:', error);
    process.exit(1);
  });

// 优雅退出
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// 定期更新用户最后活跃时间
setInterval(() => {
  // 这里可以添加定期清理过期会话等逻辑
}, 300000); // 每5分钟

module.exports = bot;
