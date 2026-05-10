/* PISO OS V3 — in-memory cache with optional disk persistence (server/cache/*.json). */
const NodeCache = require('node-cache');
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, 'cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

const memo = new NodeCache({ stdTTL: 1800, checkperiod: 300, useClones: false });

function safeKey(key) {
  return String(key).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function fileFor(key) {
  return path.join(CACHE_DIR, `${safeKey(key)}.json`);
}

function get(key) {
  return memo.get(key);
}

function set(key, value, ttlSec) {
  if (typeof ttlSec === 'number') memo.set(key, value, ttlSec);
  else memo.set(key, value);
}

function del(key) {
  memo.del(key);
}

function getPersisted(key) {
  const f = fileFor(key);
  try {
    if (!fs.existsSync(f)) return null;
    const { value, exp } = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (exp && exp < Date.now()) return null;
    return value;
  } catch (_) {
    return null;
  }
}

function setPersisted(key, value, ttlSec) {
  const f = fileFor(key);
  const exp = ttlSec ? Date.now() + ttlSec * 1000 : null;
  try {
    fs.writeFileSync(f, JSON.stringify({ value, exp, savedAt: new Date().toISOString() }), 'utf8');
  } catch (e) {
    console.warn('[cache] setPersisted failed:', e.message);
  }
}

function flush() {
  memo.flushAll();
}

module.exports = { get, set, del, getPersisted, setPersisted, flush, CACHE_DIR };
