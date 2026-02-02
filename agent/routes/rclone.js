/**
 * rclone API 路由
 */
const express = require('express');
const router = express.Router();

const {
  getRemotes,
  moveFile,
  listFiles,
  getAbout
} = require('../services/rclone-client');

// GET /api/rclone/remotes - 获取所有 remotes
router.get('/remotes', async (req, res) => {
  try {
    const remotes = await getRemotes();
    res.json({
      success: true,
      data: remotes
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/rclone/move - 移动文件
router.post('/move', async (req, res) => {
  try {
    const { hash, remote, dest, sourcePath } = req.body;

    if (!remote || !dest) {
      return res.status(400).json({
        success: false,
        error: 'Remote and destination are required'
      });
    }

    // 如果提供了 hash，从 qBittorrent 获取文件路径
    let source = sourcePath;
    if (hash && !source) {
      const { getTorrentInfo } = require('../services/qb-client');
      const torrent = await getTorrentInfo(hash);

      if (!torrent) {
        return res.status(404).json({
          success: false,
          error: 'Torrent not found'
        });
      }

      source = `${torrent.save_path}/${torrent.name}`;
    }

    if (!source) {
      return res.status(400).json({
        success: false,
        error: 'Source path is required'
      });
    }

    const result = await moveFile(source, remote, dest);

    res.json({
      success: true,
      data: result,
      message: 'File moved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/rclone/list - 列出文件
router.get('/list', async (req, res) => {
  try {
    const { remote, path = '' } = req.query;

    if (!remote) {
      return res.status(400).json({
        success: false,
        error: 'Remote is required'
      });
    }

    const files = await listFiles(remote, path);

    res.json({
      success: true,
      data: files
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/rclone/about - 获取存储空间信息
router.get('/about', async (req, res) => {
  try {
    const { remote } = req.query;

    if (!remote) {
      return res.status(400).json({
        success: false,
        error: 'Remote is required'
      });
    }

    const info = await getAbout(remote);

    res.json({
      success: true,
      data: info
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
