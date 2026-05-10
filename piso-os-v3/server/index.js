/* PISO OS V3 — Express bootstrap. */
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const env = require('./env');
const db = require('./db');

const app = express();

const HTML_PATH = path.join(__dirname, '..', 'PISO_OS_V3_connect.html');

const corsAllow = (origin, cb) => {
  if (!origin) return cb(null, true);
  if (/^file:\/\//i.test(origin)) return cb(null, true);
  if (/^https?:\/\/localhost(:\d+)?$/i.test(origin)) return cb(null, true);
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin)) return cb(null, true);
  // Allow Claude Code / IDE preview tunnels (the HTML is served same-origin so
  // CORS is not strictly invoked, but /api/console/stream SSE may need it).
  if (process.env.CORS_ALLOW_ANY === 'true') return cb(null, true);
  return cb(null, false);
};

app.use(cors({ origin: corsAllow }));
app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => res.sendFile(HTML_PATH));
app.get('/index.html', (_req, res) => res.sendFile(HTML_PATH));
app.get('/PISO_OS_V3_connect.html', (_req, res) => res.sendFile(HTML_PATH));

app.get('/api/config', (_req, res) => {
  res.json({
    meta_pixel_id: process.env.META_PIXEL_ID_PRIMARY || null,
    gtm_container_id: process.env.GTM_CONTAINER_ID || null,
    ga4_property_id: process.env.GA4_PROPERTY_ID || null,
    google_ads_customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID || null,
    mocks: ['tokko', 'supermetrics'].filter(env.isMock),
  });
});

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
app.use('/api/agent/03', require('./routes/agents/03-tracking'));
app.use('/api/agent/04', require('./routes/agents/04-market'));
app.use('/api/agent/05', require('./routes/agents/05-pricing'));
app.use('/api/agent/06', require('./routes/agents/06-expected-value'));
app.use('/api/agent/07', require('./routes/agents/07-quality'));
app.use('/api/agent/08', require('./routes/agents/08-portfolio'));
app.use('/api/agent/09', require('./routes/agents/09-search'));
app.use('/api/agent/10', require('./routes/agents/10-acquisition'));
app.use('/api/agent/11', require('./routes/agents/11-remarketing'));
app.use('/api/agent/12', require('./routes/agents/12-campaigns'));
app.use('/api/agent/13', require('./routes/agents/13-search-terms'));
app.use('/api/agent/14', require('./routes/agents/14-bidding'));

app.use('/api/console', require('./routes/console'));

app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.path });
});

if (require.main === module) {
  try {
    const boot = env.bootValidate();
    const scheduler = require('./scheduler');
    const server = app.listen(env.port, () => {
      console.log(`[piso-os-v3] backend listening on http://localhost:${env.port}`);
      console.log(`[piso-os-v3] mocks: ${boot.mocks.join(', ') || 'none'}`);
      scheduler.start();
    });
    const stop = () => {
      scheduler.stop();
      server.close(() => db.shutdown().then(() => process.exit(0)));
    };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
  } catch (err) {
    console.error(`[piso-os-v3] boot failed: ${err.message}`);
    console.error(`[piso-os-v3] copy .env.example to .env and fill DATABASE_URL.`);
    process.exit(1);
  }
}

module.exports = app;
