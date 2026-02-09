const test = require('node:test');
const assert = require('node:assert/strict');

function makeCtx(text, telegramId = 10001) {
  const replies = [];
  return {
    from: { id: telegramId, username: 'u', first_name: 'f' },
    message: { text },
    reply: async (msg) => {
      replies.push(String(msg));
    },
    __replies: replies
  };
}

function createFakeAgentClient(fixtures) {
  return class FakeAgentClient {
    constructor(serverUrl, apiKey) {
      this.serverUrl = serverUrl;
      this.apiKey = apiKey;
    }

    async getTorrents() {
      return { success: true, data: fixtures.torrentsByUrl.get(this.serverUrl) || [] };
    }

    async deleteTorrent(hash, deleteFiles = false) {
      fixtures.deleteCalls.push({ url: this.serverUrl, hash, deleteFiles: !!deleteFiles });
      return { success: true };
    }
  };
}

async function setup(torrentsByUrl) {
  const prevDbPath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = ':memory:';

  const dbModulePath = require.resolve('../bot/config/database');
  const agentModulePath = require.resolve('../bot/services/agent-client');
  const sessionModulePath = require.resolve('../bot/services/session-store');
  const indexMapModulePath = require.resolve('../bot/services/task-index-map');
  const taskMgmtModulePath = require.resolve('../bot/handlers/task-management');

  // Ensure a clean module graph for each test.
  delete require.cache[taskMgmtModulePath];
  delete require.cache[indexMapModulePath];
  delete require.cache[sessionModulePath];
  delete require.cache[dbModulePath];

  const fixtures = { torrentsByUrl, deleteCalls: [] };
  const FakeAgentClient = createFakeAgentClient(fixtures);
  const originalAgentModule = require.cache[agentModulePath];
  require.cache[agentModulePath] = {
    id: agentModulePath,
    filename: agentModulePath,
    loaded: true,
    exports: FakeAgentClient
  };

  const { DatabaseManager, initDatabase } = require(dbModulePath);
  initDatabase();
  const db = new DatabaseManager();

  const sessionStore = require(sessionModulePath);
  sessionStore.taskIndexMaps.clear();

  const handlers = require(taskMgmtModulePath);

  function restore() {
    try {
      db.close();
    } finally {
      if (originalAgentModule) require.cache[agentModulePath] = originalAgentModule;
      else delete require.cache[agentModulePath];

      delete require.cache[taskMgmtModulePath];
      delete require.cache[indexMapModulePath];
      delete require.cache[sessionModulePath];
      delete require.cache[dbModulePath];

      if (prevDbPath === undefined) delete process.env.DATABASE_PATH;
      else process.env.DATABASE_PATH = prevDbPath;
    }
  }

  return { db, handlers, fixtures, restore };
}

test('handleList numbers tasks and stores an index->hash mapping', async () => {
  const url = 'http://127.0.0.1:1234';
  const torrentsByUrl = new Map();
  torrentsByUrl.set(url, [
    {
      hash: '0123456789abcdef0123456789abcdef01234567',
      name: 'Example 1',
      state: 'downloading',
      progress: 0.42,
      dlspeed: 0,
      upspeed: 0,
      eta: 120,
      size: 1024
    },
    {
      hash: '1111111111111111111111111111111111111111',
      name: 'Example 2',
      state: 'paused',
      progress: 0.0,
      dlspeed: 0,
      upspeed: 0,
      eta: 0,
      size: 2048
    }
  ]);

  const { db, handlers, restore } = await setup(torrentsByUrl);

  try {
    db.createServer('s1', url, 'k');

    const ctx = makeCtx('/list', 10001);
    await handlers.handleList(ctx);

    assert.equal(ctx.__replies.length, 1);
    const msg = ctx.__replies[0];
    assert.ok(msg.includes('1. Example 1 - 下载中'));
    assert.ok(msg.includes('2. Example 2 - 暂停'));

    const { resolveTaskByIndex } = require('../bot/services/task-index-map');
    const mapped1 = resolveTaskByIndex(10001, 1);
    assert.ok(mapped1);
    assert.equal(mapped1.hash, '0123456789abcdef0123456789abcdef01234567');
    assert.equal(mapped1.name, 'Example 1');
  } finally {
    restore();
  }
});

test('handleDelete supports `/delete <index>` and deletes the bot DB task record', async () => {
  const url = 'http://127.0.0.1:1234';
  const torrentsByUrl = new Map();
  const hash1 = '0123456789abcdef0123456789abcdef01234567';
  const hash2 = '1111111111111111111111111111111111111111';

  torrentsByUrl.set(url, [
    { hash: hash1, name: 'Example 1', state: 'downloading', progress: 0.1, dlspeed: 0, upspeed: 0, eta: 0, size: 1 },
    { hash: hash2, name: 'Example 2', state: 'paused', progress: 0.0, dlspeed: 0, upspeed: 0, eta: 0, size: 1 }
  ]);

  const { db, handlers, fixtures, restore } = await setup(torrentsByUrl);

  try {
    const serverRes = db.createServer('s1', url, 'k');
    const serverId = Number(serverRes.lastInsertRowid);

    db.createUser(10001, 'u', 'f');
    const user = db.getUserByTelegramId(10001);

    db.createTask(user.id, serverId, hash1, 'Example 1');
    db.createTask(user.id, serverId, hash2, 'Example 2');

    // Seed the ephemeral mapping by calling /list first.
    const listCtx = makeCtx('/list', 10001);
    await handlers.handleList(listCtx);

    const delCtx = makeCtx('/delete 1 --files', 10001);
    await handlers.handleDelete(delCtx);

    assert.equal(fixtures.deleteCalls.length, 1);
    assert.deepEqual(fixtures.deleteCalls[0], { url, hash: hash1, deleteFiles: true });
    assert.equal(db.getTaskByHash(hash1), undefined);

    assert.equal(delCtx.__replies.length, 1);
    assert.ok(delCtx.__replies[0].includes('任务: 1. Example 1'));
  } finally {
    restore();
  }
});

