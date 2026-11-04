# Discord parity gap audit

Date: 2026-10-20. Scope: the Voics desktop client and the backend features it needs, compared with the real Discord desktop client. Payments, Nitro and boost billing are out of scope (see "Won't do").

## How this audit was done

Read-only review of the code, not of file names:

- Client (`client/apps/desktop/src`): every feature folder under `renderer/interface/features`, the settings tabs (`SettingsHost.tsx`, `UserTabs.tsx`, `ServerTabs.tsx`, `RolesEditor.tsx`, `ChannelSettings.tsx`), context menus (message, channel, guild, user), dialogs (`uiStore` dialog kinds), the markdown parser, the composer, keybinds (`shortcutCatalog.ts`, `prefsStore.ts`), the API port (`application/ports/api.ts`) and the Electron main process (`main/*`).
- Backend: the OpenAPI inventory (`contracts/openapi/discordy.yaml`), `contracts/protocol.json` (gateway opcodes and dispatch events), the JSON schemas, the api route table (`api/crates/interface/src/routes`) and the messages route table.
- Existing issues in every repo were listed first; items already tracked are linked, not duplicated.

Status counts in the matrix below: Implemented 32, Partial 25, Missing 50. 66 new issues were created (all labelled `type:feature`, `ws:<repo>`, `priority:p*`; P0 on the board in Ready, the rest in Backlog).

## Legend

- Implemented: works in code today. Partial: some of it exists, the gap column says what is missing. Missing: nothing usable exists.
- Priority: P0 = core chat parity users notice daily. P1 = servers, community, moderation, voice and settings depth. P2 = polish and rare features.

## Gap matrix

| Area | Feature | Discord | Voics status | Gap | Issue link | Priority |
|---|---|---|---|---|---|---|
| Account and auth | Register, login, refresh, logout | Yes | Implemented | - | - | - |
| Account and auth | TOTP 2FA, backup codes | Yes | Partial | Use cases and login field exist; no routes, no backup codes, no UI | [api#31](https://github.com/discordy-voics/api/issues/31) | P0 |
| Account and auth | 2FA setup UI, change email/password/username, delete account | Yes | Missing | Account page is read-only | [client#53](https://github.com/discordy-voics/client/issues/53) | P0 |
| Account and auth | Forgot password, email verification | Yes | Missing | No routes or mail | [api#30](https://github.com/discordy-voics/api/issues/30) | P0 |
| Account and auth | Passkeys (WebAuthn) | Yes | Partial | Backend planned; no client UI | [client#63](https://github.com/discordy-voics/client/issues/63) | P1 |
| Account and auth | Passkey backend | Yes | Missing | Existing issue | [api#19](https://github.com/discordy-voics/api/issues/19) | see issue |
| Account and auth | Sessions/devices list and remote logout | Yes | Partial | Only E2EE devices are listed | [api#42](https://github.com/discordy-voics/api/issues/42) | P1 |
| Account and auth | Stale device cleanup | Yes | Missing | Existing issues | [api#22](https://github.com/discordy-voics/api/issues/22) | see issue |
| Account and auth | QR login | Yes | Missing | Needs mobile client | [gateway#17](https://github.com/discordy-voics/gateway/issues/17) | P2 |
| Account and auth | Account switching | Yes | Missing | Single vault session | [client#75](https://github.com/discordy-voics/client/issues/75) | P2 |
| Account and auth | Data export / deletion request | Yes | Missing | - | [api#47](https://github.com/discordy-voics/api/issues/47) | P2 |
| Profile and presence | Avatar, display name, bio, accent colour | Yes | Implemented | - | - | - |
| Profile and presence | Banner edit, pronouns, theme colours, per-server profile | Yes | Partial | Banner in API but not in UI; others missing | [api#43](https://github.com/discordy-voics/api/issues/43) | P1 |
| Profile and presence | Status (online/idle/dnd/invisible), custom status | Yes | Implemented | Dialog and gateway op exist | - | - |
| Profile and presence | Automatic idle | Yes | Implemented | powerMonitor idle and lock, manual DND respected (client#151) | [client#70](https://github.com/discordy-voics/client/issues/70) | P1 |
| Profile and presence | Activity / game detection / Rich Presence / overlay | Yes | Missing | Always sends empty activities | [client#73](https://github.com/discordy-voics/client/issues/73) | P2 |
| Profile and presence | Connections (linked accounts) | Yes | Missing | - | [api#46](https://github.com/discordy-voics/api/issues/46) | P2 |
| Profile and presence | Profile popout: mutual servers/friends, notes, roles | Yes | Partial | Plain dialog | [client#52](https://github.com/discordy-voics/client/issues/52) | P0 |
| Friends and DMs | Friend requests, accept, decline, remove, block list | Yes | Implemented | FriendsView tabs | - | - |
| Friends and DMs | Friends search, row menu, call buttons, stale DM picker | Yes | Partial | Client#28 open | [client#72](https://github.com/discordy-voics/client/issues/72) | P1 |
| Friends and DMs | User context menu: block, add friend, call, invite, note | Yes | Partial | Missing items | [client#52](https://github.com/discordy-voics/client/issues/52) | P0 |
| Friends and DMs | 1:1 DMs, group DM creation | Yes | Implemented | Create works from picker | - | - |
| Friends and DMs | Group DM name/icon/add/remove/leave | Yes | Missing | No routes, no UI | [api#29](https://github.com/discordy-voics/api/issues/29) | P0 |
| Friends and DMs | Close DM, DM list actions | Yes | Missing | - | [client#51](https://github.com/discordy-voics/client/issues/51) | P0 |
| Friends and DMs | Message requests, DM spam filter, who can DM/friend you | Yes | Missing | - | [api#41](https://github.com/discordy-voics/api/issues/41) | P1 |
| Friends and DMs | DM 1:1 and group calls with ringing | Yes | Implemented | Open bugs client#25,#26,#27 | - | - |
| Messaging | Send, edit, delete, reply, typing, mention autocomplete | Yes | Implemented | - | - | - |
| Messaging | Markdown: bold/italic/underline/strike/spoiler/code/quote | Yes | Implemented | - | - | - |
| Messaging | Headers, lists, masked links, subtext, timestamps, highlight | Yes | Missing | - | [client#46](https://github.com/discordy-voics/client/issues/46) | P0 |
| Messaging | Emoji autocomplete, slowmode countdown, drafts, edit-last, limits | Yes | Partial | - | [client#49](https://github.com/discordy-voics/client/issues/49) | P0 |
| Messaging | Reactions add/remove, custom emoji in picker | Yes | Implemented | - | - | - |
| Messaging | Reaction details, frequently used, skin tone, remove all | Yes | Partial | - | [client#55](https://github.com/discordy-voics/client/issues/55) | P1 |
| Messaging | Stickers | Yes | Missing | - | [api#33](https://github.com/discordy-voics/api/issues/33) | P1 |
| Messaging | GIF picker | Yes | Missing | - | [api#32](https://github.com/discordy-voics/api/issues/32) | P1 |
| Messaging | Attachments upload, drag-drop, paste, progress, video/audio | Yes | Implemented | Basic | - | - |
| Messaging | Lightbox, spoiler, alt text, grids, cancel | Yes | Partial | - | [client#54](https://github.com/discordy-voics/client/issues/54) | P0 |
| Messaging | Link unfurling and embeds for user links | Yes | Partial | Bot embeds render only | [messages#12](https://github.com/discordy-voics/messages/issues/12) | P0 |
| Messaging | Polls | Yes | Missing | - | [messages#14](https://github.com/discordy-voics/messages/issues/14) | P1 |
| Messaging | Voice messages | Yes | Missing | - | [messages#15](https://github.com/discordy-voics/messages/issues/15) | P1 |
| Messaging | Message forwarding | Yes | Implemented | Snapshot, attachment copies, picker ([ADR 0020](../adr/0020-message-forwarding.md)) | - | - |
| Messaging | Copy link, mark unread, report, delete confirm | Yes | Partial | - | [client#56](https://github.com/discordy-voics/client/issues/56) | P1 |
| Messaging | Pins | Yes | Implemented | Pin panel and routes | - | - |
| Messaging | Message search with filters | Yes | Missing | UI and API | [client#47](https://github.com/discordy-voics/client/issues/47) | P0 |
| Messaging | Search backend | Yes | Missing | Index design only | [messages#11](https://github.com/discordy-voics/messages/issues/11) | P0 |
| Messaging | Unread divider, jump to first unread, jump to message | Yes | Partial | - | [client#48](https://github.com/discordy-voics/client/issues/48) | P0 |
| Messaging | Threads create/view | Yes | Implemented | Create and panel | - | - |
| Messaging | Threads browse/archive/lock/private/members | Yes | Partial | - | [api#34](https://github.com/discordy-voics/api/issues/34) | P1 |
| Messaging | Forum channels: posts | Yes | Implemented | Basic | - | - |
| Messaging | Forum tags, sort, layouts | Yes | Partial | - | [api#35](https://github.com/discordy-voics/api/issues/35) | P1 |
| Messaging | Announcement channels follow/publish | Yes | Missing | - | [api#36](https://github.com/discordy-voics/api/issues/36) | P1 |
| Messaging | Text in voice channels | Yes | Missing | Existing issue | [api#23](https://github.com/discordy-voics/api/issues/23) | see issue |
| Servers | Create server (name/icon), join via invite, leave, delete | Yes | Implemented | - | - | - |
| Servers | Create from template | Yes | Implemented | Built-in templates, shareable template links (app deep link; no web landing page yet) | [api#44](https://github.com/discordy-voics/api/issues/44) | - |
| Servers | Discovery and community | Yes | Missing | - | [api#45](https://github.com/discordy-voics/api/issues/45) | P2 |
| Servers | Invites with expiry and max uses; revoke | Yes | Implemented | Temporary membership missing | - | - |
| Servers | Vanity URL, banner, system channel, AFK, default notifications | Yes | Missing | - | [api#37](https://github.com/discordy-voics/api/issues/37) | P1 |
| Servers | Onboarding, rules screening, welcome screen | Yes | Missing | - | [api#40](https://github.com/discordy-voics/api/issues/40) | P1 |
| Servers | Server folders and synced order | Yes | Implemented | Synced via user settings (see [spec](../specs/2026-10-22-server-folders-and-channel-ordering.md)) | [client#58](https://github.com/discordy-voics/client/issues/58) | P1 |
| Servers | Channel drag-and-drop ordering | Yes | Implemented | Drag, Move up/down, permission sync prompt | [client#59](https://github.com/discordy-voics/client/issues/59) | P1 |
| Servers | Categories, create/delete/edit channels, topic, slowmode | Yes | Implemented | - | - | - |
| Servers | Channel permission overwrites | Yes | Implemented | - | - | - |
| Servers | Roles + permission matrix | Yes | Implemented | Basic editor | - | - |
| Servers | Role hierarchy drag, hoist, icons, members, view-as-role | Yes | Implemented (view-as-role deferred) | Roles manager spec | [client#60](https://github.com/discordy-voics/client/issues/60) | P1 |
| Servers | Custom emoji management | Yes | Implemented | - | - | - |
| Servers | Stickers and soundboard tabs | Yes | Missing | - | [api#33](https://github.com/discordy-voics/api/issues/33) | P1 |
| Servers | Integrations and webhooks UI | Yes | Missing | - | [client#61](https://github.com/discordy-voics/client/issues/61) | P1 |
| Servers | Audit log (last 100) | Yes | Implemented | No filters/pagination in UI | - | - |
| Servers | Member management: nickname, roles, kick, ban, timeout | Yes | Implemented | - | - | - |
| Servers | Ban delete-history, bulk delete, member filters, reports | Yes | Partial (history purge, bulk delete, filters, bulk kick/ban, audit filters done; reports and prune need api routes) | - | [client#62](https://github.com/discordy-voics/client/issues/62) | P1 |
| Servers | Safety setup: verification, explicit filter, raid protection | Yes | Missing | - | [api#38](https://github.com/discordy-voics/api/issues/38) | P1 |
| Servers | AutoMod | Yes | Missing | - | [api#39](https://github.com/discordy-voics/api/issues/39) | P1 |
| Servers | Member pruning | Yes | Missing | - | [api#48](https://github.com/discordy-voics/api/issues/48) | P2 |
| Servers | Scheduled events | Yes | Missing | - | [api#49](https://github.com/discordy-voics/api/issues/49) | P2 |
| Servers | Age-restricted channel gate | Yes | Missing | - | [client#76](https://github.com/discordy-voics/client/issues/76) | P2 |
| Servers | Member list grouped by role/presence, search | Yes | Implemented | Groups, counts, crown, bot tag, hover card, search, windowing (client#151); ranges wait for gateway#12 | [client#71](https://github.com/discordy-voics/client/issues/71) | P1 |
| Voice and video | Join/leave voice, mute/deafen, PTT, VAD, noise suppression, echo, AGC | Yes | Implemented | - | - | - |
| Voice and video | Per-user volume, server mute/deafen, timeout | Yes | Implemented | - | - | - |
| Voice and video | Camera, screen share with audio, presets | Yes | Implemented | Quality issues client#31, #39 | - | - |
| Voice and video | Grid/focus layouts | Yes | Implemented | - | - | - |
| Voice and video | Pop-out, PiP, per-stream controls, pin UI | Yes | Partial | - | [client#57](https://github.com/discordy-voics/client/issues/57) | P1 |
| Voice and video | Stage channels | Yes | Missing | Type exists only | [voice#9](https://github.com/discordy-voics/voice/issues/9) | P1 |
| Voice and video | Priority speaker, AFK move, video/stream permission enforcement | Yes | Missing | - | [gateway#16](https://github.com/discordy-voics/gateway/issues/16) | P1 |
| Voice and video | Soundboard | Yes | Missing | - | [voice#10](https://github.com/discordy-voics/voice/issues/10) | P2 |
| Voice and video | Camera background blur | Yes | Missing | Existing issue | [client#36](https://github.com/discordy-voics/client/issues/36) | see issue |
| Voice and video | Advanced voice settings (camera test, auto sensitivity, attenuation) | Yes | Partial | - | [client#78](https://github.com/discordy-voics/client/issues/78) | P2 |
| Voice and video | Move/disconnect members | Yes | Missing | Existing issue | [api#24](https://github.com/discordy-voics/api/issues/24) | see issue |
| Voice and video | Embedded activities | Yes | Missing | Watch Together only | [api#50](https://github.com/discordy-voics/api/issues/50) | P2 |
| Notifications | Desktop notifications, badge count, taskbar flash, sounds | Yes | Implemented | Global toggles only | - | - |
| Notifications | Per-server/channel level, mute durations, suppress @everyone | Yes | Missing | Local mute only | [api#28](https://github.com/discordy-voics/api/issues/28) | P0 |
| Notifications | Notification UI and Inbox | Yes | Missing | - | [client#50](https://github.com/discordy-voics/client/issues/50) | P0 |
| Notifications | Ringtone volume and choice | Yes | Missing | Existing issue | [client#38](https://github.com/discordy-voics/client/issues/38) | see issue |
| App and settings | Themes dark/light/AMOLED, accent, density, font scale, reduce motion | Yes | Implemented | - | - | - |
| App and settings | Zoom, OS theme sync, custom themes | Yes | Missing | - | [client#66](https://github.com/discordy-voics/client/issues/66) | P1 |
| App and settings | Accessibility page | Yes | Partial | - | [client#65](https://github.com/discordy-voics/client/issues/65) | P1 |
| App and settings | Keybinds editor (18 actions, global scope, conflicts, reset) | Yes | Yes | - | [client#67](https://github.com/discordy-voics/client/issues/67) | P1 |
| App and settings | Language / i18n | Yes | Missing | English only | [client#64](https://github.com/discordy-voics/client/issues/64) | P1 |
| App and settings | Streamer mode | Yes | Missing | - | [client#74](https://github.com/discordy-voics/client/issues/74) | P2 |
| App and settings | Privacy & delivery (E2EE modes) | Yes | Implemented | Voics-specific | - | - |
| App and settings | Developer mode / copy IDs | Yes | Implemented | - | - | - |
| App and settings | Command palette / quick switcher | Yes | Implemented | - | - | - |
| Bots and apps | Slash commands, components, modals | Yes | Implemented | - | - | - |
| Bots and apps | OAuth2 authorize screen and authorized apps | Yes | Missing | - | [client#69](https://github.com/discordy-voics/client/issues/69) | P1 |
| Bots and apps | Context-menu apps, developer portal, app directory | Yes | Missing | - | [client#77](https://github.com/discordy-voics/client/issues/77) | P2 |
| Bots and apps | Reports and safety centre | Yes | Missing | - | [client#79](https://github.com/discordy-voics/client/issues/79) | P2 |
| Desktop integration | Tray, deep links, single instance, auto-update plumbing, badge | Yes | Implemented | - | - | - |
| Desktop integration | Start on boot, close-to-tray, hardware acceleration, update UX | Yes | Missing | - | [client#68](https://github.com/discordy-voics/client/issues/68) | P1 |
| Desktop integration | Large guild performance (passive sessions, delta updates) | Yes | Partial | Existing issue | [gateway#12](https://github.com/discordy-voics/gateway/issues/12) | see issue |

## Roadmap

### Wave 0 (P0): core chat parity, ship first
These are on the board in Ready. Order inside the wave: markdown and composer (pure client, no dependencies) in parallel with the API tracks (account/TOTP, notification settings, group DM routes, search endpoint); then the client screens that need them.

P0 issues:

- [client#46](https://github.com/discordy-voics/client/issues/46) full message markdown (headers, lists, masked links, subtext, timestamps, syntax highlighting) (`ws:client`)
- [client#47](https://github.com/discordy-voics/client/issues/47) message search UI with filters and jump to result (`ws:client`)
- [messages#11](https://github.com/discordy-voics/messages/issues/11) message search endpoint and index (`ws:messages`)
- [client#48](https://github.com/discordy-voics/client/issues/48) unread divider, jump-to-first-unread, jump to message and 'mark as unread' (`ws:client`)
- [client#49](https://github.com/discordy-voics/client/issues/49) composer parity (emoji autocomplete, slowmode countdown, drafts, edit-last, limits) (`ws:client`)
- [api#28](https://github.com/discordy-voics/api/issues/28) per-server and per-channel notification settings and mute durations (`ws:api`)
- [client#50](https://github.com/discordy-voics/client/issues/50) notification settings UI, mentions inbox and server/channel mute menus (`ws:client`)
- [api#29](https://github.com/discordy-voics/api/issues/29) group DM management routes (rename, icon, add/remove recipients, leave) (`ws:api`)
- [client#51](https://github.com/discordy-voics/client/issues/51) DM list parity: group DM creation, settings, close DM and unread ordering (`ws:client`)
- [client#52](https://github.com/discordy-voics/client/issues/52) user context menu and profile popout (block, friend actions, call, note, mutual servers and friends) (`ws:client`)
- [api#30](https://github.com/discordy-voics/api/issues/30) account management routes (change email, password, username; password reset; email verification; delete account) (`ws:api`)
- [client#53](https://github.com/discordy-voics/client/issues/53) My account page: email, password, username, two-factor setup, delete account (`ws:client`)
- [api#31](https://github.com/discordy-voics/api/issues/31) TOTP 2FA enrolment routes and backup codes (`ws:api`)
- [client#54](https://github.com/discordy-voics/client/issues/54) attachment parity (lightbox, spoiler, alt text, media grid, cancel upload, file previews) (`ws:client`)
- [messages#12](https://github.com/discordy-voics/messages/issues/12) link unfurling and rich embeds (`ws:messages`)

Also finish the already-open client bugs that undermine daily use: client#25, #26, #27 (calls), #28 (friend picker), #31/#39 (video quality), api#22/#25 (device limit).

### Wave 1 (P1): servers, community and moderation

- [api#37](https://github.com/discordy-voics/api/issues/37) server overview and settings parity (banner, system channel, AFK, default notifications, vanity URL) (`ws:api`)
- [api#38](https://github.com/discordy-voics/api/issues/38) safety setup: verification level, explicit content filter, raid protection, member screening (`ws:api`)
- [api#39](https://github.com/discordy-voics/api/issues/39) AutoMod rules (keywords, spam, mention spam, link filter) (`ws:api`)
- [api#40](https://github.com/discordy-voics/api/issues/40) rules screening, onboarding and welcome screen (`ws:api`)
- [client#60](https://github.com/discordy-voics/client/issues/60) roles management parity (hierarchy, drag reorder, hoist, colors, icons, members, view-as-role) (`ws:client`)
- [client#61](https://github.com/discordy-voics/client/issues/61) integrations and webhooks management UI (`ws:client`)
- [client#62](https://github.com/discordy-voics/client/issues/62) moderation tools parity (delete message history on ban, bulk delete, member filters, reports) (`ws:client`)
- [client#58](https://github.com/discordy-voics/client/issues/58) server folders and persisted server order (`ws:client`)
- [client#59](https://github.com/discordy-voics/client/issues/59) channel and category drag-and-drop ordering (`ws:client`)
- [client#71](https://github.com/discordy-voics/client/issues/71) member list parity (grouped by role and presence, large guild lazy loading, search) (`ws:client`)
- [api#34](https://github.com/discordy-voics/api/issues/34) threads parity (browse, join/leave, archive, lock, private threads, members) (`ws:api`)
- [api#35](https://github.com/discordy-voics/api/issues/35) forum channels parity (tags, sorting, guidelines, post list) (`ws:api`)
- [api#36](https://github.com/discordy-voics/api/issues/36) announcement channels: follow and crosspost (`ws:api`)
- [api#41](https://github.com/discordy-voics/api/issues/41) privacy and safety settings (who can DM or friend you, DM spam filter, message requests) (`ws:api`)

### Wave 2 (P1): expression and voice

- [api#32](https://github.com/discordy-voics/api/issues/32) GIF picker (Tenor-compatible provider proxy) (`ws:api`)
- [api#33](https://github.com/discordy-voics/api/issues/33) stickers (server stickers and a built-in pack) (`ws:api`)
- [client#55](https://github.com/discordy-voics/client/issues/55) reaction and emoji picker parity (`ws:client`)
- [client#56](https://github.com/discordy-voics/client/issues/56) message action parity (copy link, forward, report, reply ping, suppress embeds, speak) (`ws:client`)
- [messages#13](https://github.com/discordy-voics/messages/issues/13) message forwarding (`ws:messages`)
- [messages#14](https://github.com/discordy-voics/messages/issues/14) polls (`ws:messages`)
- [messages#15](https://github.com/discordy-voics/messages/issues/15) voice messages (`ws:messages`)
- [voice#9](https://github.com/discordy-voics/voice/issues/9) stage channels (speakers, audience, request to speak) (`ws:voice`)
- [client#57](https://github.com/discordy-voics/client/issues/57) voice stage layouts and pop-out (grid, focus, spotlight, pop-out window, PiP) (`ws:client`)
- [gateway#16](https://github.com/discordy-voics/gateway/issues/16) voice permission parity (priority speaker, video/stream permissions, AFK channel) (`ws:gateway`)
- [client#72](https://github.com/discordy-voics/client/issues/72) friends parity (mutuals, add from profile, nicknames, notes, DM-from-friend list) (`ws:client`)

### Wave 3 (P1): account, settings and desktop

- [client#63](https://github.com/discordy-voics/client/issues/63) passkey sign-in and enrolment UI (`ws:client`)
- [api#42](https://github.com/discordy-voics/api/issues/42) active sessions list and remote logout (`ws:api`)
- [api#43](https://github.com/discordy-voics/api/issues/43) profile parity (pronouns, per-server profile, profile theme colors, banner per server) (`ws:api`)
- [client#64](https://github.com/discordy-voics/client/issues/64) localisation: language picker and translated UI (`ws:client`)
- [client#65](https://github.com/discordy-voics/client/issues/65) accessibility settings (saturation, role colors, sticker/gif animations, TTS, high contrast, link underline) (`ws:client`)
- [client#66](https://github.com/discordy-voics/client/issues/66) appearance parity (zoom, sync with OS theme, custom themes, chat width, message group spacing) (`ws:client`)
- [client#67](https://github.com/discordy-voics/client/issues/67) keybinds editor parity (more actions, global keybinds, conflicts) (`ws:client`)
- [client#68](https://github.com/discordy-voics/client/issues/68) desktop integration settings (start on boot, close-to-tray, start minimized, hardware acceleration, update UX) (`ws:client`)
- [client#69](https://github.com/discordy-voics/client/issues/69) OAuth2 authorize screen and authorized apps (`ws:client`)
- [client#70](https://github.com/discordy-voics/client/issues/70) automatic idle and activity-aware presence (`ws:client`)

### Wave 4 (P2): polish and rare features

- [voice#10](https://github.com/discordy-voics/voice/issues/10) soundboard (`ws:voice`)
- [api#44](https://github.com/discordy-voics/api/issues/44) server templates and create-from-template (`ws:api`)
- [api#45](https://github.com/discordy-voics/api/issues/45) server discovery and community features (`ws:api`)
- [api#46](https://github.com/discordy-voics/api/issues/46) linked accounts (connections) and profile display (`ws:api`)
- [client#73](https://github.com/discordy-voics/client/issues/73) activity status: game detection, Rich Presence and overlay (phased) (`ws:client`)
- [client#74](https://github.com/discordy-voics/client/issues/74) streamer mode (`ws:client`)
- [api#47](https://github.com/discordy-voics/api/issues/47) data export and request (`ws:api`)
- [gateway#17](https://github.com/discordy-voics/gateway/issues/17) QR code login (remote auth) (`ws:gateway`)
- [client#75](https://github.com/discordy-voics/client/issues/75) account switching (multiple saved accounts) (`ws:client`)
- [api#48](https://github.com/discordy-voics/api/issues/48) member pruning (`ws:api`)
- [client#76](https://github.com/discordy-voics/client/issues/76) age-restricted channels gate (`ws:client`)
- [client#77](https://github.com/discordy-voics/client/issues/77) context-menu apps, app directory and developer portal (`ws:client`)
- [api#49](https://github.com/discordy-voics/api/issues/49) scheduled events (`ws:api`)
- [client#78](https://github.com/discordy-voics/client/issues/78) advanced voice and video settings (`ws:client`)
- [client#79](https://github.com/discordy-voics/client/issues/79) report, safety centre and ephemeral message handling (`ws:client`)
- [api#50](https://github.com/discordy-voics/api/issues/50) embedded activities (games and apps in voice channels) (`ws:api`)

Existing issues that belong to this roadmap and stay where they are: client#34 (member roles), client#35 (voice member menu), client#36 (camera blur), client#38 (ringtone), api#19 (passkeys), api#23 (voice text chat), api#24 (move/disconnect), gateway#12 (passive sessions), messages#10 (search index).

## Dependencies (backend, gateway and contracts)

Contracts changes go first for every row (OpenAPI/JSON schema plus codegen drift check in contracts CI).

| Issue | Needs |
|---|---|
| [client#46](https://github.com/discordy-voics/client/issues/46) | None for rendering. Timestamps and masked links are pure client; the API/messages repos only store content. |
| [client#47](https://github.com/discordy-voics/client/issues/47) | Depends on the search endpoint issue in messages (GET /guilds/{id}/messages/search and /channels/{id}/messages/search, new in contracts/openapi) and messages#10 (index topology). Ephemeral and P2P DMs are not searchable server-side; the client must search its local history (`application/privacy/localHistory.ts`) for those. |
| [messages#11](https://github.com/discordy-voics/messages/issues/11) | contracts (new route + schema + codegen), messages (index consumer + endpoint), api (route proxy only if search is exposed through the API host; otherwise client talks to messages like it does for history). Coordinate with messages#10. |
| [client#48](https://github.com/discordy-voics/client/issues/48) | messages: ack must allow moving the pointer backwards (verify; add `manual: true` semantics like Discord). MESSAGE_ACK already fans out to other devices. |
| [client#49](https://github.com/discordy-voics/client/issues/49) | messages: honour `rate_limit_per_user` (verify enforcement and 429 body with retry_after) and the SUPPRESS_NOTIFICATIONS message flag (verify in contracts/schemas/objects/message.json). |
| [api#28](https://github.com/discordy-voics/api/issues/28) | contracts (schema, event, READY field), api (resource + storage migration), gateway (dispatch to user topic), messages (read-state mention counting and push filter). Client UI is the notif-ui issue. |
| [client#50](https://github.com/discordy-voics/client/issues/50) | Depends on notif-api (per-guild settings resource). Inbox needs mention history: GET /users/@me/mentions in messages (add to contracts) or derive from locally cached mentions as an interim. |
| [api#29](https://github.com/discordy-voics/api/issues/29) | contracts + api routes + messages internal system messages. Client part is the gdm-ui issue. |
| [client#51](https://github.com/discordy-voics/client/issues/51) | Needs gdm-api. 'Close DM' needs a per-user hidden flag (user DM list state, or a client-only list as an interim). |
| [client#52](https://github.com/discordy-voics/client/issues/52) | api: GET /users/{id}/profile (mutual_guilds, mutual_friends, premium-free fields) and PUT /users/@me/notes/{id}; contracts update. Block semantics already exist via relationships. |
| [api#30](https://github.com/discordy-voics/api/issues/30) | api (+ contracts, gitops secrets for SMTP). Client UI is account-ui. |
| [client#53](https://github.com/discordy-voics/client/issues/53) | Depends on account-api and totp-api. |
| [api#31](https://github.com/discordy-voics/api/issues/31) | api + contracts (OpenAPI, user.mfa_enabled already in schema). |
| [client#54](https://github.com/discordy-voics/client/issues/54) | contracts/messages: attachment `flags` (spoiler) and `description` are in the attachment schema (verify spoiler flag; filename prefix `SPOILER_` is the interim). |
| [messages#12](https://github.com/discordy-voics/messages/issues/12) | messages (unfurler worker + MESSAGE_UPDATE), contracts (flags, embed video/thumbnail/provider), client rendering, gitops (egress policy for the unfurler). |
| [api#32](https://github.com/discordy-voics/api/issues/32) | api (proxy + cache), contracts, client panel. Needs a provider choice (Tenor/Giphy-compatible) recorded in docs#10. |
| [api#33](https://github.com/discordy-voics/api/issues/33) | contracts, api (CRUD, events), messages (message field), client (settings tab, picker, render). |
| [client#55](https://github.com/discordy-voics/client/issues/55) | contracts: add DELETE .../reactions, .../reactions/{emoji}, .../{user_id} and GET users routes to OpenAPI (messages already has /reactions); gateway events exist. |
| [client#56](https://github.com/discordy-voics/client/issues/56) | Deep link handling in `main/deepLinks.ts`. Forward and Report are separate issues. |
| [messages#13](https://github.com/discordy-voics/messages/issues/13) | contracts, messages, client. |
| [messages#14](https://github.com/discordy-voics/messages/issues/14) | contracts, messages (state, events), gateway (dispatch mapping), client UI. |
| [messages#15](https://github.com/discordy-voics/messages/issues/15) | contracts, messages (validation of flags), client. |
| [api#34](https://github.com/discordy-voics/api/issues/34) | contracts, api (routes + worker), gateway (THREAD_MEMBERS_UPDATE), messages, client. |
| [api#35](https://github.com/discordy-voics/api/issues/35) | contracts, api, client. |
| [api#36](https://github.com/discordy-voics/api/issues/36) | contracts, api, messages, client. |
| [voice#9](https://github.com/discordy-voics/voice/issues/9) | contracts, api (stage instance), gateway (voice-state fields), voice (publish permission), client. |
| [client#57](https://github.com/discordy-voics/client/issues/57) | None for UI; viewer layer choice uses existing SFU simulcast. Electron main: new window handling in `main/window.ts`. |
| [gateway#16](https://github.com/discordy-voics/gateway/issues/16) | gateway (enforcement + AFK timer), voice (speaking flags), client (ducking + forced PTT), contracts. See api#24 for move/disconnect. |
| [api#37](https://github.com/discordy-voics/api/issues/37) | api (vanity + system message posting), contracts, client form. |
| [api#38](https://github.com/discordy-voics/api/issues/38) | api, messages (attachment scan hook), gateway (join events), client tab. |
| [api#39](https://github.com/discordy-voics/api/issues/39) | contracts, api (rule CRUD), messages (enforcement), gateway (events), client. |
| [api#40](https://github.com/discordy-voics/api/issues/40) | contracts, api, gateway (pending gating), client. |
| [client#58](https://github.com/discordy-voics/client/issues/58) | api: add guild_folders/guild_positions to user settings (contracts/schemas/objects/user-settings.json + PATCH validation) and USER_SETTINGS_UPDATE already exists. |
| [client#59](https://github.com/discordy-voics/client/issues/59) | None (PATCH /guilds/{id}/channels exists). |
| [client#60](https://github.com/discordy-voics/client/issues/60) | api: role position bulk PATCH and `icon`/`unicode_emoji`/`hoist` fields in the role schema (verify in contracts/schemas/objects/role.json). |
| [client#61](https://github.com/discordy-voics/client/issues/61) | api: GET /guilds/{id}/integrations or application listing for installed bots (add to contracts). |
| [client#62](https://github.com/discordy-voics/client/issues/62) | api: ensure ban body supports delete_message_seconds; reports need a small api route (POST /channels/{id}/messages/{id}/report) in contracts. |
| [api#41](https://github.com/discordy-voics/api/issues/41) | contracts, api, messages, client. |
| [client#63](https://github.com/discordy-voics/client/issues/63) | Depends on api#19. |
| [api#42](https://github.com/discordy-voics/api/issues/42) | api, gateway (kick revoked session), contracts, client. |
| [api#43](https://github.com/discordy-voics/api/issues/43) | contracts, api (+ validation, GUILD_MEMBER_UPDATE), client. |
| [client#64](https://github.com/discordy-voics/client/issues/64) | None; optional api validation of supported locales. |
| [client#65](https://github.com/discordy-voics/client/issues/65) | None. |
| [client#66](https://github.com/discordy-voics/client/issues/66) | None. |
| [client#67](https://github.com/discordy-voics/client/issues/67) | None. |
| [client#68](https://github.com/discordy-voics/client/issues/68) | None; release notes need a feed field (gitops/release). |
| [client#69](https://github.com/discordy-voics/client/issues/69) | api: GET/DELETE /oauth2/tokens (authorized apps list) is missing; add to contracts. |
| [client#70](https://github.com/discordy-voics/client/issues/70) | None (gateway PRESENCE_UPDATE exists). |
| [client#71](https://github.com/discordy-voics/client/issues/71) | See client#34 and gateway#12; this issue tracks search and activity line. |
| [client#72](https://github.com/discordy-voics/client/issues/72) | None. |
| [voice#10](https://github.com/discordy-voics/voice/issues/10) | contracts, api, voice (design with E2EE), client. |
| [api#44](https://github.com/discordy-voics/api/issues/44) | contracts, api, client. |
| [api#45](https://github.com/discordy-voics/api/issues/45) | contracts, api, client; depends on onboarding and safety issues. |
| [api#46](https://github.com/discordy-voics/api/issues/46) | contracts, api (OAuth clients, secrets via OpenBao), client. |
| [client#73](https://github.com/discordy-voics/client/issues/73) | gateway: validate and size-limit activities (verify). |
| [client#74](https://github.com/discordy-voics/client/issues/74) | None. |
| [api#47](https://github.com/discordy-voics/api/issues/47) | api, messages, client. |
| [gateway#17](https://github.com/discordy-voics/gateway/issues/17) | gateway, api, client; blocked on a mobile client. |
| [client#75](https://github.com/discordy-voics/client/issues/75) | None. |
| [api#48](https://github.com/discordy-voics/api/issues/48) | contracts, api, client. |
| [client#76](https://github.com/discordy-voics/client/issues/76) | api: user setting for age-restricted content allowed. |
| [client#77](https://github.com/discordy-voics/client/issues/77) | api: app directory listing route and verified-app flags if directory is built. |
| [api#49](https://github.com/discordy-voics/api/issues/49) | contracts, api, gateway, client. |
| [client#78](https://github.com/discordy-voics/client/issues/78) | None. |
| [client#79](https://github.com/discordy-voics/client/issues/79) | api (reports table + admin listing), client. |
| [api#50](https://github.com/discordy-voics/api/issues/50) | gateway (activity instances), api (app registry), client (iframe host). |

Cross-cutting rules:

- Ephemeral (MLS) and P2P delivery modes: no server-side feature may read their content. Search, unfurling, automod, forwarding, polls and voice messages must define a client-side or disabled behaviour for these modes.
- Anything that changes the READY payload (notification settings, folders) goes through contracts/schemas/gateway/dispatch/ready.json and the gateway READY builder.
- Voice features (stage, soundboard, priority speaker) must be designed together with the E2EE-for-all-calls decision (voice#8, docs#10).

## Won't do (out of scope)

- Nitro and subscriptions: Payments are out of scope.
- Server boosts, boost perks (higher upload limits, banners tiers, vanity gating): Billing out of scope. Limits are fixed server-side configuration.
- Shop, gifting, Quests, profile effects, avatar decorations: Cosmetic store tied to payments.
- Super Reactions and premium emoji across servers: Premium feature.
- Role subscriptions and server monetisation: Payments.
- Clyde/AI features and Discord-run safety partnerships: Not part of the self-hosted product.

No issues were created for these.


## Interaction-level gaps (second pass)

Date: 2026-10-20. The first pass listed features; this pass walks the client surface by surface (`client/apps/desktop/src/renderer/interface/**`, plus `src/main/*` for OS integration) and compares each small interaction with the Discord desktop client. Status comes from reading the code, not from running the app. User context menus everywhere, roles in menus and popouts, and mod actions from chat are being built under [client#80](https://github.com/discordy-voics/client/issues/80) and are not repeated here.

Legend: I = Implemented, P = Partial, M = Missing. "Issue" is the new or existing issue that owns the gap.

New issues from this pass: client#81 to client#98 and api#53 (19 issues: 4 P0, 10 P1, 5 P2; list in the summary at the end).

### Server rail

| Interaction | Status | Notes | Issue |
|---|---|---|---|
| Hover tooltip with server name | I | `Tooltip` in `ServerRail.tsx` | - |
| Unread pill and mention badge | I | `rail-pip`, `rail-badge` | - |
| In-call indicator on the server | I | `rail-call` dot | - |
| Home button badge for DMs | P | counts mentions only, not unread DMs | [client#91](https://github.com/discordy-voics/client/issues/91) |
| Drag to reorder | P | drop indicator and Move up/down done (client#58); no auto-scroll | [client#91](https://github.com/discordy-voics/client/issues/91), [client#58](https://github.com/discordy-voics/client/issues/58) |
| Drag onto another server to make a folder | I | folders, colour, collapse, aggregate badge (client#58) | [client#58](https://github.com/discordy-voics/client/issues/58) |
| Muted server dimming, no pill | M | only channel mutes exist | [client#91](https://github.com/discordy-voics/client/issues/91), [client#50](https://github.com/discordy-voics/client/issues/50) |
| Menu: Mark as read, Invite, Server settings, Create channel/category, Leave/Delete | I | `GuildMenu.tsx` | - |
| Menu: Mute server with durations, Notification settings | M | | [client#50](https://github.com/discordy-voics/client/issues/50) |
| Menu: Hide muted channels, Privacy settings, Copy server ID, Collapse all | M | | [client#91](https://github.com/discordy-voics/client/issues/91) |
| Menu: Edit server profile | M | | [api#43](https://github.com/discordy-voics/api/issues/43) |
| Create and Join buttons | I | | - |

### Channel list

| Interaction | Status | Notes | Issue |
|---|---|---|---|
| Right-click channel: Mark as read, Mute (toggle), Copy ID, Edit, Create, Delete | I | `channelMenu.tsx` | - |
| Mute durations, Notification settings | M | local boolean only | [client#50](https://github.com/discordy-voics/client/issues/50) |
| Invite, Copy link, Duplicate channel in menu | M | | [client#83](https://github.com/discordy-voics/client/issues/83) |
| Right-click category | M | no `onContextMenu` on `category-head` | [client#83](https://github.com/discordy-voics/client/issues/83) |
| Collapse categories | P | collapses fully; unread channels are hidden too | [client#83](https://github.com/discordy-voics/client/issues/83) |
| Collapse all categories | M | | [client#83](https://github.com/discordy-voics/client/issues/83) |
| Hover actions (invite, edit) | P | gear hidden when the user lacks invite permission | [client#83](https://github.com/discordy-voics/client/issues/83) |
| Drag channels and categories | M | API exists, no UI | [client#59](https://github.com/discordy-voics/client/issues/59) |
| Unread dot and bold, mention count | I | | - |
| Muted channel dimmed | I | `is-muted` | - |
| Lock, age-restricted, rules icons | M | only mode icons (ephemeral, p2p) | [client#83](https://github.com/discordy-voics/client/issues/83) |
| Announcement and forum icons | I | `ICONS` map | - |
| Floating "New mentions" pill | M | | [client#83](https://github.com/discordy-voics/client/issues/83) |
| Voice row: connected users with speaking ring | I | | - |
| Voice row: mute, deafen, camera icons, LIVE badge | P | letters `M`, `V`, text LIVE; no deafen | [client#92](https://github.com/discordy-voics/client/issues/92) |
| Voice row: user limit display and enforcement | M | `user_limit` in port, no UI | [client#92](https://github.com/discordy-voics/client/issues/92) |
| Voice row: click user opens profile | M | | [client#92](https://github.com/discordy-voics/client/issues/92) |
| Voice row: right-click user | M | | [client#80](https://github.com/discordy-voics/client/issues/80) |
| Drag users between voice channels (move members) | M | route exists (api#24) | [client#92](https://github.com/discordy-voics/client/issues/92) |
| Voice channel Open chat button | M | | [client#92](https://github.com/discordy-voics/client/issues/92) |
| Voice channel status line | M | needs API | [api#53](https://github.com/discordy-voics/api/issues/53), [client#92](https://github.com/discordy-voics/client/issues/92) |
| Click voice channel to join | I | | - |

### Chat: messages

| Interaction | Status | Notes | Issue |
|---|---|---|---|
| Hover toolbar: react, reply, edit, more | I | `MessageItem.tsx` | - |
| Toolbar quick reactions, Forward, Shift extras | M | | [client#81](https://github.com/discordy-voics/client/issues/81) |
| Toolbar on keyboard focus | M | JS hover only | [client#81](https://github.com/discordy-voics/client/issues/81) |
| Message menu: Reply, Edit, Pin, Create thread, Copy text, Copy ID, Delete | I | | - |
| Message menu: Add reaction entry | M | | [client#81](https://github.com/discordy-voics/client/issues/81) |
| Message menu: Copy link, Forward, Mark unread, Speak, Report, Apps | M | | [client#56](https://github.com/discordy-voics/client/issues/56), [client#48](https://github.com/discordy-voics/client/issues/48), [messages#13](https://github.com/discordy-voics/messages/issues/13), [client#79](https://github.com/discordy-voics/client/issues/79), [client#77](https://github.com/discordy-voics/client/issues/77) |
| Shift-click delete without confirm | M | | [client#56](https://github.com/discordy-voics/client/issues/56) |
| Contextual menus on links, images, emoji, selection | M | generic menu everywhere | [client#81](https://github.com/discordy-voics/client/issues/81) |
| Cut/copy/paste/spellcheck in text fields | M | no `context-menu` handler in main | [client#82](https://github.com/discordy-voics/client/issues/82) |
| Reaction chips toggle | I | | - |
| Reaction hover shows who reacted | M | | [client#55](https://github.com/discordy-voics/client/issues/55) |
| Click avatar or name opens profile | P | modal dialog, not anchored popout | [client#52](https://github.com/discordy-voics/client/issues/52) |
| Right-click message author | M | | [client#80](https://github.com/discordy-voics/client/issues/80) |
| Click user mention | I | opens profile | - |
| Click channel mention | I | | - |
| Click role mention | P | rendered, no action or colour | [client#86](https://github.com/discordy-voics/client/issues/86) |
| Jump to replied message | M | | [client#48](https://github.com/discordy-voics/client/issues/48) |
| Reply preview text and deleted state | P | no @, generic missing text | [client#86](https://github.com/discordy-voics/client/issues/86) |
| "New" divider | I | | - |
| "N new messages" bar, mark as read with Esc | M | Esc keybind is a no-op | [client#48](https://github.com/discordy-voics/client/issues/48), [client#84](https://github.com/discordy-voics/client/issues/84) |
| Jump to present | I | | - |
| Typing indicator with names | P | up to two names | [client#88](https://github.com/discordy-voics/client/issues/88) |
| Timestamp: Today/Yesterday, hover full date | M | short locale date, no tooltip | [client#86](https://github.com/discordy-voics/client/issues/86) |
| (edited) tooltip | M | | [client#86](https://github.com/discordy-voics/client/issues/86), [client#56](https://github.com/discordy-voics/client/issues/56) |
| Link preview and embed dismiss | P | bot embeds only | [messages#12](https://github.com/discordy-voics/messages/issues/12), [client#56](https://github.com/discordy-voics/client/issues/56) |
| Image lightbox, copy image, spoiler files | M | | [client#54](https://github.com/discordy-voics/client/issues/54) |
| Drag-drop upload overlay | I | | - |
| Paste images | I | | - |
| @everyone highlight and mention highlight | I | | - |
| Role-mention highlight for the viewer | M | `mentionsMe` ignores roles | [client#84](https://github.com/discordy-voics/client/issues/84) |
| Jumbo emoji for emoji-only messages | M | | [client#86](https://github.com/discordy-voics/client/issues/86) |
| APP tag next to bot names | P | BOT tag on avatar only | [client#86](https://github.com/discordy-voics/client/issues/86) |
| Invite link card | M | | [client#86](https://github.com/discordy-voics/client/issues/86) |
| System messages: join, pin | P | plain text, no actions, no menu | [client#87](https://github.com/discordy-voics/client/issues/87) |
| System messages: call, thread, group DM events, wave | M | "did something" | [client#87](https://github.com/discordy-voics/client/issues/87) |
| Message grouping, date dividers | I | | - |
| Failed send: retry and discard | I | | - |
| Edit in place with Esc and Enter hints | I | `MessageEditor.tsx` | - |

### Composer

| Interaction | Status | Notes | Issue |
|---|---|---|---|
| Emoji button and picker | I | | - |
| GIF and sticker buttons | M | | [api#32](https://github.com/discordy-voics/api/issues/32), [api#33](https://github.com/discordy-voics/api/issues/33) |
| Slash command picker | I | | - |
| @user, @role, #channel autocomplete | I | | - |
| :emoji: autocomplete | M | | [client#49](https://github.com/discordy-voics/client/issues/49) |
| @here suggestion | M | only @everyone | [client#88](https://github.com/discordy-voics/client/issues/88) |
| Up arrow edits last message | M | | [client#49](https://github.com/discordy-voics/client/issues/49) |
| Esc cancels reply | I | | - |
| Shift+Enter newline | I | | - |
| Character counter, slowmode indicator, drafts | M | | [client#49](https://github.com/discordy-voics/client/issues/49) |
| Upload with spoiler and description | M | | [client#54](https://github.com/discordy-voics/client/issues/54) |
| Plus menu (upload, thread, poll, apps) | M | direct attach only | [client#88](https://github.com/discordy-voics/client/issues/88) |
| Selection format toolbar | M | shortcut wrapping only | [client#88](https://github.com/discordy-voics/client/issues/88) |
| Send with Ctrl+Enter option | M | | [client#88](https://github.com/discordy-voics/client/issues/88), [client#89](https://github.com/discordy-voics/client/issues/89) |
| Paste long text as file | M | | [client#88](https://github.com/discordy-voics/client/issues/88) |
| No-permission placeholder | I | | - |

### Chat header and panels

| Interaction | Status | Notes | Issue |
|---|---|---|---|
| Topic shown | P | truncated, tooltip only | [client#93](https://github.com/discordy-voics/client/issues/93) |
| Pins button and panel | P | no Jump, no Unpin, no attachments | [client#93](https://github.com/discordy-voics/client/issues/93) |
| Notification bell | M | | [client#93](https://github.com/discordy-voics/client/issues/93), [client#50](https://github.com/discordy-voics/client/issues/50) |
| Threads button and list | M | | [client#93](https://github.com/discordy-voics/client/issues/93), [api#34](https://github.com/discordy-voics/api/issues/34) |
| Member list toggle | I | | - |
| Search box | M | | [client#47](https://github.com/discordy-voics/client/issues/47) |
| DM header: voice call | I | | - |
| DM header: video call, add friends, profile panel | M | | [client#93](https://github.com/discordy-voics/client/issues/93) |

### Member list

| Interaction | Status | Notes | Issue |
|---|---|---|---|
| Groups by hoisted role with counts, online and offline | I | `buildMemberSections` | - |
| Activity or status text under the name | P | activity only; custom status is never broadcast | [client#85](https://github.com/discordy-voics/client/issues/85) |
| Owner crown | M | | [client#97](https://github.com/discordy-voics/client/issues/97) |
| Bot tag | P | on avatar | [client#97](https://github.com/discordy-voics/client/issues/97) |
| Voice indicator, collapsible groups, role icons | M | | [client#97](https://github.com/discordy-voics/client/issues/97) |
| Hover card | M | Discord has none on the list; click opens the popout | [client#52](https://github.com/discordy-voics/client/issues/52) |
| Search members | M | | [client#71](https://github.com/discordy-voics/client/issues/71) |
| Right-click member | I | roles in menu: client#80 | [client#80](https://github.com/discordy-voics/client/issues/80) |

### Profile popout and full profile

| Interaction | Status | Notes | Issue |
|---|---|---|---|
| Banner | P | accent colour only, no image | [api#43](https://github.com/discordy-voics/api/issues/43) |
| Status text and custom status | M | | [client#85](https://github.com/discordy-voics/client/issues/85) |
| About me | I | plain text | - |
| Member since (server) | I | | - |
| Discord account creation date | M | | [client#52](https://github.com/discordy-voics/client/issues/52) |
| Roles list | P | read only | [client#80](https://github.com/discordy-voics/client/issues/80) |
| Note, mutual servers and friends, message box | M | | [client#52](https://github.com/discordy-voics/client/issues/52) |
| Connections | M | | [api#46](https://github.com/discordy-voics/api/issues/46) |
| Anchored popout instead of modal | M | | [client#52](https://github.com/discordy-voics/client/issues/52) |

### User area and voice panel

| Interaction | Status | Notes | Issue |
|---|---|---|---|
| Mute and deafen toggles with states | I | | - |
| Device quick menus beside mute and deafen | M | | [client#94](https://github.com/discordy-voics/client/issues/94) |
| Keybind in tooltips | M | | [client#94](https://github.com/discordy-voics/client/issues/94) |
| Settings gear | I | | - |
| Avatar menu: status and custom status | P | menu offset hard coded; no clear-after or emoji | [client#85](https://github.com/discordy-voics/client/issues/85) |
| Switch accounts | M | | [client#75](https://github.com/discordy-voics/client/issues/75) |
| Voice panel: state, channel, disconnect, camera, share | I | `VoiceDock.tsx` | - |
| RTC connection details popover | P | one line of ping and loss | [client#94](https://github.com/discordy-voics/client/issues/94) |
| Noise suppression quick toggle | M | | [client#94](https://github.com/discordy-voics/client/issues/94) |
| Soundboard and activities buttons | M | | [voice#10](https://github.com/discordy-voics/voice/issues/10), [api#50](https://github.com/discordy-voics/api/issues/50) |

### Voice and call view

| Interaction | Status | Notes | Issue |
|---|---|---|---|
| Tile right-click menu (volume, mod actions) | I | | - |
| Pin or focus a tile | P | focus button; no persisted layout | [client#57](https://github.com/discordy-voics/client/issues/57) |
| Pop-out window | M | | [client#57](https://github.com/discordy-voics/client/issues/57) |
| Picture in picture | I | tile tool | - |
| Grid and speaker layouts | I | | - |
| Per-user volume | I | | - |
| Stream preview, Watch Stream opt-in, Stop watching | M | auto-attached | [client#95](https://github.com/discordy-voics/client/issues/95) |
| Viewer count for the streamer | M | | [client#95](https://github.com/discordy-voics/client/issues/95) |
| Invite, Add to call, hide self-view | M | | [client#95](https://github.com/discordy-voics/client/issues/95) |
| Speaking ring | I | | - |
| Mute and deafen badges on tiles | I | | - |

### Direct messages and friends

| Interaction | Status | Notes | Issue |
|---|---|---|---|
| DM list right-click | M | | [client#51](https://github.com/discordy-voics/client/issues/51) |
| Close DM X on hover | M | | [client#51](https://github.com/discordy-voics/client/issues/51), [client#96](https://github.com/discordy-voics/client/issues/96) |
| Group DM add, remove, rename | M | | [api#29](https://github.com/discordy-voics/api/issues/29), [client#51](https://github.com/discordy-voics/client/issues/51) |
| Message requests | M | | [api#41](https://github.com/discordy-voics/api/issues/41) |
| Friends tabs Online, All, Pending, Blocked, Add friend | I | | - |
| Friend row context menu, search, call | M | | [client#72](https://github.com/discordy-voics/client/issues/72) |
| Active Now column | M | | [client#96](https://github.com/discordy-voics/client/issues/96) |
| DM sorted by recent activity | I | | - |

### Settings

| Interaction | Status | Notes | Issue |
|---|---|---|---|
| My Account | P | read-only fields | [client#53](https://github.com/discordy-voics/client/issues/53) |
| Profile | P | | [api#43](https://github.com/discordy-voics/api/issues/43) |
| Privacy and delivery (E2EE) | I | | - |
| Devices | P | E2EE devices only | [api#42](https://github.com/discordy-voics/api/issues/42) |
| Authorized Apps, Connections | M | | [client#69](https://github.com/discordy-voics/client/issues/69), [api#46](https://github.com/discordy-voics/api/issues/46) |
| Appearance | I | | - |
| Accessibility, Language, Streamer mode | M | | [client#65](https://github.com/discordy-voics/client/issues/65), [client#64](https://github.com/discordy-voics/client/issues/64), [client#74](https://github.com/discordy-voics/client/issues/74) |
| Voice and video | I | | - |
| Chat tab | M | | [client#89](https://github.com/discordy-voics/client/issues/89) |
| Notifications | P | global switches only | [client#50](https://github.com/discordy-voics/client/issues/50), [client#84](https://github.com/discordy-voics/client/issues/84) |
| Keybinds | Y | 18 actions, global via key hook, conflicts, per-action reset (client#67) | [client#67](https://github.com/discordy-voics/client/issues/67), [client#84](https://github.com/discordy-voics/client/issues/84) |
| Advanced and developer mode | M | copy IDs always shown | [client#89](https://github.com/discordy-voics/client/issues/89) |
| Settings search, Log out in nav | M | | [client#89](https://github.com/discordy-voics/client/issues/89) |
| Unsaved changes bar | P | channel settings only | [client#89](https://github.com/discordy-voics/client/issues/89) |
| Server: Overview, Roles, Emoji, Members, Invites, Bans, Audit log | I | | - |
| Server: Stickers, Soundboard | M | | [api#33](https://github.com/discordy-voics/api/issues/33), [voice#10](https://github.com/discordy-voics/voice/issues/10) |
| Server: Widget, Server Profile | M | | [client#98](https://github.com/discordy-voics/client/issues/98), [api#53](https://github.com/discordy-voics/api/issues/53) |
| Server: Template, Custom invite link | M | | [api#44](https://github.com/discordy-voics/api/issues/44), [api#37](https://github.com/discordy-voics/api/issues/37) |
| Server: Integrations and webhooks | M | | [client#61](https://github.com/discordy-voics/client/issues/61) |
| Server: Safety, AutoMod, Community, Onboarding | M | | [api#38](https://github.com/discordy-voics/api/issues/38), [api#39](https://github.com/discordy-voics/api/issues/39), [api#45](https://github.com/discordy-voics/api/issues/45), [api#40](https://github.com/discordy-voics/api/issues/40) |
| Server: Insights | M | | [api#53](https://github.com/discordy-voics/api/issues/53) |
| Server: Delete Server in nav | M | menu only | [client#98](https://github.com/discordy-voics/client/issues/98) |

### Global

| Interaction | Status | Notes | Issue |
|---|---|---|---|
| Ctrl+K switcher | P | no prefixes, no recents or unread ranking | [client#90](https://github.com/discordy-voics/client/issues/90) |
| Prev/next channel and server shortcuts | P | voice skipped, no unread jumping, no history | [client#90](https://github.com/discordy-voics/client/issues/90) |
| Desktop notification toast with click-through | I | | - |
| Notify on every message in a non-muted channel | M | mentions and DMs only | [client#84](https://github.com/discordy-voics/client/issues/84) |
| Message sounds in the app | M | | [client#84](https://github.com/discordy-voics/client/issues/84) |
| Windows taskbar badge | M | `setBadgeCount` is a no-op on Windows | [client#84](https://github.com/discordy-voics/client/issues/84) |
| Unread count in window title | M | | [client#84](https://github.com/discordy-voics/client/issues/84) |
| Tray icon unread state | M | static icon | [client#84](https://github.com/discordy-voics/client/issues/84) |
| Tray menu, single instance, deep links | I | | - |

### Summary of this pass

Counts are taken from the tables above.

Interactions reviewed: 173. Implemented 53, Partial 29, Missing 91. Gaps (Partial + Missing) 120 were grouped into 19 new issues: 4 P0, 10 P1, 5 P2.

New issues (all `type:feature`, with `ws:` and `priority:` labels; P0 are on the board in Ready, the rest in Backlog):

| Priority | Issue | Scope |
|---|---|---|
| P0 | [client#81](https://github.com/discordy-voics/client/issues/81) | message hover toolbar, quick reactions, contextual menus |
| P0 | [client#82](https://github.com/discordy-voics/client/issues/82) | native text-field context menu |
| P0 | [client#83](https://github.com/discordy-voics/client/issues/83) | channel and category menus, mention indicators, collapse behaviour |
| P0 | [client#84](https://github.com/discordy-voics/client/issues/84) | unread and mention surfaces (taskbar, tray, title, sounds, rules, Esc) |
| P1 | [client#85](https://github.com/discordy-voics/client/issues/85) | custom status visible to others |
| P1 | [client#86](https://github.com/discordy-voics/client/issues/86) | message rendering details |
| P1 | [client#87](https://github.com/discordy-voics/client/issues/87) | system messages |
| P1 | [client#89](https://github.com/discordy-voics/client/issues/89) | settings structure (Chat, Advanced, search, unsaved bar) |
| P1 | [client#90](https://github.com/discordy-voics/client/issues/90) | navigation shortcuts and switcher |
| P1 | [client#91](https://github.com/discordy-voics/client/issues/91) | server rail and server menu details |
| P1 | [client#92](https://github.com/discordy-voics/client/issues/92) | voice entries in the channel list |
| P1 | [client#93](https://github.com/discordy-voics/client/issues/93) | chat header interactions |
| P1 | [client#94](https://github.com/discordy-voics/client/issues/94) | user area and voice panel |
| P1 | [client#95](https://github.com/discordy-voics/client/issues/95) | call view interactions |
| P2 | [client#88](https://github.com/discordy-voics/client/issues/88) | composer details |
| P2 | [client#96](https://github.com/discordy-voics/client/issues/96) | DM list and Friends page details |
| P2 | [client#97](https://github.com/discordy-voics/client/issues/97) | member list details |
| P2 | [client#98](https://github.com/discordy-voics/client/issues/98) | server settings navigation |
| P2 | [api#53](https://github.com/discordy-voics/api/issues/53) | voice channel status, Server Insights, widget endpoints |

Existing issues extended with a cross-reference comment: client#49, #50, #56, #59.
