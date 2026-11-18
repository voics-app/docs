# Server templates (api#44)

Status: the built-ins, API lifecycle and desktop create flow are implemented. Public web previews and accurate dirty-state tracking are the 18 November completion increment; independent UI/live acceptance remains required for api#44. REST shapes are in `protocols/rest.md` (generated from contracts).

## Model

A template is a shareable snapshot of a guild's settings, roles and channels, plus a name, a description and a usage counter. It follows Discord's guild template shape: `code`, `name`, `description`, `usage_count`, `creator_id`, `creator`, `created_at`, `updated_at`, `source_guild_id`, `serialized_source_guild`, `is_dirty`.

`serialized_source_guild` holds `name`, `description`, `verification_level`, `default_message_notifications`, `explicit_content_filter`, `afk_timeout`, `afk_channel_id`, `system_channel_id`, `roles` and `channels`. Ids inside it are template-local: `@everyone` is role `0`, other roles count from `1` in ascending position, channels count from `1`; `parent_id`, the AFK/system channel and overwrite targets use those local ids. Each channel carries `permission_overwrites` for roles (member overwrites are never captured).

Capture leaves out managed (bot) roles, threads and member overwrites. Instantiating validates every reference (a parent must be a category of the template, an overwrite must target a template role) and mints fresh Snowflakes, so one template can create any number of guilds. The creator of the new guild owns it and is its only member; template permission bits are masked to the known set.

Stored templates live in `guild_templates` (migration `0013_guild_templates.sql`): `code` primary key, `guild_id` unique (one template per guild, like Discord), `serialized_source_guild` as JSONB. Deleting the guild deletes its template.

## Built-in templates

Five templates ship in code (`domain::template`), not in the database: Gaming, Friends, Study Group, Community and Creators. Their codes are `builtin-gaming`, `builtin-friends`, `builtin-study-group`, `builtin-community` and `builtin-creators`; generated codes are alphanumeric, so the prefix never collides. Built-ins have a null creator and `source_guild_id`, a fixed `usage_count` of 0 and are read-only. They carry channels, roles (for example Moderator) and overwrites (read-only announcement channels, a staff-only channel in Community). "Create My Own" in the client keeps calling `POST /guilds` and gets the existing default layout.

## Endpoints

| Route | Who | Behaviour |
| --- | --- | --- |
| `GET /guilds/templates` | signed in | The built-in templates. |
| `GET /guilds/templates/{code}` | public, rate limited | Resolves the saved built-in or shared snapshot; 404 `10057` for an unknown code. Possession of the code grants preview access. |
| `POST /guilds/templates/{code}` | signed-in user (not bots) | `{name, icon?}`: creates a guild from the template (201, same body as `POST /guilds`). Increments `usage_count` of a shared template. Same 200-guild cap as `POST /guilds`. |
| `GET /guilds/{id}/templates` | `MANAGE_GUILD` | The guild's templates (zero or one). |
| `POST /guilds/{id}/templates` | `MANAGE_GUILD` | `{name, description?}` (name 1-100, description up to 120): snapshots the guild. A second template for the same guild is 400 with code `30031`. |
| `PUT /guilds/{id}/templates/{code}` | `MANAGE_GUILD` | Re-snapshots the guild into the template (Discord's "sync"); the returned `is_dirty` is false until the source structure changes again. |
| `PATCH /guilds/{id}/templates/{code}` | `MANAGE_GUILD` | Changes name and/or description (`description: null` clears it). |
| `DELETE /guilds/{id}/templates/{code}` | `MANAGE_GUILD` | Removes the template (204); its link stops working. |

A template that does not belong to the guild in the path is 404, as is a built-in code on the guild routes. New error code `UNKNOWN_GUILD_TEMPLATE` (10057, 404).

`is_dirty` compares the saved snapshot with a fresh capture of template-visible settings, roles and channels. Changes to members, messages, bot roles and member-specific overwrites do not make a template dirty. Public preview and creation continue to use the saved snapshot until the manager explicitly syncs. Reading a template never writes it. Deleting a template invalidates its public link.

The path `/guilds/templates/{code}` overlaps `/guilds/{guild_id}/...` as it does in Discord's API; the router matches the static `templates` segment first and guild ids are numeric, so there is no collision. The redocly `no-ambiguous-paths` rule is switched off in contracts for this reason.

## Client

- Create-server dialog: first step lists "Create My Own" (name, as before) and the built-in templates fetched from `GET /guilds/templates`, with a "Have a template link?" field below; picking a template goes to a name step and calls `POST /guilds/templates/{code}`. The "Tell us more" step of Discord's flow is left out (no use for the answer yet).
- Template link route: `discordy://template/{code}` (brand scheme, handled by the main process deep link filter) opens a preview dialog with the template's description, creator, usage count, role names and channels grouped by category, and a Create server button that asks for a name. Pasting a link or code in the create dialog opens the same preview.
- Server settings, Template tab (needs `MANAGE_GUILD`): generate the template link, copy it, rename, edit the description, sync with the server and delete. An out-of-date snapshot is labelled before syncing; a failed load offers retry instead of an empty create form.
- The shareable web URL is `https://<landing host>/template.html?code=<code>`. It is an ordinary static object, so publishing the website needs no ingress rewrite. The page previews the saved name, description, roles and channels without signing in, explains that it creates a new server, and offers an explicit Open in app action plus downloads. Unknown/deleted links show an unavailable state; connection failures offer retry. It never creates a guild automatically or embeds a session token. Existing app deep links and `/template/<code>` inputs remain accepted by the desktop parser.

## Not in scope / follow-ups

Several templates per guild, template previews of inline emojis/stickers, and applying a template to an existing guild remain outside this increment. Template audit actions are not part of api#44 acceptance and need their own event contract; no audit entry is claimed here.
