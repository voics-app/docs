# Desktop client: keybinds editor, global shortcuts and the shortcuts dialog

Status: implemented in client PR for client#67 (builds on client#43 roving focus, client#90 navigation and client#101 Esc / Shift+Esc mark read).

Keybinds are **device-local**, like Discord: they live in `prefsStore.keybinds` (localStorage) and are never part of the synced user settings (see `2026-10-22-synced-user-settings.md`).

## Model (`renderer/domain/keybinds.ts`)

`Keybind = { id, action, keys, global? }`. `keys` is a described combination (`Ctrl+Shift+M`, `Alt+ArrowUp`; `Ctrl` also covers Cmd) or empty when unbound. The action catalog (`ACTION_CATALOG`) holds label, group, default keys, whether the action may be global and whether it is a held action.

| Group | Actions (default) |
|---|---|
| Voice | Toggle mute (Ctrl+Shift+M), toggle deafen (Ctrl+Shift+D), push to mute (unbound, held), toggle camera (Ctrl+Shift+V), start or stop screen share (Ctrl+Shift+S) |
| Calls | Answer incoming call (Ctrl+Shift+A), decline incoming call (Ctrl+Shift+X) |
| Navigation | Quick switcher (Ctrl+K), previous or next channel (Alt+Up / Down), previous or next unread channel (Alt+Shift+Up / Down), history back or forward (Alt+Left / Right) |
| General | Mark channel as read (Esc, Shift+Esc for the server), search (Ctrl+F), upload (Ctrl+Shift+U), toggle member list (Ctrl+U) |

Push to talk stays configured under Settings, Voice and video (it needs key-up and a bare key); the Keybinds tab lists it with a shortcut to that page.

Persisted binds are merged with the catalog on load (`mergeKeybinds`): user keys and global flags are kept, actions added in later releases appear with their defaults, unknown ones are dropped. So upgrading never loses or duplicates a bind.

Behaviour of the actions: answer and decline act on the DM call ringing for the user (`ringingCallFor`); screen share toggle stops a running share or opens the source picker while in a call; push to mute mutes while held and restores the mic on release only if it was live; unread navigation walks the open server's unmuted unread text channels (the DM list from Home) and wraps; history is an in-memory back/forward stack of visited views (50 entries, `domain/navHistory.ts`) fed by every navigation.

## Editor (Settings, Keybinds)

Rows grouped by Voice, Calls, Navigation, General. Per row: record button (Esc cancels, a modifier alone is ignored), Global switch (only on actions that may be global and only in the desktop app), Clear, per-action Reset (shown when changed), and a "Reset all to defaults" button. **Conflict detection**: a combination used by another bind or by a fixed shortcut (Ctrl+/, Ctrl+I, Ctrl+Alt+Up/Down) shows `Conflicts with ...` on the row; the bind is still saved, like Discord, so the user decides.

## Global (system-wide) scope

Electron's `globalShortcut` has no key-up, so everything global rides on the existing optional native key hook (`uiohook-napi`), shared through one `HookHub` in `src/main/hotkeys.ts` (started on the first listener, stopped when the last one leaves). `GlobalKeybinds` matches exact modifier sets plus the keycode, ignores auto-repeat, and for held actions (push to mute) also reports the release, including when a required modifier is let go or the registration changes.

Flow: the renderer sends the global specs (`hotkey:global`, from `globalSpecs()`) whenever binds change; main emits `hotkey:global-event {id, pressed}`; the renderer runs the action. While the hook delivers a bind the in-window handler skips it, so nothing fires twice. If the module cannot load (unsupported platform), `hotkey:global` returns false, the Global switches have no effect and the binds keep working while the window is focused. Only actions that make sense without the window may be global (mute, deafen, push to mute, camera, answer, decline); navigation and search stay in-window.

Limits: the hook only sees physical keys the OS reports (keycodes in `uiohookKeys.ts`); combinations with keys outside that table cannot be global. macOS needs the Accessibility permission for the hook. The hook observes but cannot swallow the keystroke, so the focused application still receives it.

## Shortcuts dialog (Ctrl+/)

Lists every bound action (with "(global)" for system-wide ones), push to talk when set, and the fixed shortcuts (servers, inbox, list navigation, context menu key, Esc). Unbound actions are omitted.

## Tests

`tests/unit/domain/keybinds.test.ts` (catalog, defaults without conflicts, merge/migration, conflicts, reset, global specs), `navHistory.test.ts` (history stack, unread picker), `tests/unit/main/hotkeys.test.ts` (hub, modifier matching, hold release, shared hook), `tests/unit/interface/KeybindsEditor.test.tsx` (record, conflict, reset, clear).
