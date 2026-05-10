# PISO_OS V3 — FIX_PLAN.md

**Branch**: `claude/setup-piso-os-v3-5Z6nv`
**Subdir**: `piso-os-v3/` dentro del repo `inmobiliariauru-dotcom/mirofish`
**Modo**: scaffold from scratch (sin HTML fuente)
**Ruta de integración**: A — Supermetrics API enterprise (`/enterprise/v2/query`)
**Postgres**: corre en la Mac del usuario; el sandbox no tiene listener en :5432
**Stack**: Node 20+ Express + Postgres 16 + vanilla JS + Tailwind CDN

---

## 1. Bugs ordenados por impacto

| # | Severidad | Bug | Resolución |
|---|---|---|---|
| 1 | CRÍT (entorno) | Sandbox Linux no puede correr migraciones contra Postgres del usuario en macOS | Migraciones se validan localmente por el usuario (`npm run db:migrate`). Sandbox solo escribe SQL. Ver §11. |
| 2 | CRÍT (spec) | 3 Meta Pixels disparando en pisoinmobiliario.com | Por construcción: el HTML nuevo nace con **1 sólo Pixel**. ID viene de `META_PIXEL_ID_PRIMARY`. Bug muere antes de existir. |
| 3 | MAY | Cero secrets permitidos en frontend | HTML lee solo de `localhost:8787/api/*`. `.env.example` con placeholders. Backend valida env al arrancar. |
| 4 | MAY | Tokko = single source of truth de inventario | DB local es **caché + ledger + scoring**. Agente 01 escribe a `ops.properties`; nada borra Tokko. Agentes 05/06/07 escriben a `ml.*`, no a `ops.properties`. |
| 5 | MAY | Meta READ-ONLY siempre / Google Ads READ-ONLY en esta sesión | Cero llamadas mutativas a Ads APIs. Agente 12 (Campaign Builder) explícitamente READ-ONLY: lee de Supermetrics, escribe a `ops.campaigns` (snapshot), no toca Google Ads. Agente 14 (Bidding) escribe **propuestas** en `audit.decisions` con `applied=false`. |
| 6 | MEN | GTM-TN8SRRR8 una sola vez (head + noscript) | Estructura del HTML lo respeta from scratch. |
| 7 | MEN | CORS solo file:// y localhost:* | `cors({ origin: (o, cb) => /^(file:\\/\\/|http:\\/\\/localhost(:\\d+)?)/.test(o || '') ? cb(null, true) : cb(null, false) })`. |
| 8 | MEN | Conflicto potencial con MiroFish (3000/5001/5432) | PISO_OS usa **8787**. Postgres compartido en 5432 — sin conflicto si el usuario no levanta el Postgres de algún `docker-compose.yml` paralelo. |

---

## 2. Archivos a crear (todos dentro de `piso-os-v3/`)

### Raíz del subdir
- `PISO_OS_V3_connect.html` — frontend, 14 paneles + consola en vivo + 1 Meta Pixel + 1 GTM
- `package.json` — Node 20+, scripts `dev`, `start`, `db:migrate`, `db:seed`, `db:reset`
- `.env.example` — placeholders Ruta A
- `.gitignore` — `node_modules/`, `.env`, `server/cache/*.json`, `*.log`, `.DS_Store`
- `docker-compose.yml` — opcional, fallback Postgres 16 en `:5432` solo si el usuario lo invoca
- `INSTALL_LOG.md` — registro verde
- `FIX_LOG.md` — registro de bugs resueltos (se llena en Gate 3)
- `README_RUN.md` — cómo correr el sistema

### `piso-os-v3/server/`
- `index.js` — bootstrap Express, monta routes, valida env, arranca scheduler
- `env.js` — `loadEnv()`, `assertOrMock(varName)`, lista de vars + flags `MOCK_<source>`
- `db.js` — `pg.Pool({ max: 10 })`, helpers `query()`, `tx()`
- `audit.js` — helpers: `logApiCall()`, `startAgentRun()`, `finishAgentRun()`, `recordDecision()`
- `cache.js` — wrapper de `node-cache` con persistencia opcional a `server/cache/*.json`
- `scheduler.js` — `node-cron`: Tokko 30min, Supermetrics 60min, scores 6h
- `routes/console.js` — SSE/polling de últimos `audit.agent_runs` y `audit.api_calls`
- `routes/agents/01-tokko-sync.js`
- `routes/agents/02-inventory-normalizer.js`
- `routes/agents/03-tracking.js`
- `routes/agents/04-market.js`
- `routes/agents/05-pricing.js`
- `routes/agents/06-expected-value.js`
- `routes/agents/07-quality.js`
- `routes/agents/08-portfolio.js`
- `routes/agents/09-search.js`
- `routes/agents/10-acquisition.js`
- `routes/agents/11-remarketing.js`
- `routes/agents/12-campaigns.js`
- `routes/agents/13-search-terms.js`
- `routes/agents/14-bidding.js`
- `integrations/tokko.js` — cliente REST con `axios`, audit-logged, retry con backoff
- `integrations/supermetrics.js` — cliente Ruta A enterprise/v2/query, audit-logged

### `piso-os-v3/db/migrations/`
Una migración por archivo. Reversibles. **No destructivas**. Numeración `pgm-*` que respeta orden lexicográfico.

| # | Archivo | Crea | Notas |
|---|---|---|---|
| 1 | `1700000000000_init-schemas.js` | schemas `ops`, `audit`, `ml` | grant a `piso_app` |
| 2 | `1700000000001_ops-properties.js` | `ops.properties` + índices `(operation)`, `(neighborhood)`, `(status)`, `gin (raw)` | `id_tokko TEXT PK` |
| 3 | `1700000000002_ops-agents.js` | `ops.agents` | seed inicial 14 agentes va en `db/seeds/001-agents.sql` |
| 4 | `1700000000003_ops-campaigns.js` | `ops.campaigns` + índice `(platform)` | `id TEXT PK` |
| 5 | `1700000000004_ops-leads.js` | `ops.leads` + índices `(source)`, `(campaign_id)`, `(property_id)`, `(closed_at)` | `BIGSERIAL` |
| 6 | `1700000000005_ops-snapshots-daily.js` | `ops.snapshots_daily` PK `(date, source, metric, dimension)` | dimension `JSONB` |
| 7 | `1700000000006_audit-agent-runs.js` | `audit.agent_runs` + índice `(agent_id, started_at)` | `BIGSERIAL` |
| 8 | `1700000000007_audit-decisions.js` | `audit.decisions` + índice `(agent_id, applied, created_at)` | `BIGSERIAL` |
| 9 | `1700000000008_audit-api-calls.js` | `audit.api_calls` + índice `(integration, called_at)` | `BIGSERIAL` |
| 10 | `1700000000009_ml-expected-value.js` | `ml.expected_value` PK `(property_id, computed_at)` | |
| 11 | `1700000000010_ml-pricing-score.js` | `ml.pricing_score` PK `(property_id, computed_at)` | |
| 12 | `1700000000011_ml-quality-score.js` | `ml.quality_score` PK `(property_id, computed_at)` | `blockers TEXT[]` |

### `piso-os-v3/db/seeds/`
- `001-agents.sql` — 14 INSERTs en `ops.agents` con `id`, `name`, `layer`, `status='idle'`, `config` JSONB con `cron_schedule`, `mock_mode`, `read_sources`.

---

## 3. Endpoints backend — contrato I/O y curl de prueba

Todos devuelven el shape estandarizado:

```json
{
  "agent_id": "NN",
  "agent_name": "...",
  "status": "ok|warning|error|mock",
  "last_run": "ISO-8601",
  "summary": "...",
  "metrics": [{"label": "...", "value": "...", "delta": "..."}],
  "alerts": [{"severity": "high|med|low", "message": "..."}],
  "raw": {}
}
```

Antes de devolver, escriben `audit.agent_runs` (start, finish, status, summary).

| # | Method + Path | Fuente | Persiste en | Curl de prueba |
|---|---|---|---|---|
| 01 | `GET /api/agent/01/inventory` | Tokko | `ops.properties` (upsert), `audit.api_calls` | `curl -s localhost:8787/api/agent/01/inventory \| jq` |
| 02 | `GET /api/agent/02/normalized` | Lee `ops.properties.raw` | `ops.properties` (update normalized cols) | `curl -s localhost:8787/api/agent/02/normalized \| jq` |
| 03 | `GET /api/agent/03/tracking` | GA4 + GAds + Meta vía SM | `ops.snapshots_daily` | `curl -s localhost:8787/api/agent/03/tracking \| jq` |
| 04 | `GET /api/agent/04/market` | GA4 + GSC vía SM | `ops.snapshots_daily` | `curl -s localhost:8787/api/agent/04/market \| jq` |
| 05 | `GET /api/agent/05/pricing` | Tokko + comparables (Tokko query) | `ml.pricing_score` | `curl -s localhost:8787/api/agent/05/pricing \| jq` |
| 06 | `GET /api/agent/06/expected-value` | Tokko + GAds CPL vía SM | `ml.expected_value` | `curl -s localhost:8787/api/agent/06/expected-value \| jq` |
| 07 | `GET /api/agent/07/quality` | Tokko fichas (fotos+copy) | `ml.quality_score` | `curl -s localhost:8787/api/agent/07/quality \| jq` |
| 08 | `GET /api/agent/08/portfolio` | GAds + Meta vía SM | `audit.decisions` (applied=false) | `curl -s localhost:8787/api/agent/08/portfolio \| jq` |
| 09 | `GET /api/agent/09/search` | GAds + GSC vía SM | `audit.decisions` (applied=false) | `curl -s localhost:8787/api/agent/09/search \| jq` |
| 10 | `GET /api/agent/10/acquisition` | GAds captación vía SM | `audit.decisions` (applied=false) | `curl -s localhost:8787/api/agent/10/acquisition \| jq` |
| 11 | `GET /api/agent/11/remarketing` | GA4 + Meta vía SM | `audit.decisions` (applied=false) | `curl -s localhost:8787/api/agent/11/remarketing \| jq` |
| 12 | `GET /api/agent/12/campaigns` | GAds vía SM (READ-ONLY) | `ops.campaigns` (upsert) | `curl -s localhost:8787/api/agent/12/campaigns \| jq` |
| 13 | `GET /api/agent/13/search-terms` | GAds search terms vía SM | `audit.decisions` (applied=false) | `curl -s localhost:8787/api/agent/13/search-terms \| jq` |
| 14 | `GET /api/agent/14/bidding` | GAds + Meta vía SM | `audit.decisions` (applied=false) | `curl -s localhost:8787/api/agent/14/bidding \| jq` |

Endpoints adicionales (no de agente):

| Path | Para qué |
|---|---|
| `GET /api/health` | liveness probe; devuelve `{ ok: true, db: 'up'\|'down', mocks: [...] }` |
| `GET /api/agents` | listado agentes con último `agent_runs` (alimenta header de UI) |
| `GET /api/console/stream` | SSE con últimos eventos (`agent_runs` + `api_calls`) |
| `POST /api/agent/:id/run` | dispara un agente on-demand; respeta lock por agente |

### Ejecución on-demand vs cron

- Cada agente expone `read()` (puro fetch + cache), `score()` (cálculo idempotente sobre data leída), `persist()` (DB writes envueltos en `audit.agent_runs`).
- El endpoint GET corre `read → score → persist` y devuelve el shape.
- El cron llama el mismo flujo. Mismo código, mismo audit.

---

## 4. Skills de Claude Code

Ninguna skill adicional. Las skills disponibles (`init`, `review`, `simplify`, `claude-api`, etc.) no son necesarias para este task. **No instalo skills.**

---

## 5. Dependencias npm — lista VERDE

Todas declaradas en `piso-os-v3/package.json`. No globales.

```jsonc
{
  "dependencies": {
    "express": "^4.19.2",
    "cors": "^2.8.5",
    "pg": "^8.13.0",
    "axios": "^1.7.7",
    "dotenv": "^16.4.5",
    "node-cache": "^5.1.2",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "node-pg-migrate": "^7.6.1",
    "nodemon": "^3.1.4"
  }
}
```

Notas:
- `googleapis` **no** lo incluyo porque la Ruta A no lo necesita — Supermetrics enterprise/v2/query habla HTTP plano con axios. Si en el futuro pasamos a Ruta B (Sheets), agrego `googleapis` en otra iteración.
- `nodemon` solo dev, opcional para `npm run dev`.
- `pg-format` no incluido — uso parametrized queries del `pg` driver.

---

## 6. Items AMARILLOS que pediré confirmación antes de hacer

| # | Item | Por qué | Cuándo pregunto |
|---|---|---|---|
| Y1 | Levantar Postgres 16 en sandbox via Docker para validar migraciones | Validación end-to-end en sandbox antes de que vos las corras en tu Mac | Inicio Gate 3 Bloque B |
| Y2 | Hacer `git commit` + push a la branch `claude/setup-piso-os-v3-5Z6nv` | Persistir el trabajo y abrir PR draft | Después de Gate 3 Bloque G |
| Y3 | Crear PR draft en GitHub | Spec del entorno dice que debo crear PR draft tras push | Inmediatamente después de Y2, junto |

**Recomendación para Y1**: NO lo hagas. Vos ya tenés Postgres en tu Mac. El flujo limpio:
1. En Gate 3 termino de escribir migraciones.
2. Vos las corrés con `npm run db:migrate` desde tu Mac.
3. Si fallan, vos pegás el error acá y itero.

Esto evita gastar recursos del sandbox en un Postgres efímero y garantiza que las migraciones funcionen en tu entorno real, no en uno simulado.

---

## 7. Plan de tests

### Sandbox (esta sesión)
- **Lint sintáctico de Node**: `node --check server/index.js` y por cada `server/**/*.js` después de escribirlo.
- **Lint sintáctico de migrations**: cargar cada archivo con `require()` para verificar que es JS válido sin ejecutarlo.
- **Validación SQL estática**: `psql --dry-run`-equivalente no existe; uso `pg_query --parse-only` si está disponible o, si no, simulo con `node -e "require('./db/migrations/...')(fakePgm)"` con un mock que graba las llamadas y pretty-printea el SQL.
- **Smoke test del HTML**: abrir con un parser HTML (ej. `tidy`), verificar exactamente 1 `<script src=".*facebook.*pixel.*">` o `fbq()` y exactamente 1 `<script>...gtm.js?id=GTM-TN8SRRR8</script>`.
- **Curl de endpoints en modo mock**: arranco backend en sandbox con todas las vars apuntando a inexistente, fuerza `status: "mock"` en cada agente, devuelvo fixtures. Verifico shape con `jq`.

### Tu Mac (post-handoff)
- `npm install` — instala deps.
- `npm run db:migrate` — corre migraciones contra `DATABASE_URL`.
- `npm run db:seed` — inserta 14 agentes en `ops.agents`.
- `npm run dev` — arranca backend en :8787.
- Abrir `PISO_OS_V3_connect.html` en navegador (file:// o http-server local).
- Tocar el botón "Run all" del frontend → todos los agentes corren read→score→persist.
- Verificar `audit.agent_runs` en `psql`.

### CI / GitHub Actions
No agregamos pipelines en este Gate. Si querés, en una iteración posterior.

---

## 8. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Tu plan Supermetrics no incluye enterprise/v2/query | Media | Alto — Ruta A no funciona | El backend detecta 401/403 y degrada el agente a `status: "mock"`. Te aviso para evaluar Ruta B en otra sesión. |
| Tokko API rate limits o cambia esquema | Baja | Medio | Backoff exponencial + caché de 30min en `server/cache/tokko-properties.json`. Audit en `api_calls`. |
| Postgres del usuario tiene rol distinto a `piso_app` | Media | Medio | Migraciones usan `CURRENT_USER`. `.env.example` documenta el rol esperado. |
| `DATABASE_URL` con SSL obligatorio | Baja | Bajo | `pg.Pool` autoconfigura `ssl` si la URL incluye `?sslmode=require`. |
| El usuario corre `docker compose up` desde la raíz del repo y se mezcla MiroFish con PISO_OS | Baja | Alto | `piso-os-v3/docker-compose.yml` es independiente. README explícito: "siempre invocar desde `piso-os-v3/`". |
| Múltiples Pixels accidentales si el HTML se edita a mano | Baja | Medio | Comentario inline `<!-- WARNING: only one fbq pixel allowed (bug #1) -->`. |
| Deriva de Tokko vs DB | Media | Medio | `synced_at` por propiedad. Agente 01 hace upsert con `ON CONFLICT (id_tokko) DO UPDATE SET ...`. Vista `ops.v_stale_properties` (synced_at < now() - 1h) en migración futura si se necesita. |
| Secrets en `.env` accidentalmente commiteados | Baja | Crítico | `.gitignore` cubre `.env`. `INSTALL_LOG.md` chequea estado de gitignore antes del primer commit. **Yo nunca hago `git add .env`**. |

---

## 9. Reglas duras que sigo en Gate 3

1. **Cero secrets en HTML**. Todo viene de `localhost:8787/api/*`.
2. **Cero secrets en archivos commiteables**. Solo en `.env` (gitignored).
3. **Meta = READ-ONLY**. Cero llamadas `POST/PATCH/DELETE` a Graph API.
4. **Google Ads = READ-ONLY** en esta sesión. Agente 14 escribe propuestas, no aplica.
5. **Tokko = source of truth**. Cero `DELETE` desde nuestra side a Tokko. Solo lectura.
6. **Migraciones reversibles**. Cada `up()` tiene `down()`. Cero `DROP COLUMN`/`DROP TABLE` sin que vos lo confirmes.
7. **Audit log obligatorio**. Cada llamada externa pasa por `audit.api_calls`. Cada run de agente pasa por `audit.agent_runs`.
8. **CORS estricto**. `file://` y `http://localhost:*`. Cero `*`.
9. **Modo mock con badge naranja**. Si falta env var, el agente devuelve `status: "mock"` con fixtures, y la UI lo señala.

---

## 10. Bloque-por-bloque (Gate 3)

| Bloque | Entregable | Validación al final |
|---|---|---|
| A | scaffold (carpetas, `package.json`, `.env.example`, `.gitignore`, `INSTALL_LOG.md`) | `node --check`, `npm install` corre sin errores |
| B | DB (migrations + seeds + `db.js`) | Lint estático JS, simulación de SQL con mock pgm, doc de cómo correr en tu Mac |
| C | Tokko (agentes 01, 02, 05, 07) + `integrations/tokko.js` | Curl en modo mock devuelve shape correcto |
| D | Supermetrics (agentes 03, 04, 06, 08–14) + `integrations/supermetrics.js` | Curl en modo mock devuelve shape correcto |
| E | scheduler + cache + audit logging | Cron schedules verificados con dry-run; archivos cache se crean en `server/cache/` |
| F | frontend HTML (limpiar nada, crear desde cero, 14 paneles, consola, 1 pixel, 1 GTM) | `tidy`/parser confirma 1 pixel, 1 GTM head, 1 GTM noscript |
| G | `README_RUN.md` + `INSTALL_LOG.md` final + `FIX_LOG.md` + (AMARILLO) commit + push + PR draft | README listo para que vos arranqués el sistema en tu Mac |

Después de cada bloque te paso:

```
QUÉ HICE | QUÉ INSTALÉ (verde) | QUÉ NECESITO QUE APRUEBES (amarillo) | RESULTADO DE VALIDACIÓN | SIGUIENTE BLOQUE
```

---

## 11. Decisiones que necesito de vos antes de Gate 3

1. **Validación de DB**: confirmás que las migraciones las corrés vos en tu Mac (recomendado), o querés que levante Postgres temporal en sandbox (Y1, AMARILLO)?
2. **Commit + push + PR draft al final**: lo hago yo con tu OK al cerrar Gate 3 G (Y2+Y3, AMARILLO), o preferís commit/push manual desde tu Mac?
3. **`docker-compose.yml` opcional para PISO_OS**: lo incluyo como fallback para futuros usuarios sin Postgres local, sí o no?

Después de tus respuestas, arranco Bloque A.
