/* ops.campaigns — read-only snapshot from Google Ads / Meta via Supermetrics. */
exports.shorthands = undefined;

const TBL = { schema: 'ops', name: 'campaigns' };

exports.up = (pgm) => {
  pgm.createTable(TBL, {
    id: { type: 'text', primaryKey: true },
    platform: { type: 'text', notNull: true },
    external_id: { type: 'text' },
    name: { type: 'text' },
    objective: { type: 'text' },
    status: { type: 'text' },
    daily_budget: { type: 'numeric' },
    raw: { type: 'jsonb' },
    last_synced_at: { type: 'timestamptz' },
  });
  pgm.createIndex(TBL, 'platform');
};

exports.down = (pgm) => {
  pgm.dropTable(TBL);
};
