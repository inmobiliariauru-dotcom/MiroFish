/* Agent 14 — Bidding/Budget/Scaling. Reads spend & conversions; proposes budget moves.
 * Persists audit.decisions with applied=false. NEVER mutates Ads.
 */
const express = require('express');
const router = express.Router();

const { runAgent } = require('./_base');
const { isMock } = require('../../env');
const { query } = require('../../db');
const { recordDecision } = require('../../audit');

const AGENT_ID = '14';
const TARGET_CPL_USD = 18;

router.get('/bidding', async (_req, res) => {
  const out = await runAgent(AGENT_ID, async ({ dbUp }) => {
    if (!dbUp) {
      return { status: 'warning', summary: 'DB unreachable.', metrics: [], alerts: [{ severity: 'high', message: 'DB unreachable' }] };
    }
    const mock = isMock('supermetrics');

    const r = await query(`
      SELECT source,
             sum(value) FILTER (WHERE metric='cost')        AS cost,
             sum(value) FILTER (WHERE metric='conversions') AS conv
      FROM ops.snapshots_daily
      WHERE date >= now() - INTERVAL '7 days'
        AND source IN ('google_ads','meta_ads')
      GROUP BY source
    `);

    if (r.rows.length === 0) {
      return {
        status: 'mock',
        summary: 'No Ads spend snapshots yet. Run agent 03.',
        metrics: [],
        alerts: [{ severity: 'med', message: 'No data.' }],
      };
    }

    const proposals = [];
    for (const row of r.rows) {
      const cost = Number(row.cost) || 0;
      const conv = Number(row.conv) || 0;
      const cpl = conv ? cost / conv : Infinity;
      let action;
      if (!isFinite(cpl)) action = 'pause_or_optimize_creative';
      else if (cpl < TARGET_CPL_USD * 0.7) action = 'scale_up_budget_25pct';
      else if (cpl > TARGET_CPL_USD * 1.5) action = 'reduce_budget_30pct';
      else action = 'hold_budget';
      proposals.push({ source: row.source, cost, conv, cpl, action });
    }

    for (const p of proposals) {
      await recordDecision(
        AGENT_ID,
        `${p.action}: ${p.source}`,
        `7d ${p.source}: cost=${p.cost.toFixed(2)}, conv=${p.conv}, CPL=${isFinite(p.cpl) ? p.cpl.toFixed(2) : 'n/a'} (target ${TARGET_CPL_USD}).`
      );
    }

    return {
      status: mock ? 'mock' : 'ok',
      summary: `Proposed ${proposals.length} bidding moves; all applied=false.`,
      metrics: proposals.map((p) => ({
        label: p.source,
        value: `${p.action} (CPL ${isFinite(p.cpl) ? p.cpl.toFixed(2) : 'n/a'})`,
      })),
      alerts: [{ severity: 'low', message: 'NEVER mutates Ads. Decisions live in audit.decisions.' }],
      raw: { proposals },
    };
  });
  res.json(out);
});

module.exports = router;
