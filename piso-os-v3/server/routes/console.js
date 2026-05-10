/* PISO OS V3 — live console: SSE stream + recent backfill. */
const express = require('express');
const router = express.Router();

const { query } = require('../db');
const { listJobs } = require('../scheduler');

router.get('/recent', async (_req, res) => {
  try {
    const runs = await query(`
      SELECT id, agent_id, status, summary, started_at, finished_at
      FROM audit.agent_runs ORDER BY id DESC LIMIT 50
    `);
    const calls = await query(`
      SELECT id, integration, endpoint, method, status_code, duration_ms, called_at, error
      FROM audit.api_calls ORDER BY id DESC LIMIT 50
    `);
    const decisions = await query(`
      SELECT id, agent_id, decision, rationale, applied, created_at
      FROM audit.decisions ORDER BY id DESC LIMIT 50
    `);
    res.json({ runs: runs.rows, calls: calls.rows, decisions: decisions.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/jobs', (_req, res) => {
  res.json({ jobs: listJobs() });
});

router.get('/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let lastRunId = 0;
  let lastApiId = 0;
  let lastDecisionId = 0;

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Backfill last 20 of each.
  try {
    const runs = await query(`
      SELECT id, agent_id, status, summary, started_at, finished_at
      FROM audit.agent_runs ORDER BY id DESC LIMIT 20
    `);
    for (const row of runs.rows.reverse()) {
      lastRunId = Math.max(lastRunId, Number(row.id));
      send('agent_run', row);
    }
  } catch (_) { /* ignore */ }

  const tick = async () => {
    try {
      const r1 = await query(
        `SELECT id, agent_id, status, summary, started_at, finished_at
         FROM audit.agent_runs WHERE id > $1 ORDER BY id LIMIT 50`,
        [lastRunId]
      );
      for (const row of r1.rows) {
        lastRunId = Number(row.id);
        send('agent_run', row);
      }
      const r2 = await query(
        `SELECT id, integration, endpoint, method, status_code, duration_ms, called_at, error
         FROM audit.api_calls WHERE id > $1 ORDER BY id LIMIT 50`,
        [lastApiId]
      );
      for (const row of r2.rows) {
        lastApiId = Number(row.id);
        send('api_call', row);
      }
      const r3 = await query(
        `SELECT id, agent_id, decision, rationale, applied, created_at
         FROM audit.decisions WHERE id > $1 ORDER BY id LIMIT 50`,
        [lastDecisionId]
      );
      for (const row of r3.rows) {
        lastDecisionId = Number(row.id);
        send('decision', row);
      }
      res.write(`: keepalive ${new Date().toISOString()}\n\n`);
    } catch (err) {
      send('error', { message: err.message });
    }
  };

  const interval = setInterval(tick, 5_000);
  req.on('close', () => clearInterval(interval));
});

module.exports = router;
