/* audit.decisions — proposed actions (applied=false in this read-only session). */
exports.shorthands = undefined;

const TBL = { schema: 'audit', name: 'decisions' };

exports.up = (pgm) => {
  pgm.createTable(TBL, {
    id: 'bigserial',
    agent_id: { type: 'text' },
    decision: { type: 'text' },
    rationale: { type: 'text' },
    applied: { type: 'boolean', notNull: true, default: false },
    applied_at: { type: 'timestamptz' },
    rolled_back_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  }, {
    constraints: { primaryKey: 'id' },
  });
  pgm.createIndex(TBL, ['agent_id', 'applied', 'created_at']);
};

exports.down = (pgm) => {
  pgm.dropTable(TBL);
};
