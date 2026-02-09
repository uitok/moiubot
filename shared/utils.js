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
  if (typeof magnetUri !== 'string') return null;
  const input = magnetUri.trim();
  if (!input.toLowerCase().startsWith('magnet:?')) return null;

  // Minimal RFC4648 base32 decode (A-Z2-7), used for BTIH base32 hashes.
  function decodeBase32ToHex(base32) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const clean = base32.toUpperCase().replace(/=+$/g, '');
    let bits = 0;
    let value = 0;
    const out = [];

    for (const ch of clean) {
      const idx = alphabet.indexOf(ch);
      if (idx === -1) return null;
      value = (value << 5) | idx;
      bits += 5;
      while (bits >= 8) {
        out.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }

    return Buffer.from(out).toString('hex');
  }

  try {
    const u = new URL(input);
    const xts = u.searchParams.getAll('xt');

    for (const xt of xts) {
      const m = String(xt).match(/^urn:(?:btih|sha1):([a-zA-Z0-9]+)$/i);
      if (!m) continue;

      const raw = m[1];
      if (/^[a-fA-F0-9]{40}$/.test(raw)) return raw.toLowerCase();
      if (/^[a-zA-Z2-7]{32}$/.test(raw)) return decodeBase32ToHex(raw);
    }
  } catch (_) {
    // Fall through to regex parsing.
  }

  // Fallback: tolerate xt not being the first query param.
  const hexMatch = input.match(/[?&]xt=urn:(?:btih|sha1):([a-fA-F0-9]{40})(?:&|$)/i);
  if (hexMatch) return hexMatch[1].toLowerCase();

  const b32Match = input.match(/[?&]xt=urn:(?:btih|sha1):([a-zA-Z2-7]{32})(?:&|$)/i);
  if (b32Match) return decodeBase32ToHex(b32Match[1]);

  return null;
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
