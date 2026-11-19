# Personal friend favourites and invitations

Status: draft for [api#103](https://github.com/discordy-voics/api/issues/103); dependent changes: [api#165](https://github.com/discordy-voics/api/pull/165), [client#376](https://github.com/discordy-voics/client/pull/376), [gitops#140](https://github.com/discordy-voics/gitops/pull/140), and [website#22](https://github.com/discordy-voics/website/pull/22). This document describes the proposed implementation, not a deployed feature.

## User flow and privacy

A user marks an existing friend as a favourite. The private list is scoped to the caller and is loaded for the friends and direct-message sections on desktop and mobile; removing or blocking the friendship clears the mark. The current clients do not receive realtime favourite changes from another device: they refresh the list when the session or view is initialized. Existing pinned DMs remain separate.

A user can create one current personal invite, valid for 24 hours, and revoke it. Creating a replacement invalidates the previous token. The token is returned only at creation; the API stores its hash. Anyone with the link can present it while signed in to send a friend request to the owner; the regular relationship rules reject self-targeting and a block by the target, and an existing incoming request can instead become a friendship. No raw token belongs in support tickets, analytics, application logs or screenshots. If a link is exposed, its owner can revoke it or create a replacement. A request already in flight when a revocation occurs may have passed validation; inspect the resulting relationship rather than assume cancellation.

The independent [friend-request source controls](https://github.com/discordy-voics/docs/pull/211) and [api#167](https://github.com/discordy-voics/api/issues/167) must be reconciled before both changes ship. This draft reuses the existing relationship use case; it does not specify that personal links bypass any future source restriction.

## Wire and app links

The machine-readable [contracts](https://github.com/discordy-voics/contracts) define the user-session-only API: `GET /users/@me/favourites`, `PUT` or `DELETE /users/@me/favourites/{user_id}`, `POST` or `DELETE /users/@me/friend-invites`, and `POST /friend-invites` with a token body. Invalid, expired or revoked tokens produce the unknown-invite response. A favourite PUT for a non-friend returns unknown user; DELETE is idempotent. The API does not publish favourite-change events in this draft.

The shareable HTTPS path is `/friend-invite/#<token>` on the active instance's landing origin. A fragment is not included in the HTTP request. The separate landing page validates the token shape and opens `voics://friend-invite/<token>`; it has an explicit fallback button when automatic opening is blocked. Desktop and mobile queue an app route until sign-in. Guild `/invite/` URLs and their Windows registration stay independent. The configured app scheme and landing origin must correspond to the intended instance; this flow is not an identity proof or a server invite.

## Delivery and operations

Ship the reviewed API and compatible apps together, including migration 0088. The website build contains a rendered personal landing page; gitops has the local-stack copy and a separate ingress. Both repositories pin a normalized page fingerprint and the website check also compares an available gitops checkout. Review the fingerprints in both PRs whenever the page changes; the two independent CI runs cannot by themselves prove the other repository's current branch matches. Publish the static page before enabling the ingress. Do not enable the route until the target instance and app protocol association have been verified; no production deployment is authorized by this document.

When restoring Postgres, invite records and hashes return to the backup's point in time, which can revive an invite revoked after that backup if it has not expired. Treat restored invite state as stale: delete personal invite records during the restore procedure before accepting traffic, and advise users to create fresh links. Favourite rows are private user data and follow the database backup and deletion lifecycle. This is a recovery plan, not a completed restore or backup.

## Evidence and limits

The dedicated API CI job exercises a disposable Postgres instance, including friend request, favourite removal, rotation, expiry and revocation. Desktop Electron tests exercise UI and app-route behavior with a fake backend; mobile tests cover favourite grouping, sharing, revocation and sign-in queuing. Browser checks cover valid and invalid fragments at desktop and mobile widths. These tests do not prove the installed operating-system association or a single live browser-to-app-to-Postgres flow. Android QA evidence is pending the shared emulator slot; other physical devices and production remain unverified.
