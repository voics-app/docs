# Server folders, synced server order and channel drag-and-drop (client#58, client#59)

Status: implemented in contracts#13, api#59 and client#133 (folders), client#134 (channel ordering).

## Server rail: folders and order (client#58)

The server rail is part of the user's settings, so it is the same on every device.

`UserSettings` (`GET/PATCH /users/@me/settings`, READY `user_settings`, `USER_SETTINGS_UPDATE`) gained two fields:

| Field | Meaning |
|---|---|
| `guild_folders[]` | The rail in order. Each entry is `{ id, name, color, guild_ids[] }`. `id` is `null` for a single, un-foldered server (exactly one `guild_ids` entry); a number identifies a folder. `name` is at most 32 characters or `null`; `color` is `0xRRGGBB` or `null`. |
| `guild_positions[]` | Flat server order, the flattened `guild_folders` (legacy mirror, kept for clients that predate folders). |

Storage: migration `0010_guild_folders.sql` adds `user_settings.guild_folders` (JSONB, default `[]`) and `guild_positions` (BIGINT[], default `{}`). The shape follows Discord's `guild_folders` so the later general user-settings sync (client#123) can carry the same fields unchanged.

Validation (api `update_settings`): at most 200 entries, 200 servers per folder, a folder holds at least one server, an entry without an id holds exactly one, folder ids are unique, a server appears once, names are at most 32 characters. Membership is not checked (Discord does not either); the client drops ids of servers the user is no longer in.

Fan-out: the PATCH emits the existing `USER_SETTINGS_UPDATE`, which the gateway delivers to the user's own sessions; no gateway change was needed. READY already includes `user_settings`.

Client behaviour:

1. `guildStore.rail` is the layout, `order` is its flattening. `normalizeRail` reconciles a stored layout with the servers the user is actually in (drops unknown/duplicate ids and empty folders, appends new servers as single entries). READY with an empty `guild_folders` falls back to `guild_positions`.
2. Drag a server: the upper quarter of a target inserts before, the lower quarter after, the middle drops onto it. Dropping onto a single server creates a folder (target first); onto a folder or one of its servers joins that folder. A folder reduced to one server turns back into a plain server. Folders themselves can be dragged.
3. Folder button: collapsed shows a 2x2 grid of server icons tinted with the folder colour, with a mention badge and unread pip aggregated over its servers; expanded shows the servers in a tinted column. Open/closed is device-local (`collapsedCategories`, key `folder-<id>`), like Discord.
4. Folder menu: Mark folder as read, Mute/Unmute folder (every server in it), Folder settings (name and colour), Ungroup servers. Server menu: Move up, Move down, Remove from folder (keyboard alternative to dragging).
5. Every change is applied locally first, then `PATCH /users/@me/settings { guild_folders, guild_positions }`; on failure the previous layout is restored and a toast is shown. Remote changes arrive as `USER_SETTINGS_UPDATE` and replace the layout.

## Channel and category ordering (client#59)

No backend change: `PATCH /guilds/{id}/channels` (`MANAGE_CHANNELS`) takes `[{ id, position, parent_id?, lock_permissions? }]`, validates that a parent is a category of the same guild (categories never nest), and emits one `CHANNEL_UPDATE` per changed channel to every member.

Client behaviour (`domain/channelOrder.ts`, `interface/app/channelOrderActions.ts`):

1. Only members with MANAGE_CHANNELS can drag. Channel rows and category headers are draggable; a row's upper/lower half inserts before/after it, a category header inserts at the start of that category, empty space in a category appends, and the top-level group (channels without a category) accepts drops, including when it is empty. Dragging a category over another category's upper/lower half reorders categories. A category cannot be dropped into another category.
2. The layout (`loose`, then categories with children) is renumbered per group; `diffMoves` sends only entries whose position or parent changed, with `parent_id` only when the category changed. The store is updated optimistically and restored if the request fails.
3. After a channel moves into a different category and its permission overwrites differ from that category's, a confirm dialog offers "Sync permissions": it sends the same entry with `lock_permissions: true`, which makes the server copy the category's overwrites. Cancelling keeps the channel's own permissions (the move itself is already saved).
4. Keyboard alternative: Move Up / Move Down in the channel and category menus (disabled at the ends). A channel at the edge of a category continues into the neighbouring category or the top-level group.
5. Other clients update live from `CHANNEL_UPDATE`.

Out of scope: voice-channel drag to move a member (client#92), threads (not part of the sidebar order).
