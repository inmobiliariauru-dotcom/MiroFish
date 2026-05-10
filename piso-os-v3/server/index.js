/* PISO OS V3 — Express bootstrap. */
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const env = require('./env');
const db = require('./db');

const app = express();

const corsAllow = (origin, cb) => {
  if (!origin) return cb(null, true);
  if (/^file:\/\//i.test(origin)) return cb(null, true);
  if (/^https?:\/\/localhost(:\d+)?$/i.test(origin)) return cb(null, true);
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin)) return cb(null, true);
  return cb(null, false);
};

app.use(cors({ origin: corsAllow }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  const dbUp = await db.ping();
  res.json({
    ok: true,
    db: dbUp ? 'up' : 'down',
    mocks: ['tokko', 'supermetrics'].filter(env.isMock),
    port: env.port,
    ts: new Date().toISOString(),
  });
});

app.get('/api/agents', async (_req, res) => {
  try {
    const r = await db.query(`
      SELECT a.id, a.name, a.layer, a.status, a.last_run_at, a.config,
             (SELECT row_to_json(x) FROM (
                 SELECT status, summary, started_at, finished_at
                 FROM audit.agent_runs WHERE agent_id = a.id
                 ORDER BY started_at DESC NULLS LAST LIMIT 1
              ) x) AS last_run
        FROM ops.agents a
       ORDER BY a.id
    `);
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/api/agent/01', require('./routes/agents/01-tokko-sync'));
app.use('/api/agent/02', require('./routes/agents/02-inventory-normalizer'));
app.use('/api/agent/05', require('./routes/agents/05-pricing'));
app.use('/api/agent/07', require('./routes/agents/07-quality'));

const PENDING = ['03', '04', '06', '08', '09', '10', '11', '12', '13', '14'];
const { AGENT_NAMES } = require('./routes/agents/_base');
for (const id of PENDING) {
  app.use(`/api/agent/${id}`, (_req, res) => {
    res.status(200).json({
      agent_id: id,
      agent_name: AGENT_NAMES[id] || id,
      status: 'mock',
      last_run: new Date().toISOString(),
      summary: 'Not implemented yet — pending Bloque D (Supermetrics integration).',
      metrics: [],
      alerts: [{ severity: 'low', message: 'Bloque D pendiente.' }],
      raw: {},
    });
  });
}

app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.path });
});

if (require.main === module) {
  try {
    const boot = env.bootValidate();
    const server = app.listen(env.port, () => {
      console.log(`[piso-os-v3] backend listening on http://localhost:${env.port}`);
      console.log(`[piso-os-v3] mocks: ${boot.mocks.join(', ') || 'none'}`);
    });
    const stop = () => server.close(() => db.shutdown().then(() => process.exit(0)));
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
  } catch (err) {
    console.error(`[piso-os-v3] boot failed: ${err.message}`);
    console.error(`[piso-os-v3] copy .env.example to .env and fill DATABASE_URL.`);
    process.exit(1);
  }
}

module.exports = app;
