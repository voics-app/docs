# api

Summary: the REST API and owner of the relational data (Postgres), in Rust.

| | |
|---|---|
| Repository | `discordy-voics/api` |
| Image | `ghcr.io/discordy-voics/api` (namespace `voics-apps`, port 8080) |
| Tech | Rust 1.99, axum 0.8, sqlx, Postgres 17 |
| Owns | Postgres database `discordy` (migrations in `migrations/`), Valkey `rl:*` and `cache:*`, MinIO bucket `discordy-assets` |
| Publishes | `discordy.guild.v1`, `discordy.user.v1`, `discordy.interaction.v1`, `discordy.audit.v1` through a transactional outbox |
| Catalog entry | [Service catalog: api](../services/catalog.md#api) |

## What it does

Accounts, users and settings, DMs, relationships, devices and MLS key packages, guilds, channels, roles and permissions, members, bans, invites, emojis, audit log, applications and bots, slash commands, interactions and webhooks. It also serves the internal `/internal/v1` endpoints used by the gateway, messages and admin-bff (header `X-Internal-Token`).

## Folder map

| Path | What is there |
|---|---|
| `crates/domain` | Entities, permission calculator, delivery-mode resolver, Snowflakes, validation. No IO. |
| `crates/application` | Use cases and port traits, the write set (`Mutation` and `DomainEvent`). |
| `crates/infrastructure` | sqlx repositories and unit of work, outbox and relay, Kafka publisher, argon2, JWT, TOTP, Valkey rate limiter, MinIO storage, messages client. |
| `crates/interface` | axum routers, extractors, Discord-style errors, rate-limit middleware. |
| `crates/contracts` | Wire DTOs and the event envelope. |
| `bin/api` | Composition root: config, wiring, outbox relay task, telemetry, server. |
| `migrations/` | Postgres schema migrations. |
| `ARCHITECTURE.md` | Layering and the component diagram. |

## Configuration

Environment variables, validated at startup (table in the README). Secrets in the catalog are marked and come from OpenBao `kv/discordy/api`: `DATABASE_URL`, `VALKEY_URL`, `JWT_PRIVATE_KEY`, `INTERNAL_SERVICE_TOKEN`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`. See the [secrets inventory](../secrets/README.md).

## Run, test, release

```bash
cp .env.example .env && make dev     # needs the gitops/local compose stack
make test                            # unit and integration (testcontainers, Docker required)
make lint                            # rustfmt and clippy -D warnings
```

CI is `ci.yml`, which calls the shared `rust.yml` and `docker.yml`. A tag `vX.Y.Z` on `main` builds the stable image and Flux deploys it ([Release](../runbooks/release.md)).

## Operate

- Logs: `kubectl -n voics-apps logs deploy/api` (JSON). Health: `/healthz`, `/readyz`, `/metrics` (VictoriaMetrics job `api`).
- Data browsing: pgweb at `discordy-db.voics.nl` ([Ops tools](../runbooks/ops-access.md)).
- Runbooks: [backup and restore](../runbooks/backup-restore.md), [secret rotation](../runbooks/secret-rotation.md) (JWT keys, database password).
- Protocol: [REST reference](../protocols/rest.md).
