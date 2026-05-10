/* PISO OS V3 — node-cron schedule for the 14 agents.
 * Calls localhost endpoints so all agents go through the same Express pipeline + audit.
 * Disable by setting SCHEDULER=off.
 */
const cron = require('node-cron');
const axios = require('axios');

const PORT = parseInt(process.env.PORT, 10) || 8787;
const BASE = `http://127.0.0.1:${PORT}`;

const SCHEDULES = [
  // ---- Salboo inventory: once per day at 21:05 (after the 21:00 export drop) ----
  { expr: '5 21 * * *', path: '01/inventory' },
  // Run normalizer 5 min after each Salboo ingest, plus once midday for safety.
  { expr: '10 21 * * *', path: '02/normalized' },
  { expr: '0 13 * * *',  path: '02/normalized' },

  // ---- Supermetrics pulls: every 60 min, staggered ----
  { expr: '5 * * * *',  path: '03/tracking' },
  { expr: '10 * * * *', path: '04/market' },
  { expr: '15 * * * *', path: '12/campaigns' },

  // ---- ML scoring: every 6 hours, staggered minutes ----
  { expr: '20 */6 * * *', path: '05/pricing' },
  { expr: '25 */6 * * *', path: '06/expected-value' },
  { expr: '30 */6 * * *', path: '07/quality' },

  // ---- Strategic agents: every hour, staggered ----
  { expr: '40 * * * *', path: '08/portfolio' },
  { expr: '41 * * * *', path: '09/search' },
  { expr: '42 * * * *', path: '10/acquisition' },
  { expr: '43 * * * *', path: '11/remarketing' },
  { expr: '44 * * * *', path: '13/search-terms' },
  { expr: '45 * * * *', path: '14/bidding' },
];

async function callAgent(p) {
  const t0 = Date.now();
  try {
    const r = await axios.get(`${BASE}/api/agent/${p}`, { timeout: 60_000 });
    console.log(`[scheduler] ${p}: ${r.data.status} (${Date.now() - t0}ms)`);
  } catch (err) {
    console.warn(`[scheduler] ${p} failed: ${err.message}`);
  }
}

let tasks = [];

function start() {
  if ((process.env.SCHEDULER || 'on').toLowerCase() === 'off') {
    console.log('[scheduler] disabled (SCHEDULER=off)');
    return;
  }
  for (const s of SCHEDULES) {
    if (!cron.validate(s.expr)) {
      console.error(`[scheduler] invalid cron expr: ${s.expr} (path=${s.path})`);
      continue;
    }
    const t = cron.schedule(s.expr, () => callAgent(s.path), { scheduled: true });
    tasks.push({ ...s, task: t });
  }
  console.log(`[scheduler] ${tasks.length} cron job(s) registered`);
}

function stop() {
  for (const t of tasks) {
    try { t.task.stop(); } catch (_) {}
  }
  tasks = [];
}

function listJobs() {
  return SCHEDULES.map((s) => ({ expr: s.expr, path: s.path }));
}

module.exports = { start, stop, listJobs };
