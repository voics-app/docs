# admin

Summary: the operator portal, a Rust backend-for-frontend with an embedded React SPA.

| | |
|---|---|
| Repository | `discordy-voics/admin` |
| Image | `ghcr.io/discordy-voics/admin-bff` (namespace `voics-apps`, port 8090; the SPA is embedded) |
| Tech | Rust 1.99, axum, sqlx; React, Vite, Recharts |
| Owns | Postgres database `discordy_admin` (minute, hour and day rollups of event counters) |
| URL | `https://discordy-admin.voics.nl` behind the IP lock and Cloudflare Access ([Ops and access](04-ops-and-access.md)) |
| Catalog entry | [Service catalog: admin](../services/catalog.md#admin-bff--admin-web) |

## What it does

Pages: Overview, Usage, Voice regions (drain and resume nodes), Platform health, Trust and Safety (user and guild lookup, suspension), Feature flags and Audit log. The BFF counts events from every Redpanda topic into rollups, reads metrics from VictoriaMetrics and calls the internal APIs of api and gateway. It never stores message content.

## Folder map

| Path | What is there |
|---|---|
| `bff/src/{domain,application,infrastructure,interface}` | Clean Architecture layers of the BFF; `bootstrap.rs` wires them. |
| `bff/migrations/` | Postgres migrations for `discordy_admin`. |
| `bff/src/domain/service_health.rs` | `PLATFORM_SERVICES`, the list of jobs the health page groups by. |
| `web/src/pages` | One file per page; `api/` is the typed client, `charts/` the Recharts wrappers. |

## Auth

Cloudflare Access issues a JWT verified against the team JWKS (`CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`), then the email must be in `ADMIN_ALLOWED_EMAILS`. With `DISCORDY_ENV=local` the header `X-Dev-Admin-Email` replaces the token; production ignores it.

## Run, test, release

```bash
cp .env.example .env && set -a && . ./.env && set +a
make dev      # BFF on 8090, Vite on 5174
make test     # cargo test (testcontainers, wiremock) and vitest
make lint
```

Release: tag `vX.Y.Z`, stable image, Flux. A new platform service needs its job name added to `PLATFORM_SERVICES` ([Service catalog](../services/catalog.md)).
