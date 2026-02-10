const test = require('node:test');
const assert = require('node:assert/strict');

const { handleAddCallback } = require('../bot/handlers/add');
const { userSessions } = require('../bot/services/session-store');
const { SESSION_STATES } = require('../bot/config/constants');

test('handleAddCallback answers callback queries for unknown add_* data (prevents spinner)', async () => {
  const telegramId = 10001;
  const events = [];

  userSessions.set(telegramId, {
    state: SESSION_STATES.ADD_SELECT_SERVER,
    servers: []
  });

  const ctx = {
    from: { id: telegramId },
    callbackQuery: {
      data: 'add_unknown_action',
      message: { text: 'x', reply_markup: null }
    },
    answerCbQuery: async (text) => {
      events.push(['answer', text]);
    },
    editMessageText: async () => {
      events.push(['edit']);
    },
    reply: async () => {
      events.push(['reply']);
    }
  };

  try {
    await handleAddCallback(ctx, 'add_unknown_action');
  } finally {
    userSessions.delete(telegramId);
  }

  assert.equal(events.length >= 1, true);
  assert.equal(events[0][0], 'answer');
  assert.equal(events[0][1], '未知操作');
});

test('handleAddCallback answers callback query before editing message for server selection', async () => {
  const telegramId = 10002;
  const events = [];

  userSessions.set(telegramId, {
    state: SESSION_STATES.ADD_SELECT_SERVER,
    servers: [{ id: 5, name: 'srv', url: 'http://127.0.0.1:3333', api_key: 'k' }]
  });

  const ctx = {
    from: { id: telegramId },
    callbackQuery: {
      data: 'add_server_5',
      message: { text: 'old', reply_markup: { inline_keyboard: [] } }
    },
    answerCbQuery: async (text) => {
      events.push(['answer', text]);
    },
    editMessageText: async (_text, _extra) => {
      events.push(['edit']);
      return {};
    },
    reply: async () => {
      events.push(['reply']);
      return {};
    }
  };

  try {
    await handleAddCallback(ctx, 'add_server_5');
  } finally {
    userSessions.delete(telegramId);
  }

  assert.equal(events.length >= 2, true);
  assert.equal(events[0][0], 'answer');
  assert.equal(events[0][1], '服务器已选择');
  assert.equal(['edit', 'reply'].includes(events[1][0]), true);
});

