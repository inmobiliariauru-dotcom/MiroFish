/* Agent 08 — Portfolio Allocation. Reads spend by platform, proposes allocation deltas.
 * Persists audit.decisions (applied=false; READ-ONLY session).
 */
const express = require('express');
const router = express.Router();

const { runAgent } = require('./_base');
const { isMock } = require('../../env');
const { query } = require('../../db');
const { recordDecision } = require('../../audit');

const AGENT_ID = '08';
const TARGET_GAQ_SHARE = 0.6; // 60% Google Ads / 40% Meta as a starting heuristic

router.get('/portfolio', async (_req, res) => {
  const out = await runAgent(AGENT_ID, async ({ dbUp }) => {
    const mock = isMock('supermetrics');

    if (!dbUp) {
      return { status: 'warning', summary: 'DB unreachable.', metrics: [], alerts: [{ severity: 'high', message: 'DB unreachable' }] };
    }

    const r = await query(`
      SELECT source, sum(value) AS cost
      FROM ops.snapshots_daily
      WHERE metric = 'cost' AND date >= now() - INTERVAL '7 days'
        AND source IN ('google_ads', 'meta_ads')
      GROUP BY source
    `);

    const cost = { google_ads: 0, meta_ads: 0 };
    for (const row of r.rows) cost[row.source] = Number(row.cost) || 0;
    const total = cost.google_ads + cost.meta_ads;

    if (total === 0) {
      return {
        status: 'mock',
        summary: 'No spend snapshots yet. Run agent 03 first.',
        metrics: [],
        alerts: [{ severity: 'med', message: 'ops.snapshots_daily has no cost rows.' }],
      };
    }

    const gaqShare = cost.google_ads / total;
    const metaShare = cost.meta_ads / total;
    const gaqDelta = TARGET_GAQ_SHARE - gaqShare;

    const decision = Math.abs(gaqDelta) < 0.05
      ? 'hold_allocation'
      : (gaqDelta > 0 ? 'increase_google_ads' : 'increase_meta');

    const rationale = `7d spend: GAds=${cost.google_ads.toFixed(2)} (${(gaqShare * 100).toFixed(1)}%), Meta=${cost.meta_ads.toFixed(2)} (${(metaShare * 100).toFixed(1)}%). Target GAds=${(TARGET_GAQ_SHARE * 100).toFixed(0)}%.`;

    await recordDecision(AGENT_ID, decision, rationale);

    return {
      status: mock ? 'mock' : 'ok',
      summary: `${decision}. ${rationale}`,
      metrics: [
        { label: 'GAds spend (7d)', value: cost.google_ads.toFixed(2) },
        { label: 'Meta spend (7d)', value: cost.meta_ads.toFixed(2) },
        { label: 'GAds share', value: `${(gaqShare * 100).toFixed(1)}%` },
        { label: 'Decision', value: decision },
      ],
      alerts: Math.abs(gaqDelta) > 0.2
        ? [{ severity: 'med', message: `Allocation drift: ${(Math.abs(gaqDelta) * 100).toFixed(0)}% off target.` }]
        : [],
      raw: { cost, share: { google_ads: gaqShare, meta_ads: metaShare }, decision },
    };
  });
  res.json(out);
});

module.exports = router;
