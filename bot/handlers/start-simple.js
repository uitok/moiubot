/**
 * /start 命令处理器 - 简化测试版本
 */
const { DatabaseManager } = require('../config/database');

// 创建数据库实例
const db = new DatabaseManager();

/**
 * 处理 /start 命令
 */
async function handleStart(ctx) {
  const telegramId = ctx.from.id;
  const username = ctx.from.username;
  const firstName = ctx.from.first_name;

  console.log(`📥 收到 /start 命令 from: ${telegramId} (@${username || 'N/A'})`);

  try {
    // 检查用户是否存在
    let user = db.getUserByTelegramId(telegramId);
    console.log(`👤 用户查询结果:`, user);

    if (!user) {
      // 创建新用户
      console.log(`➕ 创建新用户: ${telegramId}`);
      db.createUser(telegramId, username, firstName);
      db.logActivity(null, 'user_created', null, { telegramId, username });

      // 简单的欢迎消息，不使用任何常量
      await ctx.reply('👋 欢迎使用 MoiuBot！\n\n新用户注册成功！\n\n使用 /help 查看所有命令。');
      console.log(`✅ 欢迎消息已发送给新用户`);
    } else {
      // 更新最后活跃时间
      console.log(`🔄 更新用户最后活跃时间: ${telegramId}`);
      db.updateUserLastSeen(telegramId);

      // 简单的欢迎消息
      await ctx.reply('👋 欢迎回来！\n\n使用 /help 查看所有命令。');
      console.log(`✅ 欢迎消息已发送给现有用户`);
    }
  } catch (error) {
    console.error('❌ 处理 /start 命令错误:', error);
    console.error('错误详情:', error.message);
    console.error('错误堆栈:', error.stack);
    await ctx.reply(`❌ 发生错误: ${error.message}\n\n请联系管理员。`);
  }
}

module.exports = { handleStart };
