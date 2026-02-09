const test = require('node:test');
const assert = require('node:assert/strict');

const { formatBytes, parseMagnetLink } = require('../shared/utils');

test('formatBytes formats 0 and positive numbers', () => {
  assert.equal(formatBytes(0), '0 Bytes');
  assert.equal(formatBytes(1024), '1 KiB');
});

test('parseMagnetLink extracts v1 infohash (hex)', () => {
  const hash = '0123456789abcdef0123456789abcdef01234567';
  const magnet = `magnet:?xt=urn:btih:${hash}&dn=example`;
  assert.equal(parseMagnetLink(magnet), hash);
});

test('parseMagnetLink normalizes uppercase hex infohash', () => {
  const hash = '0123456789abcdef0123456789abcdef01234567';
  const magnet = `magnet:?xt=urn:btih:${hash.toUpperCase()}&dn=example`;
  assert.equal(parseMagnetLink(magnet), hash);
});

test('parseMagnetLink finds xt even when it is not the first query param', () => {
  const hash = '0123456789abcdef0123456789abcdef01234567';
  const magnet = `magnet:?dn=example&xt=urn:btih:${hash}`;
  assert.equal(parseMagnetLink(magnet), hash);
});

test('parseMagnetLink supports base32 BTIH infohash and returns hex', () => {
  function encodeBase32(buf) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let out = '';

    for (const byte of buf) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        out += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
    return out;
  }

  const hash = '0123456789abcdef0123456789abcdef01234567';
  const base32 = encodeBase32(Buffer.from(hash, 'hex'));
  assert.equal(base32.length, 32);

  const magnet = `magnet:?xt=urn:btih:${base32}&dn=example`;
  assert.equal(parseMagnetLink(magnet), hash);
});
