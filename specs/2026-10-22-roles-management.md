# Roles management (client#60)

Status: implemented in client#147; api hierarchy tests in api#64 (no api behaviour change needed).

Server Settings > Roles (`RolesEditor.tsx`, rules in `renderer/domain/roleManagement.ts`).

## Role list

- Ordered by hierarchy (highest position first), @everyone pinned last.
- Each row shows colour dot, optional emoji icon, Administrator shield and member count (@everyone counts all members).
- Drag to reorder with the HTML5 drag API. Rows the actor may not move show a lock icon: the owner may move every role, anyone else only roles strictly below their own highest role.
- A drop sends one bulk `PATCH /guilds/{id}/roles` with only the changed `{id, position}` entries. The model reuses the position slots held by movable roles, so locked roles never move and no role lands at or above the actor's rank. The list updates optimistically and rolls back on error.

## Role editor tabs

- Display: name, emoji icon (`unicode_emoji`), colour (presets plus custom picker), hoist, mentionable, delete.
- Permissions: grouped permission matrix with search, "Clear permissions", and a warning banner while Administrator is on. Toggles for permissions the actor lacks are disabled (the api rejects them unless owner or administrator).
- Manage members: members with the role (search, remove) and a search to add. Uses the member role endpoints.
- @everyone only has the Permissions tab (default permissions).
- Roles at or above the actor's rank open read-only with a notice.

## Server-side enforcement

The api rejects with 403 (50013): role edit/delete, member role add/remove and bulk position changes for any role at or above the actor's highest role unless the actor is the owner, and permission grants the actor lacks. Covered by `crates/infrastructure/tests/http_role_hierarchy.rs`.

## Deferred

- "View server as role" preview: deferred (needs a global permission-override mode in the channel and message views).
- Image role icons: only unicode emoji for now (`icon` is read-only in the role schema).
- Channel permission overwrites UI already exists in channel settings.
