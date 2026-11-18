# Client: unread markers, jump to message, notification settings and mentions inbox

Covers client#48 and client#50.

## Read state and navigation

- The read marker is per channel on the server. `POST /channels/{id}/messages/{mid}/ack` moves it forward only. With body `{"manual": true, "mention_count": n}` it is set to exactly that message, backwards included (Mark Unread; the client acks `id - 1` of the chosen message).
- `MESSAGE_ACK` carries `message_id` and `mention_count` of the resulting marker to the user's sessions. The proposed [versioned snapshot protocol](../adr/0027-versioned-read-state-snapshots.md) adds `read_state_version`: certified clients apply only a newer channel version, including backwards manual unread, and never increment standard counts from CREATE. Legacy unversioned clients retain the existing ordering limitation.
- Certified READY initializes authoritative counts, including an empty account. READ_STATE_UPDATE supplies full user-targeted channel snapshots. READ_STATE_SYNC after resume merges fetched snapshots by version so a stale fetch cannot undo newer replayed updates. Failed hydration is retryable; it never certifies zero counts. Private decrypted messages continue to count locally.
- On opening a channel the client captures the marker. The red "New" divider sits above the first message after it written by someone else, and a bar at the top reads "N new messages since T" with "Jump to first unread" and "Mark as read". Esc / marking read hides the bar but keeps the divider until the next visit.
- Jump to message (reply header, pin card, `discordy://channels/<guild|@me>/<channel>/<message>`, mentions inbox): if the message is not loaded the client replaces the timeline with `GET messages?around=<id>`, marks it detached (`hasMoreAfter`) and pages towards the present on scroll. Live messages are not appended while detached; "Jump to present" and sending reload the latest page.

## Notification settings

All mutes, levels and suppression flags are the synced per-guild settings resource (`GET/PATCH /users/@me/guilds/{id|@me}/settings`, `USER_GUILD_SETTINGS_UPDATE`). Device-local copies were removed. Resolution order: channel override, category override, guild level, server default. A mute applies to the guild, a channel or a category; timed mutes use `selected_time_window` seconds, -1 for until turned off.

- Server menu: Mute server (15m, 1h, 3h, 8h, 24h, until off) and Notification settings dialog (level, suppress @everyone/@here, suppress role mentions, hide muted channels, channel overrides list).
- Channel and category menus use the same overrides.
- `@silent` messages (flag `1 << 12`) never count as mentions and fire no notification, sound or taskbar flash; turning off a reply ping removes only its implicit author mention, preserving explicit mentions ([composer spec](2026-10-20-client-markdown-and-composer.md)).
- Muted channels render dimmed and do not count as unread. The notification-accounting policy suppresses mention badges when the resolved mute is active or level is Nothing; role/everyone suppression also applies. Current API policy is evaluated per recipient page. See [read accounting](../runbooks/read-accounting.md) for the proposed server writer and migration limits.
- Notes use `PUT /users/@me/notes/{id}` via the synced notes store, saved on blur.

## Mentions inbox (Ctrl+I, title bar button)

Interim implementation: entries are collected on this device from live `MESSAGE_CREATE` and from loaded history (server messages that mention the viewer, honouring suppression flags), newest 100 kept. A server-side `GET /users/@me/mentions` would make it complete across devices and cold starts; not built yet.

## Private delivery modes (client#154)

Ephemeral (E2EE relay, ops 20/21) and P2P messages never arrive as `MESSAGE_CREATE`; the client only has their plaintext after decrypting. The services therefore report every newly decrypted incoming message (`onIncoming`, once per message id, not for duplicates or our own sends) to the same pipeline as standard messages (`registerIncoming` in `dispatchRouter.ts`): channel `last_message_id` (unread marker), mention counter, mentions inbox and then `notifyIncoming`. The same rules apply: mute, notification level, DND, suppress @everyone/roles, and "channel is currently focused". The OS notification for a private message carries only the sender and the generic text "Sent a private message"; the plaintext never reaches the notification centre (there is no separate preview setting yet). Live regression: `tests/live/private-notify.spec.ts`.

## Window chrome (client#157)

- Title bar: the brand cell and the empty cell to the right of the "Search or jump to" pill are `-webkit-app-region: drag`; the pill and the title-bar buttons are `no-drag` (Chromium treats a `drag` ancestor as draggable for any child that is not explicitly `no-drag`, so the end cell must set its children to `no-drag`).
- Server rail badges (mentions, call dot) are inset from the rail edge and the scroll area has top padding so the badge ring is never clipped by the scroller.
