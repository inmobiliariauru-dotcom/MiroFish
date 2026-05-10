/* Agent 07 — Commercial Quality. Photos + copy completeness on Tokko fichas. */
const express = require('express');
const router = express.Router();

const { runAgent } = require('./_base');
const { query, tx } = require('../../db');

const AGENT_ID = '07';
const PHOTOS_TARGET = 8;
const COPY_TARGET_WORDS = 100;

function wordCount(s) {
  if (!s || typeof s !== 'string') return 0;
  return s.trim().split(/\s+/).filter(Boolean).length;
}

router.get('/quality', async (_req, res) => {
  const out = await runAgent(AGENT_ID, async ({ dbUp }) => {
    if (!dbUp) {
      return { status: 'warning', summary: 'DB unreachable.', metrics: [], alerts: [{ severity: 'high', message: 'DB unreachable' }] };
    }

    const r = await query(`
      SELECT id_tokko,
             coalesce(jsonb_array_length(raw->'photos'), 0)        AS n_photos,
             coalesce(raw->>'description', '')                     AS description
      FROM ops.properties
      WHERE status = 'activa'
    `);

    if (r.rows.length === 0) {
      return {
        status: 'mock',
        summary: 'No active properties — run agent 01 first.',
        metrics: [],
        alerts: [{ severity: 'med', message: 'ops.properties has no active rows.' }],
      };
    }

    const scored = r.rows.map((row) => {
      const nPhotos = Number(row.n_photos) || 0;
      const wc = wordCount(row.description);
      const photosScore = Math.min(1, nPhotos / PHOTOS_TARGET);
      const copyScore = Math.min(1, wc / COPY_TARGET_WORDS);
      const total = (photosScore + copyScore) / 2;
      const blockers = [];
      if (nPhotos === 0) blockers.push('no_photos');
      else if (photosScore < 0.5) blockers.push('few_photos');
      if (wc === 0) blockers.push('no_copy');
      else if (copyScore < 0.5) blockers.push('short_copy');
      return { id: row.id_tokko, photosScore, copyScore, total, blockers };
    });

    await tx(async (client) => {
      for (const s of scored) {
        await client.query(
          `INSERT INTO ml.quality_score (property_id, photos_score, copy_score, total, blockers, computed_at)
           VALUES ($1, $2, $3, $4, $5, now())
           ON CONFLICT (property_id, computed_at) DO NOTHING`,
          [s.id, s.photosScore, s.copyScore, s.total, s.blockers]
        );
      }
    });

    const lowQuality = scored.filter((s) => s.total < 0.5).length;
    const noPhotos = scored.filter((s) => s.blockers.includes('no_photos')).length;
    const avgTotal = scored.reduce((a, s) => a + s.total, 0) / scored.length;

    return {
      status: 'ok',
      summary: `Quality scored on ${scored.length} active properties; avg ${avgTotal.toFixed(2)}, ${lowQuality} below 0.5.`,
      metrics: [
        { label: 'Scored', value: String(scored.length) },
        { label: 'Avg total', value: avgTotal.toFixed(2) },
        { label: 'Below 0.5', value: String(lowQuality) },
        { label: 'No photos', value: String(noPhotos) },
      ],
      alerts: noPhotos > 0
        ? [{ severity: 'high', message: `${noPhotos} active properties have ZERO photos.` }]
        : (lowQuality > scored.length / 3 ? [{ severity: 'med', message: `${lowQuality} listings below 0.5 quality.` }] : []),
      raw: { sample: scored.slice(0, 5) },
    };
  });
  res.json(out);
});

module.exports = router;
