# Forum channels: proposed parity work

Status: draft, coordinated with [api#35](https://github.com/discordy-voics/api/issues/35). This document describes proposed work, not deployed behavior.

Forum channels contain public threads. Managers can configure up to 20 tags, whether a post needs a tag, the default sort order and list or gallery layout. The channel topic carries posting guidelines. A post may use up to five tags; moderated tags require Manage Threads. Existing tags retain their server-issued IDs when renamed; new tags receive IDs from the API.

The API stores forum settings and applied tags on channels (migration 0085). Settings changes require Manage Channels; applying moderated tags requires Manage Threads. Threads inherit the parent delivery mode. Managers with Manage Threads can pin and unpin forum posts; pinned posts appear first. Changes are intended to travel through normal channel and thread events.

## Delivery and verification gaps

Thread creation and the first message currently use separate service operations. The draft API rejects an embedded first message rather than silently discarding it. If the message request fails or its response is lost, the thread may exist without a confirmed first message. A client must not blindly resend on an ambiguous failure: it should open the existing post and let the author inspect it first. The existing message nonce is a correlation value, not an idempotency key.

A complete single-request forum creation contract needs a durable, idempotent cross-service delivery design, including retries and reconciliation after a crash. One candidate for Standard delivery is to accept a client-generated idempotency key, persist the thread and a pending first-message command in one API transaction, and return the same thread for a repeated key and matching request. A worker would deliver that command with a stable message ID; the messages service must atomically deduplicate that ID and make message side effects recoverable across crashes. A repeated key with different content must be rejected. Reconciliation must handle failure after message storage but before acknowledgement, and the client must be able to inspect pending or failed delivery without creating a second post.

The design must not send plaintext private-mode content through the API outbox. Ephemeral or P2P delivery needs its existing encrypted client path or a separately specified encrypted command. Verify actual stored messages, gateway events, delivery modes, duplicate retries, and recovery from failures before enabling the contract.

Post previews, reliable reply counts, authoritative activity ordering, covers, and end-to-end behavior are not yet complete. The draft client sorts by activity IDs it has already observed and falls back to creation order when activity is unavailable. Do not mark api#35 done or treat the draft PRs as feature-complete until these paths and deployment compatibility are verified.
