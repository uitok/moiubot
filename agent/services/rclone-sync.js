/**
 * rclone 配置同步服务
 * 负责从主服务器同步 rclone 配置
 */
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const axios = require('axios');

const execAsync = promisify(exec);

// 配置
const RCLONE_CONFIG_PATH = process.env.RCLONE_CONFIG || '/home/admin/.config/rclone/rclone.conf';
const CONFIG_SERVER_URL = process.env.CONFIG_SERVER_URL || 'http://localhost:4000';
const CONFIG_SERVER_API_KEY = process.env.CONFIG_SERVER_API_KEY || '';
const RCLONE_SYNC_ENABLED = process.env.RCLONE_SYNC_ENABLED !== 'false';
const RCLONE_SYNC_ON_START = process.env.RCLONE_SYNC_ON_START !== 'false';

// 日志函数
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [rclone-sync] ${message}`;
  
  switch (level) {
    case 'info':
      console.log(logMessage);
      break;
    case 'warn':
      console.warn(logMessage);
      break;
    case 'error':
      console.error(logMessage);
      break;
    case 'success':
      console.log(`✅ ${logMessage}`);
      break;
  }
  
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
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

/**
 * 从配置文件中提取版本号
 */
function extractVersion(configContent) {
  const match = configContent.match(/^# rclone-config-version:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

/**
 * 添加版本号到配置文件
 */
function addVersionToConfig(configContent) {
  const version = extractVersion(configContent);
  if (version) {
    return configContent;
  }
  
  const newVersion = generateVersion();
  return `# rclone-config-version: ${newVersion}\n${configContent}`;
}

/**
 * 检查本地配置是否存在
 */
function checkLocalConfig() {
  try {
    if (fs.existsSync(RCLONE_CONFIG_PATH)) {
      const content = fs.readFileSync(RCLONE_CONFIG_PATH, 'utf-8');
      const version = extractVersion(content);
      log('info', '检查本地配置...', { exists: true, version: version || 'unknown' });
      return { exists: true, version, content };
    } else {
      log('info', '检查本地配置...', { exists: false });
      return { exists: false, version: null, content: null };
    }
  } catch (error) {
    log('error', '检查本地配置失败', { error: error.message });
    return { exists: false, version: null, content: null, error: error.message };
  }
}

/**
 * 备份旧配置
 */
function backupConfig() {
  try {
    if (!fs.existsSync(RCLONE_CONFIG_PATH)) {
      return { success: true, message: '无需备份' };
    }
    
    const backupDir = path.dirname(RCLONE_CONFIG_PATH);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupPath = path.join(backupDir, `rclone.conf.backup-${timestamp}`);
    
    fs.copyFileSync(RCLONE_CONFIG_PATH, backupPath);
    log('info', '配置已备份', { backupPath });
    return { success: true, backupPath };
  } catch (error) {
    log('error', '备份配置失败', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * 从主服务器下载配置
 */
async function downloadConfig() {
  if (!CONFIG_SERVER_URL || !CONFIG_SERVER_API_KEY) {
    const error = '配置服务器 URL 或 API Key 未设置';
    log('error', error);
    return { success: false, error };
  }
  
  try {
    log('info', '开始下载配置...', { server: CONFIG_SERVER_URL });
    
    const response = await axios.get(`${CONFIG_SERVER_URL}/api/config/rclone`, {
      headers: {
        'X-API-Key': CONFIG_SERVER_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    if (!response.data || !response.data.success) {
      const error = response.data?.error || '下载失败';
      log('error', '下载配置失败', { error });
      return { success: false, error };
    }
    
    const config = response.data.data.config;
    const version = response.data.data.version;
    
    log('success', '配置下载成功', { version });
    return { success: true, config, version };
  } catch (error) {
    log('error', '下载配置失败', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * 获取远程版本号
 */
async function getRemoteVersion() {
  if (!CONFIG_SERVER_URL || !CONFIG_SERVER_API_KEY) {
    return { success: false, error: '配置服务器未设置' };
  }
  
  try {
    const response = await axios.get(`${CONFIG_SERVER_URL}/api/config/rclone/version`, {
      headers: {
        'X-API-Key': CONFIG_SERVER_API_KEY
      },
      timeout: 10000
    });
    
    if (response.data && response.data.success) {
      return { success: true, version: response.data.data.version };
    }
    
    return { success: false, error: '获取版本失败' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 保存配置到本地
 */
function saveConfig(configContent) {
  try {
    // 确保目录存在
    const dir = path.dirname(RCLONE_CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 添加版本号（如果不存在）
    const configWithVersion = addVersionToConfig(configContent);
    
    fs.writeFileSync(RCLONE_CONFIG_PATH, configWithVersion, 'utf-8');
    const version = extractVersion(configWithVersion);
    log('success', '配置已保存', { path: RCLONE_CONFIG_PATH, version });
    return { success: true, version };
  } catch (error) {
    log('error', '保存配置失败', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * 验证 rclone 配置
 */
async function verifyConfig() {
  try {
    log('info', '验证配置...');
    
    // 使用 rclone listremotes 验证配置
    const { stdout, stderr } = await execAsync('rclone listremotes', {
      env: { ...process.env, RCLONE_CONFIG: RCLONE_CONFIG_PATH },
      timeout: 30000
    });
    
    const remotes = stdout.trim().split('\n').filter(line => line.trim());
    
    if (remotes.length === 0) {
      log('warn', '配置中没有 remotes');
      return { success: true, valid: true, remotes: [], message: '配置有效，但没有 remotes' };
    }
    
    log('success', '配置验证通过', { remotes: remotes.length });
    return { success: true, valid: true, remotes };
  } catch (error) {
    log('error', '配置验证失败', { error: error.message });
    return { success: false, valid: false, error: error.message };
  }
}

/**
 * 比较版本号
 */
function needsUpdate(localVersion, remoteVersion) {
  if (!localVersion) return true;
  if (!remoteVersion) return false;
  return localVersion !== remoteVersion;
}

/**
 * 确保配置存在且是最新的
 */
async function ensureRcloneConfig() {
  if (!RCLONE_SYNC_ENABLED) {
    log('info', 'rclone 同步功能已禁用');
    return { success: true, message: '同步功能已禁用' };
  }
  
  try {
    log('info', '===== 开始 rclone 配置同步 =====');
    
    // 1. 检查本地配置
    const localConfig = checkLocalConfig();
    
    // 2. 获取远程版本
    const remoteVersionResult = await getRemoteVersion();
    
    if (!remoteVersionResult.success) {
      log('warn', '无法获取远程版本', { error: remoteVersionResult.error });
      
      // 如果本地配置存在，使用本地配置
      if (localConfig.exists) {
        log('info', '使用本地配置继续启动');
        return { success: true, message: '使用本地配置', fromCache: true };
      }
      
      // 如果本地配置不存在，尝试下载
      log('info', '本地配置不存在，尝试下载...');
    }
    
    const remoteVersion = remoteVersionResult.version;
    
    // 3. 判断是否需要更新
    const shouldUpdate = needsUpdate(localConfig.version, remoteVersion);
    
    if (!shouldUpdate && localConfig.exists) {
      log('success', '配置已是最新', { version: localConfig.version });
      return { success: true, message: '配置已是最新', version: localConfig.version };
    }
    
    // 4. 下载新配置
    const downloadResult = await downloadConfig();
    
    if (!downloadResult.success) {
      // 下载失败，使用本地配置（如果存在）
      if (localConfig.exists) {
        log('warn', '下载失败，使用本地配置继续启动');
        return { success: true, message: '下载失败，使用本地配置', fromCache: true };
      }
      
      return { success: false, error: downloadResult.error };
    }
    
    // 5. 备份旧配置
    if (localConfig.exists) {
      await backupConfig();
    }
    
    // 6. 保存新配置
    const saveResult = saveConfig(downloadResult.config);
    
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }
    
    // 7. 验证配置
    const verifyResult = await verifyConfig();
    
    if (!verifyResult.success || !verifyResult.valid) {
      log('error', '配置验证失败，恢复备份');
      
      // 恢复备份
      if (localConfig.exists) {
        const backupDir = path.dirname(RCLONE_CONFIG_PATH);
        const backups = fs.readdirSync(backupDir)
          .filter(f => f.startsWith('rclone.conf.backup-'))
          .sort()
          .reverse();
        
        if (backups.length > 0) {
          const latestBackup = path.join(backupDir, backups[0]);
          fs.copyFileSync(latestBackup, RCLONE_CONFIG_PATH);
          log('info', '已恢复备份');
        }
      }
      
      return { success: false, error: '配置验证失败' };
    }
    
    log('success', '===== rclone 配置同步完成 =====');
    return {
      success: true,
      version: saveResult.version,
      remotes: verifyResult.remotes,
      message: '配置同步成功'
    };
    
  } catch (error) {
    log('error', '同步过程出错', { error: error.message });
    
    // 降级方案：使用本地配置（如果存在）
    const localConfig = checkLocalConfig();
    if (localConfig.exists) {
      log('warn', '使用本地配置继续启动');
      return { success: true, message: '同步失败，使用本地配置', fromCache: true };
    }
    
    return { success: false, error: error.message };
  }
}

/**
 * 获取同步状态
 */
async function getSyncStatus() {
  const localConfig = checkLocalConfig();
  const remoteVersion = await getRemoteVersion();
  
  return {
    enabled: RCLONE_SYNC_ENABLED,
    localExists: localConfig.exists,
    localVersion: localConfig.version,
    remoteVersion: remoteVersion.success ? remoteVersion.version : null,
    needsUpdate: needsUpdate(localConfig.version, remoteVersion.success ? remoteVersion.version : null),
    configPath: RCLONE_CONFIG_PATH,
    configServer: CONFIG_SERVER_URL
  };
}

/**
 * 强制同步
 */
async function forceSync() {
  log('info', '强制同步配置...');
  
  // 1. 下载新配置
  const downloadResult = await downloadConfig();
  if (!downloadResult.success) {
    return { success: false, error: downloadResult.error };
  }
  
  // 2. 备份旧配置
  await backupConfig();
  
  // 3. 保存新配置
  const saveResult = saveConfig(downloadResult.config);
  if (!saveResult.success) {
    return { success: false, error: saveResult.error };
  }
  
  // 4. 验证配置
  const verifyResult = await verifyConfig();
  if (!verifyResult.success || !verifyResult.valid) {
    return { success: false, error: '配置验证失败' };
  }
  
  return {
    success: true,
    version: saveResult.version,
    remotes: verifyResult.remotes,
    message: '强制同步成功'
  };
}

module.exports = {
  ensureRcloneConfig,
  getSyncStatus,
  forceSync,
  checkLocalConfig,
  downloadConfig,
  verifyConfig,
  RCLONE_SYNC_ENABLED,
  RCLONE_SYNC_ON_START
};
