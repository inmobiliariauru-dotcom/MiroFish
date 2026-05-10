/* audit.api_calls — every external API call (tokko, supermetrics, sheets). */
exports.shorthands = undefined;

const TBL = { schema: 'audit', name: 'api_calls' };

exports.up = (pgm) => {
  pgm.createTable(TBL, {
    id: 'bigserial',
    integration: { type: 'text' },
    endpoint: { type: 'text' },
    method: { type: 'text' },
    status_code: { type: 'integer' },
    duration_ms: { type: 'integer' },
    called_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    error: { type: 'text' },
  }, {
    constraints: { primaryKey: 'id' },
  });
  pgm.createIndex(TBL, ['integration', 'called_at']);
};

exports.down = (pgm) => {
  pgm.dropTable(TBL);
};
