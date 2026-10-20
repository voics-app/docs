# Notification settings and user notes (api#28, api#51)

Status: implemented in api#55, contracts#5, gateway#18 and client#104 (sync layer).

## Notification settings

Per user and per guild, plus one row for the user's DMs and group DMs (`@me`, stored as `guild_id` 0). The server is the source of truth and syncs every session.

| Field | Meaning |
|---|---|
| `message_notifications` | 0 all messages, 1 only @mentions, 2 nothing, `null` use the guild's `default_message_notifications` |
| `suppress_everyone`, `suppress_roles` | ignore @everyone/@here, or role mentions |
| `muted`, `mute_config.end_time` | mute; `end_time` null means until turned back on |
| `hide_muted_channels` | hide muted channels in the sidebar |
| `channel_overrides[]` | per channel `message_notifications` (null inherits), `muted`, `mute_config` |

Rules (domain `notification.rs`, mirrored in the client `notificationSettings.ts`):

1. Level: channel override, else guild level, else the guild default.
2. A muted guild mutes all its channels; a channel mute applies to that channel only.
3. A mute whose `end_time` is in the past is ignored by consumers (the server does not rewrite it).
4. `mute_config.selected_time_window` (seconds, or -1 for forever) in a request is turned into `end_time` by the server (15 min = 900, 1 h = 3600, 3 h = 10800, 8 h = 28800, 24 h = 86400). An explicit `end_time` wins. `muted: true` without a config mutes until turned off; `muted: false` clears the mute.
5. `PATCH` is partial. `channel_overrides` entries merge per `channel_id` (omitted fields keep their value); an entry left with no level and no mute is deleted. At most 1000 overrides. A channel must belong to the guild (or be a DM the user is in) unless the entry only clears the override.

Access: the caller must be a member of the guild (403 otherwise, 404 for an unknown guild). Bots are refused.

Mobile push is out of scope (no mobile client).

## Delivery

`PATCH` commits the row and a `USER_GUILD_SETTINGS_UPDATE` outbox event in one transaction. The event carries `target_user_ids: [owner]` on `discordy.user.v1`, so the gateway delivers it to every session of that user and no one else. READY (`/internal/v1/users/{id}/ready`) carries `user_guild_settings` for the user's guilds and DMs.

Not yet done: the messages service does not use these settings for push or mention counting (third criterion of api#28; the push path does not exist yet).

## Notes

A private note (at most 256 characters) a user writes about another user. Table `user_notes(owner_id, target_id, note)`.

- `GET /users/@me/notes/{user_id}` returns `{user_id, note_user_id, note}`, 404 when none.
- `PUT` with `{note}` sets it; an empty or missing note deletes it. `DELETE` deletes it. The target user must exist.
- Privacy: notes are readable only by their author. The noted user and everyone else cannot see them, and `USER_NOTE_UPDATE` (`{id, note}`, empty = removed) is targeted at the author's sessions only.
- READY carries `notes` as `{target_id: note}`.

## Storage

Migration `0008_notification_settings_notes.sql`: `user_guild_settings` (primary key `(user_id, guild_id)`, overrides as JSONB, rows removed when the guild is deleted) and `user_notes`. Both cascade on user deletion.

## Client

`useNotificationSettingsStore` and `useUserNotesStore` cache the synced state in localStorage and are hydrated from READY and the two dispatches; writes are optimistic with rollback. Wiring the existing device-local mute (client#102) and notes (client#99) to these stores is a follow-up that lands after those PRs.
