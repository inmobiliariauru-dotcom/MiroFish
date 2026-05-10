/* Agent 05 — Pricing & Positioning.
 * Compares each property's price against the median of its (operation, neighborhood, rooms) cohort.
 * Persists ml.pricing_score with under | fair | over and delta_pct.
 */
const express = require('express');
const router = express.Router();

const { runAgent } = require('./_base');
const { query, tx } = require('../../db');

const AGENT_ID = '05';
const UNDER_THRESHOLD = -10;
const OVER_THRESHOLD = 10;

router.get('/pricing', async (_req, res) => {
  const out = await runAgent(AGENT_ID, async ({ dbUp }) => {
    if (!dbUp) {
      return { status: 'warning', summary: 'DB unreachable.', metrics: [], alerts: [{ severity: 'high', message: 'DB unreachable' }] };
    }

    const props = await query(`
      SELECT id_tokko, operation, neighborhood, rooms,
             coalesce(price_uyu, price_usd) AS price,
             CASE WHEN price_usd IS NOT NULL THEN 'usd' ELSE 'uyu' END AS currency
      FROM ops.properties
      WHERE status = 'activa' AND operation IS NOT NULL
        AND coalesce(price_uyu, price_usd) IS NOT NULL
    `);

    if (props.rows.length === 0) {
      return {
        status: 'mock',
        summary: 'No active priced properties — run agent 01 first.',
        metrics: [],
        alerts: [{ severity: 'med', message: 'ops.properties has no priced rows.' }],
      };
    }

    const buckets = new Map();
    for (const p of props.rows) {
      if (!p.price) continue;
      const k = [p.operation, p.neighborhood, p.rooms, p.currency].join('|');
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(Number(p.price));
    }
    function median(arr) {
      const s = [...arr].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }

    const scored = [];
    let under = 0, fair = 0, over = 0;
    for (const p of props.rows) {
      const k = [p.operation, p.neighborhood, p.rooms, p.currency].join('|');
      const bucket = buckets.get(k);
      if (!bucket || bucket.length < 2) continue; // need at least 1 comparable
      const med = median(bucket);
      const delta = ((Number(p.price) - med) / med) * 100;
      let competitiveness;
      if (delta < UNDER_THRESHOLD) { competitiveness = 'under'; under++; }
      else if (delta > OVER_THRESHOLD) { competitiveness = 'over'; over++; }
      else { competitiveness = 'fair'; fair++; }
      scored.push({ id: p.id_tokko, competitiveness, delta_pct: delta });
    }

    if (scored.length > 0) {
      await tx(async (client) => {
        for (const s of scored) {
          await client.query(
            `INSERT INTO ml.pricing_score (property_id, competitiveness, delta_pct, computed_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (property_id, computed_at) DO NOTHING`,
            [s.id, s.competitiveness, s.delta_pct]
          );
        }
      });
    }

    return {
      status: 'ok',
      summary: `Scored ${scored.length}/${props.rows.length} properties (${props.rows.length - scored.length} had no comparable cohort).`,
      metrics: [
        { label: 'Scored', value: String(scored.length) },
        { label: 'Under', value: String(under) },
        { label: 'Fair', value: String(fair) },
        { label: 'Over', value: String(over) },
      ],
      alerts: over > scored.length / 3
        ? [{ severity: 'med', message: `${over} properties priced above market (>10% over median).` }]
        : [],
      raw: { sample: scored.slice(0, 5) },
    };
  });
  res.json(out);
});

module.exports = router;
