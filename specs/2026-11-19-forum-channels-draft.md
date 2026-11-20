# Forum channels: proposed parity work

Status: draft, coordinated with [api#35](https://github.com/discordy-voics/api/issues/35). This describes the proposed changes, not deployed behavior.

Forum channels contain public threads. Managers can configure up to 20 tags, required tags, the default sort and list or gallery layout. The channel topic carries posting guidelines. A post may use up to five tags; moderated tags and pinning require Manage Threads. Existing tags keep server-issued IDs when renamed. The Standard forum feed retrieves the first message preview, image cover, stored message count and latest activity from the messages service. Counts are read from existing message partitions, so large forums require performance verification.

## Creation and recovery

The Standard post request carries an author-scoped UUID and text-only first message. The API reserves a thread and message ID, stores a hash of the request, and returns a pending status until the opener is confirmed. Pending posts are hidden from the public forum list and ordinary channel access. A bounded lease lets a retry take over after a crash. The messages service writes a durable hidden marker and the opener in one conditional batch within the same partition. Replays must match the author, reserved ID and content hash; a marker remains after the opener is deleted, preventing recreation. Publication is fenced by a database lease and committed with the thread event. Deleted posts retain a scrubbed API tombstone to prevent old request IDs from recreating them.

Desktop and mobile retain the Standard draft and request ID on the device. An uncertain response can be checked again with the same request. A confirmed deleted opener reports failure and requires an explicit new request. Private-mode forum creation is temporarily unavailable; plaintext is never sent to the API outbox for Ephemeral or P2P delivery.

## Verification and remaining work

The draft changes require coordinated API, messages, contracts and client releases, with migrations before compatible clients. Fixture and live end-to-end tests must verify concurrent claims, expired lease takeover, a lost acknowledgement, deletion and tombstone replay, access control, and create-to-feed behavior. The Scylla conditional batch, Postgres lease and real cross-service failure paths have not yet been validated together. A crash after the message is stored but before its message event is emitted can still leave notification side effects incomplete; recovery publishes the thread and makes the opener readable, but does not claim exactly-once message-event delivery. The messages changes overlap [messages#87](https://github.com/discordy-voics/messages/pull/87) and require coordinated rebasing. Forum creation with first-message attachments, private delivery and scalability of full-partition counts remain open.
