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

At the scheduled time, API replicas use row locking to enqueue bounded batches of targeted
reminders. The persisted key includes the event, member, scheduled start and schedule
revision. The desktop rechecks current visibility, interest and start time before showing
a reminder. Outbox publication is at least once; its stable envelope ID and reminder key
support deduplication. The proposed event-specific notifier consumer rechecks the current
recipient through an internal directory and sends generic APNs/FCM alerts. Its underlying
consumer starts at the latest offset and keeps deduplication in memory, while its bounded
queue can drop work. Restart, outage and overload therefore remain delivery gaps; real-device
tests and a durable recovery strategy are required before this feature is complete.

This is a proposed implementation, not a deployment or backup procedure. Verify the CRUD,
visibility, RSVP, cancellation, rescheduling, restart and concurrent-replica paths together
before release. Coordinate migration numbering with other API work before merging.
