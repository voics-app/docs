# Scheduled guild events (draft)

This draft accompanies [api#49](https://github.com/discordy-voics/api/issues/49). A guild
event can be external, voice or stage, with a start time, optional description and cover.
External events require a location and end time. Voice and stage events require a matching
visible channel. Only members can list events; channel-scoped events are filtered by
`VIEW_CHANNEL`. A creator with `CREATE_EVENTS` can manage their events; `MANAGE_EVENTS`
allows managing all visible events.

The API stores event changes and gateway outbox records in the same transaction. Interest
is unique per member and event; repeated PUT or DELETE requests do not emit duplicate
interest events. A channel change emits a delete to the old visibility scope and a create
to the new scope. The gateway uses the `GUILD_SCHEDULED_EVENTS` intent for these events.

At the scheduled time API replicas enqueue targeted gateway reminders and durable per-device delivery records. A notifier leases records, rechecks access, interest, mute, schedule and token, then acknowledges terminal results or retries transient failures. Expired leases can be reclaimed; retries expire five minutes after the scheduled start. A stable delivery ID supports provider collapse.

The new delivery and restart paths require integrated verification. Provider acceptance does not prove display; a crash between sending and acknowledgement can cause duplicate alerts, and collapse is best effort. Real-device delivery remains unverified. Verify CRUD, visibility, RSVP, cancellation, rescheduling, restart and concurrent replicas before release. Coordinate migration numbering before merging. No deployment or backup action is authorized by this draft.
