/* Agent 11 — Remarketing & Audiences. GA4 audiences + Meta CAPI signals → remarketing pool decisions. */
const express = require('express');
const router = express.Router();

const { runAgent } = require('./_base');
const { isMock } = require('../../env');
const { query } = require('../../db');
const { recordDecision } = require('../../audit');

const AGENT_ID = '11';

router.get('/remarketing', async (_req, res) => {
  const out = await runAgent(AGENT_ID, async ({ dbUp }) => {
    if (!dbUp) {
      return { status: 'warning', summary: 'DB unreachable.', metrics: [], alerts: [{ severity: 'high', message: 'DB unreachable' }] };
    }
    const mock = isMock('supermetrics');

    const r = await query(`
      SELECT
        sum(value) FILTER (WHERE source='ga4' AND metric='sessions') AS ga4_sessions,
        sum(value) FILTER (WHERE source='meta_ads' AND metric='conversions') AS meta_conv
      FROM ops.snapshots_daily
      WHERE date >= now() - INTERVAL '7 days'
    `);
    const ga4 = Number(r.rows[0] && r.rows[0].ga4_sessions) || 0;
    const meta = Number(r.rows[0] && r.rows[0].meta_conv) || 0;

    if (ga4 === 0 && meta === 0) {
      return {
        status: 'mock',
        summary: 'No GA4/Meta signals yet. Run agents 03 and 04.',
        metrics: [],
        alerts: [{ severity: 'med', message: 'No data.' }],
      };
    }

    const decision = ga4 > 500 ? 'enable_remarketing_pool_high_intent' : 'observe_remarketing_pool';
    const rationale = `GA4 7d sessions=${ga4}; Meta 7d conversions=${meta}. Propose remarketing pool sized to high-intent visitors.`;
    await recordDecision(AGENT_ID, decision, rationale);

    return {
      status: mock ? 'mock' : 'ok',
      summary: `${decision}. ${rationale}`,
      metrics: [
        { label: 'GA4 sessions (7d)', value: String(ga4) },
        { label: 'Meta conversions (7d)', value: String(meta) },
        { label: 'Decision', value: decision },
      ],
      alerts: [],
      raw: { ga4, meta, decision },
    };
  });
  res.json(out);
});

module.exports = router;
