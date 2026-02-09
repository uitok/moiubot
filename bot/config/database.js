/**
 * SQLite 数据库初始化和管理
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 数据库路径
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../../database/qbt-bot.db');

// 确保数据库目录存在
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 创建数据库连接
const db = new Database(DB_PATH);

// 启用外键约束
db.pragma('foreign_keys = ON');

/**
 * better-sqlite3 只接受 numbers/strings/bigints/buffers/null。
 * 这里做统一兜底，避免 boolean/undefined/object/array 直接参与绑定导致崩溃。
 */
function safeJsonStringify(value) {
  try {
    const json = JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    return json === undefined ? null : json;
  } catch (_e) {
    try {
      return JSON.stringify({ value: String(value) });
    } catch (_e2) {
      return String(value);
    }
  }
}

function normalizeSqliteParam(value) {
  if (value === undefined || value === null) return null;
  const t = typeof value;
  if (t === 'boolean') return value ? 1 : 0;
  if (t === 'number') return Number.isFinite(value) ? value : null;
  if (t === 'string' || t === 'bigint') return value;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Date) return value.toISOString();
  // objects/arrays/functions/symbols => store as JSON-ish string best-effort
  return safeJsonStringify(value);
}

function normalizeLogDetails(details) {
  if (details === undefined || details === null) return null;
  if (typeof details === 'string') return details;
  return safeJsonStringify(details);
}

/**
 * 初始化数据库表结构
 */
function initDatabase() {
  // 用户表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER UNIQUE NOT NULL,
      username TEXT,
      first_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 服务器表
  db.exec(`
    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      enabled BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 任务表
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      server_id INTEGER,
      hash TEXT NOT NULL UNIQUE,
      name TEXT,
      status TEXT DEFAULT 'downloading',
      auto_move BOOLEAN DEFAULT 0,
      move_remote TEXT,
      move_dest TEXT,
      size BIGINT DEFAULT 0,
      downloaded_size BIGINT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      moved_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (server_id) REFERENCES servers(id)
    )
  `);

  // 分类表
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      remote TEXT NOT NULL,
      path TEXT NOT NULL,
      emoji TEXT DEFAULT '📁',
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 操作日志表
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      server_name TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // rclone 同步历史表
  db.exec(`
    CREATE TABLE IF NOT EXISTS rclone_sync_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER,
      action TEXT NOT NULL,
      from_version TEXT,
      to_version TEXT,
      success BOOLEAN,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (server_id) REFERENCES servers(id)
    )
  `);

  // 创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_hash ON tasks(hash);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_rclone_sync_history_server ON rclone_sync_history(server_id);
    CREATE INDEX IF NOT EXISTS idx_rclone_sync_history_created ON rclone_sync_history(created_at);
  `);

  // 插入默认分类数据
  insertDefaultCategories();

  console.log('✅ 数据库初始化完成');
}

/**
 * 插入默认分类
 */
function insertDefaultCategories() {
  const count = db.prepare('SELECT COUNT(*) as count FROM categories').get();
  if (count.count === 0) {
    const categories = [
      { name: '电影', remote: 'gdrive:', path: '电影/', emoji: '🎬', sort_order: 1 },
      { name: '电视剧', remote: 'gdrive:', path: '电视剧/', emoji: '📺', sort_order: 2 },
      { name: '音乐', remote: 'gdrive:', path: '音乐/', emoji: '🎵', sort_order: 3 },
      { name: '软件', remote: 'onedrive:', path: '软件/', emoji: '💾', sort_order: 4 },
      { name: '其他', remote: 'gdrive:', path: '其他/', emoji: '📦', sort_order: 5 }
    ];

    const stmt = db.prepare(`
      INSERT INTO categories (name, remote, path, emoji, sort_order)
      VALUES (@name, @remote, @path, @emoji, @sort_order)
    `);

    categories.forEach(cat => stmt.run(cat));
    console.log('✅ 默认分类已插入');
  }
}

// 数据库操作类
class DatabaseManager {
  constructor() {
    this.db = db;
  }

  // ========== 用户操作 ==========
  getUserByTelegramId(telegramId) {
    return this.db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
  }

  createUser(telegramId, username = null, firstName = null) {
    const stmt = this.db.prepare(`
      INSERT INTO users (telegram_id, username, first_name)
      VALUES (?, ?, ?)
    `);
    return stmt.run(
      normalizeSqliteParam(telegramId),
      normalizeSqliteParam(username),
      normalizeSqliteParam(firstName)
    );
  }

  updateUserLastSeen(telegramId) {
    const stmt = this.db.prepare(`
      UPDATE users SET last_seen = CURRENT_TIMESTAMP
      WHERE telegram_id = ?
    `);
    return stmt.run(telegramId);
  }

  // ========== 服务器操作 ==========
  getAllServers() {
    return this.db.prepare('SELECT * FROM servers WHERE enabled = 1 ORDER BY name').all();
  }

  getServerById(id) {
    return this.db.prepare('SELECT * FROM servers WHERE id = ?').get(id);
  }

  getServerByName(name) {
    return this.db.prepare('SELECT * FROM servers WHERE name = ?').get(name);
  }

  createServer(name, url, apiKey) {
    const stmt = this.db.prepare(`
      INSERT INTO servers (name, url, api_key)
      VALUES (?, ?, ?)
    `);
    return stmt.run(name, url, apiKey);
  }

  enableServer(id) {
    const stmt = this.db.prepare(`
      UPDATE servers
      SET enabled = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    return stmt.run(id);
  }

  disableServer(id) {
    const stmt = this.db.prepare(`
      UPDATE servers
      SET enabled = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    return stmt.run(id);
  }

  updateServer(id, name, url, apiKey) {
    const stmt = this.db.prepare(`
      UPDATE servers
      SET name = ?, url = ?, api_key = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    return stmt.run(name, url, apiKey, id);
  }

  deleteServer(id) {
    return this.db.prepare('DELETE FROM servers WHERE id = ?').run(id);
  }

  // ========== 任务操作 ==========
  createTask(userId, serverId, hash, name, autoMove = false, moveRemote = null, moveDest = null) {
    const stmt = this.db.prepare(`
      INSERT INTO tasks (user_id, server_id, hash, name, auto_move, move_remote, move_dest)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(hash) DO UPDATE SET
        user_id = excluded.user_id,
        server_id = excluded.server_id,
        name = excluded.name,
        status = 'downloading',
        auto_move = excluded.auto_move,
        move_remote = excluded.move_remote,
        move_dest = excluded.move_dest
    `);
    return stmt.run(
      normalizeSqliteParam(userId),
      normalizeSqliteParam(serverId),
      normalizeSqliteParam(hash),
      normalizeSqliteParam(name),
      normalizeSqliteParam(autoMove),
      normalizeSqliteParam(moveRemote),
      normalizeSqliteParam(moveDest)
    );
  }

  getTaskByHash(hash) {
    return this.db.prepare(`
      SELECT t.*, s.name as server_name
      FROM tasks t
      LEFT JOIN servers s ON t.server_id = s.id
      WHERE t.hash = ?
    `).get(hash);
  }

  getTaskWithUserByHash(hash) {
    return this.db.prepare(`
      SELECT
        t.*,
        s.name as server_name,
        u.telegram_id as telegram_id,
        u.username as username
      FROM tasks t
      LEFT JOIN servers s ON t.server_id = s.id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.hash = ?
    `).get(hash);
  }

  getTasksByUserId(userId, limit = 20) {
    return this.db.prepare(`
      SELECT t.*, s.name as server_name
      FROM tasks t
      LEFT JOIN servers s ON t.server_id = s.id
      WHERE t.user_id = ?
      ORDER BY t.created_at DESC
      LIMIT ?
    `).all(userId, limit);
  }

  deleteTaskByHash(hash) {
    return this.db.prepare('DELETE FROM tasks WHERE hash = ?').run(hash);
  }

  updateTaskStatus(hash, status) {
    const stmt = this.db.prepare(`
      UPDATE tasks SET status = ?
      WHERE hash = ?
    `);
    return stmt.run(status, hash);
  }

  updateTaskCompleted(hash, downloadedSize) {
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP, downloaded_size = ?
      WHERE hash = ?
    `);
    return stmt.run(downloadedSize, hash);
  }

  updateTaskMoved(hash) {
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET status = 'moved', moved_at = CURRENT_TIMESTAMP
      WHERE hash = ?
    `);
    return stmt.run(hash);
  }

  // ========== 分类操作 ==========
  getAllCategories() {
    return this.db.prepare('SELECT * FROM categories ORDER BY sort_order').all();
  }

  getCategoryById(id) {
    return this.db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  }

  getCategoryByName(name) {
    return this.db.prepare('SELECT * FROM categories WHERE name = ?').get(name);
  }

  createCategory(name, remote, path, emoji = '📁', sortOrder = 0) {
    const stmt = this.db.prepare(`
      INSERT INTO categories (name, remote, path, emoji, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(name, remote, path, emoji, sortOrder);
  }

  // ========== 日志操作 ==========
  logActivity(userId, action, serverName = null, details = null) {
    const stmt = this.db.prepare(`
      INSERT INTO activity_log (user_id, action, server_name, details)
      VALUES (?, ?, ?, ?)
    `);
    return stmt.run(
      normalizeSqliteParam(userId),
      normalizeSqliteParam(action),
      normalizeSqliteParam(serverName),
      normalizeLogDetails(details)
    );
  }

  getRecentLogs(limit = 50) {
    return this.db.prepare(`
      SELECT al.*, u.username
      FROM activity_log al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT ?
    `).all(limit);
  }

  // ========== rclone 同步历史操作 ==========
  logRcloneSync(serverId, action, fromVersion = null, toVersion = null, success = true, errorMessage = null) {
    const stmt = this.db.prepare(`
      INSERT INTO rclone_sync_history (server_id, action, from_version, to_version, success, error_message)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(serverId, action, fromVersion, toVersion, success ? 1 : 0, errorMessage);
  }

  getRcloneSyncHistory(serverId = null, limit = 50) {
    let query = `
      SELECT rsh.*, s.name as server_name
      FROM rclone_sync_history rsh
      LEFT JOIN servers s ON rsh.server_id = s.id
    `;
    
    const params = [];
    
    if (serverId) {
      query += ' WHERE rsh.server_id = ?';
      params.push(serverId);
    }
    
    query += ' ORDER BY rsh.created_at DESC LIMIT ?';
    params.push(limit);
    
    return this.db.prepare(query).all(...params);
  }

  getLatestRcloneSync(serverId) {
    return this.db.prepare(`
      SELECT * FROM rclone_sync_history
      WHERE server_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(serverId);
  }

  // 关闭数据库连接
  close() {
    this.db.close();
  }
}

// 如果直接运行此文件，初始化数据库
if (require.main === module) {
  initDatabase();
  console.log('数据库文件位置:', DB_PATH);
}

module.exports = { DatabaseManager, initDatabase, DB_PATH };
