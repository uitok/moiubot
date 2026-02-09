/**
 * Ephemeral mapping between /list numeric indexes and torrent hashes.
 *
 * Stored in session-store (in-memory). Intended for quick commands like:
 *   /delete 1
 *
 * Note: This is per Telegram user (ctx.from.id), not per chat.
 */

const { taskIndexMaps } = require('./session-store');

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

function normalizeTelegramId(telegramId) {
  const id = Number(telegramId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function normalizeIndex(index) {
  const n = Number(index);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function normalizeHash(hash) {
  const h = String(hash || '').trim();
  return h ? h : null;
}

function setTaskIndexMap(telegramId, entriesByIndex, opts = {}) {
  const id = normalizeTelegramId(telegramId);
  if (!id) return null;

  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const ttlMs = Number.isFinite(opts.ttlMs) ? opts.ttlMs : DEFAULT_TTL_MS;
  const expiresAt = now + Math.max(0, ttlMs);

  const byIndex = Object.create(null);
  const byHash = Object.create(null);

  for (const [rawIndex, rawEntry] of Object.entries(entriesByIndex || {})) {
    const idx = normalizeIndex(rawIndex);
    if (!idx) continue;

    const hash = normalizeHash(rawEntry?.hash);
    if (!hash) continue;

    const name = rawEntry?.name ? String(rawEntry.name) : null;
    byIndex[idx] = { hash, name };
    byHash[hash] = idx;
  }

  const map = { createdAt: now, expiresAt, byIndex, byHash };
  taskIndexMaps.set(id, map);
  return map;
}

function getTaskIndexMap(telegramId, opts = {}) {
  const id = normalizeTelegramId(telegramId);
  if (!id) return null;

  const map = taskIndexMaps.get(id);
  if (!map) return null;

  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  if (now >= map.expiresAt) {
    taskIndexMaps.delete(id);
    return null;
  }

  return map;
}

function resolveTaskByIndex(telegramId, index, opts = {}) {
  const idx = normalizeIndex(index);
  if (!idx) return null;

  const map = getTaskIndexMap(telegramId, opts);
  if (!map) return null;

  return map.byIndex[idx] || null;
}

function resolveIndexByHash(telegramId, hash, opts = {}) {
  const h = normalizeHash(hash);
  if (!h) return null;

  const map = getTaskIndexMap(telegramId, opts);
  if (!map) return null;

  const idx = map.byHash[h];
  return Number.isInteger(idx) ? idx : null;
}

function clearTaskIndexMap(telegramId) {
  const id = normalizeTelegramId(telegramId);
  if (!id) return false;
  return taskIndexMaps.delete(id);
}

module.exports = {
  DEFAULT_TTL_MS,
  setTaskIndexMap,
  getTaskIndexMap,
  resolveTaskByIndex,
  resolveIndexByHash,
  clearTaskIndexMap
};

