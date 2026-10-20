# Desktop client: unread surfaces, notification rules and text context menu

Status: implemented in client PR for client#82 and client#84. Brand strings come from `apps/desktop/brand.json`.

## Unread and mention surfaces (client#84)

The renderer aggregates read state (`summarizeActivity`: total mention count, number of unmuted channels with unread messages) and pushes `{ mentions, unread }` to the main process over the `app:activity` IPC channel whenever guild, read-state or prefs stores change. The main process (`src/main/attention/`) renders it:

| Surface | Mentions | Unread only | Nothing |
|---|---|---|---|
| Windows taskbar overlay | red disc with the count (`!` above 99), generated BGRA bitmap | small light dot | cleared |
| macOS / Linux | `app.setBadgeCount(mentions)` | - | 0 |
| Tray icon | base icon with red dot | base icon with grey dot | base icon |
| Tray tooltip | `Brand - 2 mentions, 3 unread channels` | same | `Brand` |
| Window title | `(3) Brand` (`(99+)` cap) | bullet + `Brand` | `Brand` |

`app.setBadgeCount` is a no-op on Windows, hence the overlay. The renderer's `page-title-updated` is suppressed so the main process owns the title.

## Notification rules

Pure functions in `renderer/domain/notificationPolicy.ts`:

- `isMentioned`: DMs, direct `@user`, any role in `mention_roles` the viewer holds, `@everyone`/`@here` unless suppressed.
- `shouldNotify`: no notification when desktop notifications are off, DND, channel muted, the channel is focused, or level is `none`; level `mentions` requires a mention; level `all` notifies for every message. The "Only mentions" setting maps to level `mentions`, otherwise `all`.
- Role pings highlight the message (`is-mention`) and increment the channel mention count.

Esc marks the open channel read and Shift+Esc the open server (keybind `markRead`, rebindable in Settings, ignored while an overlay or text field has focus).

Deferred: in-app sound for unread messages in other channels, click-to-jump to the exact message, per-channel levels (api#28).

## Native text context menu (client#82)

`src/main/textMenu.ts` listens to `webContents` `context-menu`. Renderer menus call `preventDefault` on `contextmenu`, so Chromium never raises the event for them; the native menu only appears where the app has none. Contents:

- editable field: Cut, Copy, Paste, Select all (enabled from `editFlags`); for a misspelled word up to 5 suggestions plus "Add to dictionary";
- selected static text: Copy;
- links: Open link (http/https only), Copy link address;
- images: Copy image, Save image as.

Spellcheck uses the OS locale plus `en-US` when a dictionary is available. A themed in-app menu via IPC is a possible follow-up.
