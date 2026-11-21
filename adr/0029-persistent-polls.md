# 0029 — Persistent polls with atomic votes and a closing fence

- Status: proposed
- Date: 2026-11-18
- Deciders: Voics maintainer review
- Technical story: [messages#14](https://github.com/voics-app/messages/issues/14)

## Context and Problem Statement

The message service has no poll state. A client counter or an unconditional read/increment/write loses concurrent votes and cannot settle a vote racing with poll expiry. Retries and reordered gateway events must not restore an old choice or reopen a finalized result.

## Decision Drivers

- Persist single-choice and multiple-choice votes across service restarts and devices.
- Authorize Standard channel access without introducing an internal or bot bypass.
- Bound every request, expiry scan and retry; never read all voters to count a poll.
- Keep current Scylla message data, replication and topology intact.
- Recover missed events through an authenticated authoritative snapshot.

## Considered Options

1. Store independent reaction-like rows and recompute totals by scanning all voters.
2. Use unconditional counters with application locks.
3. Use a companion vnode keyspace with one atomic metadata/voter partition per poll.

## Decision Outcome

Choose **3**. The companion `<SCYLLA_KEYSPACE>_polls` uses the same Scylla cluster and replication as the main keyspace. Tested Scylla 2025.1 tablet keyspaces cannot execute the required conditional batches; existing keyspaces are not recreated or converted. `SCYLLA_POLL_KEYSPACE` may select a distinct validated vnode keyspace. No second server is required.

The immutable definition is stored with its Standard message. The poll partition has one metadata row and one row per participant. Metadata contains expiry, open/finalized/deleted state, monotonically increasing result revision, at most ten counts and the number of participant rows. Each participant row contains its own revision and selected-answer bit mask. A conditional batch updates both rows under the observed metadata revision. A zero mask is retained with its revision so delayed old requests cannot resurrect a removed vote.

Admission is capped at 100,000 distinct participants per poll, including participants who later retract all answers. Existing participants may change or remove their choices at the cap. At most 64 CAS attempts are permitted per request; contention exhaustion returns a retryable dependency error rather than acknowledging an uncommitted vote. Each repository bounds local admission to 256 outstanding mutations and 256 fair hash stripes, with a five-second maximum admission wait. This reduces observed CAS starvation; independent repositories still serialize through Scylla. Answer counts and revisions fail closed on overflow. No counter column, unbounded voter scan or process-local lock is a correctness primitive.

### Two revisions

The caller submits `expected_vote_version`, scoped to its own vote on this poll. Another participant's change does not invalidate that precondition. A retry whose requested effect already holds returns the current snapshot without incrementing anything. Otherwise an outdated voter version returns 409. A single-choice PUT replaces the caller's earlier choice atomically; a multiple-choice PUT adds an answer. DELETE removes the named answer. Revisions are decimal strings compared numerically, never lexicographically.

The independent results `version` orders counts and finalization. Events carry complete authoritative counts. Clients do not add or subtract event deltas. Public events omit viewer-private `me_voted` facts; the actor's complete selection and vote version are included explicitly. Authenticated snapshots include the current viewer's selection. Missing results mean unknown, not zero. Equal result versions may hydrate the viewer's facts; an older viewer revision must never replace a newer one.

### Creation and deletion ordering

Reserve poll metadata and its due-index entry before inserting the message. The initial content-free metadata reservation has a 24-hour TTL. After the index write, a conditional activation rewrites every metadata column without TTL; only then may message insertion proceed. A pause beyond reservation expiry or a winning finalization prevents activation. An index-write failure therefore cannot leave a permanent undiscoverable reservation; accepted poll state never expires with that TTL. A poll metadata row alone grants no readable resource: HTTP operations also require the actual message and fresh channel access. A failed post-activation creation can leave an indexed, content-free orphan that is finalized normally; its small fence may remain. Closing an orphan is safe and must never recreate a missing message. Poll definition edits and forwarding a live poll are rejected explicitly.

Deleting a poll fences its metadata as deleted before removing the message or its participant rows. Late CAS attempts cannot write through that fence. Keep the small deleted metadata fence; remove participant rows and the due-index entry. Cleanup may be retried after failure and must not reopen the poll. Ordinary message history and gateway deletion semantics remain unchanged; this design does not claim a global transaction across the main message partition and companion partition.

### Closing and bounded expiry

Early expiry is an author-only mutation. Timed expiry and early expiry use the same metadata CAS, preserve the committed counts and increment the results version exactly once. A vote racing with that CAS is ordered either before finalization (included) or after it (rejected). Requests admitted at or after expiry cannot mutate a vote. A request already in flight across the deadline may be ordered before the finalization CAS; the UI disables new voting at the advertised instant and waits for `is_finalized` to label the tally final. This distinction avoids pretending a periodic worker is an exact wall-clock interrupt.

The durable due index uses 64 shards, a keyset cursor, pages of at most 100 entries, four page reads per one-second pass, at most four concurrent finalizations and 400 total retained tasks per replica. A full queue never advances past an unretained candidate; completion immediately refills an available slot. A failed entry remains discoverable on a later shard pass; a full page does not starve later entries. Cursors reset at shard end and restart at the head after a process restart. Discovery is limited to five seconds and each finalization to ten seconds; shutdown stops discovery/discards buffered work and drains active work for at most fifteen seconds. This is a nominal 16-tick idle rotation, plus IO and backlog, not a five-second delivery guarantee. A continuously growing backlog can extend a complete shard pass. No claim is made about production expiry latency until measured. Closing also occurs on a vote/expire command when the deadline has passed; GET remains a side-effect-free query.

### Authorization and supported content

The [poll specification](../specs/2026-11-18-polls.md) pins permissions, wire shapes and initial Unicode emoji scope. Permission checks use fresh API access, including account-disabled and timeout behavior. A gateway event is routed through the usual current VIEW_CHANNEL filter. Poll votes do not create unread counts or push notifications.

### Operations and compatibility

`POLLS_ENABLED=false` is the initial default and gates creation only. A compatible binary always opens the companion schema, serves existing polls and runs expiry; read-only companion-table probes and worker liveness are part of messages readiness even when creation is disabled. Existing messages and old clients remain readable because `poll` and new event names are additive. Consumers must ship version-aware poll handling before enabling creation. Public bot creation follows the same send/poll permission checks; internal/webhook/interaction creation cannot bypass them and is rejected for this slice. Bots may read results and end their own public poll but cannot vote.

Back up main and poll keyspaces together. Drain all poll-capable writers and expiry workers before a coordinated restore, retain replication/schema identity and keep creation disabled during verification. A restored empty companion cannot be treated as zero votes. Rollback disables creation, leaves reads/finalization available on compatible binaries and preserves both keyspaces; an old binary that ignores poll state is not a safe active writer/deleter. No new secret is introduced.

### Confirmation

Required evidence includes persistent concurrent voters across independent repositories; same-voter stale retry and add/remove/re-add races; single/multiple choice; revision and participant limits; vote/expiry/delete races; restart expiry discovery; full-page fairness; fresh denied/disabled/private-channel access; bot/internal rejection; actual HTTP fixtures checked against canonical schemas; and reordered/duplicate/missing-event client recovery. Unit tests alone do not establish Scylla atomicity. Local test timing must identify fixture adapters and must not be described as a production SLO.

## Pros and Cons of the Options

Full scans grow with participation and can disagree while votes change. Process locks cannot coordinate replicas, and unconditional counters do not atomically preserve deduplication or finalization. The selected partition gives precise revision ordering and bounded reads, at the cost of a hot-poll serialization point, an explicit participation cap and another keyspace in backup/restore procedures.

## More Information

- [Discord poll resource](https://docs.discord.com/developers/resources/poll) for the question/answer shape and optional result semantics.
- [Scylla lightweight transactions](https://docs.scylladb.com/manual/stable/features/lwt.html) for same-partition conditional batches and serial reads.
- [Atomic read accounting](0026-atomic-read-accounting.md) for the existing companion-keyspace deployment precedent.

Revisit the partition/cap after measured contention and dataset growth, or before adding custom guild emoji authorization, anonymous polls, voter directories or poll forwarding.
