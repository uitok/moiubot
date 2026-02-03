const TelegramBot = require('node-telegram-bot-api');

const token = '7976882463:AAGjWx-T5wQLT_pSGax_ecqea4vPX0L8wms';
const allowedUserId = 6830441855;

const bot = new TelegramBot(token, { polling: false });

console.log('📨 发送测试消息到 Bot...');

bot.sendMessage(allowedUserId, '🧪 **测试消息**\n\n如果你看到这条消息，说明 Bot 已经修复成功！\n\n请回复 /start 来测试完整功能。', { parse_mode: 'Markdown' })
  .then(() => {
    console.log('✅ 测试消息发送成功！');
    console.log(`👤 目标用户: ${allowedUserId}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 发送失败:', error.message);
    console.error('提示: 请确保你已经给 Bot 发送过 /start 命令');
    process.exit(1);
  });
