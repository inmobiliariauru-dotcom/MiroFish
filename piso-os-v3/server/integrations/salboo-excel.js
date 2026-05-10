/* PISO OS V3 — Salboo (Tokko) Excel ingestion.
 *
 * Drop a daily inventory export into SALBOO_INBOX_DIR (default: data/inbox/).
 * Agent 01 picks the most recent .xlsx, parses it, and upserts into ops.properties.
 * After successful ingest the file is moved to data/processed/<timestamp>/<name>.
 *
 * Two formats are auto-detected:
 *   1. meta_catalog — Salboo's actual export, identical to the Facebook /
 *      Meta Commerce Manager Real Estate catalog feed. Header includes
 *      home_listing_id, name, description, availability, condition, price,
 *      url, address.street_address, address.city, address.region,
 *      address.country, image[N].url, image[N].tag[0], num_baths, num_beds.
 *      Field mapping:
 *        id           ← home_listing_id
 *        operation    ← availability ('for_rent' → 'alquiler',
 *                                     'for_sale' → 'venta')
 *        type         ← derived from name when available
 *        neighborhood ← address.region
 *        rooms        ← num_beds
 *        price_uyu/   ← price column "29000 UYU" / "2200 USD" parsed
 *          price_usd
 *        status       ← 'activa' if availability is for_rent | for_sale
 *        photos       ← image[0..N].url collected (non-empty)
 *        description  ← description (kept verbatim in raw JSONB)
 *
 *   2. standard — flexible header-synonym table for ad-hoc exports
 *      (fallback for any other Excel that follows ID/Operación/Tipo/...).
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const DEFAULT_INBOX = process.env.SALBOO_INBOX_DIR || 'data/inbox';
const DEFAULT_PROCESSED = process.env.SALBOO_PROCESSED_DIR || 'data/processed';

const HEADER_SYNONYMS = {
  id:           ['id', 'codigo', 'ref', 'referencia'],
  operation:    ['operacion', 'op', 'tipo_operacion', 'operation'],
  type:         ['tipo', 'tipo_propiedad', 'type'],
  neighborhood: ['barrio', 'ubicacion', 'zona', 'neighborhood', 'localidad'],
  rooms:        ['habitaciones', 'dormitorios', 'ambientes', 'rooms', 'cuartos'],
  price_uyu:    ['precio_uyu', 'valor_uyu', 'alquiler_uyu', 'precio_alquiler', 'precio_alquiler_uyu'],
  price_usd:    ['precio_usd', 'valor_usd', 'venta_usd', 'precio_venta', 'precio_venta_usd'],
  status:       ['estado', 'status', 'situacion'],
  published_at: ['f_publicacion', 'fecha_publicacion', 'fecha', 'published_at'],
  photos:       ['fotos', 'fotos_url', 'imagenes', 'photos', 'imagenes_url'],
};

function normalizeHeader(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Returns 'meta_catalog' | 'standard' | 'unknown' based on header set. */
function detectFormat(headerValues) {
  const norms = (headerValues || []).map((v) => normalizeHeader(v));
  if (norms.includes('home_listing_id') && norms.includes('availability')) return 'meta_catalog';
  if (norms.includes('id') || norms.includes('codigo') || norms.includes('referencia')) return 'standard';
  return 'unknown';
}

function buildStandardHeaderMap(headerRow) {
  const map = {};
  headerRow.forEach((cell, idx) => {
    const norm = normalizeHeader(cell);
    if (!norm) return;
    for (const [canonical, syns] of Object.entries(HEADER_SYNONYMS)) {
      if (syns.includes(norm)) { map[canonical] = idx; break; }
    }
  });
  return map;
}

function buildMetaCatalogHeaderMap(headerRow) {
  const map = { images: [] };
  headerRow.forEach((cell, idx) => {
    const raw = String(cell || '');
    const norm = normalizeHeader(cell);
    if (norm === 'home_listing_id') map.id = idx;
    else if (norm === 'availability') map.availability = idx;
    else if (norm === 'name') map.name = idx;
    else if (norm === 'description') map.description = idx;
    else if (norm === 'price') map.price = idx;
    else if (norm === 'url') map.url = idx;
    else if (norm === 'num_beds') map.num_beds = idx;
    else if (norm === 'num_baths') map.num_baths = idx;
    else if (norm === 'address_region') map.region = idx;
    else if (norm === 'address_city') map.city = idx;
    else if (/^image_\d+_url$/.test(norm) || /^image\[\d+\]\.url$/.test(raw)) {
      map.images.push(idx);
    }
  });
  return map;
}

function coerceNumber(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function coerceString(v) {
  if (v == null) return null;
  // ExcelJS sometimes returns hyperlink objects { text, hyperlink }
  if (typeof v === 'object' && v.text) return String(v.text).trim() || null;
  if (typeof v === 'object' && v.richText) return v.richText.map((p) => p.text).join('').trim() || null;
  return String(v).trim() || null;
}

function coercePhotos(v) {
  if (v == null || v === '') return [];
  if (Array.isArray(v)) return v.map((x) => coerceString(x)).filter(Boolean);
  return String(v).split(/[|,;\n]+/).map((s) => s.trim()).filter(Boolean);
}

function parsePriceMixed(s) {
  // "29000 UYU" → { amount: 29000, currency: 'UYU' }
  // "2,200 USD" → { amount: 2200, currency: 'USD' }
  if (s == null || s === '') return { amount: null, currency: null };
  const text = coerceString(s) || '';
  const m = text.replace(/,/g, '').match(/([0-9]+(?:\.[0-9]+)?)\s*([A-Z]{3})/i);
  if (!m) return { amount: coerceNumber(text), currency: null };
  return { amount: parseFloat(m[1]), currency: m[2].toUpperCase() };
}

function operationFromAvailability(av) {
  const v = (coerceString(av) || '').toLowerCase();
  if (v.startsWith('for_rent') || v === 'rent' || v === 'available_for_rent') return 'alquiler';
  if (v.startsWith('for_sale') || v === 'sale' || v === 'available_for_sale') return 'venta';
  return null;
}

function typeFromName(name) {
  const n = (coerceString(name) || '').toLowerCase();
  if (n.includes('apartamento') || n.includes('apto')) return 'Apartamento';
  if (n.includes('casa')) return 'Casa';
  if (n.includes('local')) return 'Local';
  if (n.includes('terreno')) return 'Terreno';
  if (n.includes('oficina')) return 'Oficina';
  if (n.includes('garaje') || n.includes('cochera')) return 'Garaje';
  return null;
}

/** Extracts property type from the free-text description block (Salboo).
 *  Patterns observed:
 *    "Tipología : Apartamento"
 *    "Tipologia : Apartamento"
 *    "MONOAMBIENTE AMOBLADO" (treated as Apartamento)
 *    word match "Apartamento" / "Casa" / etc. anywhere
 */
function typeFromDescription(desc) {
  const text = coerceString(desc);
  if (!text) return null;
  const explicit = text.match(/Tipolog[ií]a\s*:?\s*([A-Za-zÁÉÍÓÚáéíóúñÑ]+)/i);
  if (explicit) {
    const t = explicit[1].toLowerCase();
    if (t.startsWith('apart')) return 'Apartamento';
    if (t.startsWith('casa')) return 'Casa';
    if (t.startsWith('local')) return 'Local';
    if (t.startsWith('terreno')) return 'Terreno';
    if (t.startsWith('oficina')) return 'Oficina';
    if (t.startsWith('garaje') || t.startsWith('cochera')) return 'Garaje';
    if (t.startsWith('mono')) return 'Apartamento';
  }
  const lower = text.toLowerCase();
  if (lower.includes('monoambiente')) return 'Apartamento';
  if (/\bapartamento\b/.test(lower) || /\bapto\b/.test(lower)) return 'Apartamento';
  if (/\bcasa\b/.test(lower)) return 'Casa';
  if (/\blocal\s+comercial\b/.test(lower) || /\blocal\b/.test(lower)) return 'Local';
  if (/\bterreno\b/.test(lower)) return 'Terreno';
  if (/\boficina\b/.test(lower)) return 'Oficina';
  if (/\bgaraje\b/.test(lower) || /\bcochera\b/.test(lower)) return 'Garaje';
  return null;
}

function latestFile(dir = DEFAULT_INBOX) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter((f) => /\.xlsx?$/i.test(f))
    .map((f) => ({ name: f, path: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0] || null;
}

async function parseFile(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error(`No worksheet in ${filePath}`);

  const properties = [];
  let headerRow = null;
  let format = 'unknown';
  let standardMap, metaMap;

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values = row.values;
    if (rowNumber === 1) {
      headerRow = values.slice(1); // ExcelJS values[0] is undefined
      format = detectFormat(headerRow);
      standardMap = format === 'standard' ? buildStandardHeaderMap(values) : null;
      metaMap = format === 'meta_catalog' ? buildMetaCatalogHeaderMap(values) : null;
      return;
    }

    if (format === 'meta_catalog') {
      const id = coerceString(values[metaMap.id]);
      if (!id) return;
      const price = parsePriceMixed(values[metaMap.price]);
      const photos = (metaMap.images || [])
        .map((idx) => coerceString(values[idx]))
        .filter(Boolean);
      const description = coerceString(values[metaMap.description]) || '';
      properties.push({
        id,
        operation: operationFromAvailability(values[metaMap.availability]),
        type: typeFromName(values[metaMap.name]) || typeFromDescription(description),
        neighborhood: coerceString(values[metaMap.region]) || coerceString(values[metaMap.city]),
        rooms: coerceNumber(values[metaMap.num_beds]),
        bathrooms: coerceNumber(values[metaMap.num_baths]),
        price_uyu: price.currency === 'UYU' ? price.amount : null,
        price_usd: price.currency === 'USD' ? price.amount : null,
        status: 'activa',
        photos,
        description,
        url: coerceString(values[metaMap.url]),
        name: coerceString(values[metaMap.name]),
      });
      return;
    }

    if (format === 'standard') {
      const get = (col) => (standardMap[col] != null ? values[standardMap[col]] : null);
      const id = coerceString(get('id'));
      if (!id) return;
      properties.push({
        id,
        operation:    coerceString(get('operation'))?.toLowerCase() || null,
        type:         coerceString(get('type')),
        neighborhood: coerceString(get('neighborhood')),
        rooms:        coerceNumber(get('rooms')),
        price_uyu:    coerceNumber(get('price_uyu')),
        price_usd:    coerceNumber(get('price_usd')),
        status:       coerceString(get('status'))?.toLowerCase() || 'activa',
        photos:       coercePhotos(get('photos')),
        description:  '',
        _published_at: coerceString(get('published_at')),
      });
    }
  });

  return {
    file: filePath,
    format,
    headerRow: headerRow || [],
    properties,
  };
}

function archiveFile(filePath, processedDir = DEFAULT_PROCESSED) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const targetDir = path.join(processedDir, stamp);
  fs.mkdirSync(targetDir, { recursive: true });
  const target = path.join(targetDir, path.basename(filePath));
  fs.renameSync(filePath, target);
  return target;
}

module.exports = { latestFile, parseFile, archiveFile, detectFormat, DEFAULT_INBOX, DEFAULT_PROCESSED };
