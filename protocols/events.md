# Event bus

The bus is Redpanda, speaking the Kafka API ([ADR-0009](../adr/0009-redpanda-over-kafka.md)). Delivery is at least once, and consumers are idempotent on the event `id`.

## Envelope

```json
{
  "id": "0192f6c4-8a1e-7c3a-9f00-3b1d2e4f5a6b",
  "type": "MESSAGE_CREATE",
  "v": 1,
  "occurred_at": "2026-10-17T12:00:00Z",
  "guild_id": "123…",
  "channel_id": "456…",
  "target_user_ids": null,
  "data": { }
}
```

| Field | Rules |
|---|---|
| `id` | UUIDv7, used as the deduplication key |
| `type` | The gateway dispatch event name |
| `v` | Schema version of `data` |
| `guild_id`, `channel_id` | Snowflake strings, or `null` |
| `target_user_ids` | Set for user-targeted events, such as DMs or relationships |
| `data` | **Exactly** the gateway DISPATCH payload for `type` |

The envelope is JSON, encoded as UTF-8.

## Topics

| Topic | Key | Producer | Event types |
|---|---|---|---|
| `discordy.guild.v1` | `guild_id` | api | GUILD_CREATE/UPDATE/DELETE, CHANNEL_CREATE/UPDATE/DELETE, GUILD_ROLE_CREATE/UPDATE/DELETE, GUILD_MEMBER_ADD/UPDATE/REMOVE, GUILD_BAN_ADD/REMOVE, GUILD_EMOJIS_UPDATE, INVITE_CREATE/DELETE, THREAD_CREATE/UPDATE/DELETE, APPLICATION_COMMAND_PERMISSIONS_UPDATE |
| `discordy.message.v1` | `channel_id` | messages (api for TYPING_START) | MESSAGE_CREATE/UPDATE/DELETE, MESSAGE_DELETE_BULK, MESSAGE_REACTION_ADD/REMOVE/REMOVE_ALL, CHANNEL_PINS_UPDATE, MESSAGE_ACK, TYPING_START |
| `discordy.user.v1` | `user_id` | api | USER_UPDATE, USER_SETTINGS_UPDATE, RELATIONSHIP_ADD/REMOVE, CHANNEL_CREATE (DMs, with `target_user_ids`), CHANNEL_RECIPIENT_ADD/REMOVE, SESSIONS_REPLACE |
| `discordy.interaction.v1` | `application_id` | api | INTERACTION_CREATE, routed to the bot's sessions |
| `discordy.telemetry.v1` | node / user | voice, gateway (incl. client op 23) | VOICE_QUALITY, USAGE_TICK |
| `discordy.audit.v1` | `guild_id` | api | AUDIT_LOG_ENTRY_CREATE |

Keys keep related events ordered within a partition.

## Producers

- **api** writes events to the Postgres `outbox` table in the same transaction as the change. The outbox relay then publishes them, claiming rows with `FOR UPDATE SKIP LOCKED` and using an idempotent producer.
- **messages** publishes after a successful ScyllaDB write.

## Gateway routing

- If `guild_id` is set and `target_user_ids` is null, the event is fanned out through the guild process, filtered by VIEW_CHANNEL on `channel_id` and by intents.
- Otherwise, it is delivered to every session of each user in `target_user_ids`.
- The gateway keeps an LRU of the last 10,000 event IDs per node to drop duplicates.

## Other consumers

admin-bff consumes every topic for **counters only**. It never stores message content.
