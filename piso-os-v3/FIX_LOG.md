# PISO OS V3 — FIX_LOG

Registro de bugs resueltos y reglas duras verificadas durante el scaffold.

---

## Bug #1 (CRÍT) — 3 Meta Pixels firing simultáneos en pisoinmobiliario.com

**Estado**: ✅ resuelto **por construcción**.

### Cómo se previno

El HTML nuevo (`PISO_OS_V3_connect.html`) **no contiene ningún `fbq()` ni `fbevents.js` hardcoded fuera de un único helper con guard de singleton**. La inicialización del Pixel ocurre exclusivamente vía:

```js
// In PISO_OS_V3_connect.html
function injectMetaPixel(id) {
  if (!id || window.__pixelInjected) return;   // singleton guard
  window.__pixelInjected = true;
  /* …inserta UN sólo <script> con fbq('init', id) y fbq('track', 'PageView')… */
}
```

Y se llama una sola vez desde `loadConfigAndInjectTags()` en `DOMContentLoaded`. El `id` viene de `META_PIXEL_ID_PRIMARY` en `.env` → backend `/api/config` → frontend (cero hardcoding).

### Verificación

| Check | Resultado |
|---|---|
| `grep -c 'fbq('` en HTML | **1** (sólo en el template string del helper) |
| `grep -c 'fbevents.js'` en HTML | **1** (mismo template) |
| Cualquier secret/key/token literal | **0** |
| Doble inyección si el helper se llama 2 veces | **bloqueada** por `window.__pixelInjected` |
| Si `META_PIXEL_ID_PRIMARY` no existe | el script **no se inyecta** (clean fail) |

### Pixel ID que queda vivo

Definido en `.env` como `META_PIXEL_ID_PRIMARY`. **Acción del lado humano** antes de productivizar:
1. Decidir cuál de los 3 pixels históricos sobrevive (pegándole en Meta Events Manager para ver volumen).
2. Setear ese ID en `.env`.
3. Eliminar los otros 2 de Meta Events Manager y de cualquier integración LeadsBridge / Madgicx.
4. Confirmar con `Meta Pixel Helper` (extensión Chrome) que solo dispara 1.

---

## Bug #2 (MAY) — Múltiples GTM containers / `gtag` inline duplicado

**Estado**: ✅ resuelto **por construcción**.

Mismo patrón que el Pixel. `GTM_CONTAINER_ID` viene de `.env` (default `GTM-TN8SRRR8`). El helper `injectGTM(container)` usa `window.__gtmInjected` como guard, agrega el `<script>` head y el `<iframe>` noscript en `<body>`, una sola vez. Todas las tags GA4 de la propiedad `446039439` quedan administradas via GTM, no via `gtag` inline.

| Check | Resultado |
|---|---|
| `grep -c 'googletagmanager'` | **2** (gtm.js + ns.html iframe, ambos en el template) |
| `gtag(...)` inline | **0** |
| Doble inyección | **bloqueada** por `window.__gtmInjected` |

---

## Bug #3 (MAY) — Secrets potencialmente embebidos en frontend

**Estado**: ✅ resuelto **por construcción**.

El HTML solo habla con `localhost:8787/api/*`. Los IDs públicos (Pixel, GTM, GA4) los recibe vía `GET /api/config` que el backend expone leyendo `.env`. Los secrets reales (`TOKKO_API_KEY`, `SUPERMETRICS_API_KEY`, `SUPERMETRICS_TEAM_KEY`, `META_ACCESS_TOKEN`) **nunca salen del backend**.

| Check | Resultado |
|---|---|
| `grep -iE 'api_key\|secret\|token\|password'` en HTML | **0 matches reales** (solo aparece como comentario "No secrets in this file") |
| `.env` en `.gitignore` | sí (en el `.gitignore` raíz del repo y en `piso-os-v3/.gitignore`) |
| `.env.example` con placeholders únicamente | sí |

---

## Constraint compliance

### Tokko = single source of truth
- Cero llamadas mutativas (`POST/PUT/PATCH/DELETE`) a `tokkobroker.com`. El cliente solo expone `listProperties()` y `getProperty()`. ✅
- Sync hace `INSERT … ON CONFLICT (id_tokko) DO UPDATE` en `ops.properties`. La fila local es caché + ledger; nunca se borra ni reemplaza una `id_tokko` que vino de Tokko.

### Meta = READ-ONLY siempre
- No hay módulo en el backend que llame Graph API con verbos mutativos. Solo lectura, vía Supermetrics. ✅

### Google Ads = READ-ONLY en esta sesión
- Agente 12 (Campaign Builder) explícitamente READ-ONLY: solo lee y persiste a `ops.campaigns`. ✅
- Agente 14 (Bidding) escribe **propuestas** en `audit.decisions` con `applied=false`. Hay **0** llamadas a Google Ads write API en el código. ✅
- Tras una corrida completa de los 14 agentes en sandbox: `SELECT bool_and(applied=false) FROM audit.decisions` → **true** (todas pendientes).

### Audit ledger
- Cada llamada externa pasa por `audit.api_calls` (integration, endpoint, method, status_code, duration_ms, error, called_at). ✅
- Cada run de agente pasa por `audit.agent_runs` (start, finish, status, summary, output, error). ✅
- Sandbox: tras 14 corridas concatenadas → 22 filas en `audit.agent_runs` (incluye runs previos de testing), 9 filas en `audit.decisions`, 0 filas en `audit.api_calls` (correcto: mock mode no hace HTTP externo).

### CORS
- `server/index.js` rechaza cualquier origin que no sea `file://`, `http://localhost:*`, `http://127.0.0.1:*`. ✅

### Modo mock con badge naranja
- Si falta `TOKKO_API_KEY` → todos los agentes Tokko-dependientes (`01, 02, 05, 07`) corren con datos sintéticos y devuelven `status: "mock"`. La UI los pinta con clase `badge-mock` (naranja). ✅
- Idem para Supermetrics y agentes 03, 04, 06, 08–14.
- Si falta `DATABASE_URL` el backend **rechaza bootear** (DB es hard requirement, no opcional). ✅

---

## Decisiones diferidas (no son bugs)

| # | Decisión | Cuándo |
|---|---|---|
| D1 | Aplicar las propuestas en `audit.decisions` a Google Ads via API write | Requiere approval flow + scopes OAuth + paso humano explícito. Fuera de V3. |
| D2 | UI de revisión/aprobación de decisiones desde el frontend | V3.1 — mismo motivo |
| D3 | Tests unitarios (jest + supertest) | Pendiente; no bloquea producción |
| D4 | Webhook desde Tokko para push-sync | Reduce latencia de inventario; opcional |
| D5 | Métricas comparativas (Δ% vs período anterior) | Requiere histórico de ≥30 días en `ops.snapshots_daily` |

Todo D1–D5 está documentado como TODO en `README_RUN.md` §"Próximos pasos".

---

## Acciones del lado humano (te tocan a vos antes de productivizar)

- [ ] Decidir el Pixel sobreviviente (de los 3 actuales) y setear `META_PIXEL_ID_PRIMARY` en `.env`.
- [ ] Eliminar los otros 2 Pixels en Meta Events Manager + LeadsBridge + Madgicx.
- [ ] Auditar GTM `GTM-TN8SRRR8` para confirmar que las tags GA4 (property `446039439`) están una sola vez.
- [ ] Crear el rol `piso_app` y la DB `piso_os` en tu Postgres local.
- [ ] Confirmar que tu plan Supermetrics incluye el endpoint `enterprise/v2/query`. Si no, abrir nueva sesión y pasar a Ruta B (Sheets).
- [ ] Validar visualmente el HTML en tu browser (sandbox no tiene browser).
- [ ] Cuando estés conforme con el draft PR #1, abrirlo a "ready for review" o mergearlo desde la UI de GitHub.
