/**
 * Server management handlers:
 * - /add_server: interactive add/update server (name, url, api key)
 * - /remove_server: disable a server
 * - /test_server: test connectivity to a server (Agent health)
 */

const { DatabaseManager } = require('../config/database');
const { MESSAGES, SESSION_STATES } = require('../config/constants');
const AgentClient = require('../services/agent-client');
const { userSessions } = require('../services/session-store');

const db = new DatabaseManager();

function ensureUser(ctx) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return null;
  let user = db.getUserByTelegramId(telegramId);
  if (!user) {
    db.createUser(telegramId, ctx.from?.username || null, ctx.from?.first_name || null);
    user = db.getUserByTelegramId(telegramId);
  }
  return user;
}

function isValidServerName(name) {
  if (!name) return false;
  if (name.length < 1 || name.length > 64) return false;
  if (/\s/.test(name)) return false; // keep UX consistent with arg-based commands
  if (name.startsWith('/')) return false;
  return true;
}

function normalizeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(u.protocol)) return null;

  // Preserve path if user includes it, but strip trailing slash for consistency.
  const normalized = raw.replace(/\/$/, '');
  return normalized;
}

async function handleAddServer(ctx) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return ctx.reply('❌ 无法识别用户');

  userSessions.set(telegramId, {
    state: SESSION_STATES.ADD_SERVER_NAME,
    flow: 'add_server',
    draft: {}
  });

  await ctx.reply(
    '🖥️ 添加服务器\n\n' +
    '请输入服务器名称（不含空格）：\n\n' +
    '发送 /cancel 取消'
  );
}

async function handleAddServerText(ctx) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const session = userSessions.get(telegramId);
  if (!session) return;

  const state = session.state;
  const isAddServerFlow = [
    SESSION_STATES.ADD_SERVER_NAME,
    SESSION_STATES.ADD_SERVER_URL,
    SESSION_STATES.ADD_SERVER_KEY
  ].includes(state);
  if (!isAddServerFlow) return;

  const input = String(ctx.message?.text || '').trim();
  if (!input) return ctx.reply('❌ 输入不能为空');

  // If user sends another command, let command handlers process it.
  if (input.startsWith('/')) return;

  try {
    if (state === SESSION_STATES.ADD_SERVER_NAME) {
      if (!isValidServerName(input)) {
        return await ctx.reply('❌ 服务器名称无效。要求：1-64 字符，不含空格，且不以 / 开头。');
      }

      session.draft.name = input;
      session.state = SESSION_STATES.ADD_SERVER_URL;

      return await ctx.reply(
        '请输入 Agent API URL（例如: http://1.2.3.4:3000 ）\n\n' +
        '发送 /cancel 取消'
      );
    }

    if (state === SESSION_STATES.ADD_SERVER_URL) {
      const url = normalizeUrl(input);
      if (!url) return await ctx.reply(MESSAGES.INVALID_URL);

      session.draft.url = url;
      session.state = SESSION_STATES.ADD_SERVER_KEY;

      return await ctx.reply(
        '请输入 API Key（Agent 端 .env.agent 的 API_KEY）：\n\n' +
        '发送 /cancel 取消'
      );
    }

    if (state === SESSION_STATES.ADD_SERVER_KEY) {
      const apiKey = input;
      if (apiKey.length < 1 || apiKey.length > 512) {
        return await ctx.reply('❌ API Key 无效（长度应为 1-512）。');
      }

      session.draft.apiKey = apiKey;

      const { name, url } = session.draft;
      const existing = db.getServerByName(name);

      if (!existing) {
        db.createServer(name, url, apiKey);
      } else {
        db.updateServer(existing.id, name, url, apiKey);
        if (!existing.enabled) db.enableServer(existing.id);
      }

      const user = ensureUser(ctx);
      db.logActivity(user?.id || null, 'add_server', name, { name, url, updated: !!existing });

      userSessions.delete(telegramId);

      return await ctx.reply(
        `✅ 服务器已${existing ? '更新' : '添加'}\n\n` +
        `名称: ${name}\n` +
        `URL: ${url}`
      );
    }
  } catch (error) {
    userSessions.delete(telegramId);
    return ctx.reply(`❌ 添加服务器失败: ${error.message}`);
  }
}

async function handleRemoveServer(ctx) {
  const args = String(ctx.message?.text || '').trim().split(/\s+/).slice(1);
  const name = args[0];

  if (!name) {
    const servers = db.getAllServers();
    const list = servers.length > 0 ? servers.map(s => `• ${s.name}`).join('\n') : '(无)';
    return ctx.reply(
      '用法: /remove_server [服务器名称]\n\n' +
      `当前服务器:\n${list}`
    );
  }

  const server = db.getServerByName(name);
  if (!server) return ctx.reply(MESSAGES.SERVER_NOT_FOUND);

  if (!server.enabled) {
    return ctx.reply(`ℹ️ 服务器已被移除（已禁用）: ${server.name}`);
  }

  try {
    db.disableServer(server.id);
    const user = ensureUser(ctx);
    db.logActivity(user?.id || null, 'remove_server', server.name, { id: server.id });
    return ctx.reply(`✅ 已移除服务器（已禁用）: ${server.name}`);
  } catch (error) {
    return ctx.reply(`❌ 移除失败: ${error.message}`);
  }
}

async function handleTestServer(ctx) {
  const args = String(ctx.message?.text || '').trim().split(/\s+/).slice(1);
  const name = args[0];

  if (!name) {
    return ctx.reply('用法: /test_server [服务器名称]\n\n使用 /servers 查看所有服务器。');
  }

  const server = db.getServerByName(name);
  if (!server) return ctx.reply(MESSAGES.SERVER_NOT_FOUND);

  try {
    const client = new AgentClient(server.url, server.api_key);
    const health = await client.healthCheck();

    const ok = !!health?.success;
    const qbConnected = !!health?.data?.qbConnected;

    let message = `🔎 测试服务器: ${server.name}\n\n`;
    message += `Agent: ${ok ? '🟢 在线' : '🔴 离线'}\n`;
    message += `qBittorrent: ${qbConnected ? '✅ 已连接' : '❌ 未连接'}\n`;
    message += `URL: ${server.url}\n`;

    const user = ensureUser(ctx);
    db.logActivity(user?.id || null, 'test_server', server.name, { ok, qbConnected });

    return ctx.reply(message);
  } catch (error) {
    const user = ensureUser(ctx);
    db.logActivity(user?.id || null, 'test_server', server.name, { ok: false, error: error.message });
    return ctx.reply(`❌ 测试失败: ${error.message}`);
  }
}

module.exports = {
  handleAddServer,
  handleAddServerText,
  handleRemoveServer,
  handleTestServer
};

