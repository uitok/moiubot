/**
 * Task management handlers:
 * - /list: list torrents grouped by server
 * - /pause <hash>: pause torrent
 * - /resume <hash>: resume torrent
 * - /delete <index|hash> [files|--files]: delete torrent (optionally with files)
 */

const { DatabaseManager } = require('../config/database');
const { MESSAGES, TORRENT_STATUS_TEXT } = require('../config/constants');
const AgentClient = require('../services/agent-client');
const { setTaskIndexMap, resolveTaskByIndex } = require('../services/task-index-map');
const { formatSpeed, formatBytes } = require('../../shared/utils');

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

function parseArgs(ctx) {
  const text = String(ctx.message?.text || '').trim();
  const parts = text.split(/\s+/).filter(Boolean);
  return parts.slice(1);
}

function isLikelyHash(hash) {
  return /^[a-fA-F0-9]{40}$/.test(String(hash || ''));
}

function stateText(state) {
  if (!state) return TORRENT_STATUS_TEXT.unknown;
  return TORRENT_STATUS_TEXT[state] || state;
}

function formatEta(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return '∞';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
}

function torrentSortKey(t) {
  // Lower is earlier.
  const state = String(t?.state || '');
  if (['downloading', 'stalledDL', 'forcedDL', 'metaDL', 'checkingDL', 'allocating', 'queuedDL'].includes(state)) return 10;
  if (['pausedDL'].includes(state)) return 20;
  if (['uploading', 'stalledUP', 'pausedUP', 'queuedUP', 'forcedUP'].includes(state)) return 30;
  if (['error', 'missingFiles'].includes(state)) return 40;
  return 50;
}

async function handleList(ctx) {
  const servers = db.getAllServers();
  if (servers.length === 0) return ctx.reply(MESSAGES.NO_SERVERS);

  const telegramId = ctx.from?.id || null;
  const indexEntries = Object.create(null);
  let nextIndex = 1;

  const results = await Promise.all(servers.map(async (server) => {
    const client = new AgentClient(server.url, server.api_key);
    try {
      const torrentsRes = await client.getTorrents();
      const torrents = Array.isArray(torrentsRes?.data) ? torrentsRes.data : [];
      return { server, ok: true, torrents };
    } catch (error) {
      return { server, ok: false, error: error.message };
    }
  }));

  // Telegram message has a 4096 char limit; keep some margin.
  const MAX_LEN = 3500;
  const chunks = [];
  let current = '📋 当前任务列表\n\n';

  for (const r of results) {
    let section = `🖥️ ${r.server.name}\n`;
    if (!r.ok) {
      section += `   ❌ 获取失败: ${r.error}\n\n`;
    } else if (r.torrents.length === 0) {
      section += `   (暂无任务)\n\n`;
    } else {
      const torrents = r.torrents
        .slice()
        .sort((a, b) => {
          const ak = torrentSortKey(a);
          const bk = torrentSortKey(b);
          if (ak !== bk) return ak - bk;
          const ap = typeof a?.progress === 'number' ? a.progress : 0;
          const bp = typeof b?.progress === 'number' ? b.progress : 0;
          return bp - ap;
        });

      const downloadingCount = torrents.filter(t => ['downloading', 'stalledDL', 'forcedDL', 'metaDL', 'checkingDL', 'allocating', 'queuedDL'].includes(t.state)).length;
      const pausedCount = torrents.filter(t => ['pausedDL'].includes(t.state)).length;
      const seedingCount = torrents.filter(t => ['uploading', 'stalledUP', 'pausedUP', 'queuedUP', 'forcedUP'].includes(t.state)).length;

      section += `   总计: ${torrents.length} | 下载中: ${downloadingCount} | 暂停: ${pausedCount} | 做种/完成: ${seedingCount}\n`;

      const limit = 15;
      const shown = torrents.slice(0, limit);
      for (const t of shown) {
        const index = nextIndex++;
        const progress = ((t.progress || 0) * 100).toFixed(1);
        const hashShort = String(t.hash || '').slice(0, 8) || '-';
        const dl = t.dlspeed ? formatSpeed(t.dlspeed) : '-';
        const up = t.upspeed ? formatSpeed(t.upspeed) : '-';
        const eta = formatEta(t.eta);
        const size = t.size ? formatBytes(t.size) : '-';
        const name = t.name || '(未命名)';
        const status = stateText(t.state);

        // Store /delete index mapping for displayed tasks only.
        if (telegramId && t.hash) {
          indexEntries[index] = { hash: String(t.hash), name: String(name) };
        }

        // Keep the first line minimal and prominent: `1. [文件名] - 下载中`
        section += `   ${index}. ${name} - ${status}\n`;
        section += `      进度: ${progress}% | ⬇️ ${dl} | ⬆️ ${up} | ETA: ${eta} | ${size} | ${hashShort}\n`;
      }
      if (torrents.length > limit) {
        section += `   ... 还有 ${torrents.length - limit} 个任务未显示\n`;
      }
      section += '\n';
    }

    if (current.length + section.length > MAX_LEN) {
      chunks.push(current);
      current = '';
    }
    current += section;
  }

  if (current.trim()) chunks.push(current);

  // Persist the numeric index mapping for quick /delete.
  if (telegramId) {
    setTaskIndexMap(telegramId, indexEntries);
  }

  for (const chunk of chunks) {
    // eslint-disable-next-line no-await-in-loop
    await ctx.reply(chunk);
  }
}

async function resolveServerForHash(hash) {
  const task = db.getTaskByHash(hash);
  if (task?.server_id) {
    const server = db.getServerById(task.server_id);
    if (server) return { server, task };
  }

  // Fallback: probe each enabled server.
  const servers = db.getAllServers();
  for (const server of servers) {
    const client = new AgentClient(server.url, server.api_key);
    try {
      // eslint-disable-next-line no-await-in-loop
      const info = await client.getTorrentInfo(hash);
      if (info?.success) return { server, task: null };
    } catch (error) {
      if (String(error.message || '').includes('TORRENT_NOT_FOUND')) continue;
      // Other errors mean server unreachable; keep probing others.
      continue;
    }
  }

  return null;
}

async function handlePause(ctx) {
  const args = parseArgs(ctx);
  const hash = args[0];
  if (!hash) return ctx.reply('用法: /pause [hash]');
  if (!isLikelyHash(hash)) return ctx.reply('❌ hash 格式无效（应为 40 位十六进制）。');

  const resolved = await resolveServerForHash(hash);
  if (!resolved) return ctx.reply('❌ 未找到该任务所属服务器。');

  const { server, task } = resolved;
  const client = new AgentClient(server.url, server.api_key);

  try {
    await client.pauseTorrent(hash);
    db.updateTaskStatus(hash, 'paused');

    const user = ensureUser(ctx);
    db.logActivity(user?.id || null, 'pause', server.name, { hash });

    const name = task?.name ? `\n任务: ${task.name}` : '';
    return ctx.reply(`✅ 已暂停\n服务器: ${server.name}${name}\nHash: ${hash}`);
  } catch (error) {
    return ctx.reply(`❌ 暂停失败: ${error.message}`);
  }
}

async function handleResume(ctx) {
  const args = parseArgs(ctx);
  const hash = args[0];
  if (!hash) return ctx.reply('用法: /resume [hash]');
  if (!isLikelyHash(hash)) return ctx.reply('❌ hash 格式无效（应为 40 位十六进制）。');

  const resolved = await resolveServerForHash(hash);
  if (!resolved) return ctx.reply('❌ 未找到该任务所属服务器。');

  const { server, task } = resolved;
  const client = new AgentClient(server.url, server.api_key);

  try {
    await client.resumeTorrent(hash);
    db.updateTaskStatus(hash, 'downloading');

    const user = ensureUser(ctx);
    db.logActivity(user?.id || null, 'resume', server.name, { hash });

    const name = task?.name ? `\n任务: ${task.name}` : '';
    return ctx.reply(`✅ 已恢复\n服务器: ${server.name}${name}\nHash: ${hash}`);
  } catch (error) {
    return ctx.reply(`❌ 恢复失败: ${error.message}`);
  }
}

async function handleDelete(ctx) {
  const args = parseArgs(ctx);
  const target = args[0];
  if (!target) return ctx.reply('用法: /delete [序号|hash] [files|--files]');

  const deleteFiles = args.includes('files') || args.includes('--files') || args.includes('--delete-files');

  const telegramId = ctx.from?.id || null;
  let index = null;
  let hash = target;
  let mappedName = null;

  // Support `/delete 1` by looking up the ephemeral /list index mapping.
  // If the arg is purely digits and isn't a 40-char numeric-only hash, treat it as an index.
  if (/^\d+$/.test(String(target)) && String(target).length !== 40) {
    index = Number.parseInt(String(target), 10);
    if (!telegramId) return ctx.reply('❌ 无法识别用户，不能使用序号删除。');
    const mapped = resolveTaskByIndex(telegramId, index);
    if (!mapped?.hash) {
      return ctx.reply('❌ 序号无效或已过期，请先发送 /list 获取最新任务列表。');
    }
    hash = mapped.hash;
    mappedName = mapped.name || null;
  }

  if (!isLikelyHash(hash)) return ctx.reply('❌ hash 格式无效（应为 40 位十六进制）。');

  const resolved = await resolveServerForHash(hash);
  if (!resolved) return ctx.reply('❌ 未找到该任务所属服务器。');

  const { server, task } = resolved;
  const client = new AgentClient(server.url, server.api_key);

  try {
    await client.deleteTorrent(hash, deleteFiles);
    // Clean up bot DB record as well (if present).
    db.deleteTaskByHash(hash);

    const user = ensureUser(ctx);
    db.logActivity(user?.id || null, 'delete', server.name, { hash, deleteFiles, index });

    const name = mappedName || task?.name || null;

    if (Number.isInteger(index)) {
      return ctx.reply(
        `✅ 已删除\n任务: ${index}. ${name || '(未知名称)'}\n服务器: ${server.name}\nHash: ${hash}\n` +
        `删除文件: ${deleteFiles ? '是' : '否'}`
      );
    }

    const nameLine = name ? `\n任务: ${name}` : '';
    return ctx.reply(
      `✅ 已删除\n服务器: ${server.name}${nameLine}\nHash: ${hash}\n` +
      `删除文件: ${deleteFiles ? '是' : '否'}`
    );
  } catch (error) {
    return ctx.reply(`❌ 删除失败: ${error.message}`);
  }
}

module.exports = {
  handleList,
  handlePause,
  handleResume,
  handleDelete
};
