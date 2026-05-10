/* Agent 10 — Property Acquisition. Reads captación-side spend, proposes scaling decisions.
 * Persists audit.decisions.
 */
const express = require('express');
const router = express.Router();

const { runAgent } = require('./_base');
const { isMock } = require('../../env');
const { query } = require('../../db');
const { recordDecision } = require('../../audit');

const AGENT_ID = '10';

router.get('/acquisition', async (_req, res) => {
  const out = await runAgent(AGENT_ID, async ({ dbUp }) => {
    if (!dbUp) {
      return { status: 'warning', summary: 'DB unreachable.', metrics: [], alerts: [{ severity: 'high', message: 'DB unreachable' }] };
    }
    const mock = isMock('supermetrics');

    // Captación campaigns are tagged with objective in ops.campaigns.
    // For now use snapshots_daily as proxy.
    const r = await query(`
      SELECT date, sum(value) FILTER (WHERE metric = 'cost') AS cost,
             sum(value) FILTER (WHERE metric = 'conversions') AS conv
      FROM ops.snapshots_daily
      WHERE source = 'google_ads' AND date >= now() - INTERVAL '7 days'
      GROUP BY date
      ORDER BY date
    `);

    if (r.rows.length === 0) {
      return {
        status: 'mock',
        summary: 'No Google Ads spend snapshots yet. Run agent 03.',
        metrics: [],
        alerts: [{ severity: 'med', message: 'No data.' }],
      };
    }

    const totalCost = r.rows.reduce((a, x) => a + Number(x.cost || 0), 0);
    const totalConv = r.rows.reduce((a, x) => a + Number(x.conv || 0), 0);
    const cpl = totalConv ? totalCost / totalConv : Infinity;

    const inventoryR = await query(`SELECT count(*)::int AS n FROM ops.properties WHERE status = 'activa' AND operation = 'venta'`);
    const ventaInventory = Number(inventoryR.rows[0].n) || 0;

    const decision = ventaInventory < 10
      ? 'increase_acquisition_budget'
      : (cpl > 30 ? 'review_acquisition_efficiency' : 'hold_acquisition');
    const rationale = `Active venta inventory: ${ventaInventory}. 7d CPL=${isFinite(cpl) ? cpl.toFixed(2) : 'n/a'}.`;

    await recordDecision(AGENT_ID, decision, rationale);

    return {
      status: mock ? 'mock' : 'ok',
      summary: `${decision}. ${rationale}`,
      metrics: [
        { label: 'Venta inventory', value: String(ventaInventory) },
        { label: '7d cost', value: totalCost.toFixed(2) },
        { label: '7d conversions', value: String(totalConv) },
        { label: '7d CPL', value: isFinite(cpl) ? cpl.toFixed(2) : 'n/a' },
      ],
      alerts: ventaInventory < 5 ? [{ severity: 'high', message: 'Critical: <5 active venta listings.' }] : [],
      raw: { decision, ventaInventory, cpl },
    };
  });
  res.json(out);
});

module.exports = router;
