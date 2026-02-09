/**
 * /status 命令处理器
 * 显示指定服务器的详细状态
 */
const { DatabaseManager } = require('../config/database');
const { MESSAGES } = require('../config/constants');
const AgentClient = require('../services/agent-client');
const { formatBytes, formatSpeed } = require('../../shared/utils');

const db = new DatabaseManager();

/**
 * 处理 /status 命令
 */
async function handleStatus(ctx) {
  const args = ctx.message.text.split(' ').slice(1);
  const serverName = args[0];

  if (!serverName) {
    return await ctx.reply(
      '用法: /status [服务器名称]\n\n使用 /servers 查看所有服务器。'
    );
  }

  try {
    const server = db.getServerByName(serverName);

    if (!server) {
      return await ctx.reply(MESSAGES.SERVER_NOT_FOUND);
    }

    const client = new AgentClient(server.url, server.api_key);

    // 获取系统信息
    const systemInfo = await client.getSystemInfo();
    const torrentsRes = await client.getTorrents();

    if (!systemInfo.success) {
      return await ctx.reply(`❌ 无法获取服务器信息: ${systemInfo.error}`);
    }

    const info = systemInfo.data;
    const torrents = Array.isArray(torrentsRes.data) ? torrentsRes.data : [];

    const downloading = torrents.filter(t =>
      ['downloading', 'stalledDL'].includes(t.state)
    );
    const completed = torrents.filter(t =>
      ['uploading', 'stalledUP', 'pausedUP'].includes(t.state)
    );

    let message = `📊 ${server.name} 详细状态\n\n`;

    // 磁盘使用情况
    if (info.disk) {
      const usedPercent = typeof info.disk.usagePercent === 'number'
        ? info.disk.usagePercent.toFixed(1)
        : (info.disk.total ? ((info.disk.used / info.disk.total) * 100).toFixed(1) : '0.0');
      message += `💾 磁盘空间\n`;
      message += `   已用: ${formatBytes(info.disk.used)} / ${formatBytes(info.disk.total)}\n`;
      message += `   使用率: ${usedPercent}%\n\n`;
    }

    // 下载统计
    message += `⬇️ 下载统计\n`;
    message += `   下载中: ${downloading.length}\n`;
    message += `   已完成: ${completed.length}\n`;
    message += `   总计: ${torrents.length}\n\n`;

    // 下载速度
    const dlSpeed = torrents.reduce((sum, t) => sum + (t.dlspeed || 0), 0);
    const upSpeed = torrents.reduce((sum, t) => sum + (t.upspeed || 0), 0);

    if (dlSpeed > 0 || upSpeed > 0) {
      message += `🚀 实时速度\n`;
      if (dlSpeed > 0) message += `   下载: ${formatSpeed(dlSpeed)}\n`;
      if (upSpeed > 0) message += `   上传: ${formatSpeed(upSpeed)}\n`;
      message += '\n';
    }

    // 显示下载中的任务
    if (downloading.length > 0) {
      message += `📥 正在下载\n`;
      downloading.slice(0, 5).forEach(t => {
        const progress = ((t.progress || 0) * 100).toFixed(1);
        const eta = t.eta > 0 ? `${Math.floor(t.eta / 60)}分` : '∞';
        message += `   • ${t.name}\n`;
        message += `     ${progress}% | ${formatSpeed(t.dlspeed)} | ETA: ${eta}\n`;
      });

      if (downloading.length > 5) {
        message += `   ... 还有 ${downloading.length - 5} 个任务\n`;
      }
    }

    await ctx.reply(message);
  } catch (error) {
    console.error('处理 /status 命令错误:', error);
    await ctx.reply(`❌ 获取状态失败: ${error.message}`);
  }
}

module.exports = { handleStatus };
