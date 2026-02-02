/**
 * 共享工具函数
 */

/**
 * 格式化字节大小
 */
function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * 格式化速度
 */
function formatSpeed(bytesPerSecond) {
  return formatBytes(bytesPerSecond) + '/s';
}

/**
 * 格式化时间戳
 */
function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString('zh-CN');
}

/**
 * 生成随机 API Key
 */
function generateApiKey() {
  return 'sk_' + require('crypto').randomBytes(32).toString('hex');
}

/**
 * 解析磁力链接
 */
function parseMagnetLink(magnetUri) {
  const match = magnetUri.match(/^magnet:\?xt=urn:(?:btih|sha1):([a-fA-F0-9]{40})/);
  return match ? match[1] : null;
}

/**
 * 休眠函数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  formatBytes,
  formatSpeed,
  formatTimestamp,
  generateApiKey,
  parseMagnetLink,
  sleep
};
