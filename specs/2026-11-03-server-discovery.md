# Server discovery (api#74)

Status: implemented in api (feature/74-server-discovery), contracts#20 and the desktop client Discover screen. REST shapes are in `protocols/rest.md` (generated from contracts).

## Model

A guild opts in to a public listing; a row in `guild_discovery` (`guild_id`, `category`, `tags`, `listed_at`) means "listed". The card text is the guild's own `description`; member and online counts are computed at query time (online via the presence directory, best effort, `null` when unavailable). There is no separate banner: the icon is used.

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

## Moderation rules

Evaluated when enabling, again when joining, and in the search SQL, so a guild that stops qualifying disappears without being delisted:

1. Description of at least 10 characters (`DESCRIPTION_REQUIRED`).
2. At least `DISCOVERY_MIN_MEMBERS` members (default 5, `MEMBER_COUNT_TOO_LOW`).
3. Guild older than `DISCOVERY_MIN_GUILD_AGE_DAYS` (default 7, `GUILD_TOO_NEW`).
4. No channel marked `nsfw` (`NSFW_NOT_ALLOWED`).

Deleting a guild removes its listing (`ON DELETE CASCADE`).

## Client

- Server rail: a Discover (compass) button opens the Discover view (`view.kind = 'discover'`); "Join a server" keeps the invite dialog with a link icon.
- Discover view: search box (debounced), category chips, tag filter (click a tag on a card), card grid with description, tags, online/member counts and Join/Open, "Show more" pagination, loading/empty/error states.
- Server settings, new Discovery tab (needs `MANAGE_GUILD`): category, tags, blockers list, List/Save/Remove.

## Not in scope / follow-ups

Discovery splash/banner images, per-locale listings, report/appeal flow, ranking beyond member count, and a gateway event for listing changes (browsing is poll/refetch based).
