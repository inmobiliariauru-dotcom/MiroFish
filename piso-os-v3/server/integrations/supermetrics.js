/* PISO OS V3 — Supermetrics Ruta A client (enterprise/v2/query). */
const axios = require('axios');
const { logApiCall } = require('../audit');

const BASE = process.env.SUPERMETRICS_BASE_URL || 'https://api.supermetrics.com/enterprise/v2/query';

/**
 * Generic query against Supermetrics enterprise/v2/query.
 * body shape:
 *   {
 *     ds_id: 'GAQ' | 'GA4' | 'FBADS' | 'GSC' | ...,
 *     ds_accounts: '<ad-account-or-property-id>',
 *     fields: 'Date,Sessions,Conversions',
 *     start_date: 'YYYY-MM-DD',
 *     end_date:   'YYYY-MM-DD',
 *     settings:   { report_type: '...' }
 *   }
 */
async function query(body) {
  const t0 = Date.now();
  try {
    const r = await axios.post(BASE, body, {
      params: {
        api_key: process.env.SUPERMETRICS_API_KEY,
        team_key: process.env.SUPERMETRICS_TEAM_KEY,
      },
      timeout: 30_000,
    });
    const tag = `${body.ds_id || 'query'}:${(body.settings && body.settings.report_type) || 'default'}`;
    await logApiCall('supermetrics', tag, 'POST', r.status, Date.now() - t0);
    return r.data;
  } catch (err) {
    const status = (err.response && err.response.status) || 0;
    await logApiCall('supermetrics', body.ds_id || 'query', 'POST', status, Date.now() - t0, err.message);
    throw err;
  }
}

/** Returns the array of rows from a Supermetrics response, regardless of shape. */
function rows(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && Array.isArray(payload.data.rows)) return payload.data.rows;
  return [];
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(n) {
  const d = new Date(Date.now() - n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function lastNDays(n) {
  return Array.from({ length: n }, (_, i) => daysAgoISO(n - 1 - i));
}

module.exports = { query, rows, todayISO, daysAgoISO, lastNDays };
