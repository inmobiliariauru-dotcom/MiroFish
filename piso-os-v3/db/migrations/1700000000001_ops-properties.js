/* ops.properties — Tokko cache (single source of truth lives in Tokko itself). */
exports.shorthands = undefined;

const TBL = { schema: 'ops', name: 'properties' };

exports.up = (pgm) => {
  pgm.createTable(TBL, {
    id_tokko: { type: 'text', primaryKey: true },
    operation: { type: 'text' },
    type: { type: 'text' },
    neighborhood: { type: 'text' },
    rooms: { type: 'integer' },
    price_uyu: { type: 'numeric' },
    price_usd: { type: 'numeric' },
    status: { type: 'text' },
    raw: { type: 'jsonb' },
    synced_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex(TBL, 'operation');
  pgm.createIndex(TBL, 'neighborhood');
  pgm.createIndex(TBL, 'status');
  pgm.createIndex(TBL, 'raw', { method: 'gin' });
};

exports.down = (pgm) => {
  pgm.dropTable(TBL);
};
