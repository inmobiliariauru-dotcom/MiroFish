/* PISO OS V3 — schemas: ops, audit, ml */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createSchema('ops', { ifNotExists: true });
  pgm.createSchema('audit', { ifNotExists: true });
  pgm.createSchema('ml', { ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropSchema('ml', { ifExists: true });
  pgm.dropSchema('audit', { ifExists: true });
  pgm.dropSchema('ops', { ifExists: true });
};
