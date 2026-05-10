#!/usr/bin/env node
/* PISO OS V3 — runs every *.sql file in db/seeds/ in lexicographic order. */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const seedsDir = path.join(__dirname, '..', 'db', 'seeds');
const files = fs
  .readdirSync(seedsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.log('[seed] no .sql files in db/seeds/');
  process.exit(0);
}

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(seedsDir, file), 'utf8');
      process.stdout.write(`[seed] > ${file} ... `);
      await client.query(sql);
      process.stdout.write('ok\n');
    }
    console.log(`[seed] ${files.length} file(s) applied`);
  } finally {
    await client.end();
  }
})().catch((err) => {
  console.error('[seed] failed:', err.message);
  process.exit(1);
});
