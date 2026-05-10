/* ml.expected_value — score 0..1 per property, time-series via (property_id, computed_at). */
exports.shorthands = undefined;

const TBL = { schema: 'ml', name: 'expected_value' };

exports.up = (pgm) => {
  pgm.createTable(TBL, {
    property_id: { type: 'text', notNull: true, references: '"ops"."properties"', onDelete: 'cascade' },
    score: { type: 'numeric' },
    rationale: { type: 'text' },
    computed_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  }, {
    constraints: {
      primaryKey: ['property_id', 'computed_at'],
    },
  });
  pgm.createIndex(TBL, 'computed_at');
};

exports.down = (pgm) => {
  pgm.dropTable(TBL);
};
