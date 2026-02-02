/**
 * 系统信息 API 路由
 */
const express = require('express');
const router = express.Router();
const os = require('os');

// GET /api/system/info - 获取系统信息
router.get('/info', async (req, res) => {
  try {
    // 获取磁盘使用情况
    const diskUsage = await getDiskUsage();

    res.json({
      success: true,
      data: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        uptime: os.uptime(),
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          used: os.totalmem() - os.freemem(),
          usagePercent: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2)
        },
        cpu: {
          cores: os.cpus().length,
          loadAverage: os.loadavg()
        },
        disk: diskUsage
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取磁盘使用情况
 */
async function getDiskUsage() {
  const { execSync } = require('child_process');

  try {
    // Linux 系统使用 df 命令
    if (process.platform === 'linux') {
      const output = execSync('df -h / | tail -1', { encoding: 'utf-8' });
      const parts = output.trim().split(/\s+/);

      return {
        total: parts[1],
        used: parts[2],
        available: parts[3],
        usagePercent: parts[4],
        mount: parts[5]
      };
    }
  } catch (error) {
    console.error('获取磁盘信息失败:', error);
  }

  return null;
}

module.exports = router;
