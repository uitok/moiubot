/**
 * qBittorrent API 路由
 */
const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../shared/express');
const { assert, notFound } = require('../../shared/errors');
const { parseMagnetLink, sleep } = require('../../shared/utils');

const {
  getVersion,
  getTorrents,
  getTorrentInfo,
  addTorrent,
  addTorrentFile,
  pauseTorrent,
  resumeTorrent,
  deleteTorrent,
  getGlobalInfo
} = require('../services/qb-client');

// GET /api/qb/status - 获取 qBittorrent 状态
router.get('/status', asyncHandler(async (req, res) => {
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
}));

// GET /api/qb/torrents - 获取所有种子
router.get('/torrents', asyncHandler(async (req, res) => {
  const torrents = await getTorrents();
  res.json({ success: true, data: torrents });
}));

// GET /api/qb/torrents/:hash - 获取单个种子信息
router.get('/torrents/:hash', asyncHandler(async (req, res) => {
  const torrent = await getTorrentInfo(req.params.hash);
  if (!torrent) throw notFound('Torrent not found', 'TORRENT_NOT_FOUND');
  res.json({ success: true, data: torrent });
}));

// POST /api/qb/add - 添加种子（URL 或 Magnet）
router.post('/add', asyncHandler(async (req, res) => {
  const { url, savePath, category, autoMove, moveConfig } = req.body || {};

  assert(url, 'URL is required', 'MISSING_URL');

  const startUnix = Math.floor(Date.now() / 1000);
  const tag = `moiubot_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const isMagnet = typeof url === 'string' && url.startsWith('magnet:');
  const expectedHash = isMagnet ? parseMagnetLink(url) : null;
  const expectedHashLc = expectedHash ? String(expectedHash).toLowerCase() : null;

  function normalizePath(p) {
    if (typeof p !== 'string') return null;
    let s = p.trim();
    if (!s) return null;
    s = s.replace(/\\/g, '/');
    // Remove trailing slashes (but keep root "/").
    if (s.length > 1) s = s.replace(/\/+$/g, '');
    return s;
  }

  function torrentHasTag(torrent, wantedTag) {
    const raw = torrent?.tags;
    if (!raw) return false;

    // qBittorrent typically returns tags as a comma-separated string, but tolerate other separators.
    const tags = String(raw)
      .split(/[,;|]/g)
      .map(s => s.trim())
      .filter(Boolean);

    return tags.includes(wantedTag);
  }

  // 添加种子（带唯一 tag，便于回查 hash）
  const addResult = await addTorrent(url, { savePath, category, tags: tag });
  // qBittorrent returns a plain string for this endpoint. Be strict on explicit failures.
  const addFailed = typeof addResult === 'string' && addResult.trim() === 'Fails.';

  // qBittorrent v5.x may take longer to surface newly added torrents, especially when adding via
  // remote .torrent URLs (qB needs time to fetch and parse the file). Prefer tag-filtered queries
  // to avoid repeatedly downloading the full torrent list on large instances.
  let newTorrent = null;
  if (addFailed) {
    // Common case: trying to add a duplicate torrent. If we can derive a hash, locate the existing
    // task and treat it as success; otherwise, surface a clearer add failure.
    if (expectedHashLc) {
      try {
        const byHash = await getTorrents({ hashes: expectedHashLc });
        if (Array.isArray(byHash) && byHash.length > 0) {
          newTorrent = byHash.find(t => String(t?.hash || '').toLowerCase() === expectedHashLc) || null;
        }
      } catch (_) {
        // ignore and fail below if we can't locate it
      }
    }

    if (!newTorrent) {
      const { AppError } = require('../../shared/errors');
      throw new AppError('qBittorrent rejected the torrent add request', {
        status: 502,
        code: 'QBT_ADD_FAILED'
      });
    }
  }
  const envTimeout = Number.parseInt(process.env.QBT_ADD_LOCATE_TIMEOUT_MS || '', 10);
  const timeoutMs = Number.isFinite(envTimeout) && envTimeout > 0
    ? envTimeout
    : (isMagnet ? 30000 : 60000);

  const envPoll = Number.parseInt(process.env.QBT_ADD_LOCATE_POLL_MS || '', 10);
  const pollMs = Number.isFinite(envPoll) && envPoll > 0 ? envPoll : 750;

  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  let tagFilterSupported = true;
  while (!newTorrent && Date.now() < deadline) {
    attempt += 1;

    // 1) Prefer qB's `tag` filter when available (fast and avoids parsing the `tags` field).
    if (tagFilterSupported) {
      try {
        const byTag = await getTorrents({ tag });
        if (Array.isArray(byTag) && byTag.length > 0) {
          // If the server ignores the `tag` filter, this can be a huge list. Our tag is unique,
          // so we only trust small responses, or responses that explicitly contain the tag.
          const filtered = byTag.filter(t => torrentHasTag(t, tag));
          const trusted = filtered.length > 0 ? filtered : (byTag.length <= 5 ? byTag : []);
          if (trusted.length > 0) {
            newTorrent = trusted.sort((a, b) => (b.added_on || 0) - (a.added_on || 0))[0];
          }
        }

        if (Array.isArray(byTag) && byTag.length > 200) {
          // Likely unfiltered; avoid repeating this expensive call.
          tagFilterSupported = false;
        }
      } catch (_) {
        // If qB doesn't support `tag` param, fall back to other heuristics.
        tagFilterSupported = false;
      }
    }

    // 2) magnet: 可直接通过 infohash 定位
    if (!newTorrent && expectedHashLc && attempt % 4 === 0) {
      try {
        const byHash = await getTorrents({ hashes: expectedHashLc });
        if (Array.isArray(byHash) && byHash.length > 0) {
          newTorrent = byHash.find(t => String(t?.hash || '').toLowerCase() === expectedHashLc) || null;
        }
      } catch (_) {
        // ignore
      }
    }

    // 3) Fallback: scan a small "recently added" window to locate the new torrent.
    // Avoid doing this on every poll; it can be expensive on large instances.
    if (!newTorrent && (!tagFilterSupported || attempt % 3 === 0)) {
      let recent = null;
      try {
        recent = await getTorrents({ sort: 'added_on', reverse: true, limit: 50 });
      } catch (_) {
        recent = await getTorrents();
      }

      if (Array.isArray(recent) && recent.length > 0) {
        // 3.1) Tag match from torrent's `tags` field (works even if `tag` filter is unsupported).
        newTorrent = recent.find(t => torrentHasTag(t, tag)) || null;

        // 3.2) Magnet match by parsing the stored magnet URI (qB may normalize the URI).
        if (!newTorrent && expectedHashLc) {
          newTorrent = recent.find(t => String(t?.hash || '').toLowerCase() === expectedHashLc) || null;
          if (!newTorrent) {
            newTorrent = recent.find(t => parseMagnetLink(t?.magnet_uri || '') === expectedHashLc) || null;
          }
        }

        // 3.3) Last resort: pick the most recently added candidate matching savePath/category.
        if (!newTorrent) {
          const wantSave = normalizePath(savePath);
          const wantCat = typeof category === 'string' && category.trim() ? category.trim() : null;

          const candidates = recent
            .filter(t => typeof t.added_on === 'number' && t.added_on >= startUnix - 10)
            .filter(t => (wantSave ? normalizePath(t.save_path) === wantSave : true))
            .filter(t => (wantCat ? String(t.category || '').trim() === wantCat : true))
            .sort((a, b) => (b.added_on || 0) - (a.added_on || 0));

          newTorrent = candidates[0] || null;
        }
      }
    }

    if (!newTorrent) await sleep(pollMs);
  }

  if (!newTorrent) {
    const { AppError } = require('../../shared/errors');
    throw new AppError('Failed to locate added torrent (hash unknown)', {
      status: 500,
      code: 'TORRENT_HASH_UNKNOWN'
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
}));

// POST /api/qb/pause/:hash - 暂停种子
router.post('/pause/:hash', asyncHandler(async (req, res) => {
  await pauseTorrent(req.params.hash);
  res.json({ success: true, message: 'Torrent paused' });
}));

// POST /api/qb/resume/:hash - 恢复种子
router.post('/resume/:hash', asyncHandler(async (req, res) => {
  await resumeTorrent(req.params.hash);
  res.json({ success: true, message: 'Torrent resumed' });
}));

// DELETE /api/qb/delete/:hash - 删除种子
router.delete('/delete/:hash', asyncHandler(async (req, res) => {
  const deleteFiles = req.query?.deleteFiles === 'true';
  await deleteTorrent(req.params.hash, deleteFiles);
  res.json({ success: true, message: 'Torrent deleted' });
}));

module.exports = router;
