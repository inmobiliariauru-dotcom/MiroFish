/* PISO OS V3 — env loading + per-integration mock detection. */
require('dotenv').config();

const REQUIRED_AT_BOOT = ['DATABASE_URL'];

const INTEGRATION_REQS = {
  tokko: ['TOKKO_API_KEY'],
  supermetrics: ['SUPERMETRICS_API_KEY', 'SUPERMETRICS_TEAM_KEY'],
};

function isMock(integration) {
  const key = integration.toUpperCase();
  if (process.env[`MOCK_${key}`] === 'true') return true;
  const reqs = INTEGRATION_REQS[integration] || [];
  return reqs.some((k) => !process.env[k]);
}

function bootValidate() {
  const missing = REQUIRED_AT_BOOT.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
  return {
    mocks: Object.keys(INTEGRATION_REQS).filter(isMock),
  };
}

const port = parseInt(process.env.PORT, 10) || 8787;

module.exports = { bootValidate, isMock, port, INTEGRATION_REQS };
