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
