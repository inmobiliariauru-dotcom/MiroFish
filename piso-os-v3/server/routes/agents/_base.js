/* PISO OS V3 — agent runner: enforces standardized shape + audit logging. */
const { startAgentRun, finishAgentRun, bumpAgentStatus } = require('../../audit');
const { ping } = require('../../db');

const AGENT_NAMES = {
  '01': 'Tokko Sync',
  '02': 'Inventory Normalizer',
  '03': 'Tracking & Conversions',
  '04': 'Market Intelligence',
  '05': 'Pricing & Positioning',
  '06': 'Expected Value',
  '07': 'Commercial Quality',
  '08': 'Portfolio Allocation',
  '09': 'Search Strategy',
  '10': 'Property Acquisition',
  '11': 'Remarketing & Audiences',
  '12': 'Campaign Builder (read-only)',
  '13': 'Negative Keywords',
  '14': 'Bidding/Budget/Scaling',
};

const VALID_STATUSES = new Set(['ok', 'warning', 'error', 'mock']);

function shape({ agentId, status, summary, metrics, alerts, raw, lastRun }) {
  return {
    agent_id: agentId,
    agent_name: AGENT_NAMES[agentId] || agentId,
    status: VALID_STATUSES.has(status) ? status : 'ok',
    last_run: lastRun ? new Date(lastRun).toISOString() : new Date().toISOString(),
    summary: summary || '',
    metrics: Array.isArray(metrics) ? metrics : [],
    alerts: Array.isArray(alerts) ? alerts : [],
    raw: raw || {},
  };
}

async function runAgent(agentId, handler) {
  const dbUp = await ping();
  let runId;
  let started;
  if (dbUp) {
    try {
      const run = await startAgentRun(agentId);
      runId = run.id;
      started = run.started_at;
    } catch (_) { /* ignore */ }
  }

  let result;
  try {
    result = await handler({ dbUp });
  } catch (err) {
    const out = shape({
      agentId,
      status: 'error',
      summary: err.message,
      alerts: [{ severity: 'high', message: err.message }],
      lastRun: started,
    });
    if (runId) await finishAgentRun(runId, 'error', err.message, null, err.stack);
    if (dbUp) await bumpAgentStatus(agentId, 'error');
    return out;
  }

  const out = shape({
    agentId,
    status: result.status || (dbUp ? 'ok' : 'warning'),
    summary: result.summary,
    metrics: result.metrics,
    alerts: [
      ...(result.alerts || []),
      ...(!dbUp ? [{ severity: 'high', message: 'DB unreachable; persist skipped.' }] : []),
    ],
    raw: result.raw,
    lastRun: started,
  });

  if (runId) await finishAgentRun(runId, out.status, out.summary, out.raw);
  if (dbUp) await bumpAgentStatus(agentId, out.status === 'ok' ? 'idle' : out.status);
  return out;
}

module.exports = { runAgent, AGENT_NAMES };
