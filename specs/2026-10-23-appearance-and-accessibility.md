# Appearance parity and accessibility settings (client#66, client#65)

Status: implemented in contracts#18, api#71 and client#150.

Settings, Appearance and the new Settings, Accessibility page bring the Discord options that make the app comfortable to read and look at. Everything applies at once, through data attributes and custom properties on the document root set by `useAppearance`.

## Appearance (client#66)

| Option | Behaviour | Stored |
|---|---|---|
| Theme: Dark, OLED, Light | The three variants, as before. | synced `theme` |
| Sync with computer | Follows the OS light or dark setting. A light OS shows Light; a dark OS shows the chosen dark variant (Dark or OLED), or Dark when Light was chosen. | device only (`syncOsTheme`) |
| Message density | Cozy or Compact. Compact drops the avatar column unless "Show avatars in compact" is on, and halves the gap between groups. | synced `message_display_compact`, `show_avatars_in_compact` |
| Space between message groups | 0 to 32 px in steps of 4, default 16. CSS variable `--message-spacing`. | synced `message_spacing` |
| Channel list density | Cozy or Compact row heights of channels, navigation and direct messages. | device only (`channelListDensity`) |
| Text size | Chat and interface font scale, 85 to 130 percent. | synced `font_scale` |
| Zoom | 50 to 200 percent in steps of 10 through Electron `webFrame.setZoomFactor` (preload `app.setZoom`). Ctrl and plus or equals, Ctrl and minus, Ctrl and 0 (reset) work anywhere in the window; the factor is kept in the device prefs and re-applied on start. | device only (`zoom`) |

Not built: importing a theme JSON of token overrides (marked optional in the issue) and a live preview pane. A fourth, dimmer dark variant would need a new `theme` value in contracts and api; the existing three cover light, dark and darker (OLED).

## Accessibility (client#65)

| Option | Behaviour | Stored |
|---|---|---|
| Sync reduced motion with computer | The OS `prefers-reduced-motion` counts as "reduce motion" unless this is off. On by default. The CSS media query was removed so this switch can be honoured. | device only (`syncOsMotion`) |
| Reduce motion | Instant transitions, static speaking ring. | synced `reduce_motion` |
| Play GIFs automatically, Animate emoji, Animate stickers | When off, an animated image shows its first frame (drawn on a canvas) and plays while the pointer is over it. If the CDN does not allow reading the pixels (no CORS), the animation keeps playing rather than breaking the image. Applies to GIF attachments and embeds, and custom emoji in messages. | synced `animate_gifs`, `animate_emoji`, `animate_stickers` |
| Saturation | 0 to 100 percent; below 100 a `saturate()` filter is applied to the page. | synced `saturation` |
| Role colours | In the name (tint), As a dot beside the name, or Hidden. Applies to message authors and the member list. | synced `role_colors` |
| High contrast | Pure white (or black on Light) text, stronger muted text, an inset edge on buttons, fields, menus and dialogs, a thicker focus ring. | synced `high_contrast` |
| Always underline links | Underlines links in messages and the UI. | synced `link_underline` |
| Allow playback and use of /tts | Enables `/tts message` and reading text-to-speech messages aloud in the channel being viewed. | synced `tts_read_aloud` |
| Speech rate | 0.5x to 2x with a Test button, through the platform `speechSynthesis`. | synced `tts_rate` |

Forced colours: under `@media (forced-colors: active)` (Windows high contrast) the app uses the system palette, draws links underlined in `LinkText`, and keeps focus rings in `Highlight`. Keyboard focus rings and roving focus already existed (client#23); the page points at the shortcut list (Ctrl and /), which now includes the zoom keys.

### /tts

Typing `/tts text` in a standard chat sends the message with `tts: true` (`CreateMessageBody.tts`) and speaks it locally at once. In a server channel it requires `SEND_TTS_MESSAGES`; without it, or with the setting off, the composer shows an error and nothing is sent. Incoming messages with `tts: true` from others are read aloud when the setting is on and their channel is open. Known limit: the messages service currently stores and returns `tts: false` for every message, so other people only hear a `/tts` message once that service persists the flag (follow-up issue in the messages repository). The client side is complete.

## Contract and storage

`UserPreferences` (closed key set) gained ten keys: `saturation` (number 0 to 1), `role_colors` (`name`, `dot`, `hidden`), `link_underline`, `high_contrast`, `animate_gifs`, `animate_emoji`, `animate_stickers`, `tts_read_aloud` (booleans), `message_spacing` (integer 0 to 32) and `tts_rate` (number 0.5 to 2). Validation lives in `domain::user_preferences` with range checks; unknown keys and out-of-range values answer 400 on `preferences.<key>`. No migration (the column is JSONB). The sync rules are those of [Synced user settings](2026-10-22-synced-user-settings.md).

## Verification

Unit tests: `appearance.test.ts` (zoom steps and keys, effective theme and motion, role colours, `/tts` parsing, speech cleaning), `syncedPrefs.test.ts` (key mapping, bad values ignored, device-only keys not synced), `accessibilityTab.test.tsx` (switches write to the store, role dot, animated image) and api `user_preferences` tests. Live: `settings-overflow.spec.ts` now visits the Accessibility tab as well and must show no horizontal scroll at 1280, 1024 and 900 px.
