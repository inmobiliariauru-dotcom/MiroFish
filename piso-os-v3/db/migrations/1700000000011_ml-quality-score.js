/* ml.quality_score — fichas commercial quality, blockers as TEXT[]. */
exports.shorthands = undefined;

const TBL = { schema: 'ml', name: 'quality_score' };

exports.up = (pgm) => {
  pgm.createTable(TBL, {
    property_id: { type: 'text', notNull: true, references: '"ops"."properties"', onDelete: 'cascade' },
    photos_score: { type: 'numeric' },
    copy_score: { type: 'numeric' },
    total: { type: 'numeric' },
    blockers: { type: 'text[]' },
    computed_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  }, {
    constraints: {
      primaryKey: ['property_id', 'computed_at'],
    },
  });
  pgm.createIndex(TBL, 'total');
  pgm.createIndex(TBL, 'computed_at');
};

exports.down = (pgm) => {
  pgm.dropTable(TBL);
};
