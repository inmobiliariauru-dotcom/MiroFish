/* Agent 13 — Negative Keywords. Reads Google Ads search terms via Supermetrics.
 * Proposes negatives for non-converting irrelevant terms.
 */
const express = require('express');
const router = express.Router();

const { runAgent } = require('./_base');
const { isMock } = require('../../env');
const { recordDecision } = require('../../audit');

const AGENT_ID = '13';

const IRRELEVANT_PATTERNS = [
  /gratis/i, /trabajo/i, /empleo/i, /mapa/i, /imagen/i, /precio.*cuanto/i,
];

function mockSearchTerms() {
  return [
    { term: 'alquiler pocitos 2 dormitorios', clicks: 42, conversions: 3 },
    { term: 'apartamento centro venta', clicks: 28, conversions: 2 },
    { term: 'inmobiliaria piso opiniones', clicks: 14, conversions: 0 },
    { term: 'alquiler gratis pocitos', clicks: 9, conversions: 0 },
    { term: 'trabajo en inmobiliaria', clicks: 7, conversions: 0 },
    { term: 'mapa pocitos montevideo', clicks: 11, conversions: 0 },
    { term: 'casa carrasco alquiler', clicks: 18, conversions: 1 },
  ];
}

router.get('/search-terms', async (_req, res) => {
  const out = await runAgent(AGENT_ID, async () => {
    const mock = isMock('supermetrics');
    const terms = mock ? mockSearchTerms() : []; // real path: SM SEARCH_TERMS_REPORT

    if (!mock && terms.length === 0) {
      return {
        status: 'warning',
        summary: 'Supermetrics search terms report not yet wired.',
        metrics: [],
        alerts: [{ severity: 'med', message: 'Wire SM SEARCH_TERMS_REPORT.' }],
      };
    }

    const proposed = terms.filter((t) =>
      t.conversions === 0 && t.clicks >= 5 && IRRELEVANT_PATTERNS.some((re) => re.test(t.term))
    );

    for (const t of proposed) {
      await recordDecision(AGENT_ID, `add_negative_keyword: "${t.term}"`,
        `${t.clicks} clicks, ${t.conversions} conversions, matches irrelevant pattern.`);
    }

    return {
      status: mock ? 'mock' : 'ok',
      summary: `Reviewed ${terms.length} search terms; proposed ${proposed.length} negatives.`,
      metrics: [
        { label: 'Reviewed', value: String(terms.length) },
        { label: 'Proposed negatives', value: String(proposed.length) },
        { label: 'Total wasted clicks', value: String(proposed.reduce((a, t) => a + t.clicks, 0)) },
      ],
      alerts: proposed.length > 0
        ? [{ severity: 'med', message: `${proposed.length} negatives queued in audit.decisions (applied=false).` }]
        : [],
      raw: { proposed },
    };
  });
  res.json(out);
});

module.exports = router;
