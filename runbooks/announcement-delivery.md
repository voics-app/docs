# Announcement delivery (draft)

This document accompanies the unfinished announcement-channel work in api#36.
It does not authorize deployment. Validate the full two-server route and the
recovery procedure before enabling it for users.

Following creates a type-2 webhook in a destination text channel. No bearer
credential is issued for this hook. Publishing stores one publication and one
delivery per destination in the API database before the source message is
marked CROSSPOSTED. The API relay sends a stored snapshot to messages with a
reserved destination message ID and the follower webhook ID. Messages copies
attachments into the target channel and sets IS_CROSSPOST; it does not notify
destination users mentioned in the source text.

The relay claims pending deliveries once. A lost response or expired claim is
`unknown`, because a message may already have been stored. The relay checks
the reserved ID and expected webhook: if the destination still exists it marks
the delivery `delivered`. Absence does not prove failure: a user may have
deleted the delivered message. The relay therefore does not automatically send
an unknown delivery again. Investigate unknowns before deciding on any manual
action; never create a replacement message solely because the ID is absent.

The publication's `(source channel, source message)` key is unique, as is each
`(source channel, source message, destination)` delivery. Workers lock and claim
one pending row at a time. A second publisher cannot create another set of
deliveries for the same source message. A worker that dies before its claim is
committed leaves the row pending; once a claim is committed, a crash or a
transport error can leave the outcome unknown. A successful marker response
that is lost may be repeated: it changes only the separate source marker.
Repeated marker events can reach clients, so clients should apply updates
idempotently. If a source message disappears before its marker is written, the
relay cancels its pending deliveries. Deleting a follower cancels pending rows,
but cannot recall a request already claimed by a worker.

Inspect aggregate state without exposing message contents:

```sql
SELECT state, count(*) FROM announcement_deliveries GROUP BY state ORDER BY state;
SELECT count(*) FROM announcement_publications WHERE NOT marked;
```

Publishing is limited per source channel. Removing a follow cancels pending
deliveries, but an already claimed request can still complete. Deleted source
attachments may no longer be available when an asynchronous delivery attempts
to copy them. Pending records retain a Standard-mode content snapshot; after
all targets are terminal the relay clears the snapshot while retaining IDs for
duplicate prevention. Establish monitoring and an operator recovery workflow
before release. Back up the API publication journal together with messages and
object storage. Restoring a journal and message store from inconsistent points
can make a prior delivery ambiguous; keep the relay disabled until reconciled.
Keep `ANNOUNCEMENT_DELIVERY_ENABLED=false` during restore; this disables new
follow and publication admission as well as the worker. Enable it consistently
on all API replicas only after reconciling the journal with message storage.
Before enabling a new installation, migrate messages and drain older messages
replicas: older readers do not know the separate CROSSPOSTED marker column.
The optional GitOps ingress must be reviewed and activated separately; it is
not referenced by the reconciled default overlays.
