# Moderation tools and ban message purge

Status: implemented (api#52, client#62). Owner workstreams: api, messages, gateway, client.

## Ban: delete message history (api#52)

`PUT /api/v1/guilds/{id}/bans/{uid}` takes an optional JSON body `{ "delete_message_seconds": 0..604800 }`
([CreateBanRequest](../protocols/rest.md)). The client offers Discord's windows: don't delete, 1 hour, 6 hours,
12 hours, 24 hours, 3 days, 7 days.

| Step | Service | Behaviour |
| --- | --- | --- |
| 1 | api | Validates the range (above 604800 is `400 INVALID_BODY`), bans, and in the same transaction writes a `BAN_MESSAGE_PURGE` envelope to the outbox. Nothing is emitted for 0 or no body. An already banned user is a no-op. |
| 2 | Redpanda | `discordy.guild.v1`, keyed by guild id. Payload: `guild_id`, `user_id`, `channel_ids` (every non-category channel and thread at ban time, voice text chat included), `since_ms` (ban time minus the window), `delete_message_seconds`. See [BanMessagePurgeEvent](../protocols/events.md). |
| 3 | messages | `ban_purge` consumer (one task per partition). For each channel: walks the ten-day ScyllaDB buckets ([ADR 0010](../adr/0010-scylladb-bucketing.md)) from the bucket of `since_ms` up to the channel's newest message, reading ascending in pages of 500 with an exclusive id bound, and keeps messages authored by the banned user. Deletes them, removes reactions, pins and attachment objects, and publishes `MESSAGE_DELETE_BULK` (chunks of 100 ids) on `discordy.message.v1`. |
| 4 | messages | The Postgres full-text index ([ADR 0018](../adr/0018-message-search-postgres-fts.md)) consumes those `MESSAGE_DELETE_BULK` events and drops the rows; no separate index call. |
| 5 | gateway | Fans `MESSAGE_DELETE_BULK` out to channel viewers as for any bulk delete. The guild process ignores `BAN_MESSAGE_PURGE` itself (bus-only). |
| 6 | client | `MESSAGE_DELETE_BULK` removes the messages from open timelines. |

Properties:

- Asynchronous: the ban call returns immediately; deletion follows within seconds.
- Idempotent and at-least-once: a replayed event finds nothing left. A failing batch (ScyllaDB or MinIO down) is retried every 3 seconds without advancing the offset. Channels that no longer exist are skipped.
- Offsets: stored in the search Postgres (`search_offsets`, topic `discordy.guild.v1`) after each batch. Without a stored offset (first start, or `SEARCH_DATABASE_URL` unset) the consumer starts at the end of the topic, so old bans are never replayed and, without Postgres, a ban issued while messages is down is not purged.
- Safety cap: the purge never reads further back than 8 days whatever the event says.
- Permissions: only BAN_MEMBERS holders and only above the target in the role hierarchy can ban (unchanged), so no extra check is needed by messages, which trusts the bus.

## Client moderation tools (client#62)

Built on the user menu of [client user menu](2026-10-20-client-user-menu.md) (kick, ban, timeout dialogs).

| Tool | Where | Notes |
| --- | --- | --- |
| Ban with message history | Ban dialog | Adds the 12 hour option. |
| Delete recent messages | User menu, MANAGE_MESSAGES, not self | Confirm dialog counts the user's messages loaded in this server newer than two weeks and calls `POST /channels/{id}/messages/bulk-delete` per channel (batches of 2 to 100, a lone message uses the single delete route). For history beyond what is loaded, use ban with history. |
| Members: filter and sort | Server settings, Members | Search, role filter, "timed out" filter, sort by name or join date (newest, oldest). Timed-out members are labelled. |
| Members: bulk actions | Server settings, Members | Checkboxes plus select-all (owner and self excluded) and Kick / Ban for the selection, with a confirm dialog and a per-run summary toast. |
| Ban list | Server settings, Bans | Already listed reason and Unban; adds a search over name, id and reason. |
| Audit log | Server settings, Audit log | Filter by action type and by moderator (server-side `action_type`, `user_id`), "Load older entries" paging with `before`. |

Not built (need backend work, tracked as follow-ups): reporting a message to a moderation channel (needs
`POST /channels/{id}/messages/{id}/report` and a community moderation-channel setting) and member pruning (no
`/guilds/{id}/prune` route in the API). Bulk role assignment from the member list is covered by the existing per-member
role picker.

## Verification

- api: HTTP test `http_ban_purge` (outbox event content, range check, no event for 0 or no body).
- messages: unit tests for `PurgeAuthorMessages` (author and window filter, bucket crossing, replay), Redpanda and Postgres integration test `ban_purge_consumer` (event reaches the sink, other guild events ignored, restart resumes from the stored offset).
- gateway: ExUnit test that `BAN_MESSAGE_PURGE` is never dispatched to clients.
- client: vitest for the pure helpers (`moderationTools`), the extended user menu model and capabilities.
