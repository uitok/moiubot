/**
 * /servers 命令处理器
 * 显示所有配置的服务器状态
 */
const { DatabaseManager } = require('../config/database');
const { MESSAGES } = require('../config/constants');
const AgentClient = require('../services/agent-client');

const db = new DatabaseManager();

/**
 * 处理 /servers 命令
 */
async function handleServers(ctx) {
  try {
    const servers = db.getAllServers();

    if (servers.length === 0) {
      return await ctx.reply(MESSAGES.NO_SERVERS);
    }

    // 获取每个服务器的状态
    const statusPromises = servers.map(async (server) => {
      try {
        const client = new AgentClient(server.url, server.api_key);
        const health = await client.healthCheck();

        return {
          ...server,
          status: health.success ? '🟢 在线' : '🔴 离线',
          qbConnected: health.data?.qbConnected ? '✅' : '❌',
          torrents: health.data?.torrentCount || 0
        };
      } catch (error) {
        return {
          ...server,
          status: '🔴 离线',
          qbConnected: '❌',
          torrents: 0
        };
      }
    });

    const serverStatuses = await Promise.all(statusPromises);

    // 构建消息（纯文本，不使用 Markdown）
    let message = '📊 服务器状态\n\n';

    serverStatuses.forEach((server, index) => {
      message += `${index + 1}. ${server.name}\n`;
      message += `   ${server.status} | qBittorrent: ${server.qbConnected}\n`;
      message += `   任务数: ${server.torrents}\n`;
      message += `   URL: ${server.url}\n\n`;
    });

    await ctx.reply(message);
  } catch (error) {
    console.error('处理 /servers 命令错误:', error);
    await ctx.reply('❌ 获取服务器状态失败。');
  }
}

module.exports = { handleServers };
