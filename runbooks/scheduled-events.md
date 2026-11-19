# Scheduled event reminders (draft)

The proposed API worker scans due events, claims rows with `SKIP LOCKED`, and enqueues
user-targeted `GUILD_SCHEDULED_EVENT_START` records in the existing Postgres outbox. It
records the event, user, start and schedule revision in the same transaction. A restart
retries uncommitted work; the relay can republish a committed record, so consumers must
deduplicate. The desktop re-fetches event access and interest before showing a reminder.

This path has not been deployed or verified end to end. The current mobile push notifier
ignores the new event; a separate consumer, permission recheck and real-device test are
required for offline delivery. Do not describe an outbox row as proof of a delivered push.

Before release, exercise two API replicas, creation, interest, cancellation, rescheduling,
permission removal, restart during enqueue, replay and the resulting desktop notification.
Inspect outbox backlog and worker errors if a reminder is late. Do not manually delete
claims to retry: that can duplicate reminders. Back up and restore Postgres event, interest,
claim and outbox state together according to the existing backup plan; no backup action is
authorized by this draft.
