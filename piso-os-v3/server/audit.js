/* PISO OS V3 — audit helpers. Best-effort: never crash a caller. */
const { query } = require('./db');

async function logApiCall(integration, endpoint, method, statusCode, durationMs, error = null) {
  try {
    await query(
      `INSERT INTO audit.api_calls (integration, endpoint, method, status_code, duration_ms, error)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [integration, endpoint, method, statusCode, durationMs, error]
    );
  } catch (e) {
    console.warn('[audit] logApiCall failed:', e.message);
  }
}

async function startAgentRun(agentId) {
  const r = await query(
    `INSERT INTO audit.agent_runs (agent_id, started_at, status)
     VALUES ($1, now(), 'running')
     RETURNING id, started_at`,
    [agentId]
  );
  return r.rows[0];
}

async function finishAgentRun(runId, status, summary, output, error = null) {
  try {
    await query(
      `UPDATE audit.agent_runs
          SET finished_at = now(),
              status = $2,
              summary = $3,
              output = $4,
              error = $5
        WHERE id = $1`,
      [runId, status, summary, output, error]
    );
  } catch (e) {
    console.warn('[audit] finishAgentRun failed:', e.message);
  }
}

async function recordDecision(agentId, decision, rationale) {
  try {
    await query(
      `INSERT INTO audit.decisions (agent_id, decision, rationale, applied)
       VALUES ($1, $2, $3, false)`,
      [agentId, decision, rationale]
    );
  } catch (e) {
    console.warn('[audit] recordDecision failed:', e.message);
  }
}

async function bumpAgentStatus(agentId, status) {
  try {
    await query(
      `UPDATE ops.agents SET status = $2, last_run_at = now() WHERE id = $1`,
      [agentId, status]
    );
  } catch (e) {
    /* ignore */
  }
}

module.exports = { logApiCall, startAgentRun, finishAgentRun, recordDecision, bumpAgentStatus };
