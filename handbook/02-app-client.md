# client

Summary: the Electron and React desktop app, with a Rust native crypto module.

| | |
|---|---|
| Repository | `discordy-voics/client` |
| Output | Windows NSIS installer on the update feed `https://discordy-updates.voics.nl`; macOS and Linux build from the same sources but CI does not publish them yet |
| Tech | Electron, React, Zustand, WebRTC, Rust (napi-rs, OpenMLS) |
| Catalog entry | [Service catalog: Desktop client](../services/catalog.md#desktop-client) |

## Folder map

| Path | What is there |
|---|---|
| `apps/desktop/src/main` | Main process: hardened window, typed IPC, tray, deep links, capture, push-to-talk, **updater**, crypto host. |
| `apps/desktop/src/preload` | The `window.discordy` bridge (context isolation, sandbox). |
| `apps/desktop/src/shared` | IPC contract and the local `contracts` module (REST, gateway, voice). |
| `apps/desktop/src/renderer/domain` | Pure logic: permissions, delivery modes, SDP synthesis, markdown, frame format. |
| `apps/desktop/src/renderer/application` | Zustand stores, use cases (session, privacy, voice, watch) and ports. |
| `apps/desktop/src/renderer/infrastructure` | HTTP and gateway clients, WebRTC, audio, workers. |
| `apps/desktop/src/renderer/interface` | React UI: design system, features, composition root. The component gallery is at `#/__gallery`. |
| `apps/desktop/brand.json` | The single source of branding (name, app id, protocol scheme, update feed host). |
| `apps/desktop/electron-builder.config.cjs` | Installer configuration; reads `brand.json`. |
| `native/crypto` | napi-rs module: OpenMLS, Ed25519 identity, encrypted local store. |
| `DESIGN.md`, `PRODUCT.md`, `ARCHITECTURE.md` | Design system, product notes, layering. |

## Configuration

`DISCORDY_PROFILE` (`production`, `local`, `custom`), `DISCORDY_API_URL`, `DISCORDY_GATEWAY_URL`, `DISCORDY_CDN_URL`, `UPDATE_FEED_URL`, `DISCORDY_USER_DATA_DIR` and `RENDERER_PORT` (to run a second client). Users can switch profile on the sign-in screen.

### Gateway recovery

Desktop and mobile use the same core gateway client. Every connection must receive
HELLO within 10 seconds, including a socket that opens without sending a frame or
emits an error without closing. After HELLO it has 30 seconds to complete READY or
RESUMED, even if heartbeats are acknowledged; duplicate HELLO frames cannot extend
this deadline. A connection failure before an advertised resume
endpoint completes READY or RESUMED discards that endpoint. Subsequent retries use
the configured gateway with the existing exponential backoff and jitter, retaining
the session ID and sequence and reading the current token for RESUME. A fresh READY
can supply a new resume endpoint; a successful RESUMED keeps the working route.

Authentication and intent close codes remain fatal. A missing token stops recovery;
an expired/non-resumable session follows the existing fresh IDENTIFY path. Manual
disconnect cancels both handshake deadlines and reconnect timers. Socket-construction
errors enter the same retry path instead of escaping the timer callback.

This recovery does not broaden CSP or authorize another origin. When diagnosing a
client stuck on Connecting, compare the configured gateway with READY's advertised
resume URL and inspect refused connections. Local QA must use consistent reachable
hosts and route API requests through its ingress so messages reach the messages
service. Changing production configuration or permitting arbitrary origins is not
a remedy for mismatched local endpoints.

## Run, test, release

```bash
pnpm install
pnpm build:native    # native/crypto for this platform
pnpm dev             # electron-vite with HMR
pnpm dev2            # a second instance (port 5174, own user data folder) for a second account
pnpm test:unit && pnpm typecheck && pnpm lint
pnpm test:e2e        # Playwright against the real Electron app and a fake backend
```

Releases and the auto-updater are explained in [Desktop client release and auto-update](09-desktop-client-release.md). Renaming the app is a `brand.json` edit. The mobile app skeleton in the same repository is described in [Mobile client](13-mobile-client.md).

## Renderer boot budget

Desktop settings (including server administration), the emoji picker and the slash-command panel load on demand. Transient import failures retry after 250, 500 and 1000 ms; the user can retry, close the feature or reload the app. A reload may discard unsaved work and can be necessary when the browser has cached a failed module request.

The client CI builds the renderer and reports the uncompressed JavaScript entry and its transitive static imports from the Vite manifest. The limit is 2,800,000 bytes; asynchronous chunks, CSS and workers are excluded. Run `pnpm --filter @discordy/desktop exec electron-vite build` followed by `node apps/desktop/scripts/check-renderer-budget.mjs` locally. Record the build revision, measured sizes and justification when changing the budget. The same check also runs in the container build.

Cold-start comparisons must identify the reference machine, operating system, build type, network and account state. Launch with a fresh isolated user-data directory and record several process-to-visible-auth timings and the median. The catalog names a reference Windows laptop without identifying it or defining a fresh profile. The client #24 Linux runner/container measurements use new processes and fresh user-data directories without flushing OS caches, so they are an additional reference, not a Windows SLO measurement. The client repository's renderer-performance guide contains the acceptance procedure; a fake-backend run is useful for repeatability but is not a production-network latency measurement.

## Appearance and accessibility

Settings, Appearance holds theme (Dark, OLED, Light, or sync with the computer), accent, message density and group spacing, channel list density, text size and window zoom (Ctrl plus, Ctrl minus, Ctrl 0, through `webFrame`). Settings, Accessibility holds reduced motion (also synced with the OS), GIF, emoji and sticker animation, saturation, role colour display, high contrast, link underlines and text to speech (`/tts`, read-aloud, speech rate). Everything is applied by `interface/app/appearance.ts` as data attributes and custom properties on the root element, styled in `theme/access.css`; Windows forced-colors mode uses the system palette. Zoom, the two sync-with-computer switches and channel list density stay on the device; the rest follows the account. Details: [Appearance and accessibility](../specs/2026-10-23-appearance-and-accessibility.md).

## Settings that follow your account

Presence: the status goes Idle on its own after the idle timeout (Settings, Desktop; default 10 minutes of keyboard and mouse inactivity, or at once when the screen locks) and back to Online on input; Do Not Disturb and Invisible are never changed. The custom status (with an optional expiry) is broadcast as an activity, so it shows under your name in other people's member lists, which are grouped by hoisted role, Online and Offline, collapsible (the collapsed groups are remembered per server on this device), searchable and windowed for large servers. Rows show a crown for the server owner, an APP tag for bots, the icon of the highest role that has one, and a speaker (named after the channel on hover) while the member is in voice. Details: [Idle presence and member list](../specs/2026-10-22-idle-presence-and-member-list.md).

Appearance and accessibility (theme, density, message spacing, accent, text size, reduce motion, saturation, role colours, high contrast, link underline, animation and text-to-speech switches), link previews, notification sounds and ringtone, mentions-only and emoji preferences are stored on the server in your user settings (`preferences`, merged key by key) and appear on every device you sign in on. The prefs store keeps a localStorage copy as a cache and sends changes as a debounced PATCH with rollback; the first sign-in per device uploads values you had changed locally before sync existed. Devices, volumes, keybinds, push-to-talk, desktop notification toggle and view state stay on the device. The full table is in [Synced user settings](../specs/2026-10-22-synced-user-settings.md).

## Server settings

Server Settings, Overview (needs Manage Server) edits the name, description, icon, voice region, server banner and invite splash, and these defaults. System messages channel: where the server posts its automatic messages, with switches for the random welcome message when someone joins, the reply prompt on welcome messages and the setup tips (the switches are off-limits while no channel is chosen). Inactive channel and timeout (1, 5, 15, 30 minutes or 1 hour): where idle voice members are moved. Default notification settings for new members: all messages or only mentions. Changes collect in the unsaved-changes bar and are sent together on Save; each one is recorded in the audit log.

Two system messages come from the server itself. A new member is announced in the system channel with a randomly picked greeting, and a new thread is announced in its parent channel with the thread's name. Join messages are on by default as soon as a system channel is set (new servers use the general channel); switch the welcome message off or pick no channel to stop them. If the post fails, the join or the thread still succeeds. Vanity URLs are not available yet (api#37).

## Call confirmation

Settings > Voice and video > Confirm before calling (on by default, stored on the device) asks "Start a voice call with X?" or "Start a video call with X?" before a call that nobody is in yet starts ringing, from the DM header, the friends list, profiles and the user menu. Joining a call that is already running never asks. Turn the switch off to ring straight away.

## Keybinds and shortcuts

Settings > Keybinds lists the actions in four groups (Voice, Calls, Navigation, General): mute, deafen, push to mute, camera, screen share, answer and decline a ringing call, quick switcher, previous and next channel, previous and next unread channel, history back and forward, mark read, search, upload and the member list. Click a shortcut and press the new combination (Esc cancels); Clear unbinds, Reset restores one action, Reset all restores everything. A combination used twice shows a conflict warning on the row. The Global switch (desktop app only; mute, deafen, push to mute, camera, answer, decline) makes the shortcut work while the app is in the background; it needs the native key hook and quietly stays window-only where that is unavailable. Push to talk is set under Voice and video. Ctrl+/ opens the list of every shortcut. Keybinds are saved on the device and are not synced to the account. Details: `specs/2026-10-22-client-keybinds.md`.

## User area and voice connection panel

The panel at the bottom of the channel list has the avatar (status menu), mute, deafen and the settings gear. Mute and deafen each have a small caret that opens a quick menu: the input (or output) device, the input (or output) volume slider, and a link to Voice and video settings. Choices are written to the same device-local preferences as Settings > Voice and video, so the voice engine applies them immediately. Tooltips show the action and the configured keybind (for example `Mute Ctrl+Shift+M`); they follow rebinding in Settings > Keybinds.

While connected, the voice dock above it shows the channel and server. The signal icon opens Connection details: average ping (over the last 60 samples), last ping, outbound packet loss, jitter, bitrate, region, encryption state (end-to-end MLS or transport only) and transport (DTLS-SRTP over WebRTC). The dock and the call stage also have a noise suppression toggle (the RNNoise setting) and a camera button with a caret for choosing the camera (Test camera opens Voice and video settings). Soundboard and activities buttons arrive with voice#10 and api#50. Logic lives in `domain/voicePanel.ts`; the menus in `interface/features/voice/DeviceMenus.tsx`.

## Devices and login sessions

Settings > Devices starts with Logged-in devices: each login session of the account with its client and OS, approximate country when known, the name of its encrypted-message device and when it was last active, with this device marked and listed first. Log out on a row signs that device out; Log out all known devices (after a confirmation) signs out every device except this one. The revoked device is disconnected right away and returns to its sign-in screen. Below it, Encrypted-message devices lists the devices that can receive your encrypted messages. Logic lives in `domain/authSessions.ts`; the list in `interface/features/settings/user/SessionsList.tsx`. The endpoints are described in the api page.

## Desktop integration settings

Settings > Desktop holds device-local options (never synced to the account), stored in `main-settings.json` in the user data folder and validated in the main process (`src/main/desktop/`):

| Option | Effect |
| --- | --- |
| Open Voics at login | `app.setLoginItemSettings` on Windows and macOS; an XDG autostart entry on Linux. Only packaged builds register, so a dev run never registers the bare Electron binary. |
| Start minimized | The login item passes `--hidden`; the window stays in the tray at login. A normal launch always shows the window. |
| Show in system tray | Default on. Creates or removes the tray icon live; with it off, the close button quits and Start minimized has no effect. |
| Minimize to tray | Default off. The minimize button hides the window to the tray instead of the taskbar. |
| Close button minimizes to tray | The close button hides the window (default on Windows and macOS, off on Linux). Quit from the tray menu. Without a tray the close button quits. |
| Hardware acceleration | `app.disableHardwareAcceleration()` runs at startup from the local settings file, so a change needs a restart (the page offers **Restart now**). |

In Ephemeral and P2P chats the delivery-mode popover (the badge in the header) has a Disappearing messages timer, and Delete on your own message deletes it for everyone (see [delivery modes](../protocols/delivery-modes.md)). The tray menu shows Open, the unread and mention summary, Mute and Deafen toggles (the renderer reports its self voice state; clicks are sent back as commands), the version, Check for updates and Quit. A single-instance lock makes a second launch (or a `voics://` link) focus the existing window. Links in account emails work too: `voics://reset-password?token=...` opens the sign-in screen on the new-password form with the token filled in, and `voics://verify-email?token=...` verifies the address (a notice on the sign-in screen when signed out, a toast when signed in; a reset link while signed in asks you to sign out first). The token must be 16 to 128 base64url characters, otherwise the link is dropped, and it is never logged. The `voics://` scheme is registered by the installer (`protocols` in `electron-builder.config.cjs`) and again at each start. Update behaviour is described in [Desktop client release and auto-update](09-desktop-client-release.md).

## Reporting

Report Message (message menu, other people's messages), Report (user menu and profile dialog) open the report dialog: nine categories, an optional note, the text of what the report shares and, for ephemeral and P2P messages, a "Send the text of this message" checkbox (the server holds no copy of such chats). The request goes to `POST /api/v1/reports`; the dialog confirms and never says what happened to the report. The model and the send command are shared with the mobile app in `@discordy/core`; see the [moderation spec](../specs/2026-10-22-moderation-tools-and-ban-purge.md#reporting-a-message-or-a-user-api126).

## Friends and direct messages

When a friend request becomes a friendship (the gateway's `RELATIONSHIP_ADD` with type 1, on either side) the client creates the DM with `POST /users/@me/channels` (idempotent), adds it to Direct Messages and reopens it if it had been closed. The top of an empty or fully loaded 1:1 DM shows a large avatar, the display name, the username and "This is the beginning of your direct message history with @name."; while the DM has no messages, a "Wave to name" button sends a wave message and then disappears. Logic in `domain/dmIntro.ts`, view in `interface/features/chat/DmIntro.tsx`.

The profile dialog and the DM profile panel show "Friends since" with the date, read from `Relationship.since`. Clicking the avatar in either one opens it full size in the image viewer. The About me field allows 300 characters (`BIO_MAX_LENGTH`); the api stores and validates the same limit from api 0.13.0.

Server avatars also appear in member rows and hover cards, chat authors and replies,
command headers, mention/reaction lists, and voice occupants and tiles. These views
use their explicit server context and the shared profile-image resolver, including
the `/guilds/<guild>/users/<user>/avatars/<hash>` path. They react to member-profile
updates; clearing an override restores the global avatar. DMs and account controls
remain global. An image failure leaves initials, presence and speaking indicators
visible, and changing the image starts a fresh load attempt.

## Pinned DMs and pinned channels

Right-click a DM or group DM and choose Pin Conversation to keep it at the top of Direct Messages, marked with a small pin; up to 5 can be pinned (Pin is greyed out when full) and they stay in pin order above the rest, which keep their latest-activity order. Closing a pinned DM unpins it. In any server, right-click a channel and choose Pin Channel: pinned channels appear in a Pinned section above the categories, only for you, up to 10 per server. Both lists follow the account: they are stored as `pinned_dm_channel_ids` and `pinned_channel_ids` (server id to channel ids) in the user settings, validated by the api (limits, no duplicates), applied optimistically with rollback on failure and refreshed on other devices through `USER_SETTINGS_UPDATE`. Logic in `domain/pins.ts`, actions in `interface/app/pinActions.ts`, menus in `domain/dmModel.ts` and `domain/channelMenuModel.ts`.

## Leaving several group DMs at once

In the Direct Messages header, the select button (checklist icon, shown when you have at least one group DM) turns on selection mode: group DMs get a checkbox, 1:1 DMs are dimmed and cannot be selected. A bar at the bottom shows Cancel and Leave N. Leave N opens one confirmation titled with the number of group DMs to be left; on confirm they are left one after another (to respect rate limits) with the same call as the single Leave Group. If some fail, the rest still complete and one toast lists the groups that could not be left. Selection ids that disappear from the list meanwhile are dropped. There is no automatic Leave inactive group DMs option yet. Logic in `domain/groupDmSelection.ts`, action in `interface/app/dmActions.ts`, view in `interface/features/home/HomeSidebar.tsx`.

## Markdown tables and timestamps

Messages render GitHub-style pipe tables: a header row, a delimiter row (`|---|`, with `:--`, `:-:` and `--:` for left, centre and right alignment) and body rows. Outer pipes are optional, `\|` keeps a pipe inside a cell, short rows are padded and extra cells are dropped. Cells hold inline markdown only and are rendered as elements, never raw HTML. A wide table scrolls horizontally inside the message. Limits: 12 columns (wider input stays literal text) and 50 rows (later rows stay text). The parser is `domain/markdown.ts`.

Dynamic timestamps (`<t:unix:format>`, formats `t T d D f F R`) show in each reader's time zone with the full date and time on hover. To write one, type `@time` in the composer or press the clock button: pick a date, a time and a format (the list previews each one) and Insert adds the timestamp at the cursor. The model is `domain/timestampPicker.ts`.

## Media viewer

Images and videos open in one lightbox with the same chrome: Save as, Open original and a Close button; clicking outside the media and Esc also close it. The video player's own fullscreen button is hidden there.

A message with several images shows at most four tiles. With more images the fourth tile shows "+N" and opens the viewer at that image, with all images available as siblings (`gridTiles` in core). In the viewer, arrows, keys and a left or right swipe move between images; swiping only works when the image is not zoomed, so panning stays usable (`swipeDirection` in core).

Screen shares can be zoomed and panned, both the ones you watch and your own. The wheel or a trackpad pinch zooms toward the pointer from 1x to 8x, dragging pans while zoomed, and a double-click or the zoom badge resets. At 1x a double-click still toggles full screen. Cameras and the blurred preview do not zoom, and the zoom resets when entering or leaving full screen. The maths is in core `domain/panZoom`, the desktop hook is `usePanZoom`.

## Sounds

The desktop client plays short sound effects and the call ringtone. All of them are synthesized with Web Audio (original, no audio files, no licensing), through one shared `AudioContext` that is resumed on use and routed to the selected output device at the output volume.

- Sounds: you join a call, you disconnect, someone joins your call, someone leaves your call, mute, unmute, deafen, undeafen. Which sound a state change triggers lives in `domain/sounds.ts` (`voiceTransitionSounds`); people already in the channel when you join are not announced.
- Message and friend-request sounds: a new message that deserves an alert (a DM or mention, or any message at the "all messages" level; not muted, not Do Not Disturb, not the channel you are looking at in the focused window) plays the message sound in the app, whether or not desktop notifications are on; a new incoming friend request plays its own sound. Both default on and have per-sound switches. The OS toast itself is silent so the sound is never doubled.
- Ringtone: an incoming DM or group call rings in a loop until it is answered, declined or times out; the caller hears a quieter ringback. The ringtone and volume are chosen in Settings, Notifications.
- Settings, Notifications: "Notification sounds" is the master switch; each sound has its own switch and a Preview button (stored in the device prefs as `soundToggles`, a missing entry means on). Do Not Disturb silences the effects; an incoming call still rings, because it is addressed to you and the prompt is shown anyway.
- The main window sets `autoplayPolicy: no-user-gesture-required`: a context created without user activation stays suspended (silent), which is why a freshly started app did not ring (client#126). One shared `AudioContext` is also unlocked on the first click or key press, and the main process sets the autoplay switch app-wide.
