#!/usr/bin/env node
/**
 * Full interactive /add flow simulation.
 *
 * Goal:
 * - Reproduce the "400: message is not modified" scenario via a strict Telegram mock
 * - Ensure the /add flow (server -> magnet -> remote -> category) finishes without throwing
 *
 * Run:
 *   node bot/test-flow.js
 */

const assert = require('node:assert/strict');

// Use an in-memory DB so the test won't touch production data.
process.env.DATABASE_PATH = ':memory:';

const { initDatabase, DatabaseManager } = require('./config/database');
initDatabase();

const db = new DatabaseManager();

// Seed one enabled server.
const serverRes = db.createServer('test_server', 'http://127.0.0.1:1234', 'k');
const serverId = Number(serverRes.lastInsertRowid);
assert.ok(Number.isFinite(serverId));

// Patch AgentClient to avoid any real I/O.
const AgentClient = require('./services/agent-client');

let getRemotesCalls = 0;
let addTorrentCalls = 0;

AgentClient.prototype.getRemotes = async function getRemotesMock() {
  getRemotesCalls += 1;
  return {
    success: true,
    data: [
      { name: 'gdrive:', type: 'Google Drive' },
      { name: 'onedrive:', type: 'OneDrive' }
    ]
  };
};

AgentClient.prototype.addTorrent = async function addTorrentMock(options) {
  addTorrentCalls += 1;
  assert.ok(options);
  assert.ok(typeof options.url === 'string' && options.url.startsWith('magnet:'), 'addTorrent(url) should be a magnet');
  return {
    success: true,
    data: { hash: '0123456789abcdef0123456789abcdef01234567' }
  };
};

const { handleAdd, handleAddCallback, handleAddTorrent } = require('./handlers/add');
const { SESSION_STATES } = require('./config/constants');
const { userSessions } = require('./services/session-store');

userSessions.clear();

function deepJsonEqual(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

class MockChat {
  constructor() {
    this._nextMessageId = 1;
    this.messages = [];
  }

  lastMessage() {
    return this.messages[this.messages.length - 1] || null;
  }

  async reply(text, extra) {
    const msg = {
      message_id: this._nextMessageId++,
      text,
      reply_markup: extra?.reply_markup ?? null
    };
    this.messages.push(msg);
    return msg;
  }

  async editMessageText(message, nextText, extra) {
    const hasMarkup = extra && Object.prototype.hasOwnProperty.call(extra, 'reply_markup');
    const nextMarkup = hasMarkup ? (extra.reply_markup ?? null) : message.reply_markup;

    if (message.text === nextText && deepJsonEqual(message.reply_markup, nextMarkup)) {
      const err = new Error('400: Bad Request: message is not modified');
      err.description = 'Bad Request: message is not modified';
      throw err;
    }

    message.text = nextText;
    if (hasMarkup) message.reply_markup = nextMarkup;
    return message;
  }
}

function makeMessageCtx(chat, from, text) {
  return {
    from,
    message: text ? { text } : undefined,
    callbackQuery: undefined,
    async reply(t, extra) {
      return chat.reply(t, extra);
    }
  };
}

function makeCallbackCtx(chat, from, message) {
  return {
    from,
    callbackQuery: { message },
    async reply(t, extra) {
      return chat.reply(t, extra);
    },
    async editMessageText(t, extra) {
      return chat.editMessageText(message, t, extra);
    },
    async answerCbQuery(_t) {
      return;
    }
  };
}

async function main() {
  const chat = new MockChat();
  const from = { id: 10001, username: 'tester', first_name: 'Test' };

  // 1) /add -> server selection menu
  await handleAdd(makeMessageCtx(chat, from));
  const serverMenuMsg = chat.lastMessage();
  assert.ok(serverMenuMsg);
  assert.match(serverMenuMsg.text, /选择服务器/);
  assert.ok(serverMenuMsg.reply_markup?.inline_keyboard?.length, 'server menu should include inline keyboard');

  // 2) click server -> should edit message and clear keyboard
  const cbServer = makeCallbackCtx(chat, from, serverMenuMsg);
  const serverCbData = `add_server_${serverId}`;
  await handleAddCallback(cbServer, serverCbData);
  assert.match(serverMenuMsg.text, /已选择服务器/);
  assert.equal(serverMenuMsg.reply_markup, null);

  // Regression: force state back and call again to ensure safe edit skips "message is not modified".
  const sessionAfterServer = userSessions.get(from.id);
  assert.ok(sessionAfterServer);
  sessionAfterServer.state = SESSION_STATES.ADD_SELECT_SERVER;
  await handleAddCallback(cbServer, serverCbData);
  assert.match(serverMenuMsg.text, /已选择服务器/);

  // 3) send magnet link -> bot asks move yes/no (new message with keyboard)
  sessionAfterServer.state = SESSION_STATES.ADD_WAIT_TORRENT;
  const magnet = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=example';
  await handleAddTorrent(makeMessageCtx(chat, from, magnet));
  const askMoveMsg = chat.lastMessage();
  assert.ok(askMoveMsg);
  assert.match(askMoveMsg.text, /是否需要自动移动/);

  // 4) click move yes -> edit into remote selection
  const cbMove1 = makeCallbackCtx(chat, from, askMoveMsg);
  const cbMove2 = makeCallbackCtx(chat, from, askMoveMsg);

  // Concurrency: simulate double-click (or webhook parallelism). The session lock should ensure
  // we only call Agent once, and "message is not modified" must not escape.
  await Promise.all([
    handleAddCallback(cbMove1, 'add_move_yes'),
    handleAddCallback(cbMove2, 'add_move_yes')
  ]);
  assert.equal(getRemotesCalls, 1);
  assert.match(askMoveMsg.text, /选择云存储/);
  assert.ok(askMoveMsg.reply_markup?.inline_keyboard?.length, 'remote menu should include inline keyboard');

  // 5) click remote -> edit into category selection
  const cbRemote = makeCallbackCtx(chat, from, askMoveMsg);
  await handleAddCallback(cbRemote, 'add_remote_gdrive:');
  assert.match(askMoveMsg.text, /选择目录/);
  assert.ok(askMoveMsg.reply_markup?.inline_keyboard?.length, 'category menu should include inline keyboard');

  // Regression: force state back and call again to ensure safe edit skips identical content+markup.
  const sessionAfterRemote = userSessions.get(from.id);
  assert.ok(sessionAfterRemote);
  sessionAfterRemote.state = SESSION_STATES.ADD_SELECT_REMOTE;
  await handleAddCallback(cbRemote, 'add_remote_gdrive:');
  assert.match(askMoveMsg.text, /选择目录/);

  // 6) click first category for gdrive -> add torrent (mock), edit success and clear keyboard
  sessionAfterRemote.state = SESSION_STATES.ADD_SELECT_CATEGORY;
  const category = db.db
    .prepare('SELECT * FROM categories WHERE remote = ? ORDER BY sort_order, id LIMIT 1')
    .get('gdrive:');
  assert.ok(category?.id, 'should have at least one gdrive: category');

  const cbCategory1 = makeCallbackCtx(chat, from, askMoveMsg);
  const cbCategory2 = makeCallbackCtx(chat, from, askMoveMsg);

  await Promise.all([
    handleAddCallback(cbCategory1, `add_category_${category.id}`),
    handleAddCallback(cbCategory2, `add_category_${category.id}`)
  ]);
  assert.equal(addTorrentCalls, 1);
  assert.match(askMoveMsg.text, /种子已添加/);
  assert.equal(askMoveMsg.reply_markup, null);
  assert.ok(!userSessions.has(from.id), 'session should be cleared after completion');

  // DB sanity: unique hash should yield only 1 task row.
  const taskCount = db.db.prepare('SELECT COUNT(*) as c FROM tasks').get().c;
  assert.equal(taskCount, 1);

  console.log('OK test-flow passed');
}

main().catch((err) => {
  console.error('FAIL test-flow failed');
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
});
