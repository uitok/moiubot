/**
 * qBittorrent API 路由
 */
const express = require('express');
const router = express.Router();

const {
  getVersion,
  getTorrents,
  getTorrentInfo,
  addTorrent,
  addTorrentFile,
  pauseTorrent,
  resumeTorrent,
  deleteTorrent,
  isQBConnected,
  getGlobalInfo
} = require('../services/qb-client');

// GET /api/qb/status - 获取 qBittorrent 状态
router.get('/status', async (req, res) => {
  try {
    const version = await getVersion();
    const globalInfo = await getGlobalInfo();
    const torrents = await getTorrents();

    const torrentCount = torrents.length;
    const downloadingCount = torrents.filter(t =>
      ['downloading', 'stalledDL'].includes(t.state)
    ).length;

    res.json({
      success: true,
      data: {
        version,
        torrentCount,
        downloadingCount,
        dlSpeed: globalInfo.dlInfoSpeed,
        upSpeed: globalInfo.upInfoSpeed
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/qb/torrents - 获取所有种子
router.get('/torrents', async (req, res) => {
  try {
    const torrents = await getTorrents();
    res.json({
      success: true,
      data: torrents
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/qb/torrents/:hash - 获取单个种子信息
router.get('/torrents/:hash', async (req, res) => {
  try {
    const torrent = await getTorrentInfo(req.params.hash);

    if (!torrent) {
      return res.status(404).json({
        success: false,
        error: 'Torrent not found'
      });
    }

    res.json({
      success: true,
      data: torrent
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/qb/add - 添加种子（URL 或 Magnet）
router.post('/add', async (req, res) => {
  try {
    const { url, savePath, category, autoMove, moveConfig } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    // 添加种子
    await addTorrent(url, { savePath, category });

    // 等待种子添加后获取 hash
    await new Promise(resolve => setTimeout(resolve, 1000));

    const torrents = await getTorrents();
    const newTorrent = torrents.find(t =>
      t.magnet_uri === url || t.added_date === new Date().toISOString().slice(0, 19)
    );

    if (!newTorrent) {
      return res.status(500).json({
        success: false,
        error: 'Failed to find added torrent'
      });
    }

    // 如果配置了自动移动，添加到待移动队列
    if (autoMove && moveConfig) {
      const { addPendingMove } = require('../services/download-monitor');
      addPendingMove(newTorrent.hash, moveConfig);
    }

    res.json({
      success: true,
      data: {
        hash: newTorrent.hash,
        name: newTorrent.name
      },
      message: 'Torrent added successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/qb/pause/:hash - 暂停种子
router.post('/pause/:hash', async (req, res) => {
  try {
    await pauseTorrent(req.params.hash);
    res.json({
      success: true,
      message: 'Torrent paused'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/qb/resume/:hash - 恢复种子
router.post('/resume/:hash', async (req, res) => {
  try {
    await resumeTorrent(req.params.hash);
    res.json({
      success: true,
      message: 'Torrent resumed'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE /api/qb/delete/:hash - 删除种子
router.delete('/delete/:hash', async (req, res) => {
  try {
    const { deleteFiles = false } = req.query;
    await deleteTorrent(req.params.hash, deleteFiles === 'true');
    res.json({
      success: true,
      message: 'Torrent deleted'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
