# Client: unread markers, jump to message, notification settings and mentions inbox

Covers client#48 and client#50.

## Read state and navigation

- The read marker is per channel on the server. `POST /channels/{id}/messages/{mid}/ack` moves it forward only. With body `{"manual": true, "mention_count": n}` it is set to exactly that message, backwards included (Mark Unread; the client acks `id - 1` of the chosen message).
- `MESSAGE_ACK` carries `message_id` and `mention_count` of the resulting marker and goes to the user's other sessions only. Clients set their marker to exactly that value.
- On opening a channel the client captures the marker. The red "New" divider sits above the first message after it written by someone else, and a bar at the top reads "N new messages since T" with "Jump to first unread" and "Mark as read". Esc / marking read hides the bar but keeps the divider until the next visit.
- Jump to message (reply header, pin card, `discordy://channels/<guild|@me>/<channel>/<message>`, mentions inbox): if the message is not loaded the client replaces the timeline with `GET messages?around=<id>`, marks it detached (`hasMoreAfter`) and pages towards the present on scroll. Live messages are not appended while detached; "Jump to present" and sending reload the latest page.

## Notification settings

All mutes, levels and suppression flags are the synced per-guild settings resource (`GET/PATCH /users/@me/guilds/{id|@me}/settings`, `USER_GUILD_SETTINGS_UPDATE`). Device-local copies were removed. Resolution order: channel override, category override, guild level, server default. A mute applies to the guild, a channel or a category; timed mutes use `selected_time_window` seconds, -1 for until turned off.

- Server menu: Mute server (15m, 1h, 3h, 8h, 24h, until off) and Notification settings dialog (level, suppress @everyone/@here, suppress role mentions, hide muted channels, channel overrides list).
- Channel and category menus use the same overrides.
- Muted channels render dimmed and do not count as unread; mentions in them still count (Discord behaviour).
- Notes use `PUT /users/@me/notes/{id}` via the synced notes store, saved on blur.

## Mentions inbox (Ctrl+I, title bar button)

Interim implementation: entries are collected on this device from live `MESSAGE_CREATE` and from loaded history (server messages that mention the viewer, honouring suppression flags), newest 100 kept. A server-side `GET /users/@me/mentions` would make it complete across devices and cold starts; not built yet.
