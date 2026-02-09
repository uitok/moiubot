const test = require('node:test');
const assert = require('node:assert/strict');

test('DatabaseManager normalizes unsupported sqlite bind param types (boolean/undefined/object)', () => {
  // Ensure we don't touch the real on-disk database during unit tests.
  process.env.DATABASE_PATH = ':memory:';

  const dbModulePath = require.resolve('../bot/config/database');
  delete require.cache[dbModulePath];
  const { DatabaseManager, initDatabase } = require(dbModulePath);

  initDatabase();
  const db = new DatabaseManager();

  try {
    // Seed minimal FK rows.
    const serverRes = db.createServer('test_server', 'http://127.0.0.1:1234', 'k');
    const serverId = Number(serverRes.lastInsertRowid);

    // Undefined username/first_name must not crash bindings.
    db.createUser(10001, undefined, undefined);
    const user = db.getUserByTelegramId(10001);
    assert.ok(user);
    assert.equal(user.username, null);
    assert.equal(user.first_name, null);

    // Boolean autoMove must be normalized (true => 1, false => 0).
    const hash = '0123456789abcdef0123456789abcdef01234567';
    db.createTask(user.id, serverId, hash, 'Example', true, 'gdrive:', 'foo/bar/');
    const task = db.getTaskByHash(hash);
    assert.ok(task);
    assert.equal(task.auto_move, 1);

    // Undefined log details must not crash and should store NULL (not the JS undefined type).
    db.logActivity(user.id, 'test_action', 'test_server', undefined);
    const log = db.db
      .prepare('SELECT * FROM activity_log WHERE action = ? ORDER BY id DESC LIMIT 1')
      .get('test_action');
    assert.ok(log);
    assert.equal(log.details, null);

    // Object details should be stored as JSON text.
    db.logActivity(user.id, 'test_action_json', 'test_server', { ok: true, n: 1 });
    const log2 = db.db
      .prepare('SELECT * FROM activity_log WHERE action = ? ORDER BY id DESC LIMIT 1')
      .get('test_action_json');
    assert.ok(log2);
    assert.equal(typeof log2.details, 'string');
    assert.deepEqual(JSON.parse(log2.details), { ok: true, n: 1 });
  } finally {
    db.close();
    delete require.cache[dbModulePath];
  }
});

