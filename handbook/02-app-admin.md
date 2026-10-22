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

## Production data sources (verified on gen-serv, v0.1.6, 2026-10-22)

| Page / panel | Source | State |
|---|---|---|
| Platform health: services up | `sum by (job) (up)` / `count by (job) (up)` | live for admin-bff, api, messages, gateway, voice-signaling, sfu |
| Request rate, error ratio | `http_requests_total` (admin-bff) or `messages_http_requests_total` (messages) | live for those two; api and gateway expose no request counters yet |
| Latency p95, DB latency p95 | `http_request_duration_seconds_bucket`, `db_query_duration_seconds_bucket` | empty until services export histograms (shown as no data) |
| Gateway sessions | `discordy_gateway_gauges_sessions_local` by instance | live |
| Consumer lag | `redpanda_kafka_consumer_group_lag_sum` | empty: Redpanda does not export consumer-group lag yet |
| Voice nodes | `discordy_voice_node_*` plus gateway admin stats | live (one node, voice-nl-home) |
| Usage dashboards | usage aggregator counters in Postgres, fed by the `discordy.*.v1` topics | live; counts match the Redpanda topic offsets |
| Overview, users, guilds | api `/internal/v1/admin/*` | live |

The Cloudflare Access login cannot be scripted, so verification queried VictoriaMetrics directly with the BFF's own PromQL and checked `/readyz` and `/metrics` through a port-forward.
