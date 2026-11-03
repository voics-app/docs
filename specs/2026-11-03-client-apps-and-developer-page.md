# Client: Apps submenu and developer page

Status: implemented in [client#77](https://github.com/discordy-voics/client/issues/77) (part of the Discord parity plan, P2). The app directory is a follow-up and out of scope.

## Apps submenu

Message and user context menus get an **Apps** submenu listing the context-menu commands of the applications installed where the menu opened.

- Commands come from `GET /guilds/{id}/application-command-index` (guilds) or the global commands of the caller's own and the recipient bots (DMs). `InteractionService` keeps the USER (type 2) and MESSAGE (type 3) commands per scope in `interactionStore.contextCommands`, next to the slash catalogue, and loads them when a menu opens. Creating or deleting a command in the developer page drops the caches.
- Message menu: MESSAGE commands, only for server-stored (standard delivery) messages. User menu: USER commands. The entry is hidden when no command applies, when the channel lacks USE_APPLICATION_COMMANDS, and in the user menu when the viewed channel is not in the menu's scope (the command runs in the viewed channel). With several applications, commands are grouped under the application name.
- Not gated by Developer mode (Settings, Advanced).
- Invoking posts `POST /interactions` with `type: 2` (APPLICATION_COMMAND), `application_id`, `channel_id`, `guild_id` and `data: { id, name, type, target_id }`, where `target_id` is the message or user id. The "thinking" placeholder, modals and follow-up messages reuse the slash-command flow. A bot reply to a context-menu command arrives as message type 23 (CONTEXT_MENU_COMMAND), rendered as a normal message (client#87).
- Pure code: `domain/contextCommands.ts` (extraction, submenu, payload), `appsSubmenu` used by `messageMenuModel` and `userMenuModel`.

## Developer page

Settings, App settings, **Developer** tab (`DeveloperTab.tsx`). It uses the existing API routes:

| Action | Route |
| --- | --- |
| List own applications | `GET /applications` |
| Create | `POST /applications` (name 2 to 32 characters, description up to 400) |
| Reset bot token | `POST /applications/{id}/bot/reset-token` |
| List, create, delete commands | `GET/POST /applications/{id}/commands`, `DELETE /applications/{id}/commands/{command_id}` (global scope) |

Command rules (`domain/developerPortal.ts`, mirror of the API): CHAT_INPUT names are lowercase letters, digits, `-` and `_`, 1 to 32 characters, with a 1 to 100 character description; USER and MESSAGE names are 1 to 32 characters, may contain spaces and carry no description.

### Bot token handling

The token is returned once by reset. It is kept in component state only (`tokenReducer`), shown in a read-only field with a Copy button (clipboard API), and discarded on Hide, when another application is selected, or when the page closes. Reset asks for confirmation because the old token stops working immediately. The token is never put in a URL, logged, cached by the query client or written to persistent storage.

## Follow-ups

- App directory (needs an api listing route and verified-app flags).
- Guild-scoped commands, command options editor, application icon and settings (`PATCH /applications/{id}`), install link generator (`/oauth2/authorize`).
- Context commands in DMs only appear for bots in the conversation and the caller's own applications.
