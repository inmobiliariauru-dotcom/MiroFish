/* ops.leads — funnel ledger. Sources: google_ads, meta, organic, referral. */
exports.shorthands = undefined;

const TBL = { schema: 'ops', name: 'leads' };

exports.up = (pgm) => {
  pgm.createTable(TBL, {
    id: 'bigserial',
    source: { type: 'text' },
    campaign_id: { type: 'text', references: '"ops"."campaigns"', onDelete: 'set null' },
    property_id: { type: 'text', references: '"ops"."properties"', onDelete: 'set null' },
    contact_at: { type: 'timestamptz' },
    qualified_at: { type: 'timestamptz' },
    visited_at: { type: 'timestamptz' },
    closed_at: { type: 'timestamptz' },
    value_uyu: { type: 'numeric' },
    raw: { type: 'jsonb' },
  }, {
    constraints: {
      primaryKey: 'id',
    },
  });
  pgm.createIndex(TBL, 'source');
  pgm.createIndex(TBL, 'campaign_id');
  pgm.createIndex(TBL, 'property_id');
  pgm.createIndex(TBL, 'closed_at');
};

exports.down = (pgm) => {
  pgm.dropTable(TBL);
};
