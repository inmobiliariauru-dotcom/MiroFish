/* Agent 01 — Inventory Sync (Salboo Excel + Tokko REST fallback).
 *
 * Read-source priority:
 *   1. SALBOO_INBOX_DIR has an .xlsx → parse + upsert + archive (preferred path,
 *      because Tokko REST is IP-allowlisted and Salboo daily Excel is canonical).
 *   2. TOKKO_API_KEY is set → call Tokko REST.
 *   3. Otherwise → mock 128 properties.
 *
 * Always writes ops.properties and audit.api_calls.
 */
const express = require('express');
const router = express.Router();

const { runAgent } = require('./_base');
const { isMock } = require('../../env');
const { query } = require('../../db');
const tokko = require('../../integrations/tokko');
const salboo = require('../../integrations/salboo-excel');

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
  };
}

async function upsertProperty(p) {
  const idTokko = String(p.id);
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
    [idTokko, p.operation, p.type, p.neighborhood, p.rooms, p.price_uyu, p.price_usd, p.status, p]
  );
}

router.get('/inventory', async (_req, res) => {
  const out = await runAgent(AGENT_ID, async ({ dbUp }) => {
    let source = 'mock';
    let properties = [];
    let archived = null;
    const alerts = [];

    // 1. Try Salboo Excel from inbox.
    const drop = salboo.latestFile();
    if (drop) {
      try {
        const parsed = await salboo.parseFile(drop.path);
        if (parsed.properties.length > 0) {
          properties = parsed.properties;
          source = `salboo_excel:${drop.name}`;
        } else {
          alerts.push({ severity: 'med', message: `Excel "${drop.name}" parsed but no rows matched. Check headers.` });
        }
      } catch (err) {
        alerts.push({ severity: 'high', message: `Failed to parse ${drop.name}: ${err.message}` });
      }
    }

    // 2. Fallback to Tokko REST.
    if (properties.length === 0 && !isMock('tokko')) {
      try {
        const payload = await tokko.listProperties({ limit: 200 });
        properties = tokko.asArray(payload).map(normalizeFromTokko);
        source = 'tokko_api';
      } catch (err) {
        alerts.push({ severity: 'high', message: `Tokko API: ${err.message}` });
      }
    }

    // 3. Mock fallback.
    if (properties.length === 0) {
      properties = mockProperties();
      source = 'mock';
    }

    let upserted = 0;
    if (dbUp) {
      for (const p of properties) {
        try { await upsertProperty(p); upserted++; } catch (_) { /* skip */ }
      }
    }

    // Archive the Excel only after successful upserts (>= 80% to avoid losing data on partial fail).
    if (drop && source.startsWith('salboo_excel') && upserted >= properties.length * 0.8) {
      try { archived = salboo.archiveFile(drop.path); }
      catch (err) { alerts.push({ severity: 'low', message: `Could not archive ${drop.name}: ${err.message}` }); }
    }

    const alquiler = properties.filter((p) => p.operation === 'alquiler').length;
    const venta = properties.filter((p) => p.operation === 'venta').length;

    let status;
    if (source === 'mock') status = 'mock';
    else if (source.startsWith('salboo_excel')) status = 'ok';
    else if (source === 'tokko_api') status = 'ok';
    else status = 'warning';

    return {
      status,
      summary: `[${source}] ${properties.length} props (${alquiler} alq, ${venta} ven), ${upserted} upserted${archived ? ', archived' : ''}.`,
      metrics: [
        { label: 'Source', value: source },
        { label: 'Total', value: String(properties.length) },
        { label: 'Alquiler', value: String(alquiler) },
        { label: 'Venta', value: String(venta) },
        { label: 'Upserted', value: String(upserted) },
      ],
      alerts: source === 'mock'
        ? [...alerts, { severity: 'med', message: 'MOCK: drop xlsx into data/inbox/ or set TOKKO_API_KEY.' }]
        : alerts,
      raw: { source, file: drop && drop.name, archived, sample: properties.slice(0, 3) },
    };
  });
  res.json(out);
});

module.exports = router;
