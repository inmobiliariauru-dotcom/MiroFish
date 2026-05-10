/* Agent 12 — Campaign Builder (READ-ONLY). Snapshots Google Ads campaigns into ops.campaigns.
 * Never mutates Google Ads.
 */
const express = require('express');
const router = express.Router();

const { runAgent } = require('./_base');
const { isMock } = require('../../env');
const sm = require('../../integrations/supermetrics');
const { query } = require('../../db');

const AGENT_ID = '12';

function mockCampaigns() {
  return [
    { id: 'GA-101', external_id: '101', name: 'Alquiler-Pocitos-Search', objective: 'alquiler', status: 'enabled', daily_budget: 25 },
    { id: 'GA-102', external_id: '102', name: 'Alquiler-Cordon-Search', objective: 'alquiler', status: 'enabled', daily_budget: 18 },
    { id: 'GA-201', external_id: '201', name: 'Venta-Apto-General', objective: 'venta', status: 'enabled', daily_budget: 30 },
    { id: 'GA-301', external_id: '301', name: 'Captacion-Venta-Display', objective: 'captacion_venta', status: 'paused', daily_budget: 12 },
    { id: 'GA-401', external_id: '401', name: 'Captacion-Alquiler-Search', objective: 'captacion_alquiler', status: 'enabled', daily_budget: 15 },
  ];
}

router.get('/campaigns', async (_req, res) => {
  const out = await runAgent(AGENT_ID, async ({ dbUp }) => {
    const mock = isMock('supermetrics');
    let campaigns;
    if (mock) {
      campaigns = mockCampaigns();
    } else {
      const payload = await sm.query({
        ds_id: 'GAQ', // Google Ads
        ds_accounts: process.env.GOOGLE_ADS_CUSTOMER_ID,
        fields: 'CampaignId,CampaignName,CampaignStatus,Cost,Impressions,Clicks',
        start_date: sm.daysAgoISO(7),
        end_date: sm.todayISO(),
        settings: { report_type: 'CAMPAIGN_PERFORMANCE_REPORT' },
      });
      campaigns = sm.rows(payload).map((row) => ({
        id: `GA-${row.CampaignId}`,
        external_id: String(row.CampaignId),
        name: row.CampaignName,
        objective: null,
        status: (row.CampaignStatus || '').toLowerCase(),
        daily_budget: null,
      }));
    }

    let upserted = 0;
    if (dbUp) {
      for (const c of campaigns) {
        try {
          await query(
            `INSERT INTO ops.campaigns (id, platform, external_id, name, objective, status, daily_budget, raw, last_synced_at)
             VALUES ($1, 'google_ads', $2, $3, $4, $5, $6, $7, now())
             ON CONFLICT (id) DO UPDATE SET
               external_id = EXCLUDED.external_id,
               name = EXCLUDED.name,
               objective = EXCLUDED.objective,
               status = EXCLUDED.status,
               daily_budget = EXCLUDED.daily_budget,
               raw = EXCLUDED.raw,
               last_synced_at = now()`,
            [c.id, c.external_id, c.name, c.objective, c.status, c.daily_budget, c]
          );
          upserted++;
        } catch (_) { /* skip */ }
      }
    }

    const enabled = campaigns.filter((c) => c.status === 'enabled').length;
    const paused = campaigns.filter((c) => c.status === 'paused').length;

    return {
      status: mock ? 'mock' : 'ok',
      summary: `Snapshotted ${campaigns.length} Google Ads campaigns (READ-ONLY).`,
      metrics: [
        { label: 'Total', value: String(campaigns.length) },
        { label: 'Enabled', value: String(enabled) },
        { label: 'Paused', value: String(paused) },
        { label: 'Upserted', value: String(upserted) },
      ],
      alerts: [{ severity: 'low', message: 'READ-ONLY: this agent does not mutate Google Ads.' }],
      raw: { sample: campaigns.slice(0, 3) },
    };
  });
  res.json(out);
});

module.exports = router;
