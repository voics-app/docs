# Thread browsing and membership (draft)

This describes the proposed browse and membership subset of api#34, not completed thread
parity. The API, gateway, messages and desktop changes remain subject to review and verification.

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
This is a deployment dependency, not authorization to deploy. The version and visibility design
still requires review and end-to-end testing, including removals, rejoin, replay and passive sessions.

## Proposed lock and lifecycle changes

A separate draft exposes the current `thread_locked` state on internal access and webhook
routing responses. The corresponding messages and gateway changes reject sends and relays to
locked threads, including sends with administrator permissions. A thread response without the
new lock field is treated as locked by updated consumers. Ship the API field before either
consumer; validate the combined forum-opener path and concurrent lock/send behavior before release.

The lifecycle draft stores clock-driven inactivity state and puts archive/reopen events in the
same transaction as the channel change. Its worker is not enabled: ordinary message writes do
not yet provide durable activity updates. Message count, deletes and historical backfill also need
an authoritative, retry-safe source. Do not infer successful archiving from the presence of the
migration or the lifecycle store.

## Verification

A synthetic Electron route covers signing in, browsing a channel?s active threads, joining a
thread and archiving it. This exercises a local fake backend, not the combined services or live
delivery.

## Remaining work

Automatic inactivity archiving, unarchive on a new message, message counts, and end-to-end delivery,
private invitation and notification behavior are not established by this subset. Do not close
api#34 until its complete acceptance criteria and normal user flow are verified.
