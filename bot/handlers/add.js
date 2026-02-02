/**
 * /add 命令处理器
 * 交互式添加种子流程
 */
const { DatabaseManager } = require('../config/database');
const { MESSAGES, SESSION_STATES } = require('../config/constants');
const AgentClient = require('../services/agent-client');
const { parseMagnetLink } = require('../../shared/utils');

const db = new DatabaseManager();

// 用户会话存储（生产环境应使用 Redis）
const userSessions = new Map();

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

  await ctx.reply('🖥️ **选择服务器**\n\n请选择要添加种子的服务器:', {
    reply_markup: {
      inline_keyboard: keyboard
    },
    parse_mode: 'Markdown'
  });
}

/**
 * 处理添加种子的回调
 */
async function handleAddCallback(ctx, callbackData, data) {
  const telegramId = ctx.from.id;
  const session = userSessions.get(telegramId);

  if (!session) {
    return await ctx.answerCbQuery('会话已过期，请重新开始');
  }

  try {
    // 取消操作
    if (callbackData === 'add_cancel') {
      userSessions.delete(telegramId);
      await ctx.editMessageText('❌ 操作已取消');
      return await ctx.answerCbQuery();
    }

    // 选择服务器
    if (callbackData.startsWith('add_server_')) {
      const serverId = parseInt(data);
      const server = servers.find(s => s.id === serverId);

      if (!server) {
        return await ctx.answerCbQuery('服务器不存在');
      }

      session.server = server;
      session.state = SESSION_STATES.ADD_WAIT_TORRENT;

      await ctx.editMessageText(
        `✅ 已选择服务器: **${server.name}**\n\n` +
        `📎 请发送以下任意一种内容:\n` +
        `• Magnet 链接\n` +
        `• .torrent 文件\n` +
        `• HTTP/HTTPS 链接`,
        { parse_mode: 'Markdown' }
      );

      return await ctx.answerCbQuery('服务器已选择');
    }

    // 选择是否移动
    if (callbackData.startsWith('add_move_')) {
      const shouldMove = data === 'yes';

      if (!shouldMove) {
        // 不移动，直接添加种子
        await addTorrentWithoutMove(ctx, session);
        userSessions.delete(telegramId);
        return await ctx.answerCbQuery();
      }

      // 需要移动，显示云存储选项
      session.state = SESSION_STATES.ADD_SELECT_REMOTE;

      const client = new AgentClient(session.server.url, session.server.api_key);
      const remotes = await client.getRemotes();

      if (!remotes.success || remotes.data.length === 0) {
        await ctx.editMessageText('❌ 没有可用的云存储，请先配置 rclone remotes');
        userSessions.delete(telegramId);
        return await ctx.answerCbQuery();
      }

      const keyboard = remotes.data.map(r => [
        { text: `${r.name} (${r.type})`, callback_data: `add_remote_${r.name}` }
      ]);
      keyboard.push([{ text: '❌ 取消', callback_data: 'add_cancel' }]);

      await ctx.editMessageText('☁️ **选择云存储**\n\n请选择目标云存储:', {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'Markdown'
      });

      return await ctx.answerCbQuery();
    }

    // 选择云存储
    if (callbackData.startsWith('add_remote_')) {
      const remoteName = data;
      session.remoteName = remoteName;
      session.state = SESSION_STATES.ADD_SELECT_CATEGORY;

      // 显示分类选项
      const categories = db.getAllCategories();
      const keyboard = categories.map(c => [
        { text: `${c.emoji} ${c.name}`, callback_data: `add_category_${c.id}` }
      ]);
      keyboard.push([
        { text: '📁 自定义路径', callback_data: 'add_category_custom' }
      ]);
      keyboard.push([{ text: '❌ 取消', callback_data: 'add_cancel' }]);

      await ctx.editMessageText('📁 **选择目录**\n\n请选择目标目录:', {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'Markdown'
      });

      return await ctx.answerCbQuery();
    }

    // 选择分类
    if (callbackData.startsWith('add_category_')) {
      if (data === 'custom') {
        // 自定义路径
        session.customPath = true;
        session.state = 'add_custom_path';

        await ctx.editMessageText(
          '📝 请输入自定义路径:\n\n例如: 电影/2024/',
          { reply_markup: null }
        );
        return await ctx.answerCbQuery();
      }

      const categoryId = parseInt(data);
      const category = db.getCategoryById(categoryId);

      if (!category) {
        return await ctx.answerCbQuery('分类不存在');
      }

      session.category = category;
      session.state = SESSION_STATES.ADD_SELECT_CATEGORY;

      // 添加种子
      await addTorrentWithMove(ctx, session);
      userSessions.delete(telegramId);

      return await ctx.answerCbQuery();
    }
  } catch (error) {
    console.error('处理回调错误:', error);
    await ctx.reply(`❌ 操作失败: ${error.message}`);
    userSessions.delete(telegramId);
  }
}

/**
 * 处理用户输入（自定义路径）
 */
async function handleAddText(ctx) {
  const telegramId = ctx.from.id;
  const session = userSessions.get(telegramId);

  if (!session || session.state !== 'add_custom_path') {
    return;
  }

  const customPath = ctx.message.text.trim();

  // 简单验证路径格式
  if (!customPath || customPath.length > 200) {
    return await ctx.reply('❌ 路径格式无效');
  }

  session.customPathValue = customPath;

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
    `✅ 已识别种子: **${fileName}**\n\n` +
    `📦 下载完成后是否需要自动移动到云存储？`,
    {
      reply_markup: { inline_keyboard: keyboard },
      parse_mode: 'Markdown'
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
      await ctx.editMessageText(
        `✅ **种子已添加**\n\n` +
        `🖥️ 服务器: ${session.server.name}\n` +
        `📦 任务: ${session.torrentName}\n` +
        `🔑 Hash: \`${result.hash}\`\n\n` +
        `⬇️ 下载开始...`,
        { parse_mode: 'Markdown' }
      );

      // 记录到数据库
      const user = db.getUserByTelegramId(ctx.from.id);
      db.createTask(
        user?.id,
        session.server.id,
        result.hash,
        session.torrentName,
        false
      );
      db.logActivity(user?.id, 'add_torrent', session.server.name, {
        name: session.torrentName,
        hash: result.hash
      });
    } else {
      await ctx.editMessageText(`❌ 添加失败: ${result.error}`);
    }
  } catch (error) {
    await ctx.editMessageText(`❌ 添加失败: ${error.message}`);
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
      dest: session.customPathValue || session.category.path
    };

    const result = await client.addTorrent({
      ...session.torrentData,
      autoMove: true,
      moveConfig
    });

    if (result.success) {
      const destPath = `${moveConfig.remote}${moveConfig.dest}`;
      await ctx.editMessageText(
        `✅ **种子已添加**\n\n` +
        `🖥️ 服务器: ${session.server.name}\n` +
        `📦 任务: ${session.torrentName}\n` +
        `🔑 Hash: \`${result.hash}\`\n\n` +
        `⬇️ 下载完成后将自动移动到:\n` +
        `📁 ${destPath}`,
        { parse_mode: 'Markdown' }
      );

      // 记录到数据库
      const user = db.getUserByTelegramId(ctx.from.id);
      db.createTask(
        user?.id,
        session.server.id,
        result.hash,
        session.torrentName,
        true,
        moveConfig.remote,
        moveConfig.dest
      );
      db.logActivity(user?.id, 'add_torrent_with_move', session.server.name, {
        name: session.torrentName,
        hash: result.hash,
        dest: destPath
      });
    } else {
      await ctx.editMessageText(`❌ 添加失败: ${result.error}`);
    }
  } catch (error) {
    await ctx.editMessageText(`❌ 添加失败: ${error.message}`);
  }
}

module.exports = {
  handleAdd,
  handleAddCallback,
  handleAddText,
  handleAddTorrent,
  userSessions
};
