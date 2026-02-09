/**
 * rclone CLI 封装
 */
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const RCLONE_PATH = process.env.RCLONE_PATH || 'rclone';
const RCLONE_CONFIG = process.env.RCLONE_CONFIG;

// Simple in-memory cache for remotes list (kept in-process).
// TTL: 5 minutes.
const REMOTES_CACHE_TTL_MS = 300000;
const remotesCache = {
  value: null,
  expiresAt: 0,
  refreshing: null
};

/**
 * 执行 rclone 命令
 */
async function execRclone(args, options = {}) {
  if (!Array.isArray(args)) {
    throw new Error('execRclone args must be an array of strings');
  }

  const env = {
    ...process.env,
    RCLONE_CONFIG: RCLONE_CONFIG || process.env.RCLONE_CONFIG
  };

  try {
    const { stdout, stderr } = await execFileAsync(RCLONE_PATH, args, {
      env,
      timeout: options.timeout || 300000,
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stdout: error.stdout || '',
      stderr: error.stderr || ''
    };
  }
}

/**
 * 获取所有 remotes
 */
async function getRemotes() {
  const now = Date.now();

  // Cache hit.
  if (remotesCache.value !== null && now < remotesCache.expiresAt) {
    return remotesCache.value;
  }

  // De-duplicate concurrent refreshes.
  if (remotesCache.refreshing) {
    try {
      return await remotesCache.refreshing;
    } catch (error) {
      if (remotesCache.value !== null) return remotesCache.value;
      throw error;
    }
  }

  const refreshPromise = (async () => {
    const result = await execRclone(['listremotes']);

    if (!result.success) {
      // Do not clear an existing cache on failure; fall back when possible.
      if (remotesCache.value !== null) return remotesCache.value;
      throw new Error(`获取 remotes 失败: ${result.error}`);
    }

    const remotes = [];
    const lines = result.stdout.split('\n').filter(line => line.trim());

    for (const line of lines) {
      const name = line.replace(':', '').trim();
      const typeResult = await execRclone(['about', `${name}:`]);

      remotes.push({
        name: `${name}:`,
        type: typeResult.success ? extractRemoteType(typeResult.stdout) : 'Unknown'
      });
    }

    remotesCache.value = remotes;
    remotesCache.expiresAt = Date.now() + REMOTES_CACHE_TTL_MS;
    return remotes;
  })();

  remotesCache.refreshing = refreshPromise;
  try {
    return await refreshPromise;
  } finally {
    if (remotesCache.refreshing === refreshPromise) remotesCache.refreshing = null;
  }
}

/**
 * 提取 remote 类型
 */
function extractRemoteType(aboutOutput) {
  if (aboutOutput.includes('Google Drive')) return 'Google Drive';
  if (aboutOutput.includes('OneDrive')) return 'OneDrive';
  if (aboutOutput.includes('Dropbox')) return 'Dropbox';
  if (aboutOutput.includes('S3')) return 'S3';
  if (aboutOutput.includes('B2')) return 'Backblaze B2';
  return 'Unknown';
}

/**
 * 移动文件
 */
async function moveFile(sourcePath, remote, destPath, options = {}) {
  const { deleteAfterMove = true } = options;

  const args = [
    'move',
    sourcePath,
    `${remote}${destPath}`,
    '--progress',
    '--stats=1s'
  ];

  if (deleteAfterMove) args.push('--delete-empty-src-dirs');

  const result = await execRclone(args, {
    timeout: options.timeout || 3600000 // 1小时默认超时
  });

  if (!result.success) {
    throw new Error(`移动文件失败: ${result.error}`);
  }

  return {
    success: true,
    sourcePath,
    dest: `${remote}${destPath}`,
    details: result.stdout
  };
}

/**
 * 列出文件
 */
async function listFiles(remote, path = '') {
  const result = await execRclone(['lsjson', `${remote}${path}`], { timeout: 30000 });

  if (!result.success) {
    throw new Error(`列出文件失败: ${result.error}`);
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    return [];
  }
}

/**
 * 获取 remote 存储空间
 */
async function getAbout(remote) {
  const result = await execRclone(['about', remote], { timeout: 30000 });

  if (!result.success) {
    throw new Error(`获取空间信息失败: ${result.error}`);
  }

  // 解析输出
  const lines = result.stdout.split('\n');
  const info = {};

  for (const line of lines) {
    const match = line.match(/(.+):\s*(.+)/);
    if (match) {
      const [, key, value] = match;
      info[key.trim()] = value.trim();
    }
  }

  return info;
}

/**
 * 获取磁盘使用情况
 */
async function getDiskUsage(remote, path = '') {
  const result = await execRclone(['size', `${remote}${path}`], { timeout: 60000 });

  if (!result.success) {
    throw new Error(`获取磁盘使用情况失败: ${result.error}`);
  }

  // 解析输出
  const lines = result.stdout.split('\n');
  const info = {};

  for (const line of lines) {
    const match = line.match(/(.+):\s*(.+)/);
    if (match) {
      const [, key, value] = match;
      info[key.trim()] = value.trim();
    }
  }

  return info;
}

/**
 * 测试 remote 连接
 */
async function testRemote(remote) {
  const result = await execRclone(['ls', `${remote}:`], { timeout: 10000 });
  return result.success;
}

module.exports = {
  getRemotes,
  moveFile,
  listFiles,
  getAbout,
  getDiskUsage,
  testRemote
};
