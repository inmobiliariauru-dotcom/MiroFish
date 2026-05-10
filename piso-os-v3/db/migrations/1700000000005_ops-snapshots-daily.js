/* ops.snapshots_daily — long-form daily metrics across sources.
 * Composite PK uses jsonb (Postgres allows this since jsonb has equality).
 */
exports.shorthands = undefined;

const TBL = { schema: 'ops', name: 'snapshots_daily' };

exports.up = (pgm) => {
  pgm.createTable(TBL, {
    date: { type: 'date', notNull: true },
    source: { type: 'text', notNull: true },
    metric: { type: 'text', notNull: true },
    dimension: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    value: { type: 'numeric' },
  }, {
    constraints: {
      primaryKey: ['date', 'source', 'metric', 'dimension'],
    },
  });
  pgm.createIndex(TBL, ['source', 'date']);
};

exports.down = (pgm) => {
  pgm.dropTable(TBL);
};
