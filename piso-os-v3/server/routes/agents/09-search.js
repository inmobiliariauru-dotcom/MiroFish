/* Agent 09 — Search Strategy. Joins Google Ads + GSC (queries) → priority terms.
 * Persists audit.decisions with proposed keyword shifts.
 */
const express = require('express');
const router = express.Router();

const { runAgent } = require('./_base');
const { isMock } = require('../../env');
const { query } = require('../../db');
const { recordDecision } = require('../../audit');

const AGENT_ID = '09';

router.get('/search', async (_req, res) => {
  const out = await runAgent(AGENT_ID, async ({ dbUp }) => {
    if (!dbUp) {
      return { status: 'warning', summary: 'DB unreachable.', metrics: [], alerts: [{ severity: 'high', message: 'DB unreachable' }] };
    }
    const mock = isMock('supermetrics');

    const gscQueries = await query(`
      SELECT dimension->>'query' AS query, sum(value) AS clicks
      FROM ops.snapshots_daily
      WHERE source = 'gsc' AND metric = 'clicks'
        AND dimension ? 'query' AND date >= now() - INTERVAL '7 days'
      GROUP BY dimension->>'query'
      ORDER BY clicks DESC
      LIMIT 10
    `);

    if (gscQueries.rows.length === 0) {
      return {
        status: 'mock',
        summary: 'No GSC query data yet. Run agent 04 first.',
        metrics: [],
        alerts: [{ severity: 'med', message: 'ops.snapshots_daily has no gsc queries.' }],
      };
    }

    const top = gscQueries.rows.slice(0, 5);
    const terms = top.map((r) => r.query).join(', ');
    const decision = 'expand_search_terms';
    const rationale = `Top 5 GSC queries (7d): ${terms}. Propose adding to Google Ads search campaigns as exact match.`;

    await recordDecision(AGENT_ID, decision, rationale);

    return {
      status: mock ? 'mock' : 'ok',
      summary: `${decision}: top GSC queries identified.`,
      metrics: top.map((r) => ({ label: r.query, value: String(r.clicks) })),
      alerts: [],
      raw: { top: gscQueries.rows },
    };
  });
  res.json(out);
});

module.exports = router;
