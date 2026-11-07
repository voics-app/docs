# Delivery mode guarantees

What each message delivery mode promises, where the data lives and what survives a restart or an offline recipient. Decision record: [ADR-0003](../adr/0003-delivery-modes.md). Every row below is covered by a live test in `client/apps/desktop/tests/live/` (see [Verification](#verification)).

## Summary

| | Standard | Ephemeral | P2P |
|---|---|---|---|
| Who can read | Participants and the server operator (plaintext) | Only the devices in the MLS group; the gateway sees ciphertext and metadata | Only the two peers; the gateway sees SDP/ICE signalling only |
| Where content lives | ScyllaDB (server history) | Each device's encrypted local store. Ciphertext sits in the gateway inbox only until the device ACKs it (hard TTL 7 days) | Each device's encrypted local store. Never on a server |
| Recipient offline | Delivered from history when they open the chat | Held in the inbox and replayed when the device reconnects, then deleted on ACK | The send fails with "Peer offline"; nothing is queued, the peer never gets it |
| Several devices of the recipient | All see it (history + live) | Every device in the group gets its own inbox entry | Every online device of the peer gets it; offline devices miss it |
| Sender's other devices | See it | See it (they are group members) | Do **not** see it (the sender dials the peer's devices only) |
| Group DM | Normal | One MLS group per chat; each send reaches every member device | Mesh: the sender dials every member device (max 10 members) |
| Member leaves or is removed | Server stops delivering | Remaining devices commit an MLS Remove; the new epoch rotates all secrets, so the removed member cannot read later messages | The removed member is no longer dialled |
| New device after the group exists | Sees full history | Gets a Welcome on the next send; sees messages from then on, never older ones | Sees nothing older (nothing was stored) |
| After app restart | History from the server plus nothing lost | History restored from the encrypted local store; nothing is replayed from the server (entries were ACKed) | History restored from the encrypted local store on both sides |
| Edit | Yes | No (control not offered) | No (control not offered) |
| Reactions | Yes | No (control not offered) | No (control not offered) |
| Delete | For everyone | Your own messages only, for everyone: a control message inside the MLS ciphertext, honoured by each device only when its authenticated sender wrote the target. Offline devices apply it when the inbox replays. Copies and screenshots stay out of reach | Your own messages only: a control frame over the verified DataChannel. A device that is offline gets it the next time the devices connect (the sender keeps a pending list in its local store) |
| Disappearing messages | Not available | Per-chat timer (off, 5 minutes, 1 hour, 1 day, 1 week, 4 weeks), stamped on each message; every device removes it from the screen and the encrypted store when the time is up, counted from arrival (sender: from sending) | Same as Ephemeral |
| Attachments | Yes (CDN) | Yes: AES-256-GCM on the device, ciphertext on the CDN, key inside the encrypted message | Yes: encrypted and streamed over the data channel; the peer must be online |
| Mode switch in the same chat | Messages keep the mode they were sent in; history from different modes interleaves by time | same | same |

## Notes and limits

- Delete and disappearing messages (client#315): both ride on the existing private channels, so the gateway relays them without seeing anything. The control message is `{v:1, ctl:'delete', target}` or `{v:1, ctl:'timer', ttl_ms}` (Ephemeral: base64 plaintext of the MLS application message; P2P: `{t:'ctl', ...}` on the DataChannel). The receiver takes the sender from the same authentication as a chat message (the owner of the sending device for Ephemeral, the identity-verified link peer for P2P) and refuses a delete when that user did not author the target. A delete that arrives before its message is kept as a tombstone `{messageId: userId}` and the message is dropped on arrival if the same user sent it. The timer travels on each message as `ttl_ms` (5 s to 28 days; anything else is ignored), so a peer that missed the timer change still enforces it. The native store runs SQLite `secure_delete`, so removed rows are zeroed in the file. The apps tell people that a delete cannot reach a copy or screenshot someone already made.

- The strictest participant preference wins in a DM or group DM (P2P over Ephemeral over Standard). Guild channels can be Standard or Ephemeral (at most 100 viewers); P2P is DMs and group DMs only.
- Private modes never fall back to plaintext: with no usable crypto module a send fails loudly.
- Switching a chat back to Standard takes effect immediately; the `messages` service re-checks a delivery mode conflict against fresh data because its access cache lives for 5 seconds.
- Group DMs can only lose members (a member leaves). There is no API to add a member to an existing group DM; adding a member is covered on a guild Ephemeral channel instead.
- Reports: for Standard messages the api copies the reported message from messages when the report is filed; for Ephemeral and P2P content the server holds nothing, so a report carries only the author and the text the reporter chooses to submit (stored as unverified, `content_source` = `reporter`). See the [moderation spec](../specs/2026-10-22-moderation-tools-and-ban-purge.md#reporting-a-message-or-a-user-api126).
- Attachment downloads use signed, expiring CDN URLs (`?ex=&is=&hm=`, 24 h, [ADR 0017](../adr/0017-signed-attachment-download-urls.md)) for Standard and Ephemeral alike; the bucket stays private and the messages service verifies the signature and streams the bytes. A 403 or 410 means the link is invalid or expired: refetch the message for a fresh one. P2P attachments never use the CDN.
- Link previews are generated by the messages service for Standard messages only ([ADR 0019](../adr/0019-link-unfurling-and-media-proxy.md)): it adds `embeds` with MESSAGE_UPDATE and signs embed media as `/external/<token>?ex=&is=&hm=` (`proxy_url`). Ephemeral and P2P content is never fetched by the server; clients preview locally only after an explicit opt-in. `<url>` and the SUPPRESS_EMBEDS flag (`PATCH {flags: 4}`) turn a preview off.
- An Ephemeral send in a guild channel addresses the members that can view the channel (the internal access endpoint lists them); the gateway relay rejects any recipient outside that list and the client shows the rejection on the channel.
- MLS group split brain (client#118): the group id is the channel id, so two devices can each create the group (one sent before the peer had any device, or both sent their first message at once). A device cannot join a group id it holds, so on a Welcome for a group it already has, the client replaces its copy when that copy has no other member, otherwise the group created by the lower identity key wins (both sides compute the same answer). The losing device re-sends the messages the peer could not read (same message ids, so the receiver dedupes) and the winner drops undecryptable application messages from the abandoned group (acknowledging them). Needs the native `deleteGroup` (rebuild with `pnpm build:native`).
- Inline video and audio load from the signed attachment URL (`Range` supported, 206). The renderer CSP `media-src` allows `https:` plus, for the local profile only, `http://localhost:*` and `http://127.0.0.1:*` (client#117).

## Verification

The suite is a release gate (see [release runbook](../runbooks/release.md#delivery-mode-live-suite)): `npx playwright test -c tests/live/playwright.live.config.ts matrix-*.spec.ts delivery-modes.spec.ts` from `client/apps/desktop` against the local stack.

## Group DM membership changes (api#29, client#51)

Group DMs are managed with `PUT/DELETE /channels/{id}/recipients/{user_id}` (any member adds, up to 10 members; the owner removes; `@me` leaves and moves ownership to a remaining member), `PATCH /channels/{id}` (name, icon) and `DELETE /channels/{id}` (leave). api dispatches `CHANNEL_CREATE` to a new member, `CHANNEL_UPDATE` to the others, `CHANNEL_RECIPIENT_ADD` / `CHANNEL_RECIPIENT_REMOVE` to the remaining members and `CHANNEL_DELETE` to a removed member. In Standard mode api also posts system messages (types 1 RECIPIENT_ADD, 2 RECIPIENT_REMOVE, 4 CHANNEL_NAME_CHANGE, 5 CHANNEL_ICON_CHANGE) through the messages internal create endpoint (`type`, `target_user_id`); Ephemeral and P2P groups get none because messages never stores their traffic.

MLS in Ephemeral mode stays client-driven and api never sees it:

- Add: the client that called `PUT` commits an MLS Add for the new member's devices (`EphemeralService.syncMembership`) and relays the commit to existing devices and the welcome to the new ones, without waiting for the next send. A channel without an MLS group yet is left alone; its first send creates it with every device present.
- Remove and leave: every remaining device reacts to `CHANNEL_RECIPIENT_REMOVE` with `reconcileMembership`; the elected committer (lowest identity key, widened per retry) issues the MLS Remove commit, rotating the epoch so the removed devices cannot read later messages.
- Close DM (hide until a new message) is device-local state for now; there is no server-side hidden flag.
