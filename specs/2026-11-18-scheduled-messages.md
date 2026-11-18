# Scheduled messages

Status: proposed contract for [messages#61](https://github.com/discordy-voics/messages/issues/61).
The current server and clients do not implement this feature. See
[ADR 0028](../adr/0028-scheduled-message-dispatch.md) for storage, dispatch and recovery.

## User behavior

In a Standard channel, Send later opens a date/time choice in the user's local
timezone. The client shows the timezone and resulting date explicitly, converts
the instant to UTC, and preserves the draft until the server acknowledges it.
The chosen instant must be between one minute and 30 days in the future according
to the server clock. The server may send later during outages; it never sends early.

This first contract schedules text, TTS, an optional reply and the reply-ping/silent
options. Text must contain 1–2000 characters and cannot be whitespace-only.
Attachments, embeds, components and forwarding are not accepted; clients keep
Send later unavailable for those drafts and explain the limitation. Ephemeral/P2P
chats never upload a scheduled draft. Existing Send now behavior is unchanged.

The author can open their scheduled messages for the channel on another device.
Pending drafts can be edited, rescheduled or cancelled. Once dispatch starts they
are locked. A failure identifies the reason; an uncertain outcome says “Delivery
could not be confirmed” and offers to inspect the channel. A sent schedule links
to the message. There is no automatic retry after an uncertain dispatch.

## Additive REST contract

All paths are under `/api/v1`, owned by messages and authenticated by a **user**
Bearer session. Bots, webhooks and application tokens are excluded from this
initial surface. No draft is included in gateway events or other users' responses.

| Method and path | Behavior |
| --- | --- |
| `POST /channels/{channel_id}/messages/scheduled` | Accept `{request_id, scheduled_at, message}` and return the schedule, HTTP 201 on first acceptance or 200 on an identical replay. |
| `GET /channels/{channel_id}/messages/scheduled?after&limit` | List only the current author's jobs in UUID order, pending/dispatching/unknown plus terminal jobs from the last seven days. `limit` is 1–100, default 50. Return `{items, next_after}`; follow a non-null cursor even after an empty filtered page. |
| `GET /channels/{channel_id}/messages/scheduled/{schedule_id}` | Fetch the author's current schedule, including a retained content-free terminal record. |
| `PATCH /channels/{channel_id}/messages/scheduled/{schedule_id}` | `{expected_revision, scheduled_at?, message?}` replaces supplied fields on a pending job. At least one replacement is required; `message` replaces the entire draft. |
| `DELETE /channels/{channel_id}/messages/scheduled/{schedule_id}?expected_revision=N` | CAS a pending job to cancelled and return the resource. An already-cancelled job returns its current state, making a lost cancellation response safe to repeat. |

`request_id` is a client-generated, cryptographically random lowercase UUIDv4,
persisted with the exact original request before POST. It becomes `schedule_id`.
The client reuses that key/body after response loss. The author/key pair identifies
one intent across channels: using it with another channel or original request
returns 409. An identical replay returns the **current** resource even after edits,
dispatch or cancellation and does not revalidate the original time window.
The original normalized-request fingerprint remains separate from edited fields.

Creation and edits require fresh current channel access and Standard send
permissions. Exact/list/cancel operations are author-scoped and remain available
after send permission or membership is lost, so the author can inspect and remove
their own queued content. They grant no access to channel history. A resource
owned by another user or addressed through another channel returns 404.

All timestamps are RFC 3339 instants, normalized to UTC in responses. Revisions
are integers in 1..2147483647; each state/draft mutation advances them. Exhaustion
rejects further mutation. They are unrelated to message IDs, gateway sequence
or read-state versions. Clients replace a cached resource only with a higher
revision, and refetch after a stale-edit conflict instead of silently overwriting
another device's draft. No scheduled-message gateway dispatch is introduced here;
list/detail views refetch on entry, foreground and after mutations.

## Resource and states

Every resource contains `id`, `channel_id`, `author_id`, `revision`, `status`,
`scheduled_at`, `created_at`, `updated_at`, `message`, `message_id` and `failure`.
The message draft contains `content`, optional `tts` (default false), optional
`reply_to`, optional `replied_user` (default true) and optional `silent` (default
false). Delivery uses current permission/notification rules, not those captured
when the draft was created. Silent maps to SUPPRESS_NOTIFICATIONS (4096); it does
not create a new message-flag meaning.

| Status | Draft / message ID / failure | Allowed next states |
| --- | --- | --- |
| `pending` | Draft present, ID null, failure null | pending edit, dispatching, failed, cancelled |
| `dispatching` | Draft present, chosen ID present, failure null | sent, failed, delivery_unknown |
| `sent` | Draft cleared, ID present, failure null | terminal |
| `failed` | Draft cleared, ID null, sanitized failure present | terminal |
| `cancelled` | Draft cleared, ID null, failure null | terminal |
| `delivery_unknown` | Draft cleared, chosen ID present, failure `delivery_unknown` | sent only if the original attempt subsequently certifies success |

Failure values are `access_denied`, `channel_missing`, `delivery_mode_changed`,
`invalid_message`, `dependency_unavailable` and `delivery_unknown`. They never
contain draft text, tokens, internal endpoints or database errors. `sent` certifies
storage, not receipt by every device. An unknown outcome may have stored a message;
the selected message ID does not prove it exists. Cancelling a pending intent is
not deletion of a sent message; normal message deletion remains a separate action.

Validation returns the existing 400/50035 error envelope. Missing authentication
is 401; unsupported token kinds or send denial are 403; unknown resources are 404;
private delivery uses the existing 409/50160. A stale revision, non-pending mutation
or conflicting request key returns 409 with code 50035 and a field error. Existing
429 rate-limit headers apply. Temporary infrastructure errors before acceptance
return 503; clients may retry the same request key/body. They must not substitute
a new key merely because a response was lost.
