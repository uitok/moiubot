/**
 * rclone CLI 封装
 */
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const RCLONE_PATH = process.env.RCLONE_PATH || 'rclone';
const RCLONE_CONFIG = process.env.RCLONE_CONFIG;

/**
 * 执行 rclone 命令
 */
async function execRclone(args, options = {}) {
  const cmd = `${RCLONE_PATH} ${args}`;

  const env = {
    ...process.env,
    RCLONE_CONFIG: RCLONE_CONFIG || process.env.RCLONE_CONFIG
  };

  try {
    const { stdout, stderr } = await execAsync(cmd, {
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
  const result = await execRclone('listremotes');

  if (!result.success) {
    throw new Error(`获取 remotes 失败: ${result.error}`);
  }

  const remotes = [];
  const lines = result.stdout.split('\n').filter(line => line.trim());

  for (const line of lines) {
    const name = line.replace(':', '').trim();
    const typeResult = await execRclone(`about ${name}:`);

    if (typeResult.success) {
      remotes.push({
        name: `${name}:`,
        type: extractRemoteType(typeResult.stdout)
      });
    }
  }

  return remotes;
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

  // 构建 rclone move 命令
  const args = [
    'move',
    `"${sourcePath}"`,
    `${remote}${destPath}`,
    '--progress',
    '--stats=1s',
    deleteAfterMove ? '--delete-empty-src-dirs' : ''
  ].filter(Boolean).join(' ');

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
  const args = `lsjson "${remote}${path}"`;
  const result = await execRclone(args, { timeout: 30000 });

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
  const args = `about ${remote}`;
  const result = await execRclone(args, { timeout: 30000 });

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
  const args = `size "${remote}${path}"`;
  const result = await execRclone(args, { timeout: 60000 });

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
  const result = await execRclone(`ls ${remote}:`, { timeout: 10000 });
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
