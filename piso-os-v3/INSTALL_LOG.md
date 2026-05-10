# PISO OS V3 — INSTALL_LOG

Registro de todo lo VERDE instalado/creado durante la sesión.
Formato: fecha | qué | versión | por qué | comando ejecutado

## 2026-05-10 — Gate 3 Bloque A: scaffold

| fecha | qué | versión | por qué | comando |
|---|---|---|---|---|
| 2026-05-10 | `piso-os-v3/` | n/a | subdir aislado dentro del repo MiroFish para PISO OS V3 | `mkdir -p piso-os-v3` |
| 2026-05-10 | `piso-os-v3/package.json` | 0.3.0 | manifiesto del proyecto, declara deps verdes y scripts npm | (write) |
| 2026-05-10 | `piso-os-v3/.env.example` | n/a | template con placeholders Ruta A | (write) |
| 2026-05-10 | `piso-os-v3/.gitignore` | n/a | excluye node_modules, .env, server/cache JSON, .pgdata | (write) |
| 2026-05-10 | `piso-os-v3/docker-compose.yml` | n/a | fallback Postgres 16 opcional | (write) |
| 2026-05-10 | `piso-os-v3/INSTALL_LOG.md` | n/a | este archivo | (write) |
| 2026-05-10 | `piso-os-v3/server/cache/.gitkeep` | n/a | preservar dir vacío en git (cache contents son ignorados) | (write) |
| 2026-05-10 | `piso-os-v3/server/routes/agents/.gitkeep` | n/a | placeholder para Bloques C y D | (write) |
| 2026-05-10 | `piso-os-v3/server/integrations/.gitkeep` | n/a | placeholder para Bloques C y D | (write) |
| 2026-05-10 | `piso-os-v3/db/migrations/.gitkeep` | n/a | placeholder para Bloque B | (write) |
| 2026-05-10 | `piso-os-v3/db/seeds/.gitkeep` | n/a | placeholder para Bloque B | (write) |
| 2026-05-10 | `piso-os-v3/bin/.gitkeep` | n/a | placeholder para `bin/migrate.js` y `bin/seed.js` (Bloque B) | (write) |

### npm dependencies (declared in package.json)
| paquete | versión | tipo | por qué |
|---|---|---|---|
| express | ^4.19.2 | dep | servidor HTTP del backend |
| cors | ^2.8.5 | dep | CORS estricto: solo file:// y localhost:* |
| pg | ^8.13.0 | dep | driver Postgres con pool |
| axios | ^1.7.7 | dep | cliente HTTP para Tokko y Supermetrics |
| dotenv | ^16.4.5 | dep | carga `.env` |
| node-cache | ^5.1.2 | dep | caché en memoria con TTL |
| node-cron | ^3.0.3 | dep | scheduler de jobs |
| node-pg-migrate | ^7.6.1 | devDep | migraciones reversibles |
| nodemon | ^3.1.4 | devDep | autoreload en `npm run dev` |

### Bloque A — npm install (resultado)
| comando | resultado |
|---|---|
| `cd piso-os-v3 && npm install --no-audit --no-fund` | OK — 159 packages added, 7s |
| `package-lock.json` | creado, ~70 KB |

Versiones resueltas:
- axios 1.16.0
- cors 2.8.6
- dotenv 16.6.1
- express 4.22.1
- node-cache 5.1.2
- node-cron 3.0.3
- pg 8.20.0
- node-pg-migrate 7.9.1
- nodemon 3.1.14

Warnings npm: 2 deprecation notices (uuid@8 transitive de node-pg-migrate, glob@11 transitive). No crítico — son transitivas; cuando node-pg-migrate publique nueva versión se actualizan. No bloquea.

---

## 2026-05-10 — Gate 3 Bloque B: DB

### Postgres temporal en sandbox (Y1 aprobado)
| qué | comando | resultado |
|---|---|---|
| dockerd levantado en background (sin systemd) | `dockerd > /tmp/dockerd.log 2>&1 &` | OK, socket `/var/run/docker.sock` |
| Pull `postgres:16` | `docker compose -f piso-os-v3/docker-compose.yml --project-directory piso-os-v3 up -d` | OK |
| Healthcheck | `docker exec piso_os_postgres pg_isready -U piso_app -d piso_os` | accepting |
| Versión | `SELECT version();` | PostgreSQL 16.13 (Debian) |

### Archivos creados
| archivo | rol |
|---|---|
| `bin/migrate.js` | wrapper de `node-pg-migrate` con dotenv y `reset` mode |
| `bin/seed.js` | corre todos los `db/seeds/*.sql` en orden |
| `server/db.js` | `pg.Pool` size 10, `query()`, `tx()`, `ping()`, `shutdown()` |
| `db/migrations/1700000000000_init-schemas.js` | crea schemas `ops`, `audit`, `ml` |
| `db/migrations/1700000000001_ops-properties.js` | tabla + 4 índices (incl. GIN sobre raw) |
| `db/migrations/1700000000002_ops-agents.js` | tabla |
| `db/migrations/1700000000003_ops-campaigns.js` | tabla + índice por platform |
| `db/migrations/1700000000004_ops-leads.js` | tabla + 4 índices, FK a campaigns y properties |
| `db/migrations/1700000000005_ops-snapshots-daily.js` | tabla + PK compuesta jsonb + índice (source,date) |
| `db/migrations/1700000000006_audit-agent-runs.js` | tabla + 2 índices |
| `db/migrations/1700000000007_audit-decisions.js` | tabla + índice (agent_id,applied,created_at) |
| `db/migrations/1700000000008_audit-api-calls.js` | tabla + índice (integration,called_at) |
| `db/migrations/1700000000009_ml-expected-value.js` | tabla con FK + índice |
| `db/migrations/1700000000010_ml-pricing-score.js` | tabla con FK + 2 índices |
| `db/migrations/1700000000011_ml-quality-score.js` | tabla con FK + 2 índices, blockers TEXT[] |
| `db/seeds/001-agents.sql` | INSERT idempotente de los 14 agentes |

### Validación end-to-end
| paso | comando | resultado |
|---|---|---|
| up all | `npm run db:migrate` | 12 migraciones aplicadas |
| seed | `npm run db:seed` | 1 archivo, 14 filas en `ops.agents` |
| down all + up all + seed | `npm run db:reset` | OK, 14 agentes finales |
| schemas presentes | `pg_class` | `ops`, `audit`, `ml`, plus `pgmigrations` en `public` |
| 11 tablas creadas | `pg_class` | properties, agents, campaigns, leads, snapshots_daily, agent_runs, decisions, api_calls, expected_value, pricing_score, quality_score |
| 30 índices creados | `pg_indexes` | incluye GIN sobre `properties.raw`, PKs compuestas, FK indexes |
| `node --check` en todos los JS | bash loop | 15/15 OK |

## 2026-05-10 — Gate 3 Bloque C: Tokko (agentes 01, 02, 05, 07)

### Archivos creados
| archivo | rol |
|---|---|
| `server/env.js` | carga `.env`, valida vars al boot, expone `isMock(integration)` |
| `server/audit.js` | `logApiCall`, `startAgentRun`, `finishAgentRun`, `recordDecision`, `bumpAgentStatus` (best-effort, nunca crashea callers) |
| `server/integrations/tokko.js` | cliente axios con audit, `listProperties`, `getProperty`, `asArray` |
| `server/index.js` | Express bootstrap, CORS estricto (`file://` + `localhost:*`), rutas `/api/health`, `/api/agents`, agentes 01/02/05/07 montados, stubs 03/04/06/08-14 |
| `server/routes/agents/_base.js` | `runAgent(id, handler)` — aplica shape estandarizado + audit lifecycle |
| `server/routes/agents/01-tokko-sync.js` | lee Tokko (o mock 128 props) → upsert `ops.properties` |
| `server/routes/agents/02-inventory-normalizer.js` | lee `ops.properties` → reporta issues por columna |
| `server/routes/agents/05-pricing.js` | media por (operation, neighborhood, rooms, currency) → `ml.pricing_score` |
| `server/routes/agents/07-quality.js` | photos + word_count → `ml.quality_score` con blockers TEXT[] |

### Validación end-to-end (sandbox, mock mode)
| endpoint | resultado | persistencia |
|---|---|---|
| `GET /api/health` | `{ok:true, db:up, mocks:[tokko,supermetrics], port:8787}` | n/a |
| `GET /api/agents` | 14 agentes con `last_run` JOIN | lee de `ops.agents` + `audit.agent_runs` |
| `GET /api/agent/01/inventory` | mock, 128 props (109 alq + 19 ven), 128 upsert | `ops.properties`: 128 |
| `GET /api/agent/02/normalized` | ok, 128 reviewed, 0 issues, 118 active | n/a (read-only) |
| `GET /api/agent/05/pricing` | ok, 99/118 scored (19 sin cohorte): 7 under, 87 fair, 5 over | `ml.pricing_score`: 99 |
| `GET /api/agent/07/quality` | ok, 118 scored, avg 0.42, 75 < 0.5 | `ml.quality_score`: 118 |
| stubs 03/04/06/08-14 | shape mock con alerta "Bloque D pendiente" | n/a |

### Audit ledger (`audit.agent_runs`)
4 rows tras una corrida (01 → 02 → 05 → 07): start/finish/status/summary completos. `ops.agents.last_run_at` se actualiza.

### Reglas duras verificadas
- Mock mode encendido por falta de `TOKKO_API_KEY` / `SUPERMETRICS_*` (no hay HTTP externo, `audit.api_calls` queda en 0). ✅
- `ml.pricing_score` y `ml.quality_score` solo se escriben con `applied=false`-equivalente: son scoring derivado, no acción. ✅
- Cero llamadas mutativas a Tokko, Google Ads o Meta. ✅
- `node --check` en 9 archivos JS nuevos → 9/9 OK. ✅
- Server bootea, sirve, y se detiene limpio (SIGTERM cierra pool). ✅

## 2026-05-10 — Gate 3 Bloque D: Supermetrics (10 agentes restantes)

### Archivos creados
| archivo | rol |
|---|---|
| `server/integrations/supermetrics.js` | cliente Ruta A (`enterprise/v2/query`), audit-logged, helpers `rows`, `lastNDays` |
| `server/routes/agents/03-tracking.js` | GA4 + GAds + Meta → `ops.snapshots_daily` (4 metrics × 3 sources × 7 días = 84 filas en mock) |
| `server/routes/agents/04-market.js` | GA4 + GSC (queries) → `ops.snapshots_daily` |
| `server/routes/agents/06-expected-value.js` | combina `ops.properties` + CPL de `ops.snapshots_daily` → `ml.expected_value` |
| `server/routes/agents/08-portfolio.js` | spend GAds vs Meta del 7d → `audit.decisions` (target 60/40) |
| `server/routes/agents/09-search.js` | top GSC queries → propuesta `expand_search_terms` en `audit.decisions` |
| `server/routes/agents/10-acquisition.js` | inventario venta + CPL → propuesta scaling captación |
| `server/routes/agents/11-remarketing.js` | GA4 sessions + Meta conv → propuesta de remarketing pool |
| `server/routes/agents/12-campaigns.js` | snapshot READ-ONLY de campaigns GAds → `ops.campaigns` |
| `server/routes/agents/13-search-terms.js` | regex de irrelevancia + cero conversiones → propuesta de negativos |
| `server/routes/agents/14-bidding.js` | spend/CPL por source vs target → propuesta de bid moves (applied=false) |
| `server/index.js` (modificado) | reemplazó stubs por las 10 rutas reales |

### Validación end-to-end (sandbox, mock mode, secuencia 01→03→04→02→05→06→07→08→09→10→11→12→13→14)
| agent | status | summary breve |
|---|---|---|
| 01 | mock | 128 props (109+19), 128 upsert |
| 03 | mock | 84 snapshots GA4+GAds+Meta 7d, CPL 10.78 |
| 04 | mock | GSC CTR 4.01% 7d |
| 02 | ok | 128 reviewed, 0 issues |
| 05 | ok | 99/118 scored (7 under, 87 fair, 5 over) |
| 06 | mock | 118 EV scored, CPL=10.68 |
| 07 | ok | 118 quality, avg 0.42 |
| 08 | mock | `increase_google_ads` (GAds 48.1% vs target 60%) |
| 09 | mock | `expand_search_terms` |
| 10 | mock | `hold_acquisition` (19 venta, CPL 10.68) |
| 11 | mock | `enable_remarketing_pool_high_intent` (656 sessions) |
| 12 | mock | 5 GAds campaigns snapshotted |
| 13 | mock | 7 terms reviewed, 3 negativos propuestos |
| 14 | mock | 2 bid moves propuestos |

### Estado de la DB tras la corrida
| tabla | filas |
|---|---|
| ops.properties | 128 |
| ops.snapshots_daily | 133 |
| ops.campaigns | 5 |
| ml.expected_value | 118 |
| ml.pricing_score | 297 (3 runs acumuladas) |
| ml.quality_score | 354 (3 runs acumuladas) |
| audit.agent_runs | 22 (todos los runs lifecycle-tracked) |
| audit.decisions | 9 (todas con `applied=false`) |
| audit.api_calls | 0 (correcto: mock mode = sin HTTP externo) |

### Reglas duras verificadas
- ✅ READ-ONLY total: ningún agente muta Tokko, Google Ads o Meta
- ✅ Agente 14 (Bidding) escribe propuestas, nunca aplica
- ✅ Agente 12 (Campaigns) explícitamente READ-ONLY: solo lee y snapshot
- ✅ `audit.decisions.applied = false` en las 9 filas
- ✅ `node --check` en 12 archivos JS nuevos → 12/12 OK
- ✅ Server boot OK con 10 rutas montadas (sin stubs)

## 2026-05-10 — Gate 3 Bloque E: scheduler + cache + console SSE

### Archivos creados
| archivo | rol |
|---|---|
| `server/cache.js` | wrapper de `node-cache` (memoria) + persistencia opcional a `server/cache/<key>.json` con TTL |
| `server/scheduler.js` | 14 cron jobs registrados con `node-cron`, llaman `localhost:8787/api/agent/...` para reusar pipeline + audit. Desactivable con `SCHEDULER=off` |
| `server/routes/console.js` | `/api/console/recent` (snapshot último 50 de runs/calls/decisions), `/api/console/jobs` (lista cron), `/api/console/stream` (SSE con backfill + tick 5s) |
| `server/index.js` (modificado) | monta `/api/console`, arranca scheduler tras `app.listen`, lo detiene en SIGTERM/SIGINT |

### Schedule registrado
| cron | path | rationale |
|---|---|---|
| `*/30 * * * *` | 01/inventory | Tokko cada 30 min |
| `5,35 * * * *` | 02/normalized | tras sync |
| `5 * * * *` | 03/tracking | SM hourly, escalonado |
| `10 * * * *` | 04/market | SM hourly, escalonado |
| `15 * * * *` | 12/campaigns | SM hourly, escalonado |
| `20 */6 * * *` | 05/pricing | scoring 6h |
| `25 */6 * * *` | 06/expected-value | scoring 6h |
| `30 */6 * * *` | 07/quality | scoring 6h |
| `40-45 * * * *` | 08, 09, 10, 11, 13, 14 | estratégicos hourly |

### Validación end-to-end
| paso | resultado |
|---|---|
| `node --check` × 4 archivos nuevos/modificados | 4/4 OK |
| Boot log: `[scheduler] 14 cron job(s) registered` | ✅ |
| `GET /api/console/jobs` | devuelve 14 (expr, path) |
| `GET /api/console/recent` | `{runs:22, calls:0, decisions:9}` |
| `GET /api/console/stream` (curl SSE 6s) | recibe backfill `event: agent_run` con data JSON + keepalives | 
| `cache.js` round-trip (set/get + setPersisted/getPersisted) | OK; archivo JSON creado y leído |
| Server stop limpio (SIGTERM) | `scheduler.stop()` + `server.close()` + `db.shutdown()` |

## 2026-05-10 — Gate 3 Bloque F: frontend HTML

### Archivos creados / modificados
| archivo | rol |
|---|---|
| `PISO_OS_V3_connect.html` | nuevo: 359 líneas, vanilla JS + Tailwind CDN, 14 paneles + consola SSE |
| `server/index.js` (modificado) | agrega `GET /api/config` que expone Pixel/GTM/GA4 IDs sin tocar `.env` desde el cliente |

### Estructura del HTML
| Sección | Contenido |
|---|---|
| Header | logo + branding + chips `health` y `mocks` (live) + botón "Run all" |
| Stats strip | 4 cards: Properties / Snapshots(7d) / Decisions queued / Agent runs |
| Capa Datos        | 4 paneles (01, 02, 03, 04) |
| Capa Inteligencia | 3 paneles (05, 06, 07) |
| Capa Estrategia   | 4 paneles (08, 09, 10, 11) |
| Capa Ejecución    | 3 paneles (12, 13, 14), badge READ-ONLY |
| Live console      | sticky aside con `EventSource(/api/console/stream)`, dedup, max 200 líneas |
| Footer            | disclaimer READ-ONLY |

### Inyección dinámica de tags (resuelve bug #1)
- HTML **no** tiene `fbq` ni GTM hardcoded. La constante `META_PIXEL_ID_PRIMARY` viene de `.env` → backend `/api/config` → JS la inyecta.
- `injectMetaPixel(id)` es **idempotente**: usa `window.__pixelInjected` para impedir doble inicialización aunque el script corra dos veces.
- `injectGTM(container)` mismo patrón con `window.__gtmInjected`.
- Resultado: **exactamente 1 Pixel y 1 GTM container** firing por tab, garantizado por construcción.

### Validación
| paso | resultado |
|---|---|
| `node --check` sobre el bloque inline `<script>` | 1 bloque, OK |
| Conteo de `fbq(` literal en HTML | 1 (en template string de injectMetaPixel) |
| Conteo de `facebook.net/en_US/fbevents.js` | 1 (mismo template) |
| Conteo de `googletagmanager` | 2 (gtm.js + ns.html iframe, mismo template) |
| Búsqueda de `api_key|secret|token|password` literal | 0 (solo aparece como comentario "No secrets in this file") |
| Boot backend con `META_PIXEL_ID_PRIMARY=000000000000000` | `/api/config` devuelve el ID correctamente |

### Limitación de validación en sandbox
- No tengo navegador en la sandbox para validar el render visual; eso queda del lado del usuario en su Mac. La JS está syntáctica- y semánticamente correcta y todos los endpoints que consume responden con el shape esperado (verificado en bloques C/D/E).

## 2026-05-10 — Gate 3 Bloque G: handoff

### Archivos creados
| archivo | rol |
|---|---|
| `README_RUN.md` | guía completa de setup + verificación + troubleshooting + arquitectura |
| `FIX_LOG.md` | bugs resueltos (3 Pixels, GTM dup, secrets en frontend), constraints compliance, decisiones diferidas, checklist humano |
| `INSTALL_LOG.md` (cierre) | este bloque |

### Cierre del scaffold
- Branch: `claude/setup-piso-os-v3-5Z6nv`
- PR: #1 (draft — el usuario lo abre cuando valide en su Mac)
- Subdir: `piso-os-v3/` (cero archivos modificados fuera de él)
- Total commits: 7 (uno por bloque + el inicial de scaffold)
- npm deps: 159 paquetes, 9 directos (7 deps + 2 devDeps)
- Migraciones DB: 12 (idempotentes, reversibles)
- Endpoints: 17 (`/api/health`, `/api/config`, `/api/agents`, 14 agentes, 3 console)
- Cron jobs: 14
- Líneas totales `piso-os-v3/**` (sin node_modules ni package-lock):
  - JS server: ~1,000
  - HTML frontend: 359
  - SQL migrations: ~250
  - Docs: ~750

### Validación end-to-end (sandbox, mock mode, todo el sistema)
- ✅ Postgres 16 corre (Docker temporal, port 5432)
- ✅ Las 12 migraciones se aplican sin error
- ✅ Seed inserta los 14 agentes
- ✅ Backend bootea, scheduler registra 14 jobs, mocks detectados (tokko, supermetrics)
- ✅ `/api/health` → `db: up`
- ✅ Los 14 agentes responden con shape estandarizado
- ✅ Persistencia en `ops.properties` (128), `ops.snapshots_daily` (133), `ops.campaigns` (5), `ml.expected_value` (118), `ml.pricing_score` (297), `ml.quality_score` (354)
- ✅ `audit.agent_runs` (22), `audit.decisions` (9, todas con `applied=false`), `audit.api_calls` (0 en mock)
- ✅ SSE `/api/console/stream` emite eventos backfill + tick + keepalive
- ✅ HTML pasa `node --check`, sin secrets, 1 sólo Pixel inyectable, 1 sólo GTM inyectable

### Lo que no validé en sandbox (queda del lado del usuario)
- Render visual del HTML en browser (no hay browser en sandbox)
- Llamadas reales a Tokko / Supermetrics (sin credenciales)
- Migraciones contra el Postgres del usuario (corren contra el temporal)
- Cron schedules en producción (corrieron solo durante el smoke test del scheduler)
