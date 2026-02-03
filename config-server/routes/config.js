/**
 * 配置分发端点
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { authenticateApiKey } = require('../middleware/auth');

const RCLONE_CONFIG_PATH = process.env.RCLONE_CONFIG || '/home/admin/.config/rclone/rclone.conf';

/**
 * 从配置文件中提取版本号
 */
function extractVersion(configContent) {
  const match = configContent.match(/^# rclone-config-version:\s*(.+)$/m);
  return match ? match[1].trim() : 'v1.0.0-unknown';
}

/**
 * 生成版本号
 */
function generateVersion() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
  return `v1.0.0-${date}-${time}`;
}

// GET /api/config/rclone - 获取配置文件
router.get('/rclone', authenticateApiKey, (req, res) => {
  try {
    if (!fs.existsSync(RCLONE_CONFIG_PATH)) {
      return res.status(404).json({
        success: false,
        error: 'Config file not found',
        code: 'CONFIG_NOT_FOUND'
      });
    }

    const config = fs.readFileSync(RCLONE_CONFIG_PATH, 'utf-8');
    const version = extractVersion(config);

    res.json({
      success: true,
      data: {
        config,
        version,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'READ_ERROR'
    });
  }
});

// GET /api/config/rclone/version - 获取版本号
router.get('/rclone/version', authenticateApiKey, (req, res) => {
  try {
    if (!fs.existsSync(RCLONE_CONFIG_PATH)) {
      return res.status(404).json({
        success: false,
        error: 'Config file not found',
        code: 'CONFIG_NOT_FOUND'
      });
    }

    const config = fs.readFileSync(RCLONE_CONFIG_PATH, 'utf-8');
    const version = extractVersion(config);

    res.json({
      success: true,
      data: {
        version,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'READ_ERROR'
    });
  }
});

// POST /api/config/rclone/update - 更新配置
router.post('/rclone/update', authenticateApiKey, (req, res) => {
  try {
    const { config } = req.body;

    if (!config) {
      return res.status(400).json({
        success: false,
        error: 'Config is required',
        code: 'MISSING_CONFIG'
      });
    }

    // 备份旧配置
    if (fs.existsSync(RCLONE_CONFIG_PATH)) {
      const backupDir = path.dirname(RCLONE_CONFIG_PATH);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const backupPath = path.join(backupDir, `rclone.conf.backup-${timestamp}`);
      fs.copyFileSync(RCLONE_CONFIG_PATH, backupPath);
    }

    // 添加版本号
    const newVersion = generateVersion();
    const configWithVersion = `# rclone-config-version: ${newVersion}\n${config}`;

    // 保存新配置
    const dir = path.dirname(RCLONE_CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(RCLONE_CONFIG_PATH, configWithVersion, 'utf-8');

    res.json({
      success: true,
      data: {
        version: newVersion,
        timestamp: new Date().toISOString()
      },
      message: 'Config updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'UPDATE_ERROR'
    });
  }
});

module.exports = router;
