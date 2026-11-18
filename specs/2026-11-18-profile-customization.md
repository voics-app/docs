# Profile customization (api#43)

Status: contract and implementation plan; runtime/client acceptance pending. This specification
is published before implementation. No deployment, completed-card or live-verification claim.

## Public profile

`PATCH /users/@me` accepts optional nullable `pronouns` (40 Unicode characters), `theme_colors`
(exactly two RGB integers, 0–16777215), `accent_color` (one RGB integer) and `banner` (image data
URI). Pronouns are trimmed; blank clears them. Banner uses the same validated PNG/JPEG/GIF/WebP,
10 MiB decoded limit as avatars. Responses return a hash, never the upload bytes. User responses
and USER_UPDATE carry these public fields; account-private email/security fields remain private.

Omitted fields retain their stored value. Null resets a field. Theme colors are optional: without
them the client uses its existing theme; accent color remains a compatible banner fallback.
Global About me stays at300characters. No paid features or boosts are involved.

## Server profile

`PATCH /guilds/{guild_id}/members/{user_id}` adds nullable avatar/banner/bio. These fields are
self-only, including when an administrator attempts to edit another member. Existing nickname,
role, moderation and voice-move permissions are unchanged. A member can customize their images
and bio without CHANGE_NICKNAME; a nickname change still requires that permission.

Server bio has the same300character limit and trimming as global bio. Null/blank restores the
global bio; null images restore global images. Server images are stored at
`guilds/{guild_id}/users/{user_id}/avatars/{hash}.png` and the corresponding `banners` path;
animated `a_` hashes use `.gif`. Global images retain their existing CDN conventions.

Member DTOs, guild snapshots and GUILD_MEMBER_UPDATE include server avatar/banner/bio. Ordinary
moderation/nickname/role writes must preserve a concurrently saved server profile. Leaving and
rejoining starts a fresh server profile. Account anonymization clears all public profile text
and images. No new service, secret or environment setting is required; migration0054 is additive.

## Client behavior

The desktop Profile tab offers global and per-server editing, uploads/removal, pronouns, two
theme colors and a live preview. Save uses real APIs, retains drafts on failure and updates the
local user/member store on success. Changing scope cannot silently discard edits. A server
profile with no overrides clearly previews the global fallback. Nickname controls reflect the
member's CHANGE_NICKNAME permission.

Profile popouts/dialogs render the two colors, banner, pronouns and effective server avatar/bio.
Text remains readable against user-selected colors by keeping content on the established surface.
Image URLs are constructed from validated IDs/hashes and the configured CDN. Theme colors are
numeric and never interpreted as arbitrary CSS. Global fallback also applies outside a server.

## Verification required

Contract fixtures cover valid values, null reset, invalid lengths and out-of-range colors.
Real-Postgres HTTP tests first reproduce ignored fields, then verify persistence, public/private
DTOs, image validation/storage keys, per-server isolation, self-only writes, moderation permissions,
omitted/null semantics, member events and stale-write preservation. Client interaction tests
exercise preview, server fallback, save/error/retry/reset and uploads. Full repository gates and
isolated production-renderer browser acceptance precede the coordinator's integrated UI review.
