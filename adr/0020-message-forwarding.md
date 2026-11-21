# 0020 — Message forwarding

- Status: accepted
- Date: 2026-10-22
- Deciders: @oussamaelhajoui
- Technical story: [messages#13](https://github.com/voics-app/messages/issues/13)
- Related: [ADR 0003](0003-delivery-modes.md), [ADR 0017](0017-signed-attachment-download-urls.md)

## Context and Problem Statement

Discord lets a user forward a message into another channel or DM as a snapshot with a "Forwarded" header. A forward must keep working when the original is edited, deleted or in a channel the viewer cannot see. Ephemeral and P2P chats never store content on the server, so the server must not read or write forwards for them.

## Decision Outcome

**The messages service stores a frozen snapshot on the new message and copies the attachment objects.**

- **Request.** `POST /channels/{target}/messages` with `message_reference: {type: 1, message_id, channel_id, guild_id?}`. `content` is the optional added comment and may be empty. `type` 0 (default) stays a reply.
- **Permissions.** The caller needs VIEW_CHANNEL and READ_MESSAGE_HISTORY on the source, and SEND_MESSAGES (plus ATTACH_FILES when the snapshot has files) on the target. System and ephemeral messages cannot be forwarded.
- **Snapshot.** content, embeds, mentions, flags, creation and edit time, and the attachments of the original, stored in `messages.forward_snapshot` (JSON text) with `forward_channel_id`, `forward_message_id` and `forward_guild_id` (migration 0004). Mentions inside the snapshot never notify and `@everyone` is dropped. The message `type` stays 0; the response carries `message_reference.type = 1` and `message_snapshots[].message`. Forwarding a forward re-forwards the original reference and snapshot.
- **Attachments.** Object keys are scoped by channel, and deleting a message deletes its objects, so re-referencing the source object would break the forward. The service copies each object to the target channel under a new attachment id (`AttachmentStorage::copy`; files are at most 25 MiB, buffered between GET and PUT). Download URLs of the copies are signed like any other attachment (ADR 0017). Deleting the forward deletes its copies.
- **Delivery modes.** Both ends must be Standard, otherwise 409 with code 50160 and nothing is stored. The client disables Forward on E2EE and P2P messages with a tooltip, lists E2EE and P2P chats as disabled targets, and never forwards through the server for them. Moving content between modes would be a local re-encrypt in the client and is not offered.
- **Rendering.** The client shows the snapshot under a "Forwarded" header and a "Jump to original" link only when the source channel is known to the viewer and they hold VIEW_CHANNEL and READ_MESSAGE_HISTORY there; the reference alone is never enough to read the source.

## Consequences

- Forwarding a message with files costs a copy of the bytes per forward. This is bounded by 10 files of 25 MiB and avoids reference counting on objects.
- Snapshot attachments are not searchable or listed in channel media; the comment is indexed like any message.
- Old clients show a forward as an empty message (or only its comment).
