const test = require('node:test');
const assert = require('node:assert/strict');

const { taskIndexMaps } = require('../bot/services/session-store');
const {
  setTaskIndexMap,
  getTaskIndexMap,
  resolveTaskByIndex,
  resolveIndexByHash
} = require('../bot/services/task-index-map');

test('task index map stores entries and resolves by index/hash', () => {
  taskIndexMaps.clear();

  setTaskIndexMap(
    10001,
    {
      1: { hash: 'h1', name: 'Task 1' },
      2: { hash: 'h2' }
    },
    { now: 1000, ttlMs: 60_000 }
  );

  assert.deepEqual(resolveTaskByIndex(10001, 1, { now: 1000 }), { hash: 'h1', name: 'Task 1' });
  assert.deepEqual(resolveTaskByIndex(10001, 2, { now: 1000 }), { hash: 'h2', name: null });
  assert.equal(resolveIndexByHash(10001, 'h2', { now: 1000 }), 2);
});

test('task index map expires and is cleaned up on read', () => {
  taskIndexMaps.clear();

  setTaskIndexMap(10001, { 1: { hash: 'h1' } }, { now: 1000, ttlMs: 10 });

  assert.ok(getTaskIndexMap(10001, { now: 1009 }));
  assert.equal(getTaskIndexMap(10001, { now: 1010 }), null);
  assert.equal(resolveTaskByIndex(10001, 1, { now: 1010 }), null);
});

