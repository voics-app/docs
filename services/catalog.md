# Service catalog

## Proposed scheduled-message extension

[ADR 0028](../adr/0028-scheduled-message-dispatch.md) proposes a scheduler inside
the existing messages service, using the existing Scylla cluster and a dedicated
vnode keyspace. This is not deployed or implemented. It adds no server, port or
secret. Proposed settings are `SCHEDULED_MESSAGES_ENABLED` (default false) and
`SCYLLA_SCHEDULED_MESSAGE_KEYSPACE` (default `<SCYLLA_KEYSPACE>_scheduled`). Public
routes stay beneath `/channels/{id}/messages/scheduled` on the messages port.

Enablement requires competing-worker/race/fault tests, paired message/journal
backup and restore fencing. Metrics must expose pending/due age, dispatch results,
dependency retries, uncertain outcomes and stale-index cleanup without author,
channel, schedule or message IDs as labels. No new delivery SLO is claimed.

This catalog lists every deployable unit in Voics. Ports, env vars, topics and images come from the pinned interfaces (P1–P11) in the master plan, so change them there first.

Each production service:

- Exposes `GET /healthz`, `GET /readyz` and `GET /metrics`.
- Is scraped by VictoriaMetrics under **its own job name**, which the admin health page groups by (`count by (job) (up)`): `api`, `messages`, `notifier` (port 8085, singleton/Recreate, see [push notifications](../runbooks/push-notifications.md)), `gateway`, `voice-signaling` (port 4100), `sfu` (port 4102) and `admin-bff`. On the cluster these jobs live in `gitops/infrastructure/controllers/victoria-metrics/helmrelease.yaml` (`server.scrape.extraScrapeConfigs`), and the pods set `prometheus.io/scrape: "false"` so the generic `kubernetes-pods` job does not count them twice. Locally they live in `gitops/local/victoriametrics/scrape.yml`. A new service needs a job here too, and its name must match `PLATFORM_SERVICES` in `admin/bff/src/domain/service_health.rs`.
- Exports the **standard metric set** below (one naming scheme for every service; the `job` label identifies the service, so metric names carry no service prefix).
- Logs JSON to stdout.
- Exports OpenTelemetry data when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.

**Standard metrics** (the admin platform-health tiles query these; do not rename without updating `admin/bff/src/infrastructure/victoria/platform_metrics.rs`):

| Metric | Type | Labels | Exported by |
|---|---|---|---|
| `http_requests_total` | counter | `method`, `route` (matched template, `unmatched` / `/*_path` for the rest), `status` (class: `1xx`..`5xx`) | api, messages, gateway, admin-bff |
| `http_request_duration_seconds` | histogram | same as above | api, messages, gateway, admin-bff |
| `db_query_duration_seconds` | histogram | `operation` (`select`/`insert`/`update`/`delete`/`other` for Postgres, `read`/`write` for Scylla); messages adds `db` (`postgres`/`scylla`), api uses `db="postgres"` | api (sqlx), messages (Postgres search, Scylla) |
| `discordy_gateway_session_started_count`, `discordy_gateway_session_closed_count{code}` | counter | | gateway (WebSocket connect / close) |
| `discordy_gateway_dispatch_sent_count{event}`, `discordy_gateway_events_consumed_count{topic,outcome}` | counter | | gateway (event dispatch) |
| `discordy_gateway_gauges_sessions_local` | gauge | | gateway |
| `notifier_pushes_total` | counter | `provider`, `outcome` | notifier; admin charts `increase(...{outcome="dropped"}[5m])` by provider |
| `notifier_queue_depth`, `notifier_queue_capacity` | gauge | | notifier waiting jobs and configured capacity |
| `notifier_in_flight`, `notifier_in_flight_limit` | gauge | | notifier active jobs (including retry waits) and configured cap |
| `redpanda_kafka_consumer_group_lag_sum` / `_max` | gauge | `redpanda_group` | Redpanda `/public_metrics` (cluster property `enable_consumer_group_metrics` includes `consumer_lag`, set by the `redpanda-topics` Job in gitops) |

Histogram buckets (seconds) are identical everywhere: 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 10. WebSocket upgrades on the gateway are counted under `status="1xx"` (101). Postgres latency is taken from sqlx's per-statement `elapsed_secs` tracing events by a small tracing layer (no call-site changes); Scylla latency is measured in the shared `execute` / `fetch_all` helpers. voice-signaling and sfu are not yet covered (tracked separately).

**Common env vars** (every backend service):

| Variable | Notes |
|---|---|
| `DISCORDY_ENV` | `local` \| `production` |
| `LOG_LEVEL` | |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | optional |
| `INTERNAL_SERVICE_TOKEN` | secret, sent as the `X-Internal-Token` header |
| `JWT_PUBLIC_KEY` | Ed25519 PEM |
| `SNOWFLAKE_WORKER_ID` | within the ranges in P5 |
| `KAFKA_BROKERS` | |

Rows marked 🔒 are secrets. See the [secrets inventory](../secrets/README.md).

**Ownership.** Every repository is owned by `@oussamaelhajoui` (the platform owner), and the code owner for each repository is set in its `CODEOWNERS` file.

**SLOs** are measured monthly over a 28-day window and use metrics stored in VictoriaMetrics. Error budgets burn on 5xx responses, failed WebSocket handshakes and unavailable readiness.

## Summary

| Service | Repo | Image | Ports | Namespace | Availability SLO |
|---|---|---|---|---|---|
| [api](#api) | `api` | `ghcr.io/voics-app/api` | 8080 | `voics-apps` | 99.5 % |
| [messages](#messages) | `messages` | `ghcr.io/voics-app/messages` | 8082 | `voics-apps` | 99.5 % |
| [notifier](#notifier) | `messages` | `ghcr.io/voics-app/messages-notifier` | 8085 | `voics-apps` | 99.0 % while enabled |
| [gateway](#gateway) | `gateway` | `ghcr.io/voics-app/gateway` | 4000 | `voics-apps` | 99.5 % |
| [voice-signaling](#voice-signaling) | `voice` | `ghcr.io/voics-app/voice-signaling` | 4100 | `voics-voice` | 99.0 % per region |
| [sfu](#sfu) | `voice` | `ghcr.io/voics-app/voice-sfu` | UDP 50000, TCP 127.0.0.1:4101 | `voics-voice` | 99.0 % per region |
| [admin-bff](#admin-bff--admin-web) | `admin` | `ghcr.io/voics-app/admin-bff` | 8090 | `voics-apps` | 99.0 % |
| [admin-web](#admin-bff--admin-web) | `admin` | served by admin-bff | 5174 (dev only) | — | — |
| [client](#desktop-client) | `client` | installers on the update feed | 5173 (dev renderer) | user devices | — |
| [bots-sdk](#bots-sdk) | `bots-sdk` | npm `@voics-app/bots` | — | — | — |
| [contracts](#contracts) | `contracts` | npm `@voics-app/contracts`, crate `discordy-contracts` | — | — | — |

## api

| | |
|---|---|
| Purpose | Auth (login, email verification, password recovery, TOTP two-factor with backup codes), account disable and delete, users, devices, push tokens (APNs and FCM, one per login session) and MLS key packages, relationships, per-guild notification settings and private user notes, reports of messages and users (`POST /api/v1/reports`, review through the internal admin routes), guilds, channels, roles and permissions, invites, applications and bots, slash commands, interactions, webhooks, admin endpoints. Transactional outbox to Redpanda. |
| Repo / image | `voics-app/api` / `ghcr.io/voics-app/api` |
| Tech | Rust, axum 0.8, sqlx, Postgres 17 |
| Ports | 8080: public `/api/v1/*` (via `discordy-api.voics.nl`) and internal `/internal/v1/*` (cluster only) |
| Owns data | Postgres DB `discordy` (migrations in `api/migrations`; includes `reports`, [spec](../specs/2026-10-22-moderation-tools-and-ban-purge.md#reporting-a-message-or-a-user-api126)); Valkey `rl:*` and `cache:*`; MinIO bucket `discordy-assets` |
| Publishes | `discordy.guild.v1`, `discordy.user.v1`, `discordy.interaction.v1`, `discordy.audit.v1`; TYPING_START on `discordy.message.v1` |
| Depends on | Postgres, Valkey, Redpanda, MinIO, messages (internal; also `GET /internal/v1/channels/{id}/messages/{mid}` to copy a reported message) |
| Called by | client, bots, messages, gateway, admin-bff |
| Snowflake workers | Intended API range 0–63; production currently uses a fixed worker ID. Per-process allocation is not yet proven safe; see [replica constraints](../runbooks/server-uitbreiden.md#7-replicas-wat-kan-later-omhoog) |
| Env vars | common + `DATABASE_URL` 🔒, `VALKEY_URL` 🔒, `JWT_PRIVATE_KEY` 🔒, `PUBLIC_API_URL`, `PUBLIC_GATEWAY_URL`, `CDN_PUBLIC_URL`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY` 🔒, `MINIO_SECRET_KEY` 🔒, `MINIO_BUCKET_ASSETS`, `MESSAGES_INTERNAL_URL`, `MAIL_TRANSPORT` (`log` or `smtp`), `SMTP_HOST`, `SMTP_PORT`, `SMTP_TLS`, `SMTP_USERNAME` 🔒, `SMTP_PASSWORD` 🔒, `MAIL_FROM`, `APP_LINK_BASE`, `ACCOUNT_DELETION_RETENTION_DAYS`, `ACCOUNT_PURGE_INTERVAL_SECS` (see [account security](../specs/2026-10-21-account-security-and-mfa.md)) |
| SLOs | Availability 99.5 %; p95 latency < 150 ms for reads and < 300 ms for writes; outbox publish lag p99 < 2 s |
| Runbooks | [backup-restore](../runbooks/backup-restore.md), [secret-rotation](../runbooks/secret-rotation.md) (JWT keys, DB password), [release](../runbooks/release.md) |

## messages

| | |
|---|---|
| Purpose | Standard messages: CRUD, history, reactions, pins, read states, attachments (alt text, spoiler flag), full-text search ([ADR-0018](../adr/0018-message-search-postgres-fts.md)), link unfurling (OpenGraph/oEmbed, SSRF-guarded, [ADR 0019](../adr/0019-link-unfurling-and-media-proxy.md)) and the embed media proxy. Needs outbound internet on 80/443. Internal `GET /internal/v1/channels/{id}/messages/{mid}` serves one stored message to api for reports. Request coalescing; consistent-hash routing on `channel_id`. |
| Repo / image | `voics-app/messages` / `ghcr.io/voics-app/messages` |
| Tech | Rust, axum 0.8, scylla driver |
| Ports | 8082: public (ingress routes `/api/v1/channels/*/messages*`, `/api/v1/guilds/*/messages/search` and the CDN host's `/attachments/*` signed downloads and `/external/*` signed media proxy here) and internal |
| Owns data | ScyllaDB keyspace `discordy` (messages, reactions, pins, read_states discovery, channel_last_message) plus the proposed companion vnode keyspace `<SCYLLA_KEYSPACE>_reads` (atomic read metadata/ledger/contributions, same replication; paired backups required); MinIO bucket `discordy-attachments`; Postgres database `discordy_search` (`search_messages` index, `search_offsets`, `search_state`; rebuildable, text not stored) |
| Publishes | `discordy.message.v1` (keyed by `channel_id`) |
| Consumes | `discordy.message.v1` (all partitions, own offsets in Postgres) to keep the search index current; `discordy.guild.v1` `BAN_MESSAGE_PURGE` (offsets in the same Postgres, start at the end of the topic) to purge a banned user's recent messages, see [spec](../specs/2026-10-22-moderation-tools-and-ban-purge.md) |
| Depends on | ScyllaDB, Redpanda, MinIO, Postgres (search, optional), api (`/internal/v1/channels/{id}/access/{user}` with a 5 s cache; bot token introspection with a 60 s cache) |
| Called by | client, bots, api, gateway, admin-bff |
| Snowflake workers | Intended messages range 64–127; fixed worker IDs must not be duplicated across concurrent replicas |
| Env vars | common + `SCYLLA_NODES`, `SCYLLA_KEYSPACE`, `SCYLLA_READ_STATE_KEYSPACE` (distinct same-cluster companion, defaults to `<SCYLLA_KEYSPACE>_reads`), `API_INTERNAL_URL`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY` 🔒, `MINIO_SECRET_KEY` 🔒, `MINIO_BUCKET_ATTACHMENTS`, `CDN_PUBLIC_URL`, `ATTACHMENT_SIGNING_KEY` 🔒, `ATTACHMENT_URL_TTL_SECONDS`, `SEARCH_DATABASE_URL` 🔒 (search is disabled when unset), `SEARCH_BACKFILL_ON_START` |
| SLOs | Availability 99.5 %; search p95 < 300 ms; history p95 < 100 ms; send p95 < 200 ms; send-to-dispatch p95 < 500 ms (with the gateway) |
| Read-accounting prerequisite | Token-independent uncached API recipient directory (contracts#44/API#146); coordinated old-writer drain, both-keyspace readiness and backups; [rollout and rollback](../runbooks/read-accounting.md) |
| Proposed polls prerequisite | [ADR0029](../adr/0029-persistent-polls.md): optional `POLLS_ENABLED=false` and `SCYLLA_POLL_KEYSPACE` (defaults to `<SCYLLA_KEYSPACE>_polls`, same-cluster vnode companion with matching replication). Before enabling, ship poll routes at `/api/v1/channels/*/polls/*`, fresh API access, intent/content-aware gateway and version-aware clients. Include main/poll keyspaces in one drained backup/restore procedure; no new secret or production expiry SLO is introduced. |
| Runbooks | [backup-restore](../runbooks/backup-restore.md#scylladb), [release](../runbooks/release.md) |

## notifier

| | |
|---|---|
| Purpose | APNs/FCM message push and native call notifications. Applies mute, level, mention and device preferences; a live gateway socket alone does not suppress push because mobile background sockets can linger. Private/unknown modes carry no message text. Bounded queue, in-flight cap, retries and counted drops ([push runbook](../runbooks/push-notifications.md)) |
| Repo / image | `voics-app/messages` (second binary `bin/notifier`) / `ghcr.io/voics-app/messages-notifier` |
| Tech | Rust, reqwest (HTTP/2), jsonwebtoken (ES256), rskafka |
| Ports | 8085: `/healthz`, `/readyz` (Redpanda), `/metrics` |
| Owns data | None. Device tokens live in the api's Postgres (`push_tokens`). |
| Consumes | `discordy.message.v1` (all partitions, from the end of the topic, no stored offset: run exactly one replica) |
| Depends on | Redpanda, api (`/internal/v1/channels/{id}/push-targets`, `DELETE /internal/v1/push-tokens`), configured APNs/FCM providers |
| Called by | admin-bff for authenticated internal manual push |
| Env vars | `KAFKA_BROKERS`, `API_INTERNAL_URL`, `INTERNAL_SERVICE_TOKEN` 🔒, `APNS_KEY_FILE` (mounted `.p8`, from `APNS_KEY` 🔒), `APNS_KEY_ID` 🔒, `APNS_TEAM_ID` 🔒, `APNS_TOPIC`, `APNS_ENVIRONMENT`, `NOTIFIER_FCM_SERVICE_ACCOUNT` 🔒 (or local `FCM_SERVICE_ACCOUNT_FILE`), `PUSH_QUEUE_CAPACITY`, `PUSH_MAX_IN_FLIGHT`, `PUSH_MAX_ATTEMPTS`, `PUSH_BASE_BACKOFF_MS`, `PUSH_MAX_BACKOFF_MS`, `PUSH_MAX_EVENT_AGE_SECS`, `PUSH_DEDUPE_CAPACITY` |
| Deployment | One replica, `Recreate`; independently verified 1/1 Ready on v0.15.0 with synced APNs/FCM ExternalSecrets on 18 November 2026. Actual device delivery remains separate acceptance |
| Runbooks | [push-notifications](../runbooks/push-notifications.md), [secret-rotation](../runbooks/secret-rotation.md#apns-key) |

## gateway

| | |
|---|---|
| Purpose | Client WebSocket protocol (P7), sessions, guild processes, presence, typing, fan-out, E2EE inbox relay, P2P signaling relay, voice-server allocation, Watch Together relay, telemetry. |
| Repo / image | `voics-app/gateway` / `ghcr.io/voics-app/gateway` |
| Tech | Elixir 1.20 / OTP 29, Phoenix 1.8, brod, Redix, eetcd, libcluster |
| Ports | 4000: WS `/gateway` (via `gateway.voics.nl`, old alias retained) and internal HTTP `/internal/v1/*`; Erlang distribution inside the cluster through a headless service |
| Owns data | Valkey `gw:*`, `e2ee:*`, `voice:*`, `presence:*` |
| Consumes | every `discordy.*.v1` topic (one consumer group per topic) |
| Publishes | `discordy.telemetry.v1` |
| Depends on | Valkey, etcd, Redpanda, api (internal), messages (internal) |
| Called by | client, bots, admin-bff |
| Runtime IDs | UUIDv4 session IDs and UUIDv7 event IDs; the legacy Snowflake setting is not a runtime allocator |
| Cluster readiness | `discordy_gateway_cluster_ready`; DNS, distribution and session-directory membership gate new admission and ingestion with retryable 4015. Does not make in-flight fan-out transactional ([cluster runbook](../runbooks/gateway-cluster.md)) |
| Env vars | common + `VALKEY_URL` 🔒, `ETCD_ENDPOINTS`, `API_INTERNAL_URL`, `MESSAGES_INTERNAL_URL`, `VOICE_TOKEN_SECRET` 🔒, `PUBLIC_GATEWAY_URL`, `DEFAULT_VOICE_REGION`, `RELEASE_COOKIE` 🔒, `CLUSTER_DNS_QUERY`, `MOBILE_BACKGROUND_PRESENCE_MS` (bounded mobile availability lease, default 86400000 ms) |
| SLOs | Availability 99.5 % (successful IDENTIFY → READY); READY p95 < 1 s; dispatch fan-out p95 < 250 ms after consumption; consumer lag p99 < 5 s |
| Runbooks | [voice failover](../runbooks/voice-regions/failover.md), [draining a region](../runbooks/voice-regions/draining-a-region.md), [secret-rotation](../runbooks/secret-rotation.md) (`VOICE_TOKEN_SECRET`, `RELEASE_COOKIE`) |

## voice-signaling

| | |
|---|---|
| Purpose | Voice WebSocket (P8), room registry, speaking relay, DAVE MLS relay (external sender), etcd lease registration and load reporting, drain mode, SFU supervision with session replay. |
| Repo / image | `voics-app/voice` (`signaling/`) / `ghcr.io/voics-app/voice-signaling` |
| Tech | Elixir, Phoenix (no Ecto), eetcd |
| Ports | 4100: WS `/voice` (via `rtc-<region>.voics.nl`, old alias retained). Runs with `hostNetwork` in the same pod as the SFU |
| Owns data | etcd `/discordy/voice/nodes/<region>/<node_id>` (10 s lease, refreshed every 3 s) |
| Publishes | `discordy.telemetry.v1` (VOICE_QUALITY) |
| Depends on | sfu (local control socket), etcd, Redpanda |
| Called by | client |
| Runtime identity | Explicit unique voice node/region and advertised endpoint; signaling does not generate Snowflakes. Atomic etcd claim/lease ownership merged to develop in voice PR 33 (`da80415`); duplicate public endpoints remain unsafe |
| Env vars | common + `VOICE_REGION`, `VOICE_NODE_ID`, `VOICE_PUBLIC_WS_URL`, `VOICE_PUBLIC_IP`, `VOICE_UDP_PORT`, `ETCD_ENDPOINTS`, `VOICE_TOKEN_SECRET` 🔒, `SFU_CONTROL_ADDR` |
| SLOs | Availability 99.0 % per region (voice WS handshake success); join-to-first-audio p95 < 1.5 s; lease never missed for more than 10 s outside drains |
| Runbooks | [adding a region](../runbooks/voice-regions/adding-a-region.md), [draining](../runbooks/voice-regions/draining-a-region.md), [failover](../runbooks/voice-regions/failover.md), [troubleshooting](../runbooks/voice-regions/troubleshooting.md) |

## voice-prober (prepared, inactive)

This service is defined by [ADR-0025](../adr/0025-active-voice-health-probes.md) and is not enabled by this design change. Implementation and rollout evidence remain required before deployment.

| | |
|---|---|
| Purpose | Two isolated synthetic voice peers per node test advertised WebSocket, ICE/DTLS and bidirectional RTP; publish loss/RTT and hysteresis state for allocation |
| Planned repo / image | `voics-app/voice` (`prober/`) / `ghcr.io/voics-app/voice-prober` |
| Tech | Rust, str0m, Tokio |
| Ports | HTTP `127.0.0.1:4103` by default for readiness and Prometheus; no public ingress |
| Owns data | Leased `/discordy/voice/probers/<node_id>` ownership and `/discordy/voice/health/<node_id>` observations; writes atomically compare observer ownership and node registration lease |
| Depends on | etcd, each voice node's advertised WebSocket and UDP media route |
| Identity / secrets | Explicit `VOICE_PROBER_ID` and configured synthetic IDs; separate `VOICE_PROBE_TOKEN_SECRET`, never the gateway call-signing key |
| Env vars | Exact prepared settings/defaults are listed in master plan [P2](../plans/2026-10-16-discordy-master-plan.md#p2-environment-variables) |
| Rollout | Reader/signaling support first, then independently placed prober and verified observations, then optional `VOICE_REQUIRE_PROBE=true`; no VM/server creation or activation is implied |
| Runbook | [Prepared health states and blacklist behavior](../runbooks/voice-regions/troubleshooting.md#prepared-active-health-probes) |

## sfu

| | |
|---|---|
| Purpose | Selective forwarding unit: UDP mux on one port, ICE-lite, DTLS-SRTP, audio forwarding, simulcast/SVC layer selection, RTP rewriting, RTCP and bandwidth estimation, speaking detection. |
| Repo / image | `voics-app/voice` (`sfu/`) / `ghcr.io/voics-app/voice-sfu` |
| Tech | Rust, str0m, tokio |
| Ports | UDP 50000 (public, port-forwarded); control on TCP `127.0.0.1:4101` (NDJSON, loopback only) |
| Depends on | nothing external; controlled by voice-signaling |
| Env vars | `SFU_UDP_BIND`, `SFU_PUBLIC_IP`, `SFU_CONTROL_BIND`, `LOG_LEVEL`, `OTEL_EXPORTER_OTLP_ENDPOINT` |
| SLOs | Forwarding added latency p99 < 10 ms; SFU restart to sessions rebuilt < 3 s |
| Runbooks | [troubleshooting](../runbooks/voice-regions/troubleshooting.md), [failover](../runbooks/voice-regions/failover.md#sfu-crash) |

## admin-bff / admin-web

| | |
|---|---|
| Purpose | **admin-bff:** admin backend with Cloudflare Access JWT verification plus an email allowlist, a usage aggregator (counters only, never content), proxying of P4 admin stats, VictoriaMetrics queries, the voice-node view, drain/undrain, user suspension, the Reports queue (review, resolve and dismiss reports held by api), feature flags and an admin audit log. **admin-web:** the SPA, served by the BFF. |
| Repo / image | `voics-app/admin` / `ghcr.io/voics-app/admin-bff` (bundles the built admin-web) |
| Tech | Rust, axum, sqlx (BFF); React, TypeScript, Vite, Recharts (web) |
| Ports | 8090 (`/admin-api/*` and the SPA, via `discordy-admin.voics.nl` behind Cloudflare Access); 5174 for the web dev server |
| Owns data | Postgres DB `discordy_admin` (usage rollups, feature_flags, admin_audit) |
| Consumes | every `discordy.*.v1` topic (counters only) |
| Depends on | Postgres, Redpanda, VictoriaMetrics, etcd, api / messages / gateway (internal) |
| Env vars | common + `ADMIN_DATABASE_URL` 🔒, `API_INTERNAL_URL`, `VICTORIAMETRICS_URL`, `ETCD_ENDPOINTS`, `ADMIN_ALLOWED_EMAILS` |
| SLOs | Availability 99.0 %; dashboards p95 < 1 s; rollups lag < 2 min |
| Production | v0.1.6 on gen-serv; dashboards verified against VictoriaMetrics and Redpanda, see [handbook](../handbook/02-app-admin.md#production-data-sources-verified-on-gen-serv-v016-2026-10-22) |
| Runbooks | [draining a region](../runbooks/voice-regions/draining-a-region.md), [cloudflare-setup](../runbooks/cloudflare-setup.md#cloudflare-access) |

## Desktop client

| | |
|---|---|
| Purpose | End-user Electron app: chat, voice, video, screen share, Watch Together, the three delivery modes. |
| Repo / artefact | `voics-app/client` / NSIS installer (Windows), dmg (macOS), AppImage/deb (Linux), published by gitops `publish-public` to the MinIO `discordy-updates` bucket at `updates.voics.nl` |
| Tech | Electron 38, React 19, TypeScript 5.9, Vite 7, Zustand, TanStack Query, napi-rs (OpenMLS, Ed25519, SQLCipher) |
| Ports | 5173 (renderer dev server) |
| Depends on | api, messages, gateway, voice-signaling, sfu, coturn, CDN, update feed |
| Config | `UPDATE_FEED_URL`, plus the public API, gateway and CDN URLs at build time |
| SLOs | Crash-free sessions ≥ 99.5 %; cold start < 3 s on the reference Windows laptop |
| Runbooks | [release](../runbooks/release.md#desktop-client-release), [local-development](../runbooks/local-development.md) |

## bots-sdk

| | |
|---|---|
| Purpose | TypeScript bot library: gateway client with intents and auto-resume, REST client with rate-limit buckets, slash-command builder, interactions, webhooks. Includes the example `moderation-bot`. |
| Repo / artefact | `voics-app/bots-sdk` / npm `@voics-app/bots` (GitHub Packages) |
| Depends on | contracts, public api and gateway |
| Runbooks | [release](../runbooks/release.md) |

## contracts

| | |
|---|---|
| Purpose | Source of truth for REST (OpenAPI 3.1), gateway, voice and event JSON Schemas, permission and intent constants. Generates the TS, Rust and Elixir packages. |
| Repo / artefact | `voics-app/contracts` / npm `@voics-app/contracts`, Rust crate `discordy-contracts` (git tag), Elixir `Discordy.Contracts` |
| Runbooks | [release](../runbooks/release.md); human-readable copies in [protocols](../protocols/README.md) |

## Infrastructure components

| Component | Namespace | Ports | Used by | Runbook |
|---|---|---|---|---|
| Postgres 17 (CloudNativePG) | `voics-data` | 5432 | api, admin-bff, messages (search index) | [backup-restore](../runbooks/backup-restore.md#postgres) |
| ScyllaDB (developer mode) | `voics-data` | 9042 | messages | [backup-restore](../runbooks/backup-restore.md#scylladb) |
| Redpanda | `voics-data` | 9092 internal, 19092 external, 9644 admin | api, messages, gateway, voice, admin-bff | [backup-restore](../runbooks/backup-restore.md#redpanda-en-zoekindex) |
| Valkey 8 (AOF) | `voics-data` | 6379 | api, gateway | [backup-restore](../runbooks/backup-restore.md#valkey) |
| etcd 3.6 | `voics-data` | 2379 | voice-signaling, gateway, admin-bff | [backup-restore](../runbooks/backup-restore.md#kubernetes-etcd-en-applicatie-etcd) |
| MinIO | `voics-data` | 9000 API, 9001 console | api, messages, client updates | [backup-restore](../runbooks/backup-restore.md#minio) |
| coturn | `voics-system` | UDP/TCP 3478 (port-forwarded) | client (P2P only) | [troubleshooting](../runbooks/voice-regions/troubleshooting.md) |
| cloudflared | `voics-system` | outbound only | all public hostnames | [cloudflare-setup](../runbooks/cloudflare-setup.md) |
| ingress-nginx | `voics-system` | 80/443 (cluster) | cloudflared | [cloudflare-setup](../runbooks/cloudflare-setup.md) |
| OpenBao | `voics-system` | 8200 | External Secrets Operator, secrets-sync | [openbao-unseal](../runbooks/openbao-unseal.md) |
| External Secrets Operator | `voics-system` | — | all apps | [secret-rotation](../runbooks/secret-rotation.md) |
| Actions Runner Controller | `voics-system` | — | CI heavy builds, secrets-sync | [secret-rotation](../runbooks/secret-rotation.md#arc-github-credentials) |
| Headlamp | `voics-system` | via `discordy-headlamp.voics.nl` | platform admin | [cloudflare-setup](../runbooks/cloudflare-setup.md#cloudflare-access) |
| VictoriaMetrics | `observability` | 8428 | admin-bff, Grafana | — |
| Grafana | `observability` | 3000 | platform admin | [secret-rotation](../runbooks/secret-rotation.md) |
| OpenTelemetry collector | `observability` | 4317/4318 | every service | — |
| Flux | `flux-system` | — | the cluster | [release](../runbooks/release.md#deployment-via-flux) |
