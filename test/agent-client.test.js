const test = require('node:test');
const assert = require('node:assert/strict');

test('AgentClient sends params via query string for GET and DELETE', async () => {
  const axiosPath = require.resolve('axios');
  const realAxios = require(axiosPath);

  const captured = [];

  // Stub axios() used by AgentClient to capture request config without doing real I/O.
  // Note: this sandbox forbids binding sockets, so we avoid spinning up HTTP servers here.
  function stubAxios(config) {
    captured.push(config);
    return Promise.resolve({ data: { success: true, data: [] } });
  }

  // Replace axios export in require cache before loading AgentClient.
  require.cache[axiosPath].exports = stubAxios;

  const agentClientPath = require.resolve('../bot/services/agent-client');
  delete require.cache[agentClientPath];
  const AgentClient = require(agentClientPath);

  try {
    const client = new AgentClient('http://127.0.0.1:12345', 'test_key');

    await client.listFiles('gdrive:', 'foo/bar');
    await client.deleteTorrent('abc', true);
  } finally {
    // Restore axios no matter what.
    require.cache[axiosPath].exports = realAxios;
    delete require.cache[agentClientPath];
  }

  assert.equal(captured.length, 2);

  const [listCfg, delCfg] = captured;

  assert.equal(listCfg.method, 'GET');
  assert.equal(listCfg.url, 'http://127.0.0.1:12345/api/rclone/list');
  assert.equal(listCfg.headers['X-API-Key'], 'test_key');
  assert.equal(listCfg.params.remote, 'gdrive:');
  assert.equal(listCfg.params.path, 'foo/bar');

  assert.equal(delCfg.method, 'DELETE');
  assert.equal(delCfg.url, 'http://127.0.0.1:12345/api/qb/delete/abc');
  assert.equal(delCfg.headers['X-API-Key'], 'test_key');
  assert.equal(delCfg.params.deleteFiles, 'true');
});

