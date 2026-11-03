# api

Summary: the REST API and owner of the relational data (Postgres), in Rust.

| | |
|---|---|
| Repository | `discordy-voics/api` |
| Image | `ghcr.io/discordy-voics/api` (namespace `voics-apps`, port 8080) |
| Tech | Rust 1.99, axum 0.8, sqlx, Postgres 17 |
| Owns | Postgres database `discordy` (migrations in `migrations/`), Valkey `rl:*` and `cache:*` (reads the gateway's `presence:*` for the invite online count), MinIO bucket `discordy-assets` |
| Publishes | `discordy.guild.v1`, `discordy.user.v1`, `discordy.interaction.v1`, `discordy.audit.v1` through a transactional outbox |
| Catalog entry | [Service catalog: api](../services/catalog.md#api) |

## What it does

Accounts, users and settings, DMs, relationships, devices and MLS key packages, guilds, channels, roles and permissions, members, bans, invites, emojis, audit log, applications and bots, slash commands, interactions and webhooks. It also serves the internal `/internal/v1` endpoints used by the gateway, messages and admin-bff (header `X-Internal-Token`).

### Login sessions and remote logout

Every login (register, login, login with a second factor) creates a session: one refresh-token family, with the client and OS parsed from the `User-Agent`, an approximate location only when the edge sends a country (`CF-IPCountry`; nothing otherwise, no IP is stored) and a last-used time that moves on every token refresh. `GET /users/@me/sessions` lists the caller's live sessions, most recently used first, with `current` set on the one making the request. `DELETE /users/@me/sessions/{session_id}` logs out one other session (400 `CANNOT_REVOKE_CURRENT_SESSION` for the current one, which uses `POST /auth/logout`; 404 for unknown or foreign ids) and `POST /users/@me/sessions/logout-all` logs out every session except the current one.

Revoking takes effect at once: every request checks the session row, so its access tokens stop working immediately and its refresh token is rejected. The api also publishes the bus-only `SESSION_REVOKE` event (topic `discordy.user.v1`, `{session_ids}`, targeted at the user) and the gateway closes the live connections of those sessions with 4004, which the client treats as a sign-out. All revocation paths publish it: these routes, logout, password reset, disabling or deleting the account and an admin suspension. The encrypted-message device bound to a revoked session is removed unless another live session still holds it.

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
