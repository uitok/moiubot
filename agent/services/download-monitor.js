/**
 * 下载监控服务
 * 监控 qBittorrent 下载完成状态，触发自动移动
 */
const { getTorrents, getTorrentInfo, getTorrentFiles, deleteTorrent } = require('./qb-client');
const { moveFile, getRemotes } = require('./rclone-client');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// 配置
const MONITOR_INTERVAL = parseInt(process.env.MONITOR_INTERVAL) || 30000; // 30秒
const MOVE_TIMEOUT = parseInt(process.env.MOVE_TIMEOUT) || 3600000; // 1小时

// 内存存储待移动任务（生产环境应使用数据库��
const pendingMoves = new Map();
const movingTasks = new Set();

// Bot Webhook URL（用于通知）
let BOT_WEBHOOK_URL = null;

/**
 * 启动下载监控
 */
function startDownloadMonitor() {
  console.log('🔍 启动下载监控服务...');
  console.log(`⏱️ 检查间隔: ${MONITOR_INTERVAL / 1000}秒`);

  // 立即执行一次检查
  checkCompletedTorrents();

  // 定时检查
  setInterval(checkCompletedTorrents, MONITOR_INTERVAL);
}

/**
 * 检查已完成的下载
 */
async function checkCompletedTorrents() {
  try {
    const torrents = await getTorrents();

    // 筛选已完成的种子（状态为 uploading 或 stalledUP 表示已完成下载）
    const completedTorrents = torrents.filter(t => {
      return (
        (t.state === 'uploading' || t.state === 'stalledUP') &&
        !movingTasks.has(t.hash) && // 不在移动中
        !pendingMoves.has(t.hash)   // 不在待移动队列
      );
    });

    if (completedTorrents.length > 0) {
      console.log(`✅ 发现 ${completedTorrents.length} 个已完成的种子`);

      for (const torrent of completedTorrents) {
        // 这里应该从数据库查询是否需要自动移动
        // 暂时跳过，等待完整的任务管理系统
        console.log(`   - ${torrent.name} (${torrent.hash})`);
      }
    }
  } catch (error) {
    console.error('检查已完成下载失败:', error);
  }
}

/**
 * 添加到待移动队列
 */
function addPendingMove(hash, moveConfig) {
  pendingMoves.set(hash, {
    moveConfig,
    addedAt: Date.now()
  });
  console.log(`📦 添加到待移动队列: ${hash}`);
}

/**
 * 处理自动移动
 */
async function processAutoMove(torrent) {
  const moveTask = pendingMoves.get(torrent.hash);

  if (!moveTask) {
    console.log(`⏭️ 跳过无移动配置的种子: ${torrent.name}`);
    return;
  }

  // 标记为移动中
  movingTasks.add(torrent.hash);
  pendingMoves.delete(torrent.hash);

  try {
    console.log(`🚀 开始移动: ${torrent.name}`);

    // 1. 获取种子文件列表
    const files = await getTorrentFiles(torrent.hash);
    if (!files || files.length === 0) {
      throw new Error('无法获取文件列表');
    }

    // 2. 获取保存路径
    const savePath = torrent.save_path;
    const fullSourcePath = path.join(savePath, torrent.name);

    // 3. 调用 rclone 移动
    const { moveConfig } = moveTask;
    const moveResult = await moveFile(
      fullSourcePath,
      moveConfig.remote,
      moveConfig.dest,
      {
        deleteAfterMove: true,
        timeout: MOVE_TIMEOUT
      }
    );

    console.log(`✅ 移动成功: ${torrent.name} -> ${moveConfig.remote}${moveConfig.dest}`);

    // 4. 删除 qBittorrent 任务
    await deleteTorrent(torrent.hash, true);
    console.log(`🗑️ 已删除种子任务: ${torrent.hash}`);

    // 5. 通知 Bot
    await notifyBot({
      type: 'move_complete',
      name: torrent.name,
      hash: torrent.hash,
      dest: `${moveConfig.remote}${moveConfig.dest}`,
      size: torrent.size
    });

  } catch (error) {
    console.error(`❌ 自动移动失败: ${torrent.name}`, error);

    // 通知 Bot 错误
    await notifyBot({
      type: 'move_error',
      name: torrent.name,
      hash: torrent.hash,
      error: error.message
    });

  } finally {
    // 移除移动中标记
    movingTasks.delete(torrent.hash);
  }
}

/**
 * 通知 Bot
 */
async function notifyBot(data) {
  if (!BOT_WEBHOOK_URL) {
    console.warn('⚠️ Bot Webhook URL 未配置，跳过通知');
    return;
  }

  try {
    await axios.post(BOT_WEBHOOK_URL, data, {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log('📤 已通知 Bot');
  } catch (error) {
    console.error('通知 Bot 失败:', error.message);
  }
}

/**
 * 设置 Bot Webhook URL
 */
function setBotWebhook(url) {
  BOT_WEBHOOK_URL = url;
  console.log(`📡 Bot Webhook 已设置: ${url}`);
}

/**
 * 获取监控状态
 */
function getMonitorStatus() {
  return {
    pendingMoves: Array.from(pendingMoves.keys()),
    movingTasks: Array.from(movingTasks),
    interval: MONITOR_INTERVAL,
    webhookConfigured: !!BOT_WEBHOOK_URL
  };
}

module.exports = {
  startDownloadMonitor,
  addPendingMove,
  processAutoMove,
  setBotWebhook,
  getMonitorStatus
};
