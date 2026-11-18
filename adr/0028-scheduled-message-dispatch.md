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

A journal partition is keyed by author, with distinct rows for schedule UUIDs,
active-job discovery, the author's active count and per-channel counts. A job holds
the immutable channel, original request fingerprint, revision, draft, scheduled
instant, state, chosen message ID and attempt ID. SERIAL/QUORUM conditional batches
change the job and quota rows together against the expected author revision/state.
The server permits at most **100 active intents per author and 25 per channel**;
internal preparing reservations, pending jobs and dispatching jobs all occupy slots.
Terminal/unknown transitions release their slot in that same batch, exactly once.
The author cannot provide a resulting message Snowflake or attempt ID.

Creation first reserves quota in an internal `preparing` state. It writes the due
index and then CAS-activates the job as pending before acknowledging acceptance.
A due reader never deletes a preparing entry as an orphan. Preparing reservations
older than two minutes can be aborted by CAS; that state fences a paused creator
from subsequently activating. Author operations reconcile at most 100 such active
rows; an incomplete acceptance returns 503 and the caller retries the same key.
Edits likewise retain the old discoverable entry until the new index entry and
revision are committed. Real crash tests must prove both discovery and quota safety.

The due index has 64 fixed hash shards and ordered due-time/job keys. Each process
polls once per second, examines at most four pages of 100 candidates per tick and
allows at most four dispatches in flight. Shards rotate fairly. Persisted cursors
wrap to the start after each pass, including after restart, so an entry inserted
behind a cursor is revisited. A restart never jumps to the current date and discards
older work. Readers validate entries against journal state; cleanup deletes only
proven obsolete entries and shares the same scan budget. There is no whole-table
or unbounded in-memory recovery scan. The dataset itself is not a fixed-size queue;
load tests must measure full-pass duration and due-age under the supported load.

Terminal rows clear the draft immediately; the content-free idempotency record is
retained so replaying an old create cannot silently schedule a second message.
Terminal entries remain in channel lists for seven days; an exact author lookup
can still return the content-free record afterward. Storage grows by one small
record per accepted schedule, including growth of an author's journal partition.
This cost is explicit; a future bounded-retention
protocol must reject expired request keys instead of treating them as new intents.

### Dispatch and cancellation

1. Before claiming a due `pending` row, resolve uncached channel access for its
   author. Validate current account access, Standard delivery, SEND_MESSAGES and,
   when requested, SEND_TTS_MESSAGES. Resolve the reply again and compose the final
   message. The internal bot/webhook bypass is never used.
2. Dependency failures before the claim remain retryable with exponential backoff
   starting at one second, capped at 60 seconds with jitter, for at most 24 hours
   after the scheduled instant. Overdue jobs past that limit fail before a claim.
   Permanent access, mode or validation
   failures become `failed` with a sanitized reason and no message write.
3. Allocate a current message Snowflake and CAS `pending` to `dispatching`, freezing
   its message and a unique attempt ID. An edit or cancellation competes with this
   same CAS. A successful cancellation prevents any dispatch claim; a losing one
   returns conflict. The resulting message ID is allocated at dispatch, not when
   the user schedules it, so chronological message ordering stays correct.
4. After the claim, the winning worker performs another uncached author/access/mode
   check before the single insertion call. A worker paused **before** the claim
   cannot rely on the earlier permission result; revocation in that interval must
   fail without insertion. The post-claim lookup has a five-second timeout. Failure
   at this point is known to precede insertion and is terminal, not automatically
   retried. Authorization reflects that last lookup; permission revocation and a
   Scylla write are not one cross-service transaction, so a subsequent concurrent
   revocation retains the ordinary send path's check/write race.
   The worker does not call the public create use case again. Known success records `sent`
   and the message ID. An error known to precede insertion records `failed`.
   A timeout or lost result records `delivery_unknown` when the worker cannot prove
   the outcome. Recovery marks unresolved dispatches unknown once their claim is
   two minutes old, using the same bounded active/due scan. No other worker starts
   a replacement send. The two minutes are an eligibility threshold, not a promise
   that recovery runs during a complete outage.
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

Measure oldest due age, full scan-pass duration, pending/preparing/dispatching/unknown
counts, quota refusals and time from claim to terminal outcome. Alert when oldest
due age exceeds 60 seconds for five minutes, a preparing/dispatching claim exceeds
two minutes plus one completed scan pass, or any unknown outcome first appears.
These are operational investigation thresholds, not a delivery SLO. Every metric
has bounded labels; never attach author, channel, schedule or message IDs.

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
- Concurrent quota tests hit exactly 100 per author/25 per channel, including
  preparing reservations; cancellation/failure/unknown releases only once. Crash
  recovery cannot leak a slot forever or activate after its reservation was aborted.
- Deterministic cancel/edit/claim interleavings: successful cancel produces no
  insertion, stale revisions conflict, and a claimed draft cannot be edited.
- Fault injection before index/journal writes, before/after claim, after insertion
  with a lost response and before publication. Restart must not create another
  message or lose an accepted pending job; uncertain outcomes must remain visible.
- Fresh permission revocation, deleted channel/reply, changed delivery mode, TTS
  denial, dependency backoff, downtime past the due time and restore fencing.
- Pause before claim, revoke access, resume: the mandatory post-claim lookup denies
  insertion. Recovery tests exceed one page/shard, insert behind cursors, retain
  preparing entries and demonstrate the page/in-flight budgets with overdue jobs.
- Client tests for timezone conversion, response loss with the same request key,
  cross-device edits, every status and private-mode rejection. A real two-account
  delivery check is required before calling messages#61 complete.
