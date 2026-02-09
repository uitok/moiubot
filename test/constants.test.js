const test = require('node:test');
const assert = require('node:assert/strict');

test('bot/config/constants exports CommonJS values', () => {
  const constants = require('../bot/config/constants');

  assert.ok(constants);
  assert.equal(typeof constants.MESSAGES?.HELP, 'string');
  assert.equal(typeof constants.MESSAGES?.WELCOME, 'string');

  assert.equal(typeof constants.SESSION_STATES?.ADD_SELECT_SERVER, 'string');
  assert.equal(constants.SESSION_STATES.ADD_CUSTOM_PATH, 'add_custom_path');
});

