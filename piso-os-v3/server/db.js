/* PISO OS V3 — Postgres pool + helpers. */
const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set');
    }
    const useSSL = /sslmode=require/i.test(process.env.DATABASE_URL);
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      ssl: useSSL ? { rejectUnauthorized: false } : false,
    });
    pool.on('error', (err) => {
      console.error('[db] pool error:', err.message);
    });
  }
  return pool;
}

async function query(text, params) {
  return getPool().query(text, params);
}

async function tx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function ping() {
  try {
    const r = await query('SELECT 1::int AS ok');
    return r.rows[0] && r.rows[0].ok === 1;
  } catch (err) {
    return false;
  }
}

async function shutdown() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

module.exports = { getPool, query, tx, ping, shutdown };
