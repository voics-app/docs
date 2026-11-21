# Guild insights, voice status and widget: implementation design

Tracking: [api#53](https://github.com/discordy-voics/api/issues/53). This is a
design in progress; the endpoints and feeds described here are not yet shipped.

## Boundaries

The API owns guild membership and channel permissions. The gateway's guild
process owns live voice state, including multiple sessions and disconnects. The
messages service owns committed messages. No service should infer membership in
a voice channel from stale API state or count a message from a request that
later rolls back. Never inspect encrypted message content to build statistics.

The channel's nullable `status` is independent of `topic` and is at most 500
Unicode characters. Only guild voice channels accept it. A caller must have
channel visibility and either the status permission or a current voice state in
that exact channel. The latter requires an authoritative gateway lookup, routed
to the owning guild process; unavailable gateway state must not grant access.
Status writes must not overwrite concurrent channel settings, and their
`CHANNEL_UPDATE` event must describe the committed channel state.

The proposed implementation uses `GATEWAY_INTERNAL_URL` for an authenticated
gateway lookup. An unset URL, a timeout, a non-success response or an invalid
body fails closed for the connected-member path. Operators must configure a
trusted internal HTTP(S) service endpoint and the existing shared internal
token; do not point this setting at a public or untrusted host. The explicit
permission path does not depend on gateway availability. The lookup is a
point-in-time check; a disconnect can race the following database commit.

## Counters

Counts represent events, not unique people: joins, departures and successfully
committed guild messages. Aggregate by UTC calendar day and guild; voice is
connected person-time. Multiple concurrent sessions for one member must not be
double counted. Split sessions at midnight and on channel/guild departure.
Message contents, DM activity and private call activity are excluded.

Durable delivery is required. Producers should record events in the same
transaction as the underlying change where possible. Consumers must commit a
deduplication key and counter update atomically, then acknowledge, so retries
and restarts cannot double count. Voice needs an explicit crash/restart and
reconciliation policy before implementation; an in-memory join timestamp alone
cannot account reliably for a gateway crash. A fresh installation must not
pretend historical days are complete. Document the collection start and gaps.

Insights require `MANAGE_GUILD`; expose only the requested seven or thirty UTC
days with a stable, documented response. Guild deletion must remove its data.
Test concurrent changes, duplicate delivery, rollback, restart, day boundaries,
authorization and deletion with real persistence.

The draft API records actual membership insertions and deletions transactionally.
Its preliminary read marks the collection's first day and the current day as
incomplete; days before collection are null. Message and voice values may be
partial or null and their coverage flags stay false while unverified. The existing messages
`MESSAGE_CREATE` publication is best effort after the Scylla write and cannot
by itself support a complete counter. The draft instead writes an idempotent,
content-free `(guild, UTC day, message ID)` marker in a logged batch with the
message. Markers survive message deletion and expire after 45 days. Ordinary and
scheduled storage share this hook; it counts stored Standard guild messages,
including bot, webhook and system messages. DM, ephemeral and P2P relays do not
write markers. Crosspost and any future storage path must also use it. A successful
marker read is only an observed count, not proof that every
writer used the hook. Establish a coverage start only after all writers have been
verified on the new version; mixed-version deployment and earlier history remain
incomplete. A future promotion must retain evidence of the writer inventory,
drain of old instances and in-flight writes, and the confirmed UTC start time;
the current reader always returns `coverage_complete: false` and provides no
promotion mechanism.
The reader exposes the stored Scylla schema-migration timestamp as
`source_initialized_at_ms`. This is the recorded migration time, at or after
table creation; it is not evidence that every writer had upgraded. A null
timestamp means the source cannot supply even that initialization evidence.
The API also exposes its own persisted activity-schema start as
`activity_source_initialized_at_ms`; it bounds membership collection but does
not establish complete voice coverage.

The draft gateway reports join, leave and periodic observations tagged with a
session and a fresh gateway-process generation. The API deduplicates and orders
observations transactionally, splits time at UTC midnight, and counts only time
between consecutive observations no more than 60 seconds apart. The gateway uses
a bounded retry queue; a crash, a long outage or queue overflow can lose samples.
Voice values are therefore observed lower bounds and voice coverage remains
false. Gateway process restarts and time lost between samples cannot yet be
reconstructed. This partial API is not ready for release.

## Public widget

Widgets default to disabled. Editing requires `MANAGE_GUILD`; the configured
channel must belong to the guild and be a text, announcement, voice or stage
channel. Removing that channel clears the setting. The initial public response
contains only the guild ID, name and icon; the configured channel is retained in
management settings but is not yet used to create or disclose an invite.
The unauthenticated JSON must reveal only explicitly public data: do not expose
private channels, member identities, presence, status text, invite tokens or
other information merely because the widget is enabled. Disabling or deleting
the configured channel must immediately make its public representation safe.
Test disabled, enabled, invalid/cross-guild channel, permission changes and
concurrent disable/read cases.

## Delivery order

Specify and validate contracts first, then implement producers and API
consumers with their migrations, then exercise the ordinary HTTP and gateway
routes against disposable services. Roll out producers, durable consumers and
API together according to a reviewed compatibility plan. No production
deployment or backup execution is implied by this design.

### Coverage in the response

Each UTC day reports `coverage.membership`, `coverage.messages`, and
`coverage.voice` as `complete`, `partial`, or `unavailable`. The period-level
`coverage` summarizes each source with its status and counts of complete,
partial, and unavailable days. `partial` values are observations that may omit
activity; `unavailable` values are null, not synthetic zeros. The current UTC
day is not a complete day. Message days before the marker schema was initialized
are unavailable; initialization alone does not establish writer coverage.
Voice observations remain partial because checkpoints cannot prove uninterrupted
fleet coverage. A controlled fixture can compare observed values with its known
inputs without asserting that production history is complete.
