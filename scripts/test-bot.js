#!/usr/bin/env node

/**
 * Send a test message via Telegram.
 *
 * Usage:
 *   TEST_TELEGRAM_USER_ID=123456 node scripts/test-bot.js
 *
 * It loads `.env.bot` by default and falls back to the first ID in ALLOWED_USERS.
 */

// `node --test` will pick up this file due to its name. Avoid executing the
// interactive Telegram-sending logic under the Node test runner.
if (process.env.NODE_TEST_CONTEXT) {
  // Register a skipped test so the runner considers the file handled.
  // eslint-disable-next-line node/no-unsupported-features/node-builtins
  const test = require('node:test');
  test('scripts/test-bot.js is a manual utility (skipped in node --test)', { skip: true }, () => {});
  return;
}

require('dotenv').config({ path: '.env.bot' });
const { Telegram } = require('telegraf');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('❌ TELEGRAM_BOT_TOKEN 未配置（.env.bot）');
  process.exit(1);
}

const fallbackUser = (process.env.ALLOWED_USERS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)[0];

const userId = Number.parseInt(process.env.TEST_TELEGRAM_USER_ID || fallbackUser || '', 10);
if (!userId) {
  console.error('❌ TEST_TELEGRAM_USER_ID 未配置，且无法从 ALLOWED_USERS 推断目标用户');
  process.exit(1);
}

const telegram = new Telegram(token);

console.log('📨 发送测试消息...');

telegram.sendMessage(userId, '🧪 测试消息\n\n如果你看到这条消息，说明 Bot 已可以正常发送消息。\n\n请回复 /start 测试交互流程。')
  .then(() => {
    console.log('✅ 测试消息发送成功');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ 发送失败:', err?.message || err);
    console.error('提示: 请确保你已经给 Bot 发送过 /start 命令，并确认目标用户 ID 正确。');
    process.exit(1);
  });
