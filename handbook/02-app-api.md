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

Accounts, users and settings, DMs, relationships, devices and MLS key packages, guilds, channels, roles and permissions, members, bans, invites, emojis, audit log, reports of messages and users, applications and bots, slash commands, interactions and webhooks. It also serves the internal `/internal/v1` endpoints used by the gateway, messages and admin-bff (header `X-Internal-Token`).

### Login sessions and remote logout

Every login (register, login, login with a second factor) creates a session: one refresh-token family, with the client and OS parsed from the `User-Agent`, an approximate location only when the edge sends a country (`CF-IPCountry`; nothing otherwise, no IP is stored) and a last-used time that moves on every token refresh. `GET /users/@me/sessions` lists the caller's live sessions, most recently used first, with `current` set on the one making the request. `DELETE /users/@me/sessions/{session_id}` logs out one other session (400 `CANNOT_REVOKE_CURRENT_SESSION` for the current one, which uses `POST /auth/logout`; 404 for unknown or foreign ids) and `POST /users/@me/sessions/logout-all` logs out every session except the current one.

Revoking takes effect at once: every request checks the session row, so its access tokens stop working immediately and its refresh token is rejected. The api also publishes the bus-only `SESSION_REVOKE` event (topic `discordy.user.v1`, `{session_ids}`, targeted at the user) and the gateway closes the live connections of those sessions with 4004, which the client treats as a sign-out. All revocation paths publish it: these routes, logout, password reset, disabling or deleting the account and an admin suspension. The encrypted-message device bound to a revoked session is removed unless another live session still holds it.

### Push tokens

The mobile app registers its APNs (or FCM) token with `POST /users/@me/devices/push` `{platform, token, environment?, previews?, only_mentions?}` and removes it with `DELETE` on the same path. There is one token per login session: registering again replaces it, a token that shows up on another session moves there, and a user keeps at most 20. A token is removed with its session (logout, remote revoke, logout everywhere, suspension), with its encrypted-message device, when the notifier reports that the provider rejected it, and by the stale-device prune when it was not refreshed for `DEVICE_MAX_IDLE_DAYS`. For the notifier, `GET /internal/v1/channels/{id}/push-targets?author_id=` lists the members who can view the channel, are not the author and hold a token on a live session, with their effective notification level and mute (channel, category, guild, server default), suppression flags, roles, and whether they have a live gateway session; `DELETE /internal/v1/push-tokens` removes a rejected token. See the [push notifications runbook](../runbooks/push-notifications.md).

### Reports

`POST /api/v1/reports` files a report of a message or a user for the Trust and Safety queue: a category, an optional note and the target. It answers 204 whether the report is new or a repeat, is limited to 10 per user per hour and is never visible to the reported user. For Standard chats the api copies the message from messages when the report is filed; for ephemeral and P2P chats the server has no copy, so the report holds only what the reporter submits. Operators review reports in the admin portal (internal routes `GET /internal/v1/admin/reports` and `POST /internal/v1/admin/reports/{id}/resolve`). Details and fields: [moderation spec](../specs/2026-10-22-moderation-tools-and-ban-purge.md#reporting-a-message-or-a-user-api126).

### Group DMs, roles and moderation

- **Group DM size.** A group DM holds at most `GROUP_DM_MAX_PARTICIPANTS` members, the creator included (default 25, minimum 2). It is checked when a group is created and when a recipient is added; groups that already exceed a lowered value keep working. Peer-to-peer delivery stays limited to 10 members whatever this is set to. The desktop client has its own limit constant (`MAX_GROUP_DM_MEMBERS`) that must follow the default. Voice has no member limit of its own for group DM calls.
- **Duplicate a role.** `POST /guilds/{id}/roles/{role_id}/duplicate` creates "X (copy)" with the same permissions, colour, hoist, mentionable flag and icon, directly below the source (the source and the roles above it move up one). It needs MANAGE_ROLES, a source below the caller's highest role (the owner is exempt) and only permissions the caller holds; `@everyone` cannot be duplicated, and the copy is never a managed role. It writes a ROLE_CREATE audit entry and publishes ROLE_CREATE plus ROLE_UPDATE for the shifted roles.
- **Prune restriction.** The guild setting `prune_admin_only` (set with `PATCH /guilds/{id}`, needs MANAGE_GUILD, audit logged as a guild update change) is stored and returned on the guild object and enforced by the member prune endpoints.
- **Member prune.** `GET /guilds/{id}/prune?days=&include_roles=` counts (dry run) and `POST /guilds/{id}/prune` (body `{days, include_roles}`) removes the members who joined more than `days` ago (1-30, default 7), have no login session used within that window and hold no role besides the included ones. The owner, bots and members the caller does not outrank are never pruned. Both return `{pruned}`. KICK_MEMBERS is required, or ADMINISTRATOR when `prune_admin_only` is on. One MEMBER_PRUNE (21) audit entry records `delete_member_days` and `members_removed`.
- **Members who left.** The ban list and the audit log keep returning user summaries for banned and kicked users, because they read the users table rather than the member list. `GET /guilds/{id}/audit-logs?target_id=` returns only the entries about one user, which is what a moderation view of a former member needs; `GET /guilds/{id}/bans/{user_id}` returns the ban and its reason.

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
