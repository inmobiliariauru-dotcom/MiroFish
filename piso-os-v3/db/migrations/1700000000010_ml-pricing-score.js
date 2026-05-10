/* ml.pricing_score — under/fair/over vs comparables. */
exports.shorthands = undefined;

const TBL = { schema: 'ml', name: 'pricing_score' };

exports.up = (pgm) => {
  pgm.createTable(TBL, {
    property_id: { type: 'text', notNull: true, references: '"ops"."properties"', onDelete: 'cascade' },
    competitiveness: { type: 'text' },
    delta_pct: { type: 'numeric' },
    computed_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  }, {
    constraints: {
      primaryKey: ['property_id', 'computed_at'],
    },
  });
  pgm.createIndex(TBL, 'competitiveness');
  pgm.createIndex(TBL, 'computed_at');
};

exports.down = (pgm) => {
  pgm.dropTable(TBL);
};
