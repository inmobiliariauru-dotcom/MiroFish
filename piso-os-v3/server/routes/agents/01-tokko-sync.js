/* Agent 01 — Tokko Sync. Reads Tokko, upserts ops.properties. */
const express = require('express');
const router = express.Router();

const { runAgent } = require('./_base');
const { isMock } = require('../../env');
const { query } = require('../../db');
const tokko = require('../../integrations/tokko');

const AGENT_ID = '01';

function mockProperties() {
  const neighborhoods = ['Pocitos', 'Centro', 'Cordón', 'Buceo', 'Punta Carretas', 'Malvín', 'Carrasco'];
  const types = ['Apartamento', 'Casa', 'Local'];
  const list = [];
  let id = 0;
  for (let i = 0; i < 109; i++) {
    list.push({
      id: ++id,
      operation: 'alquiler',
      type: types[i % types.length],
      neighborhood: neighborhoods[i % neighborhoods.length],
      rooms: 1 + (i % 4),
      price_uyu: 28000 + 1000 * (i % 30),
      price_usd: null,
      status: i % 11 === 0 ? 'reservada' : 'activa',
      photos: Array.from({ length: 3 + (i % 8) }, (_, k) => `https://example.test/p${id}_${k}.jpg`),
      description: 'Mock description for property ' + id + '. '.repeat(2 + (i % 4)),
    });
  }
  for (let i = 0; i < 19; i++) {
    list.push({
      id: ++id,
      operation: 'venta',
      type: types[i % types.length],
      neighborhood: neighborhoods[i % neighborhoods.length],
      rooms: 2 + (i % 3),
      price_uyu: null,
      price_usd: 110_000 + 12_000 * (i % 8),
      status: 'activa',
      photos: Array.from({ length: 4 + (i % 7) }, (_, k) => `https://example.test/p${id}_${k}.jpg`),
      description: 'Mock sale listing ' + id + '. '.repeat(3 + (i % 3)),
    });
  }
  return list;
}

function normalizeFromTokko(p) {
  const opType = (p.operations && p.operations[0] && p.operations[0].operation_type) ||
                 (p.operation_types && p.operation_types[0] && p.operation_types[0].operation_type) || null;
  return {
    id: p.id,
    operation: opType ? String(opType).toLowerCase() : null,
    type: (p.type && p.type.name) || p.real_estate_type || null,
    neighborhood: (p.location && p.location.name) || p.neighborhood || null,
    rooms: p.suite_amount || p.rooms || null,
    price_uyu: null,
    price_usd: null,
    status: p.status || 'activa',
    photos: p.photos || [],
    description: p.description || '',
    raw_source: p,
  };
}

async function upsertProperty(p) {
  const idTokko = String(p.id);
  const raw = { ...p, raw_source: undefined };
  await query(
    `INSERT INTO ops.properties
       (id_tokko, operation, type, neighborhood, rooms, price_uyu, price_usd, status, raw, synced_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now(), now())
     ON CONFLICT (id_tokko) DO UPDATE SET
       operation = EXCLUDED.operation,
       type = EXCLUDED.type,
       neighborhood = EXCLUDED.neighborhood,
       rooms = EXCLUDED.rooms,
       price_uyu = EXCLUDED.price_uyu,
       price_usd = EXCLUDED.price_usd,
       status = EXCLUDED.status,
       raw = EXCLUDED.raw,
       synced_at = EXCLUDED.synced_at,
       updated_at = now()`,
    [idTokko, p.operation, p.type, p.neighborhood, p.rooms, p.price_uyu, p.price_usd, p.status, raw]
  );
}

router.get('/inventory', async (_req, res) => {
  const out = await runAgent(AGENT_ID, async ({ dbUp }) => {
    const mock = isMock('tokko');
    let properties;
    if (mock) {
      properties = mockProperties();
    } else {
      const payload = await tokko.listProperties({ limit: 200 });
      properties = tokko.asArray(payload).map(normalizeFromTokko);
    }
    let upserted = 0;
    if (dbUp) {
      for (const p of properties) {
        try { await upsertProperty(p); upserted++; } catch (_) { /* skip */ }
      }
    }
    const alquiler = properties.filter((p) => p.operation === 'alquiler').length;
    const venta = properties.filter((p) => p.operation === 'venta').length;
    return {
      status: mock ? 'mock' : (dbUp ? 'ok' : 'warning'),
      summary: `Tokko sync: ${properties.length} properties (${alquiler} alquiler, ${venta} venta), ${upserted} upserted`,
      metrics: [
        { label: 'Total', value: String(properties.length) },
        { label: 'Alquiler', value: String(alquiler) },
        { label: 'Venta', value: String(venta) },
        { label: 'Upserted', value: String(upserted) },
      ],
      alerts: mock ? [{ severity: 'med', message: 'MOCK mode: set TOKKO_API_KEY to use real Tokko data.' }] : [],
      raw: { sample: properties.slice(0, 3) },
    };
  });
  res.json(out);
});

module.exports = router;
