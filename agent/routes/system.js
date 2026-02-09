/**
 * 系统信息 API 路由
 */
const express = require('express');
const router = express.Router();
const os = require('os');
const { execFileSync } = require('child_process');
const { asyncHandler } = require('../../shared/express');

// GET /api/system/info - 获取系统信息
router.get('/info', asyncHandler(async (req, res) => {
  const diskUsage = getDiskUsage();

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
        usagePercent: Number(((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2))
      },
      cpu: {
        cores: os.cpus().length,
        loadAverage: os.loadavg()
      },
      disk: diskUsage
    }
  });
}));

/**
 * 获取磁盘使用情况
 */
function getDiskUsage() {
  try {
    // Linux 系统使用 df 命令，返回字节级别数据（便于 Bot 端统一格式化）
    if (process.platform === 'linux') {
      const output = execFileSync('df', ['-B1', '/'], { encoding: 'utf-8' });
      const lines = output.trim().split('\n');
      const last = lines[lines.length - 1] || '';
      const parts = last.trim().split(/\s+/);

      // Filesystem Size Used Avail Use% Mounted on
      // 0          1    2    3    4    5
      if (parts.length < 6) return null;

      return {
        filesystem: parts[0],
        total: Number.parseInt(parts[1], 10),
        used: Number.parseInt(parts[2], 10),
        available: Number.parseInt(parts[3], 10),
        usagePercent: Number.parseFloat(String(parts[4]).replace('%', '')),
        mount: parts[5]
      };
    }
  } catch (error) {
    console.error('获取磁盘信息失败:', error);
  }

  return null;
}

module.exports = router;
