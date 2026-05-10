#!/usr/bin/env node
/* PISO OS V3 — migration runner (wraps node-pg-migrate). */
require('dotenv').config();
const path = require('path');

const direction = process.argv[2] || 'up';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill DATABASE_URL.');
  process.exit(1);
}

const runnerModule = require('node-pg-migrate');
const runner = runnerModule.default || runnerModule;

const isReset = direction === 'reset';
const realDirection = isReset ? 'down' : direction;
const count = isReset ? Infinity : (direction === 'down' ? 1 : Infinity);

runner({
  databaseUrl: process.env.DATABASE_URL,
  dir: path.join(__dirname, '..', 'db', 'migrations'),
  direction: realDirection,
  count,
  migrationsTable: 'pgmigrations',
  verbose: true,
})
  .then((mig) => {
    console.log(`[migrate] ${direction}: ${mig.length} migration(s) executed`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('[migrate] failed:', err.message);
    process.exit(1);
  });
