# Server discovery (api#74)

Status: existing search, categories, pagination and joining are implemented. The api#45 Community configuration and listing-report increment is in [API PR147](https://github.com/discordy-voics/api/pull/147), [client PR348](https://github.com/discordy-voics/client/pull/348), [admin PR34](https://github.com/discordy-voics/admin/pull/34) and [contracts PR46](https://github.com/discordy-voics/contracts/pull/46). Local API/client/admin tests pass; independent acceptance of the integrated versions remains pending. REST shapes are in `protocols/rest.md` (generated from contracts).

## Model

A guild opts in to a public listing; a row in `guild_discovery` (`guild_id`, `category`, `tags`, `listed_at`) means opted in. Public visibility additionally requires every eligibility rule to pass. The card text is the guild's own `description`; member and online counts are computed at query time (online via the presence directory, best effort, `null` when unavailable). There is no separate banner: the icon is used.

- Categories are a fixed slug list (`gaming`, `music`, `entertainment`, `science_tech`, `education`, `art_creative`, `community`, `other`) served by `GET /discovery/categories`; the client localises the labels.
- Tags: at most 5, 2-24 chars of letters, digits or `-`, lowercased and deduplicated server-side.

## Endpoints

| Route | Who | Behaviour |
| --- | --- | --- |
| `GET /discovery/guilds?query&category&tag&limit&offset` | any signed-in user (not bots) | Listed guilds that still qualify, largest first (`member_count DESC, id`). `query` matches name, description and tags (case-insensitive substring). `limit` 1-50 (default 24), `offset` pagination, `total` is the match count. |
| `GET /discovery/categories` | signed in | Category slugs. |
| `POST /discovery/guilds/{id}/join` | signed in user | Joins a listed, qualifying guild (204). No-op when already a member. 404 when the guild is not listed or no longer qualifies; 403 when banned; same guild cap as invites. Emits `MEMBER_ADD` and `GUILD_CREATE` like an invite join. |
| `GET /guilds/{id}/discovery` | `MANAGE_GUILD` | Current settings plus `blockers`. |
| `PUT /guilds/{id}/discovery` | `MANAGE_GUILD` | `{enabled, category, tags}`. `enabled:false` delists. Enabling is refused (400) while any blocker applies or the category/tags are invalid. |
| `PATCH /guilds/{id}` | `MANAGE_GUILD` | Set `features:["COMMUNITY"]` with `rules_channel_id` and `public_updates_channel_id`. `features:[]` disables Community, clears both channels and removes the listing in one transaction. Omitted features retain the current setting. |
| `POST /discovery/guilds/{id}/reports` | signed-in user | `{category, note?}`; 204 accepted/already open, 404 for a hidden or missing listing. Uses the existing report categories and reporter limit of 10 submissions/hour; note is at most 500 characters. |

## Community configuration

Both configured channels must belong to this guild and be standard-delivery text or announcement channels without age restriction. They may be the same channel. Enabling requires both; clearing one while enabled is rejected. Unknown feature names are rejected. Community is not automatically enabled by setting channel IDs.

Configured channels cannot be deleted, marked NSFW or switched to ephemeral/P2P delivery until replaced or Community is disabled. Deleting the whole guild still works. Ordinary guild updates must not overwrite Community settings from stale reads. Changes use the existing guild update event and audit action.

The Postgres adapter serializes Community changes, channel edits and listing writes on the guild row. A concurrent incompatible channel edit and Community enable cannot both commit. A concurrent listing request either commits before disable and is removed, or sees Community disabled and is refused.

Migrations `0052` and `0053` add the channel pair and the guild report kind/index. Existing discovery rows without Community configuration become hidden at rollout. Configure Community to restore eligibility; explicitly disabling Community removes the opt-in row, so re-enabling requires listing again. No new environment variables or infrastructure are needed.

## Moderation rules

Evaluated when enabling, again when joining, and in the search SQL, so a guild that stops qualifying disappears without being delisted:

1. Community is enabled with configured channels (`COMMUNITY_REQUIRED`).
2. Description of at least 10 characters (`DESCRIPTION_REQUIRED`).
3. At least `DISCOVERY_MIN_MEMBERS` members (default 5, `MEMBER_COUNT_TOO_LOW`).
4. Guild older than `DISCOVERY_MIN_GUILD_AGE_DAYS` (default 7, `GUILD_TOO_NEW`).
5. No channel marked `nsfw` (`NSFW_NOT_ALLOWED`).

Deleting a guild removes its listing (`ON DELETE CASCADE`).

Listing reports enter the existing admin Reports queue as kind `guild`. Evidence is a server-captured plain-text snapshot of the public name, description, category and tags, with the guild ID and owner at filing. Private channels, members and messages are not copied. Duplicate open reports by the same reporter are idempotent. Owners cannot report their own listings. Admin review shows the listing evidence and supports the existing resolve/dismiss actions with operator auditing. Filing alone never delists a server; a report requires human review. Listing removal is not implied by resolving a report.

## Client

- Server rail: a Discover (compass) button opens the Discover view (`view.kind = 'discover'`); "Join a server" keeps the invite dialog with a link icon.
- Discover view: search box (debounced), category chips, tag filter (click a tag on a card), card grid with description, tags, online/member counts and Join/Open, "Show more" pagination, loading/empty/error states.
- Server settings, Discovery tab (needs `MANAGE_GUILD`): Community toggle and rules/updates channel selectors, category, tags, blockers list, List/Save/Remove. Explain when an opted-in listing is paused by eligibility.
- Discover cards offer Report listing with category, optional note, public-evidence disclosure, pending/success/error states. Admin Reports distinguishes listing evidence from message or profile reports.

## Local verification

Seven Community HTTP tests use throwaway Postgres containers and the production adapters. They cover pair/type/mode/permission validation, disabling, channel/guild deletion, stale ordinary writes, concurrent incompatible edits/listing changes, audit changes, visibility/join/report eligibility, public evidence, duplicates, shared rate limits and admin resolution. The two existing discovery and seven existing message/user report tests also pass. Full API unit, formatting, Clippy and brand gates pass.

Client interaction tests cover setup, failed-save retry, disabling, paused listing status and report opening/submission. Core, desktop and mobile lint/typecheck/unit suites and the desktop production build pass. Admin has 46 web tests and 171 BFF unit tests, with lint/typecheck/format/Clippy/build checks passing. These automated checks do not claim a production deployment or replace the coordinator's independent UI acceptance.

The desktop production renderer also passes two headless Chromium scenarios at 1280×900 and 1000×720 against an isolated in-process REST/gateway fixture. Each covers Community setup, failed-save retry, listing, disabling and a public-listing report; the captured request contains only category and note. Settings and report-dialog screenshots were inspected at both sizes. All external requests are blocked and no live accounts are created. Reproduce with the Community browser-acceptance command in the client README. This checks the renderer and transport separately from the real-Postgres API tests above.

## Not in scope / follow-ups

Discovery splash/banner images, per-locale listings, appeals, ranking beyond member count, and a gateway event for listing changes (browsing is poll/refetch based). Membership screening/onboarding is api#40 and is not completed by Community setup.
