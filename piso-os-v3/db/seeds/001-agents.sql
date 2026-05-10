-- PISO OS V3 — seed of the 14 agents.
-- Idempotent: ON CONFLICT (id) DO UPDATE refreshes name/layer/config but preserves runtime status.

INSERT INTO ops.agents (id, name, layer, status, config) VALUES
  ('01', 'Tokko Sync',                   'datos',        'idle', '{"cron":"*/30 * * * *","read_sources":["tokko"],"mock_mode":true}'::jsonb),
  ('02', 'Inventory Normalizer',         'datos',        'idle', '{"cron":"*/30 * * * *","read_sources":["ops.properties"],"mock_mode":true}'::jsonb),
  ('03', 'Tracking & Conversions',       'datos',        'idle', '{"cron":"0 * * * *","read_sources":["supermetrics:ga4","supermetrics:google_ads","supermetrics:meta"],"mock_mode":true}'::jsonb),
  ('04', 'Market Intelligence',          'datos',        'idle', '{"cron":"0 * * * *","read_sources":["supermetrics:ga4","supermetrics:gsc"],"mock_mode":true}'::jsonb),
  ('05', 'Pricing & Positioning',        'inteligencia', 'idle', '{"cron":"0 */6 * * *","read_sources":["tokko"],"mock_mode":true}'::jsonb),
  ('06', 'Expected Value',               'inteligencia', 'idle', '{"cron":"0 */6 * * *","read_sources":["tokko","supermetrics:google_ads"],"mock_mode":true}'::jsonb),
  ('07', 'Commercial Quality',           'inteligencia', 'idle', '{"cron":"0 */6 * * *","read_sources":["tokko"],"mock_mode":true}'::jsonb),
  ('08', 'Portfolio Allocation',         'estrategia',   'idle', '{"cron":"0 * * * *","read_sources":["supermetrics:google_ads","supermetrics:meta"],"mock_mode":true}'::jsonb),
  ('09', 'Search Strategy',              'estrategia',   'idle', '{"cron":"0 * * * *","read_sources":["supermetrics:google_ads","supermetrics:gsc"],"mock_mode":true}'::jsonb),
  ('10', 'Property Acquisition',         'estrategia',   'idle', '{"cron":"0 * * * *","read_sources":["supermetrics:google_ads"],"mock_mode":true}'::jsonb),
  ('11', 'Remarketing & Audiences',      'estrategia',   'idle', '{"cron":"0 * * * *","read_sources":["supermetrics:ga4","supermetrics:meta"],"mock_mode":true}'::jsonb),
  ('12', 'Campaign Builder (read-only)', 'ejecucion',    'idle', '{"cron":"0 * * * *","read_sources":["supermetrics:google_ads"],"mock_mode":true,"read_only":true}'::jsonb),
  ('13', 'Negative Keywords',            'ejecucion',    'idle', '{"cron":"0 * * * *","read_sources":["supermetrics:google_ads"],"mock_mode":true}'::jsonb),
  ('14', 'Bidding/Budget/Scaling',       'ejecucion',    'idle', '{"cron":"0 * * * *","read_sources":["supermetrics:google_ads","supermetrics:meta"],"mock_mode":true}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name   = EXCLUDED.name,
  layer  = EXCLUDED.layer,
  config = EXCLUDED.config;
