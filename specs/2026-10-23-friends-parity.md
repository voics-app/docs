# Friends parity: search, pending split, calls, Active Now, mutuals (client#72)

Status: implemented in client#160, api#75 and contracts#19. Part of the Discord parity plan ([gap audit](../plans/2026-10-20-discord-parity-gap.md), P1).

## Friends page

| Area | Behaviour |
|---|---|
| Tabs | Online, All, Pending, Blocked, Add friend. Each shows a count badge (Pending is red and counts incoming plus outgoing). |
| Search | One field above the list filters the current tab by nickname, display name or username (case-insensitive). No matches shows "No matches". |
| Order | Friends are sorted by display name (`domain/friendsModel.ts`, pure and unit tested). |
| Pending | Two headed groups: Incoming (Accept, Ignore) and Outgoing (Cancel request). |
| Row actions | Friends: Message, Voice call, Video call (opens the DM, joins its call, turns the camera on), Remove friend. Blocked: Unblock. The row also carries the shared user context menu and opens the profile. |
| Add friend | By username. Failures are explained: unknown name (404), not accepting requests (403), rate limited (429), yourself, bots, offline (`friendRequestError`). |
| Active Now | Right column listing friends in a voice channel (channel and server shown) or playing something (activity type 0). Hidden under 900 px. |

New friends reach the New DM picker at once: `RELATIONSHIP_ADD` upserts the relationship store and `dmCandidates` reads that store (client#28).

## Profile

The profile dialog adds Call next to Message, Add or Remove friend and Block, and a **Mutual servers** and **Mutual friends** section loaded from `GET /users/{id}/profile`.

## API

`GET /users/{user_id}/profile` returns `{ user, mutual_guilds: [{ id, nick }], mutual_friends: [User] }`. Mutual servers are the intersection of both users' guild memberships (`nick` is the target's nickname there); mutual friends are users who are friends of both. Your own profile returns empty lists, an unknown user is 404. No new repository methods: the use case `users/get_profile` intersects existing port results. Contract: `schemas/rest/user-profile.json`, operation `getUserProfile`.

## Not built

Friend nicknames: the `nickname` field on `Relationship` is displayed when present, but there is no endpoint to set it yet (optional in the issue).

## Verification

Unit: `friendsModel.test.ts`. API: `http_user_profile.rs` (testcontainers). Live: `tests/live/friends-parity.spec.ts` (two Electron clients on the local stack: unknown-name error, requests, cancel, accept, search, call buttons).
