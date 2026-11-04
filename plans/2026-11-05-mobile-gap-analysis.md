# Mobile gap analysis: Discord iOS, Voics desktop and Voics mobile (2026-11-05)

Summary: what the Voics mobile app lacks compared with the Discord iOS app and with our own desktop client, row by row, and the order to build it in. The owner tests in Expo Go on an iPhone, so the plan puts everything that runs in Expo Go first and groups everything that needs a native build into one later wave. Read-only research; no app code changed.

Scope and basis:

- Voics code: `client` repository, `origin/develop` at commit `78f5d3b` (PR #271, "Mobile: use the Voics client layout with a server rail and no bottom tabs"). Desktop features come from `apps/desktop/src/renderer/interface/features` and `packages/core`; mobile from `apps/mobile`. Everything in sections 3 and 4 was read in code.
- Discord iOS: public sources only, listed with dates in section 2. Discord's own help center returned 403 to our fetch tool, so several help-center claims come from search snippets and are marked.
- Owner decision, kept as the design: a server sidebar (rail plus channel column) and no bottom tabs. Section 2.1 reports what Discord does now as a fact; it does not change this decision.

## 1. Summary

1. The mobile app already has the layout the owner asked for: a 72 pt server rail (Direct messages on top, servers and folders, unread and mention badges), a channel column with collapsible categories, and chats that open full screen over it. Sign-in with two-factor, the gateway with foreground resume, and a text chat with reply, edit, delete and unicode reactions work.
2. The chat itself is still plain: it shows raw text with no avatars, markdown, links, embeds, images, system messages or unread marker, and it never marks anything read. The composer sends text only.
3. Missing entirely: attachments, emoji picker, threads, pins, search, members, voice and video, friends, notifications screen, server and user settings, push, deep links. Voice channels are not even listed.
4. Most of it needs no server work: the desktop already uses the same REST and gateway calls, and `packages/core` holds the stores and domain models (markdown, permissions, search model, friends model, menus, system messages, notification policy). Server work is needed for push (api#93, messages#56, gitops#69), QR login (gateway#17) and, for battery, passive sessions (gateway#12).
5. In Expo Go we can build roughly 80 percent of the gap: chat rendering, attachments from the photo library and camera, emoji, reactions, menus, pins, threads, search, members, friends, settings, haptics and gestures. A native (development) build is only needed for calls, push, universal links, encrypted modes, share extension and Live Activities. Section 7 says what the build needs from the owner.

## 2. Discord iOS reference

Dates matter here: Discord changed its mobile navigation in December 2023 and again in 2026. Each claim names its source and date. Where a source is third-party it says so.

### 2.1 Navigation and layout

| Claim | Version or date | Source |
|---|---|---|
| The redesign replaced the old sliding menu with four bottom tabs: Servers, Messages, Notifications, You. Servers stay in a vertical list. | 2023-12-05 | [Discord blog: Improving our mobile experience](https://discord.com/blog/improving-our-mobile-experience), [TechCrunch](https://techcrunch.com/2023/12/05/discord-app-redesign-mobile) |
| The Messages tab holds all DMs and group DMs, an "Active Now" strip of friends' activity above them, and favourited DMs pinned at the top. | 2023-12-05 | same blog |
| In a chat, swiping right to left on a message replies to it. The swipe that used to open the member list was removed; the member list opens by tapping the chat name at the top. Discord said it was working on faster member access. | 2023-12-05 | same blog; the help-center article "New Mobile App Layout" says the same (seen only as a search snippet, the page returned 403) |
| Notifications tab: mentions, replies, events and friend requests. Something counts as read once you have seen it, no tap needed. Friend-request badges stay until you act. | 2023-12-05 | blog; search snippet of the help-center article |
| You tab: profile, status, avatar, account settings and the friends list. Double-tapping the tab icon opens settings. | 2023-12-05 | blog |
| One search bar covers messages, pins, files and attachments across DMs. User Settings has its own search bar. | 2023-12-05 | blog, TechCrunch |
| Android history for the same idea: bottom tab bar plus custom side panels in a Home, Channels, Chat hierarchy, with horizontal swipes from most of the screen to open panels. | 2020-07-16 (Android only) | [Discord engineering blog](https://discord.com/blog/how-discord-made-android-in-app-navigation-easier) |
| A rounded floating "You Bar" was tested as a replacement for the bottom bar. | 2025-09-09 | [TechIssuesToday](https://techissuestoday.com/discord-tests-rounded-you-bar-replace-bottom-navigation) (third-party), reported as a random experiment |
| Discord announced the "You Bar" as a mobile navigation change that gives more prominence to identity and simplifies navigation; tapping it opens your profile. Coverage says it merges profile, notifications and settings access and adds shortcuts for switching between DMs and servers. | 2026-06-09 coverage, 2026-06-25 changelog | [Discord changelog June 25, 2026](https://discord.com/blog/discord-update-june-25-2026-changelog) (primary, one line), [AlternativeTo](https://alternativeto.net/news/2026/6/discord-introduces-the-you-bar-for-streamlined-mobile-navigation/) (third-party) |
| Third-party description of the You Bar: a persistent bottom bar showing avatar, name and status, a bell for notifications on the right, a swipe left to right to move between your DMs and the open server, long press for the account menu, a gear for settings. It says this is the standard mobile navigation and cannot be switched off. It does not say whether the four tabs are gone. | 2026-08-07 | [Friendcord](https://friendcordapp.com/blog/discord-mobile-ui-squarer-you-bar-2026) (third-party, weak) |
| Discord's own patch notes in 2026 refer to the "You Bar", a "Launchpad" (a quick navigation overlay with a pull tab, first seen as an experiment in 2023), the "Messages screen", a "Swipe to Show Channel Details" setting and a swipe-to-edit option. | 2026-04 to 2026-09 | Discord patch notes: [April 6](https://discord.com/blog/discord-patch-notes-april-6-2026), [June 4](https://discord.com/blog/discord-patch-notes-june-4-2026), [August 4](https://discord.com/blog/discord-patch-notes-august-4-2026), [September 8, 2026](https://discord.com/blog/discord-patch-notes-september-8-2026) |

Fact for the owner: from December 2023 to at least 2025 the Discord iOS app had four bottom tabs. In 2026 Discord rolled out the You Bar as the standard navigation; we could not confirm from a primary source whether the four tabs are completely gone. So the owner's "server sidebar, no bottom tabs" is close to where Discord itself is heading, and it stays the design. What we take from Discord is behaviour, not chrome: swipe to reply, name-tap for details and members, Notifications one tap away, status and settings from the user panel.

### 2.2 Chat screen

Confirmed (patch notes 2026, primary, plus the 2023 blog):

- Unread banner and a "new messages" marker; the chat opens at that marker; a "Jump to latest" button.
- Long-press menu on a message, with reply (opens the keyboard), forward, a reaction list sheet you reach by holding a reaction, and super reactions. A setting turns on double-tap to react. Emoji reactions animate in.
- Swipe to reply (2023); a setting for swipe to edit your own message (April 2026 notes).
- A media keyboard under the composer with Photos, Poll and Files buttons; an emoji picker with a server bar and search; GIF search; stickers; voice messages with a picture-in-picture player; native photo picker with limited-library handling; uploads up to 25 MB and several files at once (2023 blog).
- Spoilers on text, images and link embeds, plus a "Show spoiler content" setting (App Store notes for 352.0).
- Pinned messages screen, forums with a gallery view, threads, message requests, forwarded messages with a "go to original server" link, app commands with a menu and modals.
- Search results with Media, Files and Links tabs and `has:` filters; a bookmarks list.
- In-app notification banners; tapping a push opens the message even after a cold start.
- Link and file embeds, inline video that maximises into a viewer, image viewer with share sheet.
- Header: DM header shows name and status; tapping the name opens details and members (2023).

Not confirmed: the exact layout of the "+" button and composer toolbar, the full list in the long-press menu, and whether the pins screen is reached from the header or from search. Third-party sources only describe "hold a message for a bottom sheet" and "hold a reaction to see who reacted" ([Guiding Tech](https://www.guidingtech.com/how-to-react-to-messages-on-discord/), undated).

### 2.3 Voice and video

- Joining: tapping a voice channel opens a pre-join sheet with a Join Voice button (patch notes April and September 2026 mention the pre-join sheet and "Join Voice" button). Voice channels also have a text chat, reached by tapping the call screen and then the chat bubble ([help-center snippet](https://support.discord.com/hc/en-us/articles/4412085582359)).
- Calls: redesigned call UI for mobile in the 2023 redesign; tapping a name on a tile opens that person's profile (June 2026); noise suppression can be changed during a call (June 2026); picture in picture; a Live Activity during voice calls on iOS (August 2026); a system incoming-call screen (CallKit style); a confirmation step before starting a call from a DM button (June 2026, "Mobile").
- Screen share on mobile: works in DMs and voice channels, up to 50 viewers ([Lifehacker AU](https://www.lifehacker.com.au/?p=1040554), older, 2020 launch); the control sits in the bottom row of call controls ([help-center snippet](https://support.discord.com/hc/articles/360058862134)); starting it uses the iOS system broadcast sheet ([Zapier](https://zapier.com/de/blog/how-to-screen-share-on-discord/), undated).
- Stage channels have a Request to Speak switch (April 2026).
- Since 2026-03-02 audio and video in DMs, group DMs, voice channels and streams require end-to-end encryption support; minimum iOS client 247.0 ([Discord support, via search result](https://support.discord.com/hc/en-us/articles/38025123604631-Minimum-Client-Version-Requirements-for-Voice-Chat)).

Not confirmed: exact control order and sizes in the call screen, and whether mute and deafen live in a swipe-up tray (third-party guides disagree).

### 2.4 DMs and friends

- The Messages screen: DM list, an "Active Now" card, "Invite more friends", New Message and New Group flows, favourited DMs (2023 blog and 2026 patch notes). Creating a group DM warns when one with the same people exists (2023 blog).
- Friends list with sticky letter headers, Add Friend by username, friend requests with badges, QR code login and add-friend by QR code (June 2026 notes).
- Message requests and "Mark as not spam".

### 2.5 Server settings on mobile

2026 patch notes show mobile server administration is broad: channel rename and move, roles list with colours and permission editing, member list in settings, webhooks, channel following, audit log, AutoMod, community settings, scheduled events, invite pausing, member approval, server onboarding and guide. We have no source for the exact menu order.

### 2.6 User settings and notifications

- Settings has a search bar, a Client Info sheet, per-server profiles, profile themes and effects, an in-app browser setting, saturation and theme options including Midnight (pure black, 2023 blog), reduced motion and VoiceOver work throughout.
- iOS has no global in-app notification menu: app-wide notification settings live in iOS Settings. Per server: mute (15 minutes up to until turned back on), a Mobile Push Notifications toggle, suppress @everyone. Per channel: long-press the channel, then Notification Settings, with All, Mentions, Nothing or Mute ([help center 215253258, search snippet](https://support.discord.com/hc/en-us/articles/215253258); fetch returned 403).
- Push: a notification drawer, "Sent a GIF" previews, notification banners inside the app.

### 2.7 Deep links

Discord's `apple-app-site-association` file (fetched directly, 2026-11-05) lists the paths that open the app: `/invite/*`, `/channels/*`, `/users/*`, `/template/*`, `/gifts/*`, `/events/*`, `/app`, `/oauth2/authorize`, `/activities/*`, and a few shop and quest paths. The app id is `53Q6R32WPB.com.hammerandchisel.discord`. It also lists `webcredentials` for password autofill. Source: `https://discord.com/.well-known/apple-app-site-association`.

### 2.8 App Store listing

[Discord on the App Store](https://apps.apple.com/us/app/discord-talk-play-hang-out/id985746746), fetched 2026-11-05: requires iOS 16.0 or later, iPad and Apple Vision supported, version 352.0 adds the "Show spoiler content" setting (351.0 is dated Oct 26). The listing highlights custom emoji, stickers and soundboard, profiles, voice and video, and joining voice without calling anyone.

### 2.9 What we could not confirm

- Whether the four bottom tabs have been removed for all iOS users after the You Bar rollout.
- Whether the swipe to open the member list is back as the default; only a December 2024 tipster report ([TechIssuesToday](https://techissuestoday.com/discord-to-bring-back-swipe-gesture-to-view-members-list-on-android-and-ios), third-party) and a "Swipe to Show Channel Details" setting in the June 2026 notes.
- Pixel sizes, spacing and haptic patterns in the Discord iOS app: no public source. The visual section uses our own desktop CSS and Apple's 44 pt minimum tap target, not Discord measurements.
- Complete long-press menu, composer toolbar layout, screen share procedure, server settings menu order. Help-center pages could not be fetched (403).
- Apple's rule on remote push in Expo Go on iOS: Expo documents that remote push is unavailable in Expo Go on Android from SDK 53; the same page does not state the iOS case. We treat push as needing a development build in any case, because our notifier sends through our own APNs key.

## 3. Voics desktop inventory (code on develop)

Listed by feature folder in `apps/desktop/src/renderer/interface/features`, with the handbook pages ([client](../handbook/02-app-client.md), [voice](../handbook/02-app-voice.md), [mobile client](../handbook/13-mobile-client.md)) cross-checked.

| Folder | What the code does |
|---|---|
| `shell` | Server rail with folders, drag reorder, unread and mention badges, create and join server, folder settings, titlebar, dialog host. |
| `channels` | Channel sidebar with categories, collapse, hide muted, pinned channels; server menu (mark as read, mute, notification settings, collapse all, invite, settings, create channel and category, leave, delete); channel menu (mark read, mute, notification settings, pin, move, duplicate, copy link and ID, edit, delete); user panel with status menu, mute and deafen with device quick menus, voice connection details. |
| `chat` | Message list (grouping, skeletons, jump to unread), message item with avatar 40, reply preview, markdown (bold, italic, strike, spoiler, code with highlighting, quotes, lists, headings, tables, timestamps), embeds, link previews and invite cards, attachments (image grid, video and audio players, files), lightbox, forwarded messages, system messages, message components and slash commands with modals, edit in place, reactions with user lists, emoji picker (custom and unicode), emoji popover, forward dialog, timestamp picker, forum view, DM intro, typing indicator, composer (attachments with spoiler and alt text, paste as file, drag and drop, format toolbar, mentions and emoji autocomplete, slow mode, counter, reply with ping toggle, drafts, mode switcher). Plus-menu entries for thread, poll and apps exist but are disabled placeholders. |
| `panels` | Pins panel, thread panel, DM profile panel, watch panel; one side-panel host. |
| `members` | Member list (virtualised, role groups, presence), profile dialog with mutual friends and servers, nickname, ban, prune, mod view, roles, friends since. |
| `search` | Search bar and panel with `from:`, `in:`, `has:`, `mentions:`, `before:`, `after:`, `pinned:`. |
| `home` | Friends (Online, All, Pending, Blocked, add friend), DM sidebar with pinned DMs, group DM dialog, bulk leave. |
| `notifications` | Mentions inbox, per-server and per-channel notification dialogs (levels, suppress, mute durations). |
| `voice` and `calls` | Voice channel view, stage with focus, grid and spotlight layouts, participants, voice dock, call strip, device menus, screen picker with quality presets, system audio sharing, watch together, picture in picture and pop-out, voice text chat, incoming call with ringtone, call confirmation, E2EE media. |
| `auth` | Sign-in, register, 2FA step, connection picker. |
| `settings` | User: My account (security, 2FA), Profile, Privacy and delivery, Devices (login sessions), Voice and video, Keybinds, Appearance, Accessibility, Notifications, Chat, Connection, Desktop, Advanced, Developer, About and updates; settings search. Server: Overview, Roles, Emoji, Members, Invites, Template, Discovery, Bans, Audit log. Channel settings (name, topic, slow mode, age restriction, permissions, voice options). |
| `privacy` | Delivery mode badge and switcher (Standard, Ephemeral E2EE, Peer-to-peer), peer status. |
| `discover`, `gallery`, `palette`, `updates`, `apps` | Server discovery, component gallery (dev), command palette, update banner, context commands for apps. |
| Desktop only by nature | Tray, login item, push to talk and global shortcuts, hardware acceleration, auto updater, window zoom, deep-link handler, screen capture. These have no mobile equivalent. |

Not built on desktop either (so not a mobile gap): polls, creating threads from the plus menu, stickers as a feature, voice messages, QR login, account switching, activities and rich presence. See the [parity gap audit](2026-10-20-discord-parity-gap.md).

## 4. Voics mobile inventory

### 4.1 On `origin/develop` (`78f5d3b`)

| Area | What exists |
|---|---|
| Shell | `MainScreen`: server rail plus column plus user panel, no bottom tabs. Rail: Direct messages, servers and folders in the user's order, open and close folders, unread dots and mention badges. Column: channels by category (collapsible, state kept), unread, muted and mention states, announcement icon. DM column: conversations, most recent first. User panel: avatar, name, custom status or status text; opens the You screen. |
| Navigation | expo-router stack, native edge-swipe back, chats slide in from the right, a deep link opens with the main screen underneath. Portrait only, phone only (`supportsTablet: false`). |
| Auth | Email and password sign-in, 2FA step, tokens in the Keychain, sign out on the You screen. |
| Gateway | Connect, resume, foreground handling (replace a stale socket after 30 s). |
| Chat | `ChannelScreen`: latest 50 messages, older loaded on scroll, live updates, text composer with reply and edit banner and character counter, optimistic send with Retry and Discard, permission-aware long-press sheet (quick reactions, Reply, Edit, Delete with confirm), reaction chips toggled by tap, errors in a red bar, notices for private-delivery channels and missing permissions. Profile sheet from author name or from a 1:1 DM header (avatar, names, About me, friends since). |
| You screen | Account block, "Show reactions" switch, Sign out. |
| Notifications screen | Placeholder text. |
| Not present | Voice channels are filtered out of the column (text and announcement only). No avatars in messages, no markdown, links, embeds, images, system messages ("name - system message" placeholder), attachments ("N attachment(s), shown in a later release"), read acknowledgement, unread marker, typing, drafts, emoji picker, members, search, pins, threads, friends, settings, haptics, gestures other than the native back swipe. |

Tests: Jest and React Native Testing Library, mocks only; the handbook says not yet run on a device.

### 4.2 The two open branches

`feature/mobile-chat-screen` and `feature/mobile-server-screens` do not exist on `origin` (checked after `git fetch`, 2026-11-05), and there are no open mobile pull requests (only client#272 and client#170 are open, both desktop). Older remote branches `feature/client-206-*`, `feature/client-204-*`, `feature/client-205-*`, `feature/mobile-first-run-fixes` and `feature/mobile-desktop-layout` are already merged into develop. This analysis therefore treats everything beyond section 4.1 as not started. If those two branches appear, rows for chat rendering and server screens should be re-checked against them before work starts, to avoid duplicates.

## 5. Gap table

Legend.

- Discord iOS: Yes, Partial, or "Unconfirmed" (section 2 says why). Desktop and Mobile columns: Yes, Partial, No.
- Size: S is one component or screen with no new dependency; M is several components plus store or service wiring, or one new Expo library; L is a subsystem or a native module.
- Runs in: Go means it runs in Expo Go; Dev means it needs a native development build.
- Server: "none" means the desktop already uses the same API; otherwise the issue or work.
- Priority: P0 the chat feels broken without it, P1 daily use, P2 expected parity, P3 later or rare.

### 5.1 Navigation and shell

| Feature | Discord iOS | Desktop | Mobile today | Gap | Size | Runs in | Server | Priority |
|---|---|---|---|---|---|---|---|---|
| Server rail, folders, badges | Yes | Yes | Yes | Rail reorder and folder editing missing | M | Go | none | P3 |
| Channel column with categories | Yes | Yes | Partial | Only text and announcement channels; no voice, forum, stage, thread rows | M | Go | none | P1 |
| Server header menu (mark read, mute, notification settings, invite, settings, leave) | Yes | Yes | No | Header is a title only | M | Go | none | P1 |
| Channel long-press menu (mark read, mute, notifications, copy link, edit) | Yes | Yes | No | None | M | Go | none | P1 |
| Mark as read, read acknowledgement | Yes | Yes | No | Mobile never acknowledges reads, so unread never clears | S | Go | none | P0 |
| Unread marker, jump to latest, open at first unread | Yes | Yes | No | None | M | Go | none | P0 |
| Notifications screen (mentions inbox) | Yes | Yes | No | Placeholder | M | Go | none | P1 |
| Quick switcher | Yes | Yes | No | None | M | Go | none | P2 |
| Members panel | Yes (name tap) | Yes | No | Needs a right sheet or page; core `memberList` model exists | M | Go | none | P1 |
| Set status and custom status | Yes | Yes | No | User panel only shows it | S | Go | none | P2 |
| Swipe between rail and chat, name tap for channel details | Yes | n/a | Partial | Native back swipe only | S | Go | none | P2 |
| Pull to refresh, empty and error states | Unconfirmed | Partial | No | None | S | Go | none | P3 |
| Tablet layout | Yes (iPad) | n/a | No | `supportsTablet` false | L | Go | none | P3 |

### 5.2 Chat

| Feature | Discord iOS | Desktop | Mobile today | Gap | Size | Runs in | Server | Priority |
|---|---|---|---|---|---|---|---|---|
| Avatars, grouping, name colours, timestamps | Yes | Yes | Partial | No avatar, no role colours, no grouping gutter | S | Go | none | P0 |
| Markdown (bold, italic, strike, code, quotes, lists, headings, spoilers, tables) | Yes | Yes | No | Core `domain/markdown` parses; needs a React Native renderer | M | Go | none | P0 |
| Links, mentions, channel links, custom emoji, timestamps in text | Yes | Yes | No | Needs inline renderer and link opening (expo-web-browser) | M | Go | none | P0 |
| System messages (join, pin, call, thread) | Yes | Yes | Partial | Placeholder text | S | Go | none | P0 |
| Image, video, audio and file attachments, image grid | Yes | Yes | No | Needs expo-image and expo-video | M | Go | none | P0 |
| Media viewer (zoom, swipe, save, share) | Yes | Yes | No | None | M | Go | none | P1 |
| Embeds and link previews, invite cards | Yes | Yes | No | None | M | Go | none | P1 |
| Send photos and videos (library, camera), files, alt text, spoiler | Yes | Yes | No | expo-image-picker, expo-document-picker, expo-camera all run in Expo Go | M | Go | none | P0 |
| Composer plus button and toolbar | Yes | Yes | No | Text field and Send only; a taller input (desktop allows 320, mobile 120) | S | Go | none | P0 |
| Emoji picker (unicode, custom, search, frequent) | Yes | Yes | No | None | M | Go | none | P0 |
| Reactions: add from picker, see who reacted | Yes | Yes | Partial | Only quick unicode set and toggling; no custom emoji | M | Go | none | P0 |
| Mention and emoji autocomplete (`@`, `#`, `:name:`) | Yes | Yes | No | None | M | Go | none | P1 |
| Full message menu (copy text, copy link, mark unread, forward, pin, create thread, speak) | Yes | Yes | Partial | Only react, reply, edit, delete | S | Go | none | P0 |
| Swipe to reply with haptic | Yes | n/a | No | None | S | Go | none | P0 |
| Swipe to edit (setting) | Yes | n/a | No | None | S | Go | none | P3 |
| Forward message | Yes | Yes | No | Core `domain/forward` exists | M | Go | none | P2 |
| Pins panel, pin and unpin | Yes | Yes | No | None | M | Go | none | P1 |
| Threads (open, list, create) | Yes | Panel yes, create disabled | No | Thread screen plus create | L | Go | none | P1 |
| Forum channels | Yes | Yes | No | None | L | Go | none | P2 |
| Search with filters and Media, Files, Links tabs | Yes | Yes (filters) | No | Core `messageSearch` exists | L | Go | none | P1 |
| Typing indicator, send typing | Yes | Yes | No | None | S | Go | none | P2 |
| Drafts per channel | Unconfirmed | Yes | No | Core `composerStores` exists | S | Go | none | P2 |
| Slash commands, message components, modals | Yes | Yes | No | None | L | Go | none | P3 |
| Polls | Yes | No (disabled entry) | No | New on both | L | Go | api and messages (verify) | P3 |
| Voice messages | Yes | No | No | New on both; expo-audio | M | Go | verify waveform fields | P3 |
| Stickers | Yes | Setting only | No | None | M | Go | none | P3 |
| Offline cache of recent messages | Yes (700 chats, 2023 blog) | Unconfirmed | No | Core storage port exists | M | Go | none | P2 |
| Ephemeral and P2P delivery modes | n/a (Voics feature) | Yes | Notice only | Needs OpenMLS on iOS | L | Dev | none | P2 |

### 5.3 Voice and video

| Feature | Discord iOS | Desktop | Mobile today | Gap | Size | Runs in | Server | Priority |
|---|---|---|---|---|---|---|---|---|
| Voice channels listed with participants | Yes | Yes | No | Filtered out of the column | M | Go | none | P1 |
| Join sheet, mute, deafen, disconnect, speaking rings | Yes | Yes | No | `react-native-webrtc` is not in Expo Go | L | Dev | none for clear calls | P1 |
| Voice channel text chat | Yes | Yes | No | Reuses the chat screen | M | Go | none | P2 |
| DM and group calls, ringing, incoming call screen | Yes | Yes | No | CallKit and PushKit | L | Dev | notifier VoIP push | P1 |
| Camera video, tiles layout | Yes | Yes | No | None | L | Dev | none | P2 |
| Watch a screen share | Yes | Yes | No | None | M | Dev | none | P2 |
| Share your screen | Yes | Yes | No | ReplayKit broadcast extension | L | Dev | none | P3 |
| Audio routing (speaker, Bluetooth), picture in picture, Live Activity | Yes | n/a | No | None | M | Dev | none | P2 |
| Confirm before calling | Yes (June 2026) | Yes | No | Reuse the core setting | S | Go | none | P2 |
| Stage channels | Yes | Partial | No | None | M | Dev | none | P3 |
| E2EE calls (DAVE) | Required since 2026-03 | Yes | No | Needs a native frame cryptor | L | Dev | none | P2 |
| Connection details, input and output devices | Partial | Yes | No | None | S | Dev | none | P3 |

### 5.4 Direct messages and friends

| Feature | Discord iOS | Desktop | Mobile today | Gap | Size | Runs in | Server | Priority |
|---|---|---|---|---|---|---|---|---|
| DM list, unread, last activity | Yes | Yes | Yes | Done | - | Go | none | - |
| Pinned DMs, close DM, leave group DM | Yes | Yes | No | Long-press menu | S | Go | none | P2 |
| New DM and new group DM | Yes | Yes | No | Core `dmCandidates` exists | M | Go | none | P1 |
| Friends: list, requests, add by username, block | Yes | Yes | No | None | M | Go | none | P1 |
| Full profile (mutuals, roles, note, message, call) | Yes | Yes | Partial | Sheet shows names, About me, friends since | M | Go | none | P2 |
| Block, report | Yes | Block yes, report no | No | App Store review for user-generated content needs report and block | M | Go | report endpoint (verify) | P1 |
| Message requests | Yes | No | No | New on both | M | Go | api (verify) | P3 |

### 5.5 Server management

| Feature | Discord iOS | Desktop | Mobile today | Gap | Size | Runs in | Server | Priority |
|---|---|---|---|---|---|---|---|---|
| Join by invite link or code, create invite | Yes | Yes | No | None | S | Go | none | P1 |
| Create server, discover servers | Yes | Yes | No | None | M | Go | none | P2 |
| Server notification and mute settings | Yes | Yes | No | Needs a sheet using core `notificationSettings` | M | Go | none | P1 |
| Server settings: overview, roles, emoji, members, invites, bans, audit log | Yes | Yes | No | One page per tab, permission gated | L | Go | none | P2 |
| Template, discovery settings | Partial | Yes | No | None | S | Go | none | P3 |
| Channel create, edit, reorder, permissions | Yes | Yes | No | None | M | Go | none | P2 |
| Moderation: kick, ban, timeout, nickname, roles | Yes | Yes | No | Core `memberModeration` exists | M | Go | none | P2 |

### 5.6 User settings and account

| Feature | Discord iOS | Desktop | Mobile today | Gap | Size | Runs in | Server | Priority |
|---|---|---|---|---|---|---|---|---|
| Settings as a page list with search | Yes | Yes | No | You screen has one switch | M | Go | none | P1 |
| Notifications settings (levels, per-chat overrides, previews) | Yes (partly in iOS Settings) | Yes | No | None | M | Go | none | P1 |
| Appearance: theme (Dark, OLED, Light), accent, text size, density, reduce motion | Yes | Yes | No | Only dark Nightglass | M | Go | none | P2 |
| Accessibility switches | Yes | Yes | No | Respect iOS reduce motion and Dynamic Type | M | Go | none | P2 |
| Profile edit (avatar, banner, bio, colour) | Yes | Yes | No | Avatar via image picker | M | Go | none | P2 |
| Account: email, password, username, 2FA setup | Yes | Yes | No | None | M | Go | none | P2 |
| Devices and login sessions | Yes | Yes | No | None | S | Go | none | P2 |
| Privacy and delivery | n/a | Yes | No | Depends on encrypted modes | S | Go | none | P3 |
| Chat settings (link previews, embeds, GIF autoplay) | Yes | Yes | No | None | S | Go | none | P2 |
| Account switching, data export | Partial | No | No | New | M | Go | api#47 | P3 |
| Sign out | Yes | Yes | Yes | Done | - | Go | none | - |

### 5.7 Platform

| Feature | Discord iOS | Desktop | Mobile today | Gap | Size | Runs in | Server | Priority |
|---|---|---|---|---|---|---|---|---|
| Push notifications, tap to open message | Yes | n/a (desktop notifications) | No | APNs through our own key; token registration, notifier | L | Dev | api#93, messages#56, gitops#69, api#20 | P1 |
| App badge count | Yes | Tray | No | None | S | Dev | notifier sends badge | P2 |
| Deep links: `voics://`, universal links `/invite/<code>`, `/channels/...` | Yes (AASA, section 2.7) | Scheme handler | No | Associated Domains plus AASA file on the website; `voics://` does not work in Expo Go | M | Dev | website AASA file | P1 |
| QR login | Yes | No | No | Camera scan in the app, QR display on desktop | M | Go | gateway#17 | P3 |
| Share extension (send to Voics) | Yes | n/a | No | None | L | Dev | none | P3 |
| Haptics | Unconfirmed | n/a | No | expo-haptics runs in Expo Go | S | Go | none | P1 |
| In-app notification banner | Yes | Toast | No | None | S | Go | none | P2 |
| Battery and data on reconnect | Yes (2023 blog) | n/a | Partial | Passive sessions and zstd | M | Go | gateway#12, gateway#11 | P2 |

## 6. Visual details

Discord iOS pixel values are not public (section 2.9), so the table gives our desktop CSS, what mobile uses now, and what we recommend for touch. Desktop values come from `shared/theme/tokens.css`, `app.css` and `ui.css`; mobile values from `apps/mobile/src/theme.ts` and the components.

| Detail | Desktop (measured) | Mobile today | Recommendation for mobile |
|---|---|---|---|
| Type scale | caption 11, meta 12, small 13, ui 14, body 15, title 17, section 20, page 24, hero 30 | 11 to 15 used, titles 22; fixed sizes | Keep the same ladder, scale with iOS Dynamic Type (`allowFontScaling`, cap at 1.3 for chrome) |
| Message body | 15 px, line-height about 1.5 | 15, default line height | Same; line height 22 |
| Author name | 15, weight 650 | 15, bold | Same, with role colour |
| Timestamp | 11, subtle colour | 11 | Same; time only for grouped rows on tap |
| Message padding | 2 px vertical, 16 px sides; new group adds 16 px gap (adjustable); avatar 40 with a 16 px gap | 2 and 14 sides, group gap 12, no avatar | Use 16 sides, 16 group gap, avatar 40 (38 on small phones) |
| Reaction chip | height 26, radius 8, gap 4, top margin 6, 13 px text | padding 3 and 8, radius 8, gap 6 | Height 28 with 44 hit slop; row gap 6 |
| Composer | radius 16, padding 6 and 8, input 15 px, background bg-2, hairline ring, focus ring in accent | radius 10, padding 12 and 8, max height 120, accent send button | Radius 20 pill when single line, 16 when multi-line; round icon buttons 36 plus; max height 5 lines; send button replaces the plus group when text exists |
| Channel header | 48 px, 15 px title, icon 10 px gap | native header (about 44 plus safe area) | Keep native stack header; add title tap for details |
| Channel row | 32 px high, radius 8, 15 px | 32, radius 8, 15 | 40 to 44 high on touch (Apple's minimum target is 44 by 44 pt); keep the text size |
| Category label | 11 px caps, letter spacing 0.06em | 11, 0.66 | Same, row height 28 |
| Server rail | 72 wide, tile 48, radius 18 (14 active) | same values | Keep; tile already above 44; unread pill 4 by 8 |
| Icon buttons | 28, 32, 40 px | 22 px icon with 6 to 8 hit slop | All touch icons 44 by 44 including hit slop |
| Buttons | 28, 36, 44 px heights, radius 8, 10, 12 | about 40 | Primary 48 on full-width sheets, 44 elsewhere |
| Radii | chip 6, control 10, panel 14, dialog 20 | 8 to 16 mixed | Adopt chip 6, control 10, panel 14, sheet top radius 20 |
| Motion | fast 150 ms, base 220 ms, ease-out `cubic-bezier(0.16, 1, 0.3, 1)`, spring `cubic-bezier(0.32, 0.72, 0, 1)`; buttons scale to 0.97 on press | stack animation only | Reanimated (bundled in Expo Go): timing 150 and 220 ms with the same curves, press scale 0.97, honour reduce motion |
| Sheets and pages | Dialogs and popovers for menus, one full-screen layer for settings, side panels for pins, threads, search | RN `Modal` with slide animation, not draggable | Bottom sheets (drag handle, backdrop, detents) for message menu, emoji picker, profile, members, notification settings; full pages for settings, search, threads, pins, friends; chat stays a full-screen push |
| Gestures | Hover toolbar, right-click menus | Long press 300 ms, native back swipe | Long press 300 ms (keep), swipe left to reply with a 64 pt threshold and a haptic, double-tap to react as an option, drag to dismiss sheets, tap name for details |
| Haptics | none | none | `expo-haptics`: light impact on long press and swipe threshold, selection on reaction toggle, success and error on send; off with reduce motion |
| Keyboard | n/a | `KeyboardAvoidingView` with padding | Keep; test the emoji sheet and keyboard switching without a layout jump (a bug class Discord's own notes list) |
| Colours | Nightglass dark, OLED, Light, accent | dark only, tokens copied | Move tokens into a theme provider so OLED and Light can follow in Wave 4 |

## 7. Implementation plan

The owner moved the native build forward on 2026-11-05 so calls, Ephemeral and P2P can be tested on an iPhone: Wave 5 runs alongside Waves 1 to 4, not after them. Otherwise the order is what the owner sees first in Expo Go, then depth. Sizes are from section 5; no time estimates. Every wave ships behind the existing PR rules: tests, lint, typecheck and the docs update (handbook page 13 and a runbook change where behaviour changes).

### Wave 1: the chat looks and behaves like a chat (Expo Go, no server work)

Why first: it changes what the owner sees in every screen they open.

1. Message rendering: avatars, grouping, role colours, markdown, links (open in an in-app browser), mentions, custom emoji, system messages, edited marks. Uses `domain/markdown`, `domain/systemMessage`, `domain/messageGrouping`.
2. Read state: acknowledge reads, unread marker, "jump to latest", open at the first unread.
3. Attachments: image grid, video, audio and file rows, media viewer (expo-image, expo-video).
4. Composer: plus button, photo library, camera, files with previews, emoji picker, character counter and a taller input.
5. Reactions and message menu: full emoji picker, who reacted sheet, the complete long-press menu (copy text, copy link, mark unread, forward later), true bottom sheets.
6. Gestures and haptics: swipe to reply, haptic feedback, press feedback, reduce motion.
7. Channel and server header menus: mark as read, mute, notification settings, invite, long-press on channels.

### Wave 2: find and navigate (Expo Go, no server work)

1. Members panel and full profile sheet; tap the chat name for channel details.
2. Notifications screen (mentions inbox) reachable from the user panel; in-app banners.
3. Voice channels listed with participants (read-only), voice text chat.
4. Pins, threads (open and create), search with filters and Media, Files, Links tabs.
5. DMs: new DM and group DM, pinned and closed DMs, friends (list, requests, add, block).
6. Join with an invite link or code, create invite.

### Wave 3: settings and servers (Expo Go; QR login needs gateway#17)

1. Settings pages with search: notifications, appearance (Dark, OLED, Light, text size), accessibility, chat, devices, account (including 2FA setup), profile edit.
2. Server settings in permission-gated pages (overview, roles, members, invites, bans, audit log, emoji), channel create and edit, moderation actions.
3. Report and block flows (needed before any public App Store submission).
4. Create server, discover, forum channels, forwarding, drafts, offline cache.
5. QR login (camera scan) once gateway#17 lands.

### Wave 4: parity polish (Expo Go)

Quick switcher, slash commands and message components, stickers, polls and voice messages (new on both clients, so they need a joint decision), tablet layout, passive sessions and zstd on the client side, status and custom status editing.

### Wave 5: the native build (needs the owner)

Everything here needs a development build (EAS cloud build, no Mac).

1. Build foundation: EAS profiles, development and preview builds, TestFlight internal group, app icon (1024 px, no transparency) and splash.
2. Push: token registration, tap to open a message, badge, notification grouping. Server side first: api#93, messages#56, gitops#69, api#20.
3. Deep links: `voics://` and universal links for `/invite/<code>` and `/channels/<guild>/<channel>`, an `apple-app-site-association` file on the website.
4. Voice: `react-native-webrtc`, join and leave, mute and deafen, speaking indicators, audio routing, then CallKit and PushKit for DM calls, then video, watching screen shares, Live Activity and picture in picture.
5. Encrypted modes: OpenMLS compiled for iOS behind the `PrivacyCrypto` port (Ephemeral and P2P), then a native DAVE frame cryptor for E2EE calls, which Discord has required since March 2026.
6. Share extension, screen sharing from the phone (ReplayKit).

What the build needs from the owner:

- An Apple Developer Program account (99 USD a year), with the bundle id `nl.voics.app` registered and these capabilities enabled: Push Notifications, Associated Domains, and background modes for audio and VoIP.
- An Expo (EAS) account linked to the repository; the free plan is enough to start. EAS manages signing certificates once the Apple account is linked.
- The iPhone registered for internal distribution (its UDID) or added to a TestFlight internal group; TestFlight needs no review.
- An APNs authentication key (`.p8`) with its Key ID and Team ID, stored in OpenBao for the notifier (gitops#69). Android needs a Firebase service account if Android is built.
- The website domain served over HTTPS for the AASA file, and a privacy policy URL, support URL and a way to report and block users before any public App Store release.
- Usage descriptions are ours to write (microphone, camera, photos); no owner action.

Open owner decisions that still apply are tracked in [docs#10](https://github.com/discordy-voics/docs/issues/10).

## 8. Top gaps in order

1. Message rendering: avatars, markdown, links, system messages.
2. Read acknowledgement, unread marker and jump to latest.
3. Attachments: view images, video and files, and send photos, camera and files.
4. Emoji picker and full reactions.
5. Swipe to reply, haptics and real bottom sheets.
6. Complete message menu (copy, link, mark unread, pin, forward).
7. Channel and server menus: mark read, mute, notification settings, invite.
8. Members panel and full profile.
9. Search with filters, pins and threads.
10. Notifications screen and in-app banners.
11. Friends, new DM and group DM, block and report.
12. Settings pages: notifications, appearance, account, profile.
13. Voice channels listed, then voice and DM calls (native build).
14. Push notifications and deep links (native build, server work).
15. Server settings and moderation.
