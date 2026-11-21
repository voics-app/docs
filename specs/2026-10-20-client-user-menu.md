# Client UX: user context menu and profile popout

Status: implemented in [client#80](https://github.com/voics-app/client/issues/80) (supersedes client#52). Part of the Discord parity plan ([2026-10-20-discord-parity-gap](../plans/2026-10-20-discord-parity-gap.md), P0).

## Design

One shared component serves every place a user appears: `UserContextMenu`, bound to any element through `useUserMenu` or the `UserMenuTarget` wrapper (renders with `display: contents`). Which items appear is a pure function of permissions and relationship state (`domain/userMenuModel.ts`), built on the existing permission computation and role-hierarchy helpers (`domain/memberModeration.ts`). The guild owner and members with ADMINISTRATOR hold every permission bit and therefore see everything they outrank.

Moderation targets must be strictly below the actor's highest role; nobody can moderate the owner or themselves.

## Surfaces

| Surface | Trigger | Guild context |
| --- | --- | --- |
| Member list (right side) | row | yes |
| Voice channel occupants in the channel list (left side) | occupant row | yes |
| Call tiles (guild voice and DM calls) | tile | guild voice only |
| Chat author name and avatar | name, avatar | yes in guilds |
| @mentions in message text | mention chip | yes in guilds |
| Reply previews | avatar and name | yes in guilds |
| DM list (1:1 conversations) | row | no |
| Friends list | row | no |

Left-click on a user opens the profile popout on every surface that previously did.

## Item matrix

"Guild" items need a guild context and a known member. "Voice" items need the target in a voice channel.

| Item | Shown when | Permission and rules | Backend |
| --- | --- | --- | --- |
| Profile | always | none | `GET /users/{id}` |
| Mention | not self, a text channel is open | none | client-local composer insert |
| Message | not self | none | `POST /users/@me/channels` |
| Call | not self, not a bot, not blocked | none | DM channel + voice join |
| Add / Edit note | not self | none | device-local (api#51 tracks a server endpoint) |
| Add / Remove friend, Accept request | not self, not a bot, not blocked (Request sent is disabled) | none | `PUT/DELETE /users/@me/relationships/{id}` |
| Block / Unblock | not self, not a bot | none | `PUT {type: 2}` / `DELETE` relationships |
| Mute (local) | not self, target in voice | none | client-local, remembers previous volume |
| User volume | not self, target in voice | none | client-local, 0 to 200 percent |
| Change nickname / Edit Server Profile | guild | own: CHANGE_NICKNAME; others: MANAGE_NICKNAMES and outranks | `PATCH /guilds/{g}/members/{u}` |
| Roles (checkboxes) | guild | MANAGE_ROLES and outranks; only roles below the actor's highest role, never managed or @everyone | `PUT/DELETE .../roles/{role}` |
| Timeout (60s, 5m, 10m, 1h, 1d, 1w, Remove) | guild | MODERATE_MEMBERS and outranks | `PATCH member communication_disabled_until` |
| Kick | guild | KICK_MEMBERS and outranks, confirm dialog | `DELETE /guilds/{g}/members/{u}` |
| Ban | guild | BAN_MEMBERS and outranks, dialog with delete-history window and reason | `PUT /guilds/{g}/bans/{u}` (`delete_message_seconds`, see gaps) |
| Server mute / deafen | guild, voice | MUTE_MEMBERS / DEAFEN_MEMBERS and outranks | `PATCH member mute / deaf` |
| Move to, Disconnect | guild, voice | MOVE_MEMBERS (no hierarchy check, like Discord), not self | `PATCH member channel_id` |
| Copy user ID | always, last, below a separator | none | clipboard |

## Roles in the menu and popout

- The menu shows the member's roles as read-only coloured pills under the first group.
- The profile popout shows the same pills; with MANAGE_ROLES each assignable role pill has an "x" to remove, and a "+" opens the list of assignable roles not yet held.
- The member list groups by hoisted roles (highest first), then Online and Offline.

## Backend gaps

| Gap | Handling |
| --- | --- |
| No user notes endpoint | Notes stored on the device; api#51 |
| `delete_message_seconds` on ban | Enforced since api#52: api emits `BAN_MESSAGE_PURGE`, messages purges asynchronously; see [moderation tools and ban purge](2026-10-22-moderation-tools-and-ban-purge.md) |
