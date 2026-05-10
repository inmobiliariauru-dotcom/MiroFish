# PISO OS V3 — README_RUN

Cómo levantar el sistema localmente en tu Mac.

---

## TL;DR

```bash
cd piso-os-v3
cp .env.example .env             # editá .env con tus credenciales
npm install
npm run db:migrate
npm run db:seed
npm run dev                       # backend en http://localhost:8787
open PISO_OS_V3_connect.html      # frontend (file://)
```

---

## Pre-requisitos

| Tool | Versión | Cómo verificás |
|---|---|---|
| Node.js | ≥ 20 | `node --version` |
| npm | ≥ 10 | `npm --version` |
| Postgres | 16 | `psql --version`; debe estar escuchando en `:5432` |

Si **no** tenés Postgres local y querés evitar instalarlo: usá el fallback Docker:

```bash
cd piso-os-v3
docker compose up -d              # arranca piso_os_postgres en :5432
                                  # data persiste en piso-os-v3/.pgdata (gitignored)
```

---

## Setup paso a paso

### 1. Variables de entorno

```bash
cd piso-os-v3
cp .env.example .env
```

Editá `.env`. Mínimo viable (resto en mock mode):

```ini
DATABASE_URL=postgres://piso_app:CHANGEME@localhost:5432/piso_os
PORT=8787
```

Para sacar agentes de mock mode, agregá:

```ini
TOKKO_API_KEY=...                 # habilita agentes 01, 02, 05, 07 con data real
SUPERMETRICS_API_KEY=...          # habilita agentes 03, 04, 06, 08–14
SUPERMETRICS_TEAM_KEY=...
META_PIXEL_ID_PRIMARY=123456789   # 1 sólo pixel — el HTML lo inyecta dinámico
```

> El backend **no crashea** si faltan credenciales: cada integración cae a "mock mode" y la UI muestra badge naranja en los agentes afectados.

### 2. Base de datos

```bash
# Si usás Postgres local en tu Mac, primero creá DB y rol:
createdb piso_os
psql -d piso_os -c "CREATE ROLE piso_app WITH LOGIN PASSWORD 'CHANGEME';"
psql -d piso_os -c "GRANT ALL ON DATABASE piso_os TO piso_app;"

# Migraciones (idempotentes, reversibles):
npm run db:migrate

# Seed: 14 agentes en ops.agents
npm run db:seed
```

Otros comandos:

```bash
npm run db:migrate:down           # rollback de la última migración
npm run db:reset                  # baja todas las migraciones, vuelve a aplicar, reseed
```

> **Producción**: NUNCA correr `db:reset` en una DB con datos reales. Solo dev.

### 3. Backend

```bash
npm run dev                       # nodemon, autoreload
# o
npm start                         # node directo
```

Logs esperados:

```
[piso-os-v3] backend listening on http://localhost:8787
[piso-os-v3] mocks: tokko, supermetrics
[scheduler] registered 14 cron jobs
```

Si querés correr **sin** scheduler (útil para dev), exportá `SCHEDULER=off`:

```bash
SCHEDULER=off npm run dev
```

### 4. Inventario diario via Salboo Excel

Salboo allowlistea por IP, así que la API REST de Tokko solo funciona desde tu Mac (no desde servidores externos). El canal de inventario canónico es el **Excel diario**:

1. Cada día a las 21:00 (o cuando exportes), bajá el listado de Salboo en formato XLSX (mismo formato que el Facebook Catalog feed: `home_listing_id`, `availability`, `address.region`, `image[N].url`, `num_beds`, `num_baths`, `price`, etc.).
2. Pegá el archivo en `piso-os-v3/data/inbox/`.
3. El agente 01 lo procesa automáticamente en la corrida diaria (cron `5 21 * * *`) o ad-hoc vía:

   ```bash
   curl http://localhost:8787/api/agent/01/inventory
   ```

4. Tras el upsert (`ops.properties`), el archivo se mueve a `data/processed/<timestamp>/<nombre>.xlsx` para auditoría.

**Prioridad de fuentes** dentro del agente 01:
1. `data/inbox/*.xlsx` si existe → Excel (preferido).
2. `TOKKO_API_KEY` definido → Tokko REST (solo desde IP allowlistada).
3. Sin nada → mock.

Override del directorio:

```ini
SALBOO_INBOX_DIR=data/inbox
SALBOO_PROCESSED_DIR=data/processed
```

### 5. Frontend

El HTML es completamente estático. Abrilo en el browser:

```bash
open PISO_OS_V3_connect.html      # macOS
# o:
xdg-open PISO_OS_V3_connect.html  # Linux
```

Por defecto apunta a `http://localhost:8787`. Para apuntar a otro host:

```
PISO_OS_V3_connect.html?api=http://otra-maquina:8787
```

---

## Verificación rápida

```bash
# Health
curl -s localhost:8787/api/health | jq
# {"ok":true,"db":"up","mocks":["tokko","supermetrics"],"port":8787,...}

# Lista de 14 agentes
curl -s localhost:8787/api/agents | jq 'map({id,name,layer,status})'

# Correr el agente 01 (sync de Tokko)
curl -s localhost:8787/api/agent/01/inventory | jq '.summary, .metrics'

# Correr el agente 12 (snapshot de campañas Google Ads — READ-ONLY)
curl -s localhost:8787/api/agent/12/campaigns | jq '.summary, .metrics'

# Console snapshot
curl -s localhost:8787/api/console/recent | jq '{runs: (.runs|length), decisions: (.decisions|length)}'
```

---

## Mapa de endpoints

| Endpoint | Para qué |
|---|---|
| `GET /api/health` | liveness + status DB + mocks activos |
| `GET /api/config` | IDs públicos (Pixel, GTM, GA4) sin secrets — el HTML los lee de aquí |
| `GET /api/agents` | listado de los 14 agentes con último run |
| `GET /api/agent/01/inventory` | Tokko Sync |
| `GET /api/agent/02/normalized` | Inventory Normalizer |
| `GET /api/agent/03/tracking` | GA4 + GAds + Meta tracking |
| `GET /api/agent/04/market` | GSC + GA4 market intelligence |
| `GET /api/agent/05/pricing` | scoring vs cohorte (under/fair/over) |
| `GET /api/agent/06/expected-value` | EV por propiedad |
| `GET /api/agent/07/quality` | photos + copy → `ml.quality_score` |
| `GET /api/agent/08/portfolio` | propuesta GAds vs Meta share |
| `GET /api/agent/09/search` | propuesta de search terms (GSC) |
| `GET /api/agent/10/acquisition` | propuesta scaling captación |
| `GET /api/agent/11/remarketing` | propuesta remarketing pool |
| `GET /api/agent/12/campaigns` | snapshot READ-ONLY de campañas GAds |
| `GET /api/agent/13/search-terms` | propuesta de negativos |
| `GET /api/agent/14/bidding` | propuesta de bid moves |
| `GET /api/console/recent` | snapshot últimos 50 runs/calls/decisions |
| `GET /api/console/jobs` | listado de cron schedules |
| `GET /api/console/stream` | SSE en vivo (lo consume el HTML) |

Todos los endpoints de agente devuelven el shape estandarizado:

```json
{
  "agent_id": "NN",
  "agent_name": "...",
  "status": "ok | warning | error | mock",
  "last_run": "ISO-8601",
  "summary": "...",
  "metrics": [{ "label": "...", "value": "..." }],
  "alerts": [{ "severity": "high|med|low", "message": "..." }],
  "raw": {}
}
```

---

## Scheduler (cron)

| Agente | Schedule (cron) |
|---|---|
| 01 Salboo Sync | `5 21 * * *` (daily 21:05) |
| 02 Normalizer | `10 21 * * *` y `0 13 * * *` |
| 03 Tracking | `5 * * * *` |
| 04 Market | `10 * * * *` |
| 12 Campaigns | `15 * * * *` |
| 05 Pricing | `20 */6 * * *` |
| 06 Expected Value | `25 */6 * * *` |
| 07 Quality | `30 */6 * * *` |
| 08 Portfolio | `40 * * * *` |
| 09 Search | `41 * * * *` |
| 10 Acquisition | `42 * * * *` |
| 11 Remarketing | `43 * * * *` |
| 13 Negatives | `44 * * * *` |
| 14 Bidding | `45 * * * *` |

Todo cron run pasa por la misma pipeline HTTP/audit que un curl manual. Cada ejecución queda en `audit.agent_runs` con start/finish/status/summary.

---

## Reglas duras (no negociables)

1. **Tokko = single source of truth** del inventario. Nada en este sistema escribe a Tokko.
2. **Meta = READ-ONLY** siempre. Nunca llamamos endpoints mutativos de la Graph API.
3. **Google Ads = READ-ONLY** en esta versión. Agente 14 (Bidding) escribe **propuestas** en `audit.decisions` con `applied=false`. Para aplicar requiere paso humano explícito (no implementado en V3).
4. **1 sólo Meta Pixel**. El HTML inyecta el pixel únicamente desde `META_PIXEL_ID_PRIMARY` y usa `window.__pixelInjected` como guard.
5. **CORS** restringido a `file://` y `http://localhost:*`.
6. **Cero secrets en frontend**. El HTML solo habla con `localhost:8787/api/*`.
7. **Audit obligatorio**. Todo run de agente queda en `audit.agent_runs`. Toda llamada a API externa queda en `audit.api_calls`.

---

## Troubleshooting

### "Missing required env vars: DATABASE_URL"

Falta `.env` o `DATABASE_URL` no está seteado. Copiá `.env.example` a `.env`.

### Backend bootea pero todos los agentes en mock

Falta `TOKKO_API_KEY` y/o `SUPERMETRICS_API_KEY`/`SUPERMETRICS_TEAM_KEY`. Verificalo con:

```bash
curl -s localhost:8787/api/health | jq .mocks
```

Si devuelve `["tokko","supermetrics"]`, los dos están en mock. Para sacar uno, seteá las vars correspondientes y reiniciá.

### `EADDRINUSE :8787`

Otro proceso usa el puerto. Pará el otro o cambiá `PORT=` en `.env`.

### Migraciones fallan con permission denied

El rol `piso_app` no tiene permisos. Ejecutá como superuser:

```sql
GRANT ALL ON DATABASE piso_os TO piso_app;
GRANT ALL ON SCHEMA public TO piso_app;
```

Las migraciones crean schemas `ops`, `audit`, `ml` y otorgan permisos a `piso_app`.

### Frontend no se conecta al backend

Abrí DevTools → Network. Si ves CORS errors, asegurate de que el backend esté corriendo y que el origin sea `file://` o `localhost`. Si abrís el HTML desde otra URL, agregá `?api=http://localhost:8787` al final.

### El SSE de la consola se desconecta

Es normal por timeouts de proxy. El frontend reconecta automáticamente (`EventSource` retry built-in). El badge cambia a `reconnecting…`.

---

## Estructura del proyecto

```
piso-os-v3/
├── PISO_OS_V3_connect.html     # frontend (1 archivo, vanilla JS)
├── package.json                  # Node 20+, deps mínimas
├── .env.example                  # template (commit ok)
├── .env                          # secrets (gitignored)
├── docker-compose.yml            # Postgres 16 fallback (opcional)
├── INSTALL_LOG.md                # registro de cada cambio "verde"
├── FIX_PLAN.md                   # master plan original
├── FIX_LOG.md                    # bugs resueltos
├── README_RUN.md                 # este archivo
├── server/
│   ├── index.js                  # Express + rutas + boot
│   ├── env.js                    # carga + validación + mock detection
│   ├── db.js                     # pg pool
│   ├── audit.js                  # logApiCall, startAgentRun, ...
│   ├── cache.js                  # NodeCache + persistencia opcional
│   ├── scheduler.js              # node-cron, 14 jobs
│   ├── routes/
│   │   ├── console.js            # /api/console/{recent,jobs,stream}
│   │   └── agents/01..14-*.js
│   ├── integrations/
│   │   ├── tokko.js
│   │   └── supermetrics.js
│   └── cache/                    # archivos JSON ignorados por git
├── db/
│   ├── migrations/               # 12 migraciones reversibles
│   └── seeds/
│       └── 001-agents.sql        # 14 agentes
└── bin/
    ├── migrate.js                # wrapper de node-pg-migrate
    └── seed.js                   # corre los .sql de seeds/
```

---

## Próximos pasos (no incluidos en V3)

- Aplicación humana de propuestas en `audit.decisions` (Google Ads write API). Requiere approval flow.
- UI para revisar/aprobar/rechazar decisiones desde el frontend.
- Métricas históricas comparativas (delta vs misma semana del mes pasado).
- Webhook desde Tokko para sync push (en lugar de pull cada 30 min).
- Tests unitarios automatizados (jest + supertest).

Estos quedan documentados como TODO en `FIX_PLAN.md` §11 y se pueden encarar en iteraciones siguientes.
