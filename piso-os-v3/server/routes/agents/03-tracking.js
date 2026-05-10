/* Agent 03 — Tracking & Conversions. GA4 + Google Ads + Meta via Supermetrics.
 * Persists daily metrics to ops.snapshots_daily.
 */
const express = require('express');
const router = express.Router();

const { runAgent } = require('./_base');
const { isMock } = require('../../env');
const sm = require('../../integrations/supermetrics');
const { tx } = require('../../db');

const AGENT_ID = '03';
const SOURCES = ['ga4', 'google_ads', 'meta_ads'];
const METRICS = ['impressions', 'clicks', 'cost', 'conversions'];

function mockSnapshots() {
  const out = [];
  const days = sm.lastNDays(7);
  for (const date of days) {
    for (const source of SOURCES) {
      const base = source === 'meta_ads' ? 1.5 : (source === 'google_ads' ? 1.2 : 1);
      out.push({ date, source, metric: 'impressions',  dimension: {}, value: Math.round(8000 * base) + Math.floor(Math.random() * 1500) });
      out.push({ date, source, metric: 'clicks',       dimension: {}, value: Math.round(180 * base) + Math.floor(Math.random() * 40) });
      out.push({ date, source, metric: 'cost',         dimension: {}, value: Math.round((40 + 15 * base) * 100) / 100 });
      out.push({ date, source, metric: 'conversions', dimension: {}, value: Math.round(4 * base) + (Math.random() > 0.5 ? 1 : 0) });
    }
  }
  return out;
}

router.get('/tracking', async (_req, res) => {
  const out = await runAgent(AGENT_ID, async ({ dbUp }) => {
    const mock = isMock('supermetrics');
    const snapshots = mock ? mockSnapshots() : []; // real path requires plan-specific report_type; left for ops to wire.

    if (!mock && snapshots.length === 0) {
      return {
        status: 'warning',
        summary: 'Supermetrics path not yet wired with concrete report_type. Set MOCK_SUPERMETRICS=true to test.',
        metrics: [],
        alerts: [{ severity: 'med', message: 'Wire SM report_type per data source.' }],
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

    const totals = METRICS.reduce((acc, m) => {
      acc[m] = snapshots.filter((s) => s.metric === m).reduce((a, s) => a + Number(s.value), 0);
      return acc;
    }, {});
    const cpl = totals.conversions ? totals.cost / totals.conversions : null;

    return {
      status: mock ? 'mock' : 'ok',
      summary: `Tracked ${snapshots.length} daily metrics across ${SOURCES.length} sources (last 7d). CPL=${cpl ? cpl.toFixed(2) : 'n/a'}.`,
      metrics: [
        { label: 'Impressions (7d)', value: String(totals.impressions || 0) },
        { label: 'Clicks (7d)', value: String(totals.clicks || 0) },
        { label: 'Cost (7d)', value: (totals.cost || 0).toFixed(2) },
        { label: 'Conversions (7d)', value: String(totals.conversions || 0) },
        { label: 'CPL', value: cpl ? cpl.toFixed(2) : 'n/a' },
      ],
      alerts: mock ? [{ severity: 'med', message: 'MOCK Supermetrics: synthetic 7-day data.' }] : [],
      raw: { upserted, sample: snapshots.slice(0, 6) },
    };
  });
  res.json(out);
});

module.exports = router;
