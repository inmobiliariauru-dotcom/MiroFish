/* Agent 02 — Inventory Normalizer. Reads ops.properties, reports data quality. */
const express = require('express');
const router = express.Router();

const { runAgent } = require('./_base');
const { query } = require('../../db');

const AGENT_ID = '02';

router.get('/normalized', async (_req, res) => {
  const out = await runAgent(AGENT_ID, async ({ dbUp }) => {
    if (!dbUp) {
      return {
        status: 'warning',
        summary: 'DB unreachable; cannot read ops.properties.',
        metrics: [],
        alerts: [{ severity: 'high', message: 'DB unreachable' }],
      };
    }

    const r = await query(`
      SELECT
        count(*)                                        AS total,
        count(*) FILTER (WHERE operation IS NULL)       AS no_operation,
        count(*) FILTER (WHERE neighborhood IS NULL)    AS no_neighborhood,
        count(*) FILTER (WHERE rooms IS NULL)           AS no_rooms,
        count(*) FILTER (WHERE price_uyu IS NULL AND price_usd IS NULL) AS no_price,
        count(*) FILTER (WHERE status = 'activa')       AS active
      FROM ops.properties
    `);
    const row = r.rows[0] || {};
    const total = Number(row.total) || 0;
    const issues = ['no_operation', 'no_neighborhood', 'no_rooms', 'no_price']
      .reduce((sum, k) => sum + Number(row[k] || 0), 0);
    const empty = total === 0;

    return {
      status: empty ? 'mock' : (issues > 0 ? 'warning' : 'ok'),
      summary: empty
        ? 'No properties yet — run agent 01 first.'
        : `Reviewed ${total} properties; ${issues} field-level issues across all rows.`,
      metrics: [
        { label: 'Total', value: String(total) },
        { label: 'Active', value: String(row.active || 0) },
        { label: 'Missing operation', value: String(row.no_operation || 0) },
        { label: 'Missing neighborhood', value: String(row.no_neighborhood || 0) },
        { label: 'Missing rooms', value: String(row.no_rooms || 0) },
        { label: 'Missing price', value: String(row.no_price || 0) },
      ],
      alerts: empty
        ? [{ severity: 'med', message: 'ops.properties is empty. Hit /api/agent/01/inventory first.' }]
        : (issues > 0 ? [{ severity: 'low', message: `${issues} field-level issues detected.` }] : []),
      raw: row,
    };
  });
  res.json(out);
});

module.exports = router;
