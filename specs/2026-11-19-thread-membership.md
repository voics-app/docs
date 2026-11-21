# Thread browsing, membership, lock and lifecycle (api#34)

Specification of thread parity: browse, join/leave, private threads, lock, archive and
auto-archive. Gateway and messages protections must ship before the API (see the rollout section).

## Behavior

- `GET /channels/{parent}/threads?archived=false|true` returns threads the caller can view.
- `PUT` and `DELETE /channels/{thread}/thread-members/{user}` join/invite and leave/remove;
  `@me` identifies the caller. Targets must belong to the guild and view the parent. A manager
  can remove others; private-thread members can invite when the thread is invitable.
- A private thread requires parent visibility plus creator, thread membership or MANAGE_THREADS.
  If its parent is missing, access fails closed. The API and gateway enforce this separately.
- The internal channel-access endpoint must reject a user without VIEW_CHANNEL before exposing
  relay recipient IDs. The gateway separately checks the sender's permissions before relaying.
- Thread channel responses report the member count and, on viewer-specific REST responses,
  `is_thread_member`. Shared events do not contain another user's membership flag.
- Desktop uses the existing notification-settings resource for per-thread mute and levels.

## Internal state and rollout dependency

Migration 0084 stores memberships and versions. The API emits versioned full membership state
on the internal guild bus and includes it in internal gateway seeds. Gateway discards stale
versions, removes the internal fields before dispatch, and sends visibility changes to affected
sessions. Guild-member removal deletes memberships and emits a newer state. Messages must recheck
private-thread permissions rather than relying on its normal five-second access cache.

The gateway and messages protections must be available before an API sends the internal state or
allows membership changes; older gateways can forward unknown internal guild fields to clients.
This is a deployment dependency, not authorization to deploy. Verify
end to end after release: removals, rejoin, replay and passive sessions.

## Lock

The API exposes `thread_locked` on the internal access and webhook-routing responses. Messages
and the gateway relay path reject sends to locked threads, including senders with administrator
permissions. A response without the field is treated as locked by updated consumers, so deploy the
API before either consumer.

## Lifecycle and counts

Archive and reopen transitions are stored with the channel change in one transaction and publish
the usual thread update event. Messages reports each new message to the internal
`POST /internal/v1/threads/{id}/activity` route, which records the last activity time. A bounded
worker in the API archives threads after their `auto_archive_duration` of inactivity; a thread that
was archived automatically is reopened by the next message, while a manual archive stays archived.
`message_count` on thread responses comes from the authoritative message store through
`message_counts`, so list and detail responses agree.

## Verification

Integration jobs run against disposable PostgreSQL in CI (membership, lifecycle and lock). A
synthetic Electron route covers browsing a channel's threads, joining and archiving against a fake
backend. Live end-to-end delivery across services is verified after release, not in CI.
