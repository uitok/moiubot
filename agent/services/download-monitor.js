/**
 * 下载监控服务
 * 监控 qBittorrent 下载完成状态，触发自动移动
 */
const { getTorrents, getTorrentFiles, deleteTorrent } = require('./qb-client');
const { moveFile } = require('./rclone-client');
const path = require('path');
const axios = require('axios');

// 配置
const MONITOR_INTERVAL = parseInt(process.env.MONITOR_INTERVAL) || 30000; // 30秒
const MOVE_TIMEOUT = parseInt(process.env.MOVE_TIMEOUT) || 3600000; // 1小时
const MOVE_TASK_TTL = parseInt(process.env.MOVE_TASK_TTL) || 24 * 60 * 60 * 1000; // 24小时

// 内存存储待移动任务（生产环境建议使用数据库或队列）
const pendingMoves = new Map();
const movingTasks = new Set();

// Bot Webhook URL（用于通知）
let BOT_WEBHOOK_URL = process.env.BOT_WEBHOOK_URL || null;
const BOT_WEBHOOK_API_KEY = process.env.BOT_WEBHOOK_API_KEY || null;

let _logger = null;
let _isChecking = false;

function log(level, message, meta) {
  if (_logger) return _logger[level](message, meta);
  // Fallback to console for local/debug usage.
  // eslint-disable-next-line no-console
  console[level === 'warn' ? 'warn' : level === 'error' ? 'error' : 'log'](message, meta || '');
}

/**
 * 启动下载监控
 */
function startDownloadMonitor(options = {}) {
  _logger = options.logger || null;

  log('info', '🔍 启动下载监控服务...');
  log('info', `⏱️ 检查间隔: ${MONITOR_INTERVAL / 1000}秒`);
  if (BOT_WEBHOOK_URL) log('info', `📡 Bot Webhook 已配置: ${BOT_WEBHOOK_URL}`);

  // 立即执行一次检查
  checkCompletedTorrents();

  // 定时检查
  setInterval(checkCompletedTorrents, MONITOR_INTERVAL);
}

function isTorrentCompleted(t) {
  return ['uploading', 'stalledUP', 'pausedUP'].includes(t.state);
}

/**
 * 检查已完成的下载
 */
async function checkCompletedTorrents() {
  if (_isChecking) return;
  _isChecking = true;

  try {
    if (pendingMoves.size === 0) return;

    const torrents = await getTorrents();
    const now = Date.now();

    for (const [hash, task] of pendingMoves.entries()) {
      if (movingTasks.has(hash)) continue;

      // 清理超时的待移动任务，避免永久堆积
      if (now - task.addedAt > MOVE_TASK_TTL) {
        pendingMoves.delete(hash);
        log('warn', '⌛ 待移动任务已过期，已移除', { hash });
        continue;
      }

      const torrent = torrents.find(t => t.hash === hash);
      if (!torrent) continue;

      if (!isTorrentCompleted(torrent)) continue;

      // 触发移动（processAutoMove 会负责标记 movingTasks、移除 pendingMoves）
      await processAutoMove(torrent);
    }
  } catch (error) {
    log('error', '检查已完成下载失败', { err: { message: error.message, stack: error.stack } });
  } finally {
    _isChecking = false;
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
  log('info', '📦 添加到待移动队列', { hash, moveConfig });
}

/**
 * 处理自动移动
 */
async function processAutoMove(torrent) {
  const moveTask = pendingMoves.get(torrent.hash);

  if (!moveTask) {
    log('info', '⏭️ 跳过无移动配置的种子', { name: torrent.name, hash: torrent.hash });
    return;
  }

  // 标记为移动中
  movingTasks.add(torrent.hash);
  pendingMoves.delete(torrent.hash);

  try {
    log('info', '🚀 开始移动', { name: torrent.name, hash: torrent.hash });

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

    log('info', '✅ 移动成功', { name: torrent.name, dest: `${moveConfig.remote}${moveConfig.dest}` });

    // 4. 删除 qBittorrent 任务
    await deleteTorrent(torrent.hash, true);
    log('info', '🗑️ 已删除种子任务', { hash: torrent.hash });

    // 5. 通知 Bot
    await notifyBot({
      type: 'move_complete',
      name: torrent.name,
      hash: torrent.hash,
      dest: `${moveConfig.remote}${moveConfig.dest}`,
      size: torrent.size
    });

  } catch (error) {
    log('error', '❌ 自动移动失败', { name: torrent.name, hash: torrent.hash, err: { message: error.message, stack: error.stack } });

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
    log('warn', '⚠️ Bot Webhook URL 未配置，跳过通知');
    return;
  }

  try {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (BOT_WEBHOOK_API_KEY) headers['X-API-Key'] = BOT_WEBHOOK_API_KEY;

    await axios.post(BOT_WEBHOOK_URL, data, {
      timeout: 5000,
      headers
    });
    log('info', '📤 已通知 Bot');
  } catch (error) {
    log('warn', '通知 Bot 失败', { err: { message: error.message } });
  }
}

/**
 * 设置 Bot Webhook URL
 */
function setBotWebhook(url) {
  BOT_WEBHOOK_URL = url;
  log('info', '📡 Bot Webhook 已设置', { url });
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
