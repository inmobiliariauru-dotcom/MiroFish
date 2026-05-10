/* Agent 04 — Market Intelligence. GA4 + GSC via Supermetrics.
 * Persists organic/discovery metrics to ops.snapshots_daily.
 */
const express = require('express');
const router = express.Router();

const { runAgent } = require('./_base');
const { isMock } = require('../../env');
const sm = require('../../integrations/supermetrics');
const { tx } = require('../../db');

const AGENT_ID = '04';

function mockMarket() {
  const out = [];
  const days = sm.lastNDays(7);
  const queries = ['alquiler pocitos', 'venta apartamento montevideo', 'inmobiliaria piso', 'apartamento centro alquiler'];
  for (const date of days) {
    out.push({ date, source: 'gsc', metric: 'clicks',      dimension: {}, value: 45 + Math.floor(Math.random() * 25) });
    out.push({ date, source: 'gsc', metric: 'impressions', dimension: {}, value: 1200 + Math.floor(Math.random() * 400) });
    out.push({ date, source: 'ga4', metric: 'sessions',    dimension: { medium: 'organic' }, value: 80 + Math.floor(Math.random() * 30) });
    for (const q of queries) {
      out.push({ date, source: 'gsc', metric: 'clicks', dimension: { query: q }, value: 5 + Math.floor(Math.random() * 10) });
    }
  }
  return out;
}

router.get('/market', async (_req, res) => {
  const out = await runAgent(AGENT_ID, async ({ dbUp }) => {
    const mock = isMock('supermetrics');
    const snapshots = mock ? mockMarket() : [];

    if (!mock && snapshots.length === 0) {
      return {
        status: 'warning',
        summary: 'Supermetrics GSC/GA4 path not yet wired with plan-specific report_type.',
        metrics: [],
        alerts: [{ severity: 'med', message: 'Wire SM report_type for GSC + GA4.' }],
      };
    }

    let upserted = 0;
    if (dbUp) {
      await tx(async (client) => {
        for (const s of snapshots) {
          await client.query(
            `INSERT INTO ops.snapshots_daily (date, source, metric, dimension, value)
             VALUES ($1::date, $2, $3, $4::jsonb, $5)
             ON CONFLICT (date, source, metric, dimension)
             DO UPDATE SET value = EXCLUDED.value`,
            [s.date, s.source, s.metric, s.dimension, s.value]
          );
          upserted++;
        }
      });
    }

    const gscClicks = snapshots
      .filter((s) => s.source === 'gsc' && s.metric === 'clicks' && Object.keys(s.dimension).length === 0)
      .reduce((a, s) => a + Number(s.value), 0);
    const gscImpr = snapshots
      .filter((s) => s.source === 'gsc' && s.metric === 'impressions' && Object.keys(s.dimension).length === 0)
      .reduce((a, s) => a + Number(s.value), 0);
    const ctr = gscImpr ? (gscClicks / gscImpr) * 100 : 0;

    return {
      status: mock ? 'mock' : 'ok',
      summary: `Market signals captured for last 7d: GSC CTR ${ctr.toFixed(2)}%.`,
      metrics: [
        { label: 'GSC clicks (7d)', value: String(gscClicks) },
        { label: 'GSC impressions (7d)', value: String(gscImpr) },
        { label: 'GSC CTR', value: `${ctr.toFixed(2)}%` },
        { label: 'Snapshots upserted', value: String(upserted) },
      ],
      alerts: mock ? [{ severity: 'med', message: 'MOCK Supermetrics: synthetic GSC/GA4 data.' }] : [],
      raw: { sample: snapshots.slice(0, 6) },
    };
  });
  res.json(out);
});

module.exports = router;
