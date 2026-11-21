# admin

Summary: the operator portal, a Rust backend-for-frontend with an embedded React SPA.

| | |
|---|---|
| Repository | `voics-app/admin` |
| Image | `ghcr.io/voics-app/admin-bff` (namespace `voics-apps`, port 8090; the SPA is embedded) |
| Tech | Rust 1.99, axum, sqlx; React, Vite, Recharts |
| Owns | Postgres database `discordy_admin` (minute, hour and day rollups of event counters) |
| URL | `https://discordy-admin.voics.nl` behind the IP lock and Cloudflare Access ([Ops and access](04-ops-and-access.md)) |
| Catalog entry | [Service catalog: admin](../services/catalog.md#admin-bff--admin-web) |

## What it does

Pages: Overview, Usage, Voice regions (drain and resume nodes), Platform health, Trust and Safety (user and guild lookup, suspension), Reports (the review queue for reported messages and users: open, resolved and dismissed reports, the evidence with its source, resolve or dismiss with an optional note), Send notification (a push notification by hand, see below), Feature flags and Audit log. The BFF counts events from every Redpanda topic into rollups, reads metrics from VictoriaMetrics and calls the internal APIs of api and gateway. It never stores message content: the Reports page shows the text of a reported message that api copied (or the reporter submitted), but the BFF only passes it through and the audit entries for `report.resolve` and `report.dismiss` never contain it. See [moderation spec](../specs/2026-10-22-moderation-tools-and-ban-purge.md#reporting-a-message-or-a-user-api126).

### Public listing reports (api#45)

The paired API/client/admin increment adds guild listings to Reports. The table
identifies the guild; review shows the owner at filing and the server-captured
public name, description, category and tags. It does not copy private channels,
members or messages. Existing resolve/dismiss actions remain audited and do not
remove a listing. See the [discovery moderation policy](../specs/2026-11-03-server-discovery.md).
Independent acceptance of the integrated versions remains a separate step.

### Send notification

Page `/notify` (<https://discordy-admin.voics.nl/notify>, sidebar entry *Send notification*). Pick one user (search by username, email or id) or **Everyone**, write a title (at most 64 characters) and a message (at most 240), check the preview, press **Review and send**. The confirmation dialog states how many devices will receive it (for everyone this is the exact count of devices with a live push token, taken from a dry run), and only then **Send** goes through. The admin BFF calls the notifier, which uses the same queue and rate limits as message pushes; see [Sending a notification by hand](../runbooks/push-notifications.md#sending-a-notification-by-hand). Every send writes an audit entry `notification.send` (who, when, target `all` or `user:<id>`, title; never the message). It needs `NOTIFIER_INTERNAL_URL` (set in gitops `admin-config`) and a running notifier. Same access as the rest of the panel: Cloudflare Access plus `ADMIN_ALLOWED_EMAILS`.

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
| Request rate, error ratio | `http_requests_total{method,route,status}` (status class `2xx`..`5xx`), same name in every service | live for admin-bff, api, messages, gateway (verified 2026-10-22); error ratio is zero-filled when a service has no 5xx |
| Latency p95 | `http_request_duration_seconds_bucket` | live for admin-bff, api, messages, gateway |
| DB latency p95 | `db_query_duration_seconds_bucket` (`db`, `operation`) | live for api (sqlx); messages exports Postgres search and Scylla timings and shows up once it serves DB traffic |
| Gateway sessions | `discordy_gateway_gauges_sessions_local` by instance | live |
| Consumer lag | `sum by (redpanda_group) (redpanda_kafka_consumer_group_lag_sum)` | live: five gateway consumer groups (the `redpanda-topics` Job sets `enable_consumer_group_metrics` to include `consumer_lag`) |
| Dropped pushes (5m) | `sum by (provider) (increase(notifier_pushes_total{outcome="dropped"}[5m]))` | implemented; local adapter/UI validation, production panel verification pending |
| Push queue / sends in flight | `notifier_queue_depth` / `notifier_in_flight` by instance | implemented; includes retries in flight, requires notifier scrape samples |
| Voice nodes | `discordy_voice_node_*` plus gateway admin stats | live (one node, voice-nl-home) |
| Usage dashboards | usage aggregator counters in Postgres, fed by the `discordy.*.v1` topics | live; counts match the Redpanda topic offsets |
| Overview, users, guilds | api `/internal/v1/admin/*` | live |

The Cloudflare Access login cannot be scripted, so verification queried VictoriaMetrics directly with the BFF's own PromQL and checked `/readyz` and `/metrics` through a port-forward.

The notifier charts extend the existing authenticated `/admin-api/platform/health/series` endpoint
with `panel=push_drops`, `push_queue` and `push_in_flight`; range and response shape are unchanged.
Every drop point estimates its preceding five minutes, not the full selected range. No samples
remain no-data. Queue capacity and the active-job limit are exported separately as
`notifier_queue_capacity` and `notifier_in_flight_limit`. These panels read aggregate telemetry,
never message content, device tokens or recipients, and require no new secrets or permissions.
