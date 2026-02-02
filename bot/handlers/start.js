/**
 * /start 命令处理器
 */
const { DatabaseManager } = require('../config/database');
const { MESSAGES } = require('../config/constants');

// 创建数据库实例
const db = new DatabaseManager();

/**
 * 处理 /start 命令
 */
async function handleStart(ctx) {
  const telegramId = ctx.from.id;
  const username = ctx.from.username;
  const firstName = ctx.from.first_name;

  try {
    // 检查用户是否存在
    let user = db.getUserByTelegramId(telegramId);

    if (!user) {
      // 创建新用户
      db.createUser(telegramId, username, firstName);
      db.logActivity(null, 'user_created', null, { telegramId, username });

      await ctx.reply(
        `${MESSAGES.WELCOME}\n\n🎉 新用户注册成功！\n\n使用 /help 查看所有命令。`
      );
    } else {
      // 更新最后活跃时间
      db.updateUserLastSeen(telegramId);

      await ctx.reply(MESSAGES.WELCOME);
    }
  } catch (error) {
    console.error('处理 /start 命令错误:', error);
    await ctx.reply('❌ 发生错误，请稍后重试。');
  }
}

module.exports = { handleStart };
