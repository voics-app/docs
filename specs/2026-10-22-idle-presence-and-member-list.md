# Automatic idle presence and member list parity (client#70, client#71)

Status: implemented in client#151. No contract, API or gateway change was needed.

## Automatic idle

The desktop app turns the status to Idle after a period without keyboard or mouse input anywhere on the computer, and back to Online on the next input, as Discord does.

| Rule | Behaviour |
|---|---|
| Source | Main process: `powerMonitor.getSystemIdleTime()` through IPC `idle:seconds`; `lock-screen`/`suspend` and `unlock-screen`/`resume` through `idle:lock`. |
| Timeout | Device-local desktop setting `idleTimeoutMinutes` (Settings, Desktop, "Go idle automatically": Never, 1, 5, 10, 15, 30, 60 minutes; default 10). Not synced, it describes the machine. |
| Poll | Every 10 s while signed in, plus on window focus and on lock changes. |
| Lock screen | Goes Idle at once, returns on unlock. |
| Manual choice | Idle only replaces Online. A manually chosen Do Not Disturb, Invisible or Idle is never changed, and picking a status by hand clears automatic idle. |
| Wire | `PRESENCE_UPDATE` (op 3) `{ status: "idle", activities, afk: true }` when automatic, back to the manual status with `afk: false`. IDENTIFY carries the same payload, so a reconnect keeps the state. |

Logic lives in `domain/selfPresence.ts` (pure rules and payload), `application/selfPresence.ts` (shared auto-idle flag, `currentPresence()`), `application/idleMonitor.ts` (poll loop) and `interface/app/desktopIntegration.ts` (wiring). The gateway aggregates sessions with the priority DND over Online over Idle, so a second active device keeps the user Online. Mobile "AFK" push behaviour does not apply (no mobile client). The browser build has no OS idle source and never goes idle automatically.

Test hook: when the app runs with `DISCORDY_E2E=1`, `globalThis.__e2eIdleSeconds` in the main process replaces the OS idle time. It is ignored in normal runs.

## Custom status

The custom status is now broadcast. The client sends it as a Discord-style activity `{ type: 4, name: "Custom Status", state: <text>, emoji? }` inside `PRESENCE_UPDATE` and IDENTIFY; the gateway already stores and fans out arbitrary activity maps, so other members see it in `PRESENCE_UPDATE`, `GUILD_CREATE.presences` and `GUILD_MEMBERS_CHUNK.presences`. The dialog gained "Clear after": Do not clear, 30 minutes, 1 hour, 4 hours, Today (local midnight). `expires_at` is stored in `custom_status` (already part of the contract); the client clears an expired status within 10 s and stops broadcasting it.

## Member list

`MemberList` shows, per guild:

- Groups: hoisted roles (highest first, online members only), Online, Offline, each with a count and a collapse toggle (`aria-expanded`). Collapse state is per guild session.
- Row: avatar with status dot (online, idle, dnd, offline), role-coloured name, crown for the owner, BOT tag, one activity line (a game as "Playing X" beats the custom status text).
- Hover card (350 ms, also on keyboard focus): larger avatar, names, owner crown, BOT tag, activity line, role pills.
- Search box: filters the loaded members at once (name, nickname, username; prefix matches first) and sends `REQUEST_GUILD_MEMBERS` with the query (limit 50, `presences: true`); chunks merge into the member store and the result list updates.
- Large guilds: above 150 rows the list renders only the visible window (`@tanstack/react-virtual`). GUILD_CREATE already carries the whole member map, so loading is not lazy yet; when gateway#12 (passive sessions and ranges) lands, the ranges subscription replaces the full map without changing the view model (`domain/memberList.ts`).

## Verification

Unit tests: `selfPresence.test.ts`, `idleMonitor.test.ts`, `memberList.test.ts`, `MemberList.test.tsx`, `desktop.test.ts`. Live spec `presence-idle.spec.ts` on the local stack with two Electron clients: B goes Idle when the OS idle clock passes the timeout and A sees the idle dot, B returns to Online, a manual Do Not Disturb survives idle, a custom status with expiry appears as A's activity line, the hoisted role group and owner crown render, and member search narrows the list.
