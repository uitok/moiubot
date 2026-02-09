/**
 * rclone API 路由
 */
const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../shared/express');
const { assert, notFound } = require('../../shared/errors');

const {
  getRemotes,
  moveFile,
  listFiles,
  getAbout
} = require('../services/rclone-client');

const {
  getSyncStatus,
  forceSync
} = require('../services/rclone-sync');

// GET /api/rclone/remotes - 获取所有 remotes
router.get('/remotes', asyncHandler(async (req, res) => {
  const remotes = await getRemotes();
  res.json({ success: true, data: remotes });
}));

// POST /api/rclone/move - 移动文件
router.post('/move', asyncHandler(async (req, res) => {
  const { hash, remote, dest, sourcePath } = req.body || {};

  assert(remote, 'Remote is required', 'MISSING_REMOTE');
  assert(dest, 'Destination is required', 'MISSING_DEST');

  // 如果提供了 hash，从 qBittorrent 获取文件路径
  let source = sourcePath;
  if (hash && !source) {
    const { getTorrentInfo } = require('../services/qb-client');
    const torrent = await getTorrentInfo(hash);
    if (!torrent) throw notFound('Torrent not found', 'TORRENT_NOT_FOUND');
    source = `${torrent.save_path}/${torrent.name}`;
  }

  assert(source, 'Source path is required', 'MISSING_SOURCE_PATH');

  const result = await moveFile(source, remote, dest);
  res.json({ success: true, data: result, message: 'File moved successfully' });
}));

// GET /api/rclone/list - 列出文件
router.get('/list', asyncHandler(async (req, res) => {
  const remote = req.query?.remote;
  const listPath = req.query?.path || '';

  assert(remote, 'Remote is required', 'MISSING_REMOTE');

  const files = await listFiles(remote, listPath);
  res.json({ success: true, data: files });
}));

// GET /api/rclone/about - 获取存储空间信息
router.get('/about', asyncHandler(async (req, res) => {
  const remote = req.query?.remote;
  assert(remote, 'Remote is required', 'MISSING_REMOTE');
  const info = await getAbout(remote);
  res.json({ success: true, data: info });
}));

// ========== 配置同步相关端点 ==========

// GET /api/rclone/sync/status - 获取同步状态
router.get('/sync/status', asyncHandler(async (req, res) => {
  const status = await getSyncStatus();
  res.json({ success: true, data: status });
}));

// POST /api/rclone/sync/force - 强制同步
router.post('/sync/force', asyncHandler(async (req, res) => {
  const result = await forceSync();
  if (!result.success) {
    const { AppError } = require('../../shared/errors');
    throw new AppError(result.error || 'Sync failed', { status: 500, code: 'RCLONE_SYNC_FAILED' });
  }
  res.json({ success: true, data: result, message: result.message });
}));

// GET /api/rclone/sync/history - 同步历史（暂未实现）
router.get('/sync/history', async (req, res) => {
  res.json({
    success: true,
    data: [],
    message: '同步历史功能将在 Phase 3 实现'
  });
});

module.exports = router;
