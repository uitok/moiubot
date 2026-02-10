/**
 * /add 命令处理器
 * 交互式添加种子流程
 */
const { DatabaseManager } = require('../config/database');
const { MESSAGES, SESSION_STATES } = require('../config/constants');
const AgentClient = require('../services/agent-client');
const { parseMagnetLink } = require('../../shared/utils');
const { userSessions } = require('../services/session-store');

const db = new DatabaseManager();

function isMessageNotModifiedError(error) {
  const desc = String(
    error?.description ||
    error?.response?.description ||
    error?.response?.data?.description ||
    error?.message ||
    ''
  ).toLowerCase();
  return desc.includes('message is not modified') || desc.includes('message_not_modified');
}

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch (_e) {
    return null;
  }
}

function isSameReplyMarkup(current, next) {
  // Telegram may omit reply_markup when empty; normalize to null for comparison.
  const a = current ?? null;
  const b = next ?? null;
  return safeJson(a) === safeJson(b);
}

async function safeEditMessageText(ctx, text, extra) {
  const message = ctx.callbackQuery?.message;

  // If we can tell nothing would change, skip the edit to avoid Telegram 400.
  if (message && typeof message.text === 'string') {
    const sameText = message.text === text;
    const hasMarkup = hasOwn(extra, 'reply_markup');
    const sameMarkup = !hasMarkup || isSameReplyMarkup(message.reply_markup, extra.reply_markup);
    if (sameText && sameMarkup) return null;
  }

  try {
    return await ctx.editMessageText(text, extra);
  } catch (e) {
    if (isMessageNotModifiedError(e)) return null;
    throw e;
  }
}

async function respond(ctx, text, extra) {
  // In callback_query context, edit the original message to keep the flow tidy.
  if (ctx.callbackQuery) {
    try {
      return await safeEditMessageText(ctx, text, extra);
    } catch (e) {
      if (isMessageNotModifiedError(e)) return;
      // If editing fails (e.g. message not found/too old), fall back to replying.
      return ctx.reply(text, extra);
    }
  }
  return ctx.reply(text, extra);
}

/**
 * 处理 /add 命令
 */
async function handleAdd(ctx) {
  const telegramId = ctx.from.id;
  const servers = db.getAllServers();

  if (servers.length === 0) {
    return await ctx.reply(MESSAGES.NO_SERVERS);
  }

  // 保存会话状态
  userSessions.set(telegramId, {
    state: SESSION_STATES.ADD_SELECT_SERVER,
    servers
  });

  // 显示服务器选择菜单
  const keyboard = servers.map(s => [{ text: s.name, callback_data: `add_server_${s.id}` }]);
  keyboard.push([{ text: '❌ 取消', callback_data: 'add_cancel' }]);

  await ctx.reply('🖥️ 选择服务器\n\n请选择要添加种子的服务器:', {
    reply_markup: {
      inline_keyboard: keyboard
    }
  });
}

/**
 * 处理添加种子的回调
 */
async function handleAddCallback(ctx, callbackData) {
  const telegramId = ctx.from.id;
  const session = userSessions.get(telegramId);

  if (!session) {
    try {
      return await ctx.answerCbQuery('会话已过期，请重新开始');
    } catch (_) {
      return;
    }
  }

  // Telegram callback queries have a short response window. Make sure we answer early
  // (especially before any Agent network calls) and only once per callback.
  let cbAnswered = false;
  async function answerOnce(text) {
    if (cbAnswered) return;
    cbAnswered = true;
    try {
      await ctx.answerCbQuery(text);
    } catch (_) {
      // Ignore: the query may already be too old, but we still want the flow to continue.
    }
  }

  // Prevent concurrent callback handling for the same user session (double click / webhook parallelism).
  // Allow cancel to always go through.
  let acquiredBusy = false;

  try {
    // 取消操作
    if (callbackData === 'add_cancel') {
      userSessions.delete(telegramId);
      await respond(ctx, '❌ 操作已取消', { reply_markup: null });
      await answerOnce();
      return;
    }

    if (session.__busy) {
      await answerOnce('处理中，请稍候...');
      return;
    }
    session.__busy = true;
    acquiredBusy = true;

    // 选择服务器
    if (callbackData.startsWith('add_server_')) {
      if (session.state !== SESSION_STATES.ADD_SELECT_SERVER) {
        await answerOnce('该步骤已完成');
        return;
      }

      const serverId = Number.parseInt(callbackData.slice('add_server_'.length), 10);
      const server = session.servers?.find(s => s.id === serverId);

      if (!server) {
        await answerOnce('服务器不存在');
        return;
      }

      session.server = server;
      session.state = SESSION_STATES.ADD_WAIT_TORRENT;

      // Answer early to avoid Telegram's callback timeout window (spinner).
      await answerOnce('服务器已选择');

      await respond(ctx,
        `✅ 已选择服务器: ${server.name}\n\n` +
        `📎 请发送以下任意一种内容:\n` +
        `• Magnet 链接\n` +
        `• .torrent 文件\n` +
        `• HTTP/HTTPS 链接`
        ,
        { reply_markup: null }
      );
      return;
    }

    // 选择是否移动
    if (callbackData.startsWith('add_move_')) {
      if (session.state !== SESSION_STATES.ADD_ASK_MOVE) {
        await answerOnce();
        return;
      }

      const choice = callbackData.slice('add_move_'.length);
      const shouldMove = choice === 'yes';

      // Adding torrents / listing remotes can take > 10s; answer before doing any work.
      await answerOnce();

      if (!shouldMove) {
        // 不移动，直接添加种子
        await addTorrentWithoutMove(ctx, session);
        userSessions.delete(telegramId);
        return;
      }

      // 需要移动，显示云存储选项
      session.state = SESSION_STATES.ADD_SELECT_REMOTE;

      const client = new AgentClient(session.server.url, session.server.api_key);
      const remotes = await client.getRemotes();

      if (!remotes.success || remotes.data.length === 0) {
        await respond(ctx, '❌ 没有可用的云存储，请先配置 rclone remotes', { reply_markup: null });
        userSessions.delete(telegramId);
        return;
      }

      const keyboard = remotes.data.map(r => [
        { text: `${r.name} (${r.type})`, callback_data: `add_remote_${r.name}` }
      ]);
      keyboard.push([{ text: '❌ 取消', callback_data: 'add_cancel' }]);

      await respond(ctx, '☁️ 选择云存储\n\n请选择目标云存储:', {
        reply_markup: { inline_keyboard: keyboard }
      });

      return;
    }

    // 选择云存储
    if (callbackData.startsWith('add_remote_')) {
      if (session.state !== SESSION_STATES.ADD_SELECT_REMOTE) {
        await answerOnce();
        return;
      }

      await answerOnce();
      const remoteName = callbackData.slice('add_remote_'.length);
      session.remoteName = remoteName;
      session.state = SESSION_STATES.ADD_SELECT_CATEGORY;

      // 显示分类选项
      const allCategories = db.getAllCategories();
      const categories = allCategories.filter(c => c.remote === remoteName);
      const list = categories.length > 0 ? categories : allCategories;

      const keyboard = list.map(c => [
        { text: `${c.emoji} ${c.name}`, callback_data: `add_category_${c.id}` }
      ]);
      keyboard.push([
        { text: '📁 自定义路径', callback_data: 'add_category_custom' }
      ]);
      keyboard.push([{ text: '❌ 取消', callback_data: 'add_cancel' }]);

      await respond(ctx, '📁 选择目录\n\n请选择目标目录:', {
        reply_markup: { inline_keyboard: keyboard }
      });

      return;
    }

    // 选择分类
    if (callbackData.startsWith('add_category_')) {
      if (session.state !== SESSION_STATES.ADD_SELECT_CATEGORY) {
        await answerOnce();
        return;
      }

      if (callbackData === 'add_category_custom') {
        // 自定义路径
        await answerOnce();
        session.customPath = true;
        session.state = SESSION_STATES.ADD_CUSTOM_PATH;

        await respond(ctx,
          '📝 请输入自定义路径:\n\n例如: 电影/2024/',
          { reply_markup: null }
        );
        return;
      }

      const categoryId = Number.parseInt(callbackData.slice('add_category_'.length), 10);
      const category = db.getCategoryById(categoryId);

      if (!category) {
        await answerOnce('分类不存在');
        return;
      }

      // Adding torrents / listing folders can take > 10s; answer before doing any work.
      await answerOnce();

      session.category = category;
      session.state = SESSION_STATES.IDLE;

      // 添加种子
      await addTorrentWithMove(ctx, session);
      userSessions.delete(telegramId);

      return;
    }
  } catch (error) {
    console.error('处理回调错误:', error);
    await answerOnce();
    await ctx.reply(`❌ 操作失败: ${error.message}`);
    userSessions.delete(telegramId);
  } finally {
    if (acquiredBusy) session.__busy = false;
  }

  // Fallback: always answer callback queries, even for unknown add_* data,
  // otherwise Telegram shows "Bot didn't respond".
  await answerOnce('未知操作');
}

/**
 * 处理用户输入（自定义路径）
 */
async function handleAddText(ctx) {
  const telegramId = ctx.from.id;
  const session = userSessions.get(telegramId);

  if (!session || session.state !== SESSION_STATES.ADD_CUSTOM_PATH) {
    return;
  }

  const customPath = ctx.message.text.trim();

  // 简单验证路径格式
  if (!customPath || customPath.length > 200) {
    return await ctx.reply('❌ 路径格式无效');
  }

  session.customPathValue = customPath;
  session.state = SESSION_STATES.IDLE;

  // 添加种子
  await addTorrentWithMove(ctx, session);
  userSessions.delete(telegramId);
}

/**
 * 处理 torrent 文件或链接
 */
async function handleAddTorrent(ctx) {
  const telegramId = ctx.from.id;
  const session = userSessions.get(telegramId);

  if (!session || session.state !== SESSION_STATES.ADD_WAIT_TORRENT) {
    return;
  }

  let torrentData = null;
  let fileName = null;

  // 处理 magnet 链接或 URL
  if (ctx.message.text) {
    const text = ctx.message.text.trim();

    if (text.startsWith('magnet:')) {
      torrentData = { url: text };
      fileName = parseMagnetLink(text) || 'Magnet链接';
    } else if (text.startsWith('http://') || text.startsWith('https://')) {
      torrentData = { url: text };
      fileName = text.split('/').pop() || 'URL链接';
    }
  }

  // 处理 .torrent 文件
  if (ctx.message.document && ctx.message.document.file_name.endsWith('.torrent')) {
    const fileId = ctx.message.document.file_id;
    const fileLink = await ctx.telegram.getFileLink(fileId);
    torrentData = { url: fileLink.href };
    fileName = ctx.message.document.file_name;
  }

  if (!torrentData) {
    return await ctx.reply('❌ 无法识别的种子格式。请发送 magnet 链接、.torrent 文件或 HTTP 链接。');
  }

  session.torrentData = torrentData;
  session.torrentName = fileName;
  session.state = SESSION_STATES.ADD_ASK_MOVE;

  // 询问是否移动
  const keyboard = [
    [{ text: '✅ 是（下载完成后自动移动）', callback_data: 'add_move_yes' }],
    [{ text: '❌ 否（保留在本地）', callback_data: 'add_move_no' }],
    [{ text: '❌ 取消', callback_data: 'add_cancel' }]
  ];

  await ctx.reply(
    `✅ 已识别种子: ${fileName}\n\n` +
    `📦 下载完成后是否需要自动移动到云存储？`,
    {
      reply_markup: { inline_keyboard: keyboard }
    }
  );
}

/**
 * 添加种子（不移动）
 */
async function addTorrentWithoutMove(ctx, session) {
  try {
    const client = new AgentClient(session.server.url, session.server.api_key);

    const result = await client.addTorrent({
      ...session.torrentData,
      autoMove: false
    });

    if (result.success) {
      const hash = result.data?.hash;

      await respond(ctx,
        `✅ 种子已添加\n\n` +
        `🖥️ 服务器: ${session.server.name}\n` +
        `📦 任务: ${session.torrentName}\n` +
        `🔑 Hash: ${hash || '未知'}\n\n` +
        `⬇️ 下载开始...`,
        { reply_markup: null }
      );

      // 记录到数据库
      if (hash) {
        let user = db.getUserByTelegramId(ctx.from.id);
        if (!user) {
          db.createUser(ctx.from.id, ctx.from?.username || null, ctx.from?.first_name || null);
          user = db.getUserByTelegramId(ctx.from.id);
        }

        db.createTask(
          user?.id,
          session.server.id,
          hash,
          session.torrentName,
          false
        );
        db.logActivity(user?.id, 'add_torrent', session.server.name, {
          name: session.torrentName,
          hash
        });
      }
    } else {
      await respond(ctx, `❌ 添加失败: ${result.error}`, { reply_markup: null });
    }
  } catch (error) {
    await respond(ctx, `❌ 添加失败: ${error.message}`, { reply_markup: null });
  }
}

/**
 * 添加种子（带自动移动）
 */
async function addTorrentWithMove(ctx, session) {
  try {
    const client = new AgentClient(session.server.url, session.server.api_key);

    const moveConfig = {
      remote: session.remoteName,
      dest: session.customPathValue || session.category?.path
    };

    if (!moveConfig.remote || !moveConfig.dest) {
      return await respond(ctx, '❌ 移动配置不完整，请重新执行 /add', { reply_markup: null });
    }

    const result = await client.addTorrent({
      ...session.torrentData,
      autoMove: true,
      moveConfig
    });

    if (result.success) {
      const destPath = `${moveConfig.remote}${moveConfig.dest}`;
      const hash = result.data?.hash;

      await respond(ctx,
        `✅ 种子已添加\n\n` +
        `🖥️ 服务器: ${session.server.name}\n` +
        `📦 任务: ${session.torrentName}\n` +
        `🔑 Hash: ${hash || '未知'}\n\n` +
        `⬇️ 下载完成后将自动移动到:\n` +
        `📁 ${destPath}`,
        { reply_markup: null }
      );

      // 记录到数据库
      if (hash) {
        let user = db.getUserByTelegramId(ctx.from.id);
        if (!user) {
          db.createUser(ctx.from.id, ctx.from?.username || null, ctx.from?.first_name || null);
          user = db.getUserByTelegramId(ctx.from.id);
        }

        db.createTask(
          user?.id,
          session.server.id,
          hash,
          session.torrentName,
          true,
          moveConfig.remote,
          moveConfig.dest
        );
        db.logActivity(user?.id, 'add_torrent_with_move', session.server.name, {
          name: session.torrentName,
          hash,
          dest: destPath
        });
      }
    } else {
      await respond(ctx, `❌ 添加失败: ${result.error}`, { reply_markup: null });
    }
  } catch (error) {
    await respond(ctx, `❌ 添加失败: ${error.message}`, { reply_markup: null });
  }
}

module.exports = {
  handleAdd,
  handleAddCallback,
  handleAddText,
  handleAddTorrent,
  userSessions
};
