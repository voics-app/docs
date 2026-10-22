# Synced user settings (client#123)

Status: implemented in contracts#14, api#61 and client#144.

Preferences that describe the person follow the account to every device, as in Discord. Preferences that describe a device stay on it.

## Decision per preference

| Preference | Synced | Where in `UserSettings` |
|---|---|---|
| Theme (dark, OLED, light) | yes | `theme` |
| Message density (cozy, compact) | yes | `message_display_compact` |
| Accent colour | yes | `preferences.accent` |
| Text size | yes | `preferences.font_scale` (0.75 to 1.5) |
| Reduce motion | yes | `preferences.reduce_motion` |
| Show avatars in compact | yes | `preferences.show_avatars_in_compact` |
| Link previews (embeds) | yes | `preferences.link_previews` |
| Notification sounds master switch, per-sound switches, ringtone | yes | `preferences.notify_sounds`, `sound_toggles`, `ringtone` |
| Mentions only | yes | `preferences.notify_only_mentions` |
| Emoji skin tone, recent reactions | yes | `preferences.skin_tone`, `recent_reactions` |
| Status, custom status | yes (already) | `status`, `custom_status` |
| Locale, developer mode | yes (fields exist, no client UI yet) | `locale`, `developer_mode` |
| Server rail order and folders | yes (client#58) | `guild_folders`, `guild_positions` |
| Per-guild and DM notification settings, user notes | yes (api#55) | own endpoints |
| Audio and video devices, input and output volume, voice processing, push-to-talk, camera preset | no, device-specific | local |
| Keybinds | no (Discord keeps them local too) | local |
| Desktop notification toggle, taskbar flash | no, tied to the OS | local |
| Ringtone volume, media player volume | no, volume | local |
| Collapsed categories, call stage layouts | no, view state | local |
| Window state | no | main process |
| 12/24h timestamps, inline media, stickers, spoilers, saturation, zoom | not synced: the client has no such preference yet; they join `preferences` when built | n/a |

## Contract and storage

`UserSettings` gained `message_display_compact` (it was always `false`) and `preferences`, a sparse object (`UserPreferences`, closed key set, `additionalProperties: false`). A key is present only after the user, or the first-run migration, set it; clients use their own default for a missing key. `PATCH /users/@me/settings` accepts a partial `preferences` object and merges it key by key, so two devices changing different preferences never overwrite each other. Unknown keys and out-of-range values answer 400 with the field `preferences.<key>`.

Migration `0011_user_preferences.sql` adds `user_settings.message_display_compact` (BOOLEAN) and `preferences` (JSONB, default `{}`). Validation lives in `domain::user_preferences::merge`. The PATCH emits `USER_SETTINGS_UPDATE` (full settings) to the user's own sessions and READY carries the same object; no gateway change was needed.

## Client behaviour

The prefs store (`usePrefsStore`) stays what the UI reads and is persisted to localStorage, which is the cache until READY. `application/syncedPrefs.ts` keeps the synced keys (`application/syncedPrefsMap.ts` is the table above in code) in step with the server:

1. READY and `USER_SETTINGS_UPDATE` write server values into the store without echoing them back. A key the user edited and has not sent yet keeps the local value.
2. A local edit is sent as one PATCH, 600 ms after the last change, with only the keys that differ from the last confirmed server state.
3. A refused PATCH puts the keys back to the last confirmed value and shows a toast.
4. First run per account on a device: values still at the app default are left alone; values the user changed locally before sync existed are pushed up when the server holds nothing for that key (for theme and density: still the server default). The server wins everywhere else. A flag `discordy.prefs-sync.migrated.<userId>` in localStorage makes this happen once.

## Verification

Unit tests (`syncedPrefs.test.ts`, api `user_preferences` and `http_user_preferences`), and live spec `settings-sync.spec.ts`: two clients signed in as one user on the local stack, a theme, accent and notification-sound change on the first appears on the second and in `GET /users/@me/settings`, and a third, fresh device gets them from READY. The production smoke test step 7 ("notification settings sync to server") checks the same against production.
