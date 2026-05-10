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
*(pendiente)*

## 2026-05-10 — Gate 3 Bloque C: Tokko
*(pendiente)*

## 2026-05-10 — Gate 3 Bloque D: Supermetrics
*(pendiente)*

## 2026-05-10 — Gate 3 Bloque E: scheduler
*(pendiente)*

## 2026-05-10 — Gate 3 Bloque F: frontend
*(pendiente)*

## 2026-05-10 — Gate 3 Bloque G: handoff
*(pendiente)*
