/* ops.agents — registry of the 14 agents. Seeded by db/seeds/001-agents.sql. */
exports.shorthands = undefined;

const TBL = { schema: 'ops', name: 'agents' };

exports.up = (pgm) => {
  pgm.createTable(TBL, {
    id: { type: 'text', primaryKey: true },
    name: { type: 'text', notNull: true },
    layer: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true, default: 'idle' },
    last_run_at: { type: 'timestamptz' },
    config: { type: 'jsonb' },
  });
};

exports.down = (pgm) => {
  pgm.dropTable(TBL);
};
