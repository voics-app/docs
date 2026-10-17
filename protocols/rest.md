# REST API

The public API is served at `https://discordy-api.voics.nl/api/v1` (locally `http://localhost:8000/api/v1`). It uses JSON with snake_case fields, and the object shapes follow Discord API v10 field names exactly. The full schema lives in `contracts/openapi/discordy.yaml`.

## Authentication

| Token | Header | Details |
|---|---|---|
| User access token | `Authorization: Bearer <jwt>` | EdDSA (Ed25519), 15 minutes. Claims: `iss: "discordy-api"`, `sub` (user ID), `sid` (session UUID), `did` (device ID), `kind: "user"`, `iat`, `exp` |
| Refresh token | body of `POST /auth/refresh` | Opaque, 256-bit, base64url. Stored hashed, rotated on every use. Reuse revokes the whole session family. |
| Bot token | `Authorization: Bot <base64url(bot_user_id)>.<random>` | Non-api services validate it with `POST /internal/v1/auth/introspect`, cached for 60 s |
| Internal | `X-Internal-Token: <INTERNAL_SERVICE_TOKEN>` | Required on every `/internal/*` call |

The introspect response has the shape `{user_id, kind: "user"|"bot", application_id|null, session_id|null}`.

## Public endpoints

All endpoints are owned by `api`, except those marked **(messages)**. The local ingress and production ingress route `/api/v1/channels/*/messages*` to the messages service.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register {email, username, password}` → `{access_token, refresh_token, user}` · `POST /auth/login {email, password, totp?}` · `POST /auth/refresh {refresh_token}` · `POST /auth/logout` |
| Devices | `POST /devices {name, identity_key_b64}` → `{device_id}` · `POST /devices/{id}/key-packages {packages}` · `GET /users/{id}/devices` · `POST /users/{id}/devices/{did}/key-packages/claim` → `{package_b64}` (atomic, single use) |
| Users | `GET/PATCH /users/@me` · `GET /users/{id}` · `GET/PATCH /users/@me/settings` (includes `default_delivery_mode`) · `GET /users/@me/channels` · `POST /users/@me/channels {recipient_ids}` · `GET/PUT/DELETE /users/@me/relationships/{id}` · `PUT /users/@me/channels/{id}/delivery-mode {mode}` |
| Guilds | `POST /guilds` · `GET/PATCH/DELETE /guilds/{id}` · `GET/POST/PATCH /guilds/{id}/channels` · `GET/POST /guilds/{id}/roles` · `PATCH/DELETE /guilds/{id}/roles/{rid}` · `GET /guilds/{id}/members` · `GET/PATCH/DELETE /guilds/{id}/members/{uid}` · `PUT/DELETE /guilds/{id}/members/{uid}/roles/{rid}` · `GET/PUT/DELETE /guilds/{id}/bans/{uid}` · `GET /guilds/{id}/audit-logs` · `GET/POST/PATCH/DELETE /guilds/{id}/emojis[/{eid}]` · `GET /guilds/{id}/invites` |
| Channels | `GET/PATCH/DELETE /channels/{id}` · `PUT/DELETE /channels/{id}/permissions/{overwrite_id}` · `POST /channels/{id}/invites` · `POST /channels/{id}/typing` · `POST /channels/{id}/threads` |
| Invites | `GET /invites/{code}` · `POST /invites/{code}` · `DELETE /invites/{code}` |
| Messages **(messages)** | `GET /channels/{id}/messages?before&after&around&limit` · `POST /channels/{id}/messages {content, nonce, attachments?, message_reference?, embeds?, components?}` · `PATCH/DELETE /channels/{id}/messages/{mid}` · `POST /channels/{id}/messages/bulk-delete` · `PUT/DELETE /channels/{id}/messages/{mid}/reactions/{emoji}/@me` · `GET/PUT/DELETE /channels/{id}/pins[/{mid}]` · `POST /channels/{id}/messages/{mid}/ack` · `POST /channels/{id}/attachments` (presigned upload URL) |
| Applications / bots | `POST /applications` · `GET/PATCH /applications/{id}` · `POST /applications/{id}/bot/reset-token` · `…/applications/{id}/commands[/{cid}]` · `…/applications/{id}/guilds/{gid}/commands[/{cid}]` · `POST /interactions/{id}/{token}/callback` · `PATCH/DELETE /webhooks/{app_id}/{token}/messages/@original` · `POST /webhooks/{app_id}/{token}` · `GET/POST /oauth2/authorize` |
| Webhooks | `POST /channels/{id}/webhooks` · `GET /guilds/{id}/webhooks` · `POST /webhooks/{id}/{token}` · `PATCH/DELETE /webhooks/{id}` |
| Voice | `GET /voice/regions` → `[{id, name, optimal}]` · `PATCH /guilds/{id} {voice_region}` |

**Delivery mode**: `POST /channels/{id}/messages` returns **409** `{code: 50160, message: "Channel uses <mode> delivery"}` when the channel's effective mode isn't `standard`. Private messages travel over gateway op 20 or op 22 instead. The resolution rules are in [ADR-0003](../adr/0003-delivery-modes.md).

## Internal endpoints

These are reachable inside the cluster only and require `X-Internal-Token`. All IDs are strings.

| Service | Endpoint | Returns |
|---|---|---|
| api | `POST /internal/v1/auth/introspect {token}` | The introspect response |
| api | `GET /internal/v1/users/{user_id}/ready` | `{user, guilds: [GuildFull], private_channels, relationships, user_settings}` |
| api | `GET /internal/v1/guilds/{guild_id}/state` | `GuildFull` (guild, roles, channels, members, voice_region) |
| api | `GET /internal/v1/channels/{channel_id}/access/{user_id}` | `{permissions, guild_id\|null, channel_type, delivery_mode, recipient_ids}`, or 403 |
| api | `GET /internal/v1/admin/stats` | `{users_total, guilds_total, channels_total, bots_total, signups_24h}` |
| api | `GET /internal/v1/admin/users?query=&limit=&after=` · `POST /internal/v1/admin/users/{id}/suspend {reason, until}` · `GET /internal/v1/admin/guilds?query=` | |
| messages | `GET /internal/v1/channels/{id}/last-message-id` | `{last_message_id}` |
| messages | `GET /internal/v1/admin/stats` | `{messages_24h, messages_by_mode: {standard, ephemeral_relayed, p2p_signaled}}` (counts only) |
| gateway | `GET /internal/v1/admin/stats` | `{sessions_online, sessions_by_node, guild_processes, voice_allocations}` |
| gateway | `POST /internal/v1/voice/nodes/{node_id}/drain` · `/undrain` | |

## Errors

Error bodies have the shape `{ "code": int, "message": string, "errors"?: object }`.

| Code | Meaning |
|---|---|
| 10003 | Unknown channel |
| 10004 | Unknown guild |
| 10008 | Unknown message |
| 10013 | Unknown user |
| 40002 | Verification required |
| 50001 | Missing access |
| 50013 | Missing permissions |
| 50035 | Invalid form body |
| 50160 | Delivery-mode conflict |
| 429 | Rate limited |

Rate-limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `X-RateLimit-Reset-After` and `X-RateLimit-Bucket`.

## Snowflakes

- **Layout**: 42 bits of milliseconds since `1767225600000` (2026-01-01T00:00:00Z), then 10 bits of worker ID, then 12 bits of sequence. Snowflakes are serialised as **decimal strings**.
- **Worker ranges**: api 0–63, messages 64–127, gateway 128–191, voice 192–255.
- **Message bucket**: `floor((snowflake >> 22) / 864_000_000)`, which is 10 days.

## Permissions

Permissions follow Discord's 64-bit bitfield, serialised as a decimal string. For example, `ADMINISTRATOR = 8`, `VIEW_CHANNEL = 1024` and `CONNECT = 1048576`. The full table is `contracts/permissions.json`.

The computation is Discord's algorithm ([C4 code view](../c4/rendered/structurizr-C4-PermissionCalculator.svg)):

1. Start from the base permissions: @everyone combined with all of the member's roles.
2. ADMINISTRATOR or guild ownership grants all permissions.
3. Apply the channel overwrites in order: the @everyone overwrite, then role denies, then role allows, then the member overwrite.
4. Strip all channel-scoped permissions when VIEW_CHANNEL is missing.

**Channel types**: 0 GUILD_TEXT, 1 DM, 2 GUILD_VOICE, 3 GROUP_DM, 4 GUILD_CATEGORY, 5 GUILD_ANNOUNCEMENT, 10/11/12 threads, 13 GUILD_STAGE_VOICE, 15 GUILD_FORUM.
