# 0027 — Versioned read-state snapshots across gateway sessions

- Status: proposed
- Date: 2026-11-18
- Deciders: Voics maintainer review
- Technical story: [messages#23](https://github.com/voics-app/messages/issues/23), [atomic accounting](0026-atomic-read-accounting.md)

## Context and Problem Statement

An atomic database count does not make the existing client counter correct. An ACK at message 500 with count 1 followed by CREATE 502 is ambiguous: the snapshot might already include 502, or its count might belong to 501 and require another increment. Both orders occur because persistence, accounting and publication are separate. Message IDs are not commit-order watermarks: a smaller reserved ID can commit later. The gateway currently omits read state from READY, so reconnect cannot repair a missed count event.

## Decision Drivers

- Preserve the public ACK request, legacy event fields and clients using older servers.
- Converge under reordered and duplicate snapshots without inferring membership from message IDs.
- Repair lost publication on successful identification and resume.
- Keep private plaintext and its local mention accounting out of server counters.

## Considered Options

1. Versioned authoritative snapshots with gateway hydration and client version dominance.
2. Deduplicate CREATE and infer snapshot membership from the ACK or largest message ID.
3. A durable transactional accounting/publication outbox before any client improvement.

## Decision Outcome

Proposed option: **1**. Each authoritative `(user_id, channel_id)` record gains a nonnegative signed-64-bit sequence. Migration preserves existing data at version 0. Every successful state mutation increments the version in the same conditional batch as the count, marker and ledger. Replay and stale ACK return the current version unchanged. Overflow fails the mutation; versions never wrap. Old writers that do not increment the version must be fenced before enabling this protocol.

The wire field `read_state_version` is a canonical unsigned decimal string, independent of the existing optional integer `MESSAGE_ACK.version`. A user-targeted `READ_STATE_UPDATE` carries the complete channel snapshot: `channel_id`, nullable `last_message_id`, `mention_count` and `read_state_version`. MESSAGE_ACK adds the same optional version. Publication may occur out of commit order; equal or smaller versions never replace a newer client snapshot. A higher snapshot includes all preceding successful mutations of that channel, including manual unread.

`GET /internal/v1/users/{user_id}/read-states` retains its array response, using READY entry names (`id`, `last_message_id`, `mention_count`) and optional versions for compatibility. Header `X-Read-State-Versioned: 1` certifies that every entry has a version and that this service implements authoritative updates, including when the array is empty. Gateway rejects malformed certified responses. A legacy response without that header remains explicitly unversioned.

Gateway registers the user session before fetching read states. Events that arrive during the fetch wait in the session mailbox until READY is sent. READY adds optional `read_state` and `read_state_versioned`; the flag is true only after a successful certified fetch. Fetch failure closes identification with a retryable gateway error rather than asserting an empty authoritative state. On successful RESUME the already-registered session fetches again, replays its buffer, dispatches `READ_STATE_SYNC` with the certified array, then RESUMED. The client merges this sync per channel by version, never replacing a newer replayed snapshot with an older fetched snapshot. Failed refresh invalidates resume and requires a fresh identification. Legacy fetches can hydrate READY but do not enable authority or emit a certified sync.

Clients receiving certified READY use server snapshots for standard-channel mention counts, so MESSAGE_CREATE cannot double-increment an included count. A fresh READY establishes a new session baseline. Within that session, READ_STATE_UPDATE, versioned MESSAGE_ACK and READ_STATE_SYNC obey the same per-channel version comparison; absent channels in a sync are not deletion instructions. Unversioned ACKs cannot overwrite certified channel state. Existing local notification/inbox behavior remains separate from counter authority. Private decrypted traffic retains local accounting. Clients connected to older unversioned servers keep the legacy behavior; old clients ignore the additive fields/events and retain its ordering limitation.

Local read actions may be optimistic while their ACK is pending. A resume sync at the same version may restore the already-known authoritative snapshot over that local optimism when the ACK never committed. It must not accept conflicting data at an equal version or replace any newer snapshot. Duplicate live events remain ignored. A session that was certified must invalidate resume if the refreshed service loses certification; it cannot silently resume under an unversioned writer.

### Consequences

- The database version is the ordering authority; gateway sequence and message IDs serve different purposes.
- A dropped publication remains stale until a higher snapshot or successful reconnect/resume. This proposal does not promise instantaneous or exactly-once delivery and does not add an outbox.
- A failure before accounting commits is not repaired by reading the resulting count. The best-effort accounting limits in ADR 0026 still apply.
- Identification and resume now depend on a successful messages read. Failure is visible and retryable, never a fabricated zero count.
- A restore can move database versions backwards. Fence writers and invalidate all gateway sessions/resume buffers before reopening; fresh READY establishes the restored baseline. Do not resume an old version history after restore.
- Rollout is additive on the wire but requires coordinated writer fencing, compatible messages, then gateway, then client. A gateway may use legacy mode until the certified writer is available. Binary rollback to an unversioned writer is unsafe while certified sessions remain live.

### Confirmation

Keep the two identical legacy-wire cases as proof of ambiguity. Test ACK/CREATE in both orders, later real creates, duplicate and reordered authoritative snapshots, backwards manual unread, version values beyond JavaScript's safe integer range, empty certified READY, lost publication repaired on READY and resume, snapshot/replay races, failed fetches, legacy compatibility and private traffic. Real Scylla tests verify version increments share the existing CAS under independent concurrent repositories, remain stable on replay/stale ACK and preserve pre-migration rows.

## Pros and Cons of the Options

Local deduplication can reject repeated CREATEs but cannot identify which unique CREATEs an ACK count includes. An ID watermark has holes under concurrent writers. An outbox would improve delivery durability but is a larger persistence boundary; it remains a separate future decision and is not implied by this convergence protocol.

## More Information

- [Read accounting rollout and restore](../runbooks/read-accounting.md).
- [Client unread and notification semantics](../specs/2026-10-21-client-unread-and-notifications.md).
