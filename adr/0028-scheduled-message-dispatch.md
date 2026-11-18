# 0028 — Scheduled messages with an explicit dispatch boundary

- Status: proposed
- Date: 2026-11-18
- Deciders: @oussamaelhajoui (pending)
- Technical story: [messages#61](https://github.com/discordy-voics/messages/issues/61)
- Related: [delivery modes](0003-delivery-modes.md), [atomic read accounting](0026-atomic-read-accounting.md)

## Context and Problem Statement

A user needs to schedule a Standard message, see their pending messages in a channel,
edit them and cancel them. The device can be offline when the message is due.
Membership, permissions, the delivery mode and a reply target can change while it waits.

The current `CreateMessage` allocates a new Snowflake on every call. Its nonce only
correlates the response; it does not deduplicate retries. Scylla insertion precedes
best-effort event publication and mention accounting. Retrying this use case after
an ambiguous database response can create another message. This proposal must not
claim exactly-once publication or silently retry an uncertain send.

## Decision Drivers

- The server can execute a schedule while the author's devices are offline.
- Only the author can read a draft; private delivery modes never upload one.
- An accepted cancellation cannot race into a later first dispatch.
- Two workers or a restart cannot independently dispatch the same schedule.
- A failed or uncertain send remains visible to the author instead of disappearing.
- Use the existing Scylla cluster, without another server or an in-memory-only timer.

## Considered Options

1. Keep the timer on the client. This loses offline execution and cross-device edits.
2. Retry the current create-message use case. This can duplicate messages because a nonce is not a deduplication key.
3. Persist the schedule and allow one dispatch attempt after an atomic state transition. Report uncertainty after that boundary and never automatically start a second attempt.
4. First implement a transactional message/outbox store that also fences deletion and replay. This can improve recovery but changes the existing message storage contract substantially.

## Decision Outcome

Choose **option 3** for the first scheduling implementation. Scheduling is a durable
intent and one execution attempt, not a new exactly-once delivery guarantee. Option 4
requires a separate reviewed design before automatic retry crosses the dispatch boundary.
The [public specification](../specs/2026-11-18-scheduled-messages.md) defines the wire contract.

### Storage and discovery

The messages service owns a dedicated vnode keyspace on the **existing** Scylla cluster,
following the replication validation used by ADR 0026. The existing tablet keyspace
cannot supply the required LWT on the tested Scylla 2025.1 cluster. The new optional
`SCYLLA_SCHEDULED_MESSAGE_KEYSPACE` defaults to `<SCYLLA_KEYSPACE>_scheduled`.
`SCHEDULED_MESSAGES_ENABLED` defaults to false until the complete backend and client
slice has passed review. Disabled nodes do not accept or execute schedules.

A journal partition is keyed by author and client-generated schedule UUID. Its row
contains the immutable channel, original request fingerprint, current revision,
draft, scheduled instant, state, chosen message ID and attempt ID. All state changes
use SERIAL/QUORUM compare-and-set against the expected revision/state. The author
cannot provide the resulting message Snowflake or attempt ID.

Separate bounded-page indexes support author/channel listing and due-work discovery.
An index entry is written before the journal create/edit is acknowledged. Workers
and list readers validate every entry against the journal; losing create/edit races
can leave harmless stale entries, which are cleaned in the background. A due scan
must recover overdue entries after restart, not jump straight to the current clock.
Index lag, orphan cleanup and overdue age need integration tests and metrics.

Terminal rows clear the draft immediately; the content-free idempotency record is
retained so replaying an old create cannot silently schedule a second message.
Terminal entries remain in channel lists for seven days; an exact author lookup
can still return the content-free record afterward. Storage grows by one small
record per accepted schedule. This cost is explicit; a future bounded-retention
protocol must reject expired request keys instead of treating them as new intents.

### Dispatch and cancellation

1. Before claiming a due `pending` row, resolve uncached channel access for its
   author. Validate current account access, Standard delivery, SEND_MESSAGES and,
   when requested, SEND_TTS_MESSAGES. Resolve the reply again and compose the final
   message. The internal bot/webhook bypass is never used.
2. Dependency failures before the claim remain retryable with backoff for at most
   24 hours after the scheduled instant. Permanent access, mode or validation
   failures become `failed` with a sanitized reason and no message write.
3. Allocate a current message Snowflake and CAS `pending` to `dispatching`, freezing
   its message and a unique attempt ID. An edit or cancellation competes with this
   same CAS. A successful cancellation prevents any dispatch claim; a losing one
   returns conflict. The resulting message ID is allocated at dispatch, not when
   the user schedules it, so chronological message ordering stays correct.
4. Exactly the worker that won the claim makes the single message insertion call.
   It does not call the public create use case again. Known success records `sent`
   and the message ID. An error known to precede insertion records `failed`.
   A timeout, lost result or crash after the claim records `delivery_unknown` when
   the worker cannot prove the outcome. No other worker starts a replacement send.
5. The original attempt may later certify `sent` using its matching attempt ID,
   including after uncertainty was reported. The state cannot move back to pending.
   A message delete does not cause the schedule to be replayed. A chosen message ID
   is a correlation link, not proof that an unknown attempt was delivered.

The dispatch implementation must disable opaque application-level write retries
that would violate this boundary. It cannot promise a deadline while its process
or dependencies are paused. The UI says “Delivery could not be confirmed” for an
unknown outcome and offers to inspect the channel, not an automatic Retry button.
Existing CREATE publication/accounting remains best effort; `sent` means the message
write succeeded, not that every device received its event or push notification.

### Rollout and recovery

This is a design, not evidence that the endpoints or scheduler are deployed. Route
the additive endpoints to messages and enable only a fully compatible set of
writers/workers after real adapter, race and client tests pass. No new secret is
required. Back up the schedule journal and indexes with the message and read-state
keyspaces. After restore, keep execution disabled until every nonterminal record
has been reconciled; restoring an older `pending` state must not resend a message
whose later `sent` state was lost. The safe default is to mark unreconciled jobs
uncertain and let their author inspect history, never to replay them automatically.

### Confirmation

- Real Scylla tests with two independent workers: one claim, one insertion call;
  duplicate create with the same key/body returns one job; conflicting body rejects.
- Deterministic cancel/edit/claim interleavings: successful cancel produces no
  insertion, stale revisions conflict, and a claimed draft cannot be edited.
- Fault injection before index/journal writes, before/after claim, after insertion
  with a lost response and before publication. Restart must not create another
  message or lose an accepted pending job; uncertain outcomes must remain visible.
- Fresh permission revocation, deleted channel/reply, changed delivery mode, TTS
  denial, dependency backoff, downtime past the due time and restore fencing.
- Client tests for timezone conversion, response loss with the same request key,
  cross-device edits, every status and private-mode rejection. A real two-account
  delivery check is required before calling messages#61 complete.
