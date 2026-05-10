/* PISO OS V3 — Tokko Broker REST client. Read-only from our side. */
const axios = require('axios');
const { logApiCall } = require('../audit');

const BASE = process.env.TOKKO_BASE_URL || 'https://www.tokkobroker.com/api/v1';

function buildClient() {
  return axios.create({
    baseURL: BASE,
    timeout: 15_000,
    params: { key: process.env.TOKKO_API_KEY, format: 'json' },
  });
}

async function withAudit(method, path, fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    await logApiCall('tokko', path, method, r.status, Date.now() - t0);
    return r.data;
  } catch (err) {
    const status = (err.response && err.response.status) || 0;
    await logApiCall('tokko', path, method, status, Date.now() - t0, err.message);
    throw err;
  }
}

async function listProperties({ limit = 200, offset = 0 } = {}) {
  const c = buildClient();
  return withAudit('GET', '/property/', () => c.get('/property/', { params: { limit, offset } }));
}

async function getProperty(id) {
  const c = buildClient();
  return withAudit('GET', `/property/${id}/`, () => c.get(`/property/${id}/`));
}

/**
 * Tokko sometimes returns the list under .objects or .results; sometimes a flat array.
 * Normalize to array.
 */
function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.objects)) return payload.objects;
  if (payload && Array.isArray(payload.results)) return payload.results;
  return [];
}

module.exports = { listProperties, getProperty, asArray };
