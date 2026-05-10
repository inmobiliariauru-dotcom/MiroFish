/* audit.agent_runs — every agent execution gets a row. */
exports.shorthands = undefined;

const TBL = { schema: 'audit', name: 'agent_runs' };

exports.up = (pgm) => {
  pgm.createTable(TBL, {
    id: 'bigserial',
    agent_id: { type: 'text', references: '"ops"."agents"', onDelete: 'set null' },
    started_at: { type: 'timestamptz' },
    finished_at: { type: 'timestamptz' },
    status: { type: 'text' },
    summary: { type: 'text' },
    output: { type: 'jsonb' },
    error: { type: 'text' },
  }, {
    constraints: { primaryKey: 'id' },
  });
  pgm.createIndex(TBL, ['agent_id', 'started_at']);
  pgm.createIndex(TBL, 'status');
};

exports.down = (pgm) => {
  pgm.dropTable(TBL);
};
