/* Agent 06 — Expected Value. Combines property price + Google Ads CPL → score.
 * Persists ml.expected_value (property_id, computed_at).
 *
 * Heuristic: EV ≈ price * conversion_rate / cost_per_lead
 * Normalized to 0..1 so the UI can rank.
 */
const express = require('express');
const router = express.Router();

const { runAgent } = require('./_base');
const { isMock } = require('../../env');
const { query, tx } = require('../../db');

const AGENT_ID = '06';
const ASSUMED_CONV_RATE = 0.05; // 5% of leads close — placeholder until Tracking provides real data
const ASSUMED_CPL_USD = 12;     // placeholder; Bloque D will compute from snapshots when SM is wired

router.get('/expected-value', async (_req, res) => {
  const out = await runAgent(AGENT_ID, async ({ dbUp }) => {
    if (!dbUp) {
      return { status: 'warning', summary: 'DB unreachable.', metrics: [], alerts: [{ severity: 'high', message: 'DB unreachable' }] };
    }
    const mock = isMock('supermetrics');

    const props = await query(`
      SELECT id_tokko, operation,
             coalesce(price_usd, price_uyu / 40.0) AS price_usd_est
      FROM ops.properties
      WHERE status = 'activa'
        AND coalesce(price_usd, price_uyu) IS NOT NULL
    `);

    if (props.rows.length === 0) {
      return {
        status: 'mock',
        summary: 'No active priced properties — run agent 01 first.',
        metrics: [],
        alerts: [{ severity: 'med', message: 'ops.properties has no priced rows.' }],
      };
    }

    // Try to pick a CPL from snapshots if available; otherwise use placeholder.
    const cplRow = await query(`
      SELECT (sum(value) FILTER (WHERE metric='cost'))::numeric
             / NULLIF(sum(value) FILTER (WHERE metric='conversions'), 0) AS cpl
      FROM ops.snapshots_daily
      WHERE source = 'google_ads' AND date >= now() - INTERVAL '7 days'
    `);
    const cpl = Number(cplRow.rows[0] && cplRow.rows[0].cpl) || ASSUMED_CPL_USD;

    const maxRevenue = Math.max(...props.rows.map((p) => Number(p.price_usd_est) || 0)) || 1;
    const scored = props.rows.map((p) => {
      const revenue = Number(p.price_usd_est) || 0;
      const ev = (revenue * ASSUMED_CONV_RATE) / cpl;
      const norm = Math.min(1, ev / (maxRevenue * ASSUMED_CONV_RATE / cpl));
      const rationale = `EV = price_usd * ${ASSUMED_CONV_RATE} / cpl(${cpl.toFixed(2)})`;
      return { id: p.id_tokko, score: norm, rationale };
    });

    await tx(async (client) => {
      for (const s of scored) {
        await client.query(
          `INSERT INTO ml.expected_value (property_id, score, rationale, computed_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (property_id, computed_at) DO NOTHING`,
          [s.id, s.score, s.rationale]
        );
      }
    });

    const top = [...scored].sort((a, b) => b.score - a.score).slice(0, 10);
    const avg = scored.reduce((a, s) => a + s.score, 0) / scored.length;

    return {
      status: mock ? 'mock' : 'ok',
      summary: `Expected value scored for ${scored.length} properties; avg ${avg.toFixed(3)}, CPL=${cpl.toFixed(2)}.`,
      metrics: [
        { label: 'Scored', value: String(scored.length) },
        { label: 'Avg EV', value: avg.toFixed(3) },
        { label: 'CPL used', value: cpl.toFixed(2) },
        { label: 'Top score', value: (top[0] && top[0].score.toFixed(3)) || '0' },
      ],
      alerts: mock ? [{ severity: 'low', message: 'CPL fallback to assumed value (Supermetrics in mock).' }] : [],
      raw: { top },
    };
  });
  res.json(out);
});

module.exports = router;
