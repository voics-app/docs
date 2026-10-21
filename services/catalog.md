# Service catalog

This catalog lists every deployable unit in Discordy. Ports, env vars, topics and images come from the pinned interfaces (P1–P11) in the master plan, so change them there first.

Each production service:

- Exposes `GET /healthz`, `GET /readyz` and `GET /metrics`.
- Is scraped by VictoriaMetrics under **its own job name**, which the admin health page groups by (`count by (job) (up)`): `api`, `messages`, `gateway`, `voice-signaling` (port 4100), `sfu` (port 4102) and `admin-bff`. On the cluster these jobs live in `gitops/infrastructure/controllers/victoria-metrics/helmrelease.yaml` (`server.scrape.extraScrapeConfigs`), and the pods set `prometheus.io/scrape: "false"` so the generic `kubernetes-pods` job does not count them twice. Locally they live in `gitops/local/victoriametrics/scrape.yml`. A new service needs a job here too, and its name must match `PLATFORM_SERVICES` in `admin/bff/src/domain/service_health.rs`.
- Logs JSON to stdout.
- Exports OpenTelemetry data when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.

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
| [api](#api) | `api` | `ghcr.io/discordy-voics/api` | 8080 | `voics-apps` | 99.5 % |
| [messages](#messages) | `messages` | `ghcr.io/discordy-voics/messages` | 8082 | `voics-apps` | 99.5 % |
| [gateway](#gateway) | `gateway` | `ghcr.io/discordy-voics/gateway` | 4000 | `voics-apps` | 99.5 % |
| [voice-signaling](#voice-signaling) | `voice` | `ghcr.io/discordy-voics/voice-signaling` | 4100 | `voics-voice` | 99.0 % per region |
| [sfu](#sfu) | `voice` | `ghcr.io/discordy-voics/voice-sfu` | UDP 50000, TCP 127.0.0.1:4101 | `voics-voice` | 99.0 % per region |
| [admin-bff](#admin-bff--admin-web) | `admin` | `ghcr.io/discordy-voics/admin-bff` | 8090 | `voics-apps` | 99.0 % |
| [admin-web](#admin-bff--admin-web) | `admin` | served by admin-bff | 5174 (dev only) | — | — |
| [client](#desktop-client) | `client` | installers on the update feed | 5173 (dev renderer) | user devices | — |
| [bots-sdk](#bots-sdk) | `bots-sdk` | npm `@discordy-voics/bots` | — | — | — |
| [contracts](#contracts) | `contracts` | npm `@discordy-voics/contracts`, crate `discordy-contracts` | — | — | — |

## api

| | |
|---|---|
| Purpose | Auth, users, devices and MLS key packages, relationships, per-guild notification settings and private user notes, guilds, channels, roles and permissions, invites, applications and bots, slash commands, interactions, webhooks, admin endpoints. Transactional outbox to Redpanda. |
| Repo / image | `discordy-voics/api` / `ghcr.io/discordy-voics/api` |
| Tech | Rust, axum 0.8, sqlx, Postgres 17 |
| Ports | 8080: public `/api/v1/*` (via `discordy-api.voics.nl`) and internal `/internal/v1/*` (cluster only) |
| Owns data | Postgres DB `discordy` (migrations in `api/migrations`); Valkey `rl:*` and `cache:*`; MinIO bucket `discordy-assets` |
| Publishes | `discordy.guild.v1`, `discordy.user.v1`, `discordy.interaction.v1`, `discordy.audit.v1`; TYPING_START on `discordy.message.v1` |
| Depends on | Postgres, Valkey, Redpanda, MinIO, messages (internal) |
| Called by | client, bots, messages, gateway, admin-bff |
| Snowflake workers | 0–63 |
| Env vars | common + `DATABASE_URL` 🔒, `VALKEY_URL` 🔒, `JWT_PRIVATE_KEY` 🔒, `PUBLIC_API_URL`, `PUBLIC_GATEWAY_URL`, `CDN_PUBLIC_URL`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY` 🔒, `MINIO_SECRET_KEY` 🔒, `MINIO_BUCKET_ASSETS`, `MESSAGES_INTERNAL_URL` |
| SLOs | Availability 99.5 %; p95 latency < 150 ms for reads and < 300 ms for writes; outbox publish lag p99 < 2 s |
| Runbooks | [backup-restore](../runbooks/backup-restore.md), [secret-rotation](../runbooks/secret-rotation.md) (JWT keys, DB password), [release](../runbooks/release.md) |

## messages

| | |
|---|---|
| Purpose | Standard messages: CRUD, history, reactions, pins, read states, attachments (alt text, spoiler flag), link unfurling (OpenGraph/oEmbed, SSRF-guarded, [ADR 0018](../adr/0018-link-unfurling-and-media-proxy.md)) and the embed media proxy. Needs outbound internet on 80/443. Request coalescing; consistent-hash routing on `channel_id`. |
| Repo / image | `discordy-voics/messages` / `ghcr.io/discordy-voics/messages` |
| Tech | Rust, axum 0.8, scylla driver |
| Ports | 8082: public (ingress routes `/api/v1/channels/*/messages*` and the CDN host's `/attachments/*` signed downloads and `/external/*` signed media proxy here) and internal |
| Owns data | ScyllaDB keyspace `discordy` (messages, reactions, pins, read_states, channel_last_message); MinIO bucket `discordy-attachments` |
| Publishes | `discordy.message.v1` (keyed by `channel_id`) |
| Depends on | ScyllaDB, Redpanda, MinIO, api (`/internal/v1/channels/{id}/access/{user}` with a 5 s cache; bot token introspection with a 60 s cache) |
| Called by | client, bots, api, gateway, admin-bff |
| Snowflake workers | 64–127 |
| Env vars | common + `SCYLLA_NODES`, `SCYLLA_KEYSPACE`, `API_INTERNAL_URL`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY` 🔒, `MINIO_SECRET_KEY` 🔒, `MINIO_BUCKET_ATTACHMENTS`, `CDN_PUBLIC_URL`, `ATTACHMENT_SIGNING_KEY` 🔒, `ATTACHMENT_URL_TTL_SECONDS` |
| SLOs | Availability 99.5 %; history p95 < 100 ms; send p95 < 200 ms; send-to-dispatch p95 < 500 ms (with the gateway) |
| Runbooks | [backup-restore](../runbooks/backup-restore.md#scylladb), [release](../runbooks/release.md) |

## gateway

| | |
|---|---|
| Purpose | Client WebSocket protocol (P7), sessions, guild processes, presence, typing, fan-out, E2EE inbox relay, P2P signaling relay, voice-server allocation, Watch Together relay, telemetry. |
| Repo / image | `discordy-voics/gateway` / `ghcr.io/discordy-voics/gateway` |
| Tech | Elixir 1.20 / OTP 29, Phoenix 1.8, brod, Redix, eetcd, libcluster |
| Ports | 4000: WS `/gateway` (via `discordy-gateway.voics.nl`) and internal HTTP `/internal/v1/*`; Erlang distribution inside the cluster through a headless service |
| Owns data | Valkey `gw:*`, `e2ee:*`, `voice:*`, `presence:*` |
| Consumes | every `discordy.*.v1` topic (one consumer group per topic) |
| Publishes | `discordy.telemetry.v1` |
| Depends on | Valkey, etcd, Redpanda, api (internal), messages (internal) |
| Called by | client, bots, admin-bff |
| Snowflake workers | 128–191 |
| Env vars | common + `VALKEY_URL` 🔒, `ETCD_ENDPOINTS`, `API_INTERNAL_URL`, `MESSAGES_INTERNAL_URL`, `VOICE_TOKEN_SECRET` 🔒, `PUBLIC_GATEWAY_URL`, `DEFAULT_VOICE_REGION`, `RELEASE_COOKIE` 🔒, `CLUSTER_DNS_QUERY` |
| SLOs | Availability 99.5 % (successful IDENTIFY → READY); READY p95 < 1 s; dispatch fan-out p95 < 250 ms after consumption; consumer lag p99 < 5 s |
| Runbooks | [voice failover](../runbooks/voice-regions/failover.md), [draining a region](../runbooks/voice-regions/draining-a-region.md), [secret-rotation](../runbooks/secret-rotation.md) (`VOICE_TOKEN_SECRET`, `RELEASE_COOKIE`) |

## voice-signaling

| | |
|---|---|
| Purpose | Voice WebSocket (P8), room registry, speaking relay, DAVE MLS relay (external sender), etcd lease registration and load reporting, drain mode, SFU supervision with session replay. |
| Repo / image | `discordy-voics/voice` (`signaling/`) / `ghcr.io/discordy-voics/voice-signaling` |
| Tech | Elixir, Phoenix (no Ecto), eetcd |
| Ports | 4100: WS `/voice` (via `discordy-rtc-<region>.voics.nl`). Runs with `hostNetwork` in the same pod as the SFU. |
| Owns data | etcd `/discordy/voice/nodes/<region>/<node_id>` (10 s lease, refreshed every 3 s) |
| Publishes | `discordy.telemetry.v1` (VOICE_QUALITY) |
| Depends on | sfu (local control socket), etcd, Redpanda |
| Called by | client |
| Snowflake workers | 192–255 |
| Env vars | common + `VOICE_REGION`, `VOICE_NODE_ID`, `VOICE_PUBLIC_WS_URL`, `VOICE_PUBLIC_IP`, `VOICE_UDP_PORT`, `ETCD_ENDPOINTS`, `VOICE_TOKEN_SECRET` 🔒, `SFU_CONTROL_ADDR` |
| SLOs | Availability 99.0 % per region (voice WS handshake success); join-to-first-audio p95 < 1.5 s; lease never missed for more than 10 s outside drains |
| Runbooks | [adding a region](../runbooks/voice-regions/adding-a-region.md), [draining](../runbooks/voice-regions/draining-a-region.md), [failover](../runbooks/voice-regions/failover.md), [troubleshooting](../runbooks/voice-regions/troubleshooting.md) |

## sfu

| | |
|---|---|
| Purpose | Selective forwarding unit: UDP mux on one port, ICE-lite, DTLS-SRTP, audio forwarding, simulcast/SVC layer selection, RTP rewriting, RTCP and bandwidth estimation, speaking detection. |
| Repo / image | `discordy-voics/voice` (`sfu/`) / `ghcr.io/discordy-voics/voice-sfu` |
| Tech | Rust, str0m, tokio |
| Ports | UDP 50000 (public, port-forwarded); control on TCP `127.0.0.1:4101` (NDJSON, loopback only) |
| Depends on | nothing external; controlled by voice-signaling |
| Env vars | `SFU_UDP_BIND`, `SFU_PUBLIC_IP`, `SFU_CONTROL_BIND`, `LOG_LEVEL`, `OTEL_EXPORTER_OTLP_ENDPOINT` |
| SLOs | Forwarding added latency p99 < 10 ms; SFU restart to sessions rebuilt < 3 s |
| Runbooks | [troubleshooting](../runbooks/voice-regions/troubleshooting.md), [failover](../runbooks/voice-regions/failover.md#sfu-crash) |

## admin-bff / admin-web

| | |
|---|---|
| Purpose | **admin-bff:** admin backend with Cloudflare Access JWT verification plus an email allowlist, a usage aggregator (counters only, never content), proxying of P4 admin stats, VictoriaMetrics queries, the voice-node view, drain/undrain, user suspension, feature flags and an admin audit log. **admin-web:** the SPA, served by the BFF. |
| Repo / image | `discordy-voics/admin` / `ghcr.io/discordy-voics/admin-bff` (bundles the built admin-web) |
| Tech | Rust, axum, sqlx (BFF); React, TypeScript, Vite, Recharts (web) |
| Ports | 8090 (`/admin-api/*` and the SPA, via `discordy-admin.voics.nl` behind Cloudflare Access); 5174 for the web dev server |
| Owns data | Postgres DB `discordy_admin` (usage rollups, feature_flags, admin_audit) |
| Consumes | every `discordy.*.v1` topic (counters only) |
| Depends on | Postgres, Redpanda, VictoriaMetrics, etcd, api / messages / gateway (internal) |
| Env vars | common + `ADMIN_DATABASE_URL` 🔒, `API_INTERNAL_URL`, `VICTORIAMETRICS_URL`, `ETCD_ENDPOINTS`, `ADMIN_ALLOWED_EMAILS` |
| SLOs | Availability 99.0 %; dashboards p95 < 1 s; rollups lag < 2 min |
| Runbooks | [draining a region](../runbooks/voice-regions/draining-a-region.md), [cloudflare-setup](../runbooks/cloudflare-setup.md#cloudflare-access) |

## Desktop client

| | |
|---|---|
| Purpose | End-user Electron app: chat, voice, video, screen share, Watch Together, the three delivery modes. |
| Repo / artefact | `discordy-voics/client` / NSIS installer (Windows), dmg (macOS), AppImage/deb (Linux), published to the MinIO `updates` bucket at `discordy-updates.voics.nl` |
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
| Repo / artefact | `discordy-voics/bots-sdk` / npm `@discordy-voics/bots` (GitHub Packages) |
| Depends on | contracts, public api and gateway |
| Runbooks | [release](../runbooks/release.md) |

## contracts

| | |
|---|---|
| Purpose | Source of truth for REST (OpenAPI 3.1), gateway, voice and event JSON Schemas, permission and intent constants. Generates the TS, Rust and Elixir packages. |
| Repo / artefact | `discordy-voics/contracts` / npm `@discordy-voics/contracts`, Rust crate `discordy-contracts` (git tag), Elixir `Discordy.Contracts` |
| Runbooks | [release](../runbooks/release.md); human-readable copies in [protocols](../protocols/README.md) |

## Infrastructure components

| Component | Namespace | Ports | Used by | Runbook |
|---|---|---|---|---|
| Postgres 17 (CloudNativePG) | `voics-data` | 5432 | api, admin-bff | [backup-restore](../runbooks/backup-restore.md#postgres) |
| ScyllaDB (developer mode) | `voics-data` | 9042 | messages | [backup-restore](../runbooks/backup-restore.md#scylladb) |
| Redpanda | `voics-data` | 9092 internal, 19092 external, 9644 admin | api, messages, gateway, voice, admin-bff | [backup-restore](../runbooks/backup-restore.md#redpanda) |
| Valkey 8 (AOF) | `voics-data` | 6379 | api, gateway | [backup-restore](../runbooks/backup-restore.md#valkey) |
| etcd 3.6 | `voics-data` | 2379 | voice-signaling, gateway, admin-bff | [backup-restore](../runbooks/backup-restore.md#etcd) |
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
