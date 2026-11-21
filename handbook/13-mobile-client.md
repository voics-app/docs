# Mobile client (Expo, React Native)

Summary: engineering reference for the mobile client. For current installation and everyday use, read the Dutch mobile guide; historical slice notes below do not establish current release acceptance. The plan is [Mobile app plan](../plans/2026-11-03-mobile-app.md); the stack choice is [ADR 0024](../adr/0024-mobile-client-stack.md).

Last reviewed: 2026-11-05 (settings, server administration, forums and offline messages: [client#279](https://github.com/voics-app/client/issues/279); find and navigate, notifications and DMs: [client#278](https://github.com/voics-app/client/issues/278); servers: [client#274](https://github.com/voics-app/client/issues/274); [client#206](https://github.com/voics-app/client/issues/206), PRs client#256, client#257 and client#258; skeleton: client#205, PR client#232).

## Status

Updated 18 November 2026: iOS 1.0.0 is in the App Store; TestFlight builds 6/7 and Android APK 1.0.0/7 are available. The [Dutch mobile guide](14-handleiding-mobiele-app.md) covers installation and real menu labels. The [verification status](16-status-en-beheerkeuzes.md) separates released builds, background-presence improvements, the new ReplayKit native build, and physical-device checks still required.

The following describes the accumulated engineering slices; check later sections for functionality added after the initial M0/M1 work. `apps/mobile` in the `client` repository is an Expo app laid out like the desktop client, with no bottom tabs (see Layout below). You can sign in (email and password, then the authenticator or backup code when the account has two-factor sign-in) and sign out from the Settings pages (the user panel opens them). The app keeps a gateway connection and the server rail lists your servers and, per server, the text channels you can see, grouped by category. Tapping a text channel opens its messages (see Messages below). The DM column lists your conversations and the You screen has your account and a few settings (see Direct messages, profiles and settings below). Notifications is the mentions inbox, and DMs, friends, pins, threads, search and joining a server are in (see Notifications, Friends and direct messages, and Find and navigate below). All stores, the session manager and the protocol clients come from `@discordy/core`; the initial slices used mocked tests. That historical test limit has since been supplemented by native build checks and isolated Android login/message QA; it is not evidence of full real-device voice, screen-share or push acceptance.

## How it is built

| Topic | Choice |
|---|---|
| Framework | Expo SDK 58, React Native 0.88, expo-router (file based routes in `app/`) |
| Language | TypeScript strict (plus `noUncheckedIndexedAccess`) |
| Versions | All pinned exactly in `apps/mobile/package.json`. `npx expo install --check` (run in `apps/mobile`) says whether they match the SDK |
| Workspace | One pnpm workspace with desktop. The root `.npmrc` has `node-linker=hoisted`, which Expo's monorepo support works with; Metro finds the workspace on its own |
| React version | Desktop and mobile pin the same React (19.3.0, what React Native 0.88 needs). Two React copies in a hoisted tree broke 144 desktop tests, so keep them equal when either app bumps React |
| Lint | `eslint.base.mjs` at the repo root holds the shared rules; `apps/desktop` and `apps/mobile` extend it |
| Tests | Jest (`jest-expo` preset) and React Native Testing Library in `apps/mobile/tests` |

## Sign-in, session and gateway

| Topic | Behaviour |
|---|---|
| Tokens | Kept in the iOS Keychain (Android Keystore) through expo-secure-store, readable after the first unlock and never leaving the device. A damaged entry reads as signed out. |
| Other device-local data | The persisted stores (preferences, drafts) use the key-value store of expo-sqlite behind the core storage port. |
| Sign-in | Core `SessionManager` does the work. A wrong email or password always shows "Wrong credentials. Please try again.", like desktop. A two-factor account gets a second step for the authenticator or backup code. |
| Gateway | Connects after sign-in or when the app starts with a stored session, and resumes the session when it can. |
| Foreground | When the app comes back from the background, a connection that is still connecting or reconnecting is replaced at once, and a ready one is replaced if the app was away for 30 seconds or more, because iOS can kill the socket silently. A short pause such as the control centre changes nothing. |
| Encrypted modes | Native build only: see Ephemeral and peer-to-peer chats below. In Expo Go no device identity is registered and those chats show a notice. |

## Messages

| Topic | Behaviour |
|---|---|
| Reading | A text channel opens a message list with the newest message at the bottom. The latest 50 load first, older ones load as you scroll up. New, edited and deleted messages and reactions arrive live from the gateway through the core message store. |
| Sending | Type and tap Send. The message shows at once, dimmed, and settles when the server answers. If sending fails, the message stays with "Not sent: reason" and Retry and Discard. |
| Long press | A bottom sheet with quick reactions, Reply, Copy Text, Select Text, Edit and Delete. Only what you may do is shown: Edit on your own messages, Delete on your own or with Manage Messages (in Ephemeral and P2P chats only on your own: it deletes for everyone, and the dialog says that copies and screenshots stay), reactions with Add Reactions, Reply and the composer with Send Messages, Copy Text and Select Text on messages that have text. The rules come from the core permission and message menu code, the same as desktop. Delete asks for confirmation. Select Text opens a sheet with natively selectable text; links and mentions stay tappable. |
| Sheets | Every sheet (message menu, profile, select text, server menu and server settings sheets) is the same bottom sheet: the dark backdrop fades in on its own at about 45% while only the sheet slides up, tap outside or drag the grab handle down to close, the keyboard closes first, and with Reduce Motion on it appears without animation. |
| Rendering | Message text is the core markdown tree: bold, italic, underline, strike, inline code, code blocks (with Copy), quotes, lists, headings, tables, spoilers (tap to reveal), mentions, custom emoji and timestamps. Links open in an in-app browser; a link whose label differs from its address asks first unless the host is trusted (offers Always trust). Names use the highest role colour, avatars come from the CDN, system messages (join, pin, call, group changes) use the core system message table, and a reply shows the original above it and jumps to it when tapped. |
| Reactions | Tap a reaction chip to add or remove your own. A refused change is undone and the reason shows in a red bar above the list. |
| Unread | Opening a chat captures the read marker. The first message from someone else after it gets a red NEW divider, a bar at the top counts the new messages (Mark as read dismisses it), and the list opens at that message. The chat still acknowledges the latest message while the app is in the foreground. A Jump to latest button appears after scrolling up more than one and a half screens. Mark Unread in the message menu moves the marker before that message. |
| Attachments | The + button opens a sheet with Photo library, Take photo or video and Files (only with Attach Files, never in private channels). Picked files show as previews with a remove button, limited to 10 files of 25 MB. They upload through the presigned-slot flow with progress; an unsent message shows its files, an upload bar and Cancel, and Retry keeps the files. Sent attachments show as an image and video grid (four tiles, then +N; spoilers blurred until tapped), a full-screen viewer (swipe, pinch to zoom), audio rows with play and pause, and file rows that open in the in-app browser. |
| Emoji | A picker sheet with search, recently used, the server's custom emoji and the unicode categories. The composer's emoji button inserts at the cursor; More reactions in the message menu and the + chip under a message add a reaction. Long-pressing a reaction lists who reacted, one tab per emoji. Custom emoji from other servers need a later release. |
| Message menu | Also Copy Message Link and Mark Unread for everyone, and Pin or Unpin with Manage Messages (standard channels only). |
| Gestures | Drag a message left 64 pt to reply (a light haptic ticks at the threshold). Haptics: light on long press, a tick on reaction toggles, success or error on send. With Reduce Motion on, haptics are off and the message does not follow the finger. |
| Header menu | The ... button opens Mark as read, Mute channel (15 minutes to until turned off) or Unmute, Notification settings (server default, all messages, only mentions, nothing) and Invite people (with Create Invite). Mute and levels sync through the notification settings of the account. |
| Not yet | Channels with private delivery (ephemeral, peer to peer) open on a plain message instead of messages, because they need the encryption core (M3). Embeds and forwarding are not in this slice yet; pins, threads and search are described in Find and navigate below. |

## Name, scheme and bundle id (branding)

`apps/mobile/app.config.ts` reads `apps/desktop/brand.json`, the same file desktop uses:

| App setting | `brand.json` field |
|---|---|
| Display name | `displayName` |
| URL scheme (`voics://`) | `protocolScheme` |
| iOS bundle identifier and Android package | `appId` |

The icon is `apps/desktop/build/icon.png` (512 px; a 1024 px icon without transparency is needed before the App Store). The app is named Voics and the bundle id and Android package are `nl.voics.app`; the id cannot change after the first TestFlight build. Renaming the product: see [How to rebrand](../runbooks/rebrand.md); the mobile app follows the client `brand.json`.

## CI

The `client` CI calls the shared node workflow with the root scripts `lint`, `typecheck` and `test:unit`. These now run desktop and mobile one after the other, so a mobile failure fails the same job. It runs on Linux and needs no EAS or Apple account. EAS builds are started by hand with `eas.json` profiles (see Voice and calls); CI does not build them.

## Running it

[Run the mobile app](../runbooks/run-the-mobile-app.md) (phone with Expo Go, development builds, Windows without a Mac).

## Layout

The main screen follows the desktop shell: a narrow server rail on the left, a column beside it, and a user panel at the foot of the column.

| Part | Behaviour |
|---|---|
| Server rail | Direct messages on top, a separator, then your servers and folders in the order you set on desktop (folders open and close). The selected item has a pill on its left edge and a squarer, accent-coloured tile; a server with unread messages has a short pip; mentions show a red count (Direct messages counts mentions in all conversations). Muted channels never light the pip. A + at the end joins a server from an invite (see Find and navigate). Create and discover are not on mobile yet. |
| Column | The selected server's name (tap it for the server menu, see Servers below) and its channels of every kind by category (tap a category to collapse it): text `#`, announcement megaphone, voice and stage speaker (with the people connected and the user limit), forum bubbles. The open channel is highlighted, unread channels bold with a dot, muted ones dimmed, with mention counts; a lock marks private, ephemeral (accent lock) and age-restricted (18+) channels and a link marks peer-to-peer ones. With Direct messages selected it is the conversation list. The bell in the column header opens Notifications. |
| User panel | Your avatar, name and status (your custom status when set). Tapping it, or the gear, opens the You screen. |
| Chats | Opening a channel or conversation shows the chat full screen over the rail. The back arrow, the swipe from the left edge (iOS) and the Android back button return to the rail, with the same server and channel still selected. |
| Sign-in screen | Sign in, Create account (email, username, password), Forgot password (email, then the code from the email and the new password). The same api calls as desktop. `voics://reset-password?token=...` opens the new-password form with the token filled in (a malformed token opens it empty); `voics://verify-email?token=...` verifies the address and says so. Both work signed in or out. |
| Channel list | Long press on a channel opens its menu: Mark as read, Mute, Notification settings, Invite people and, with Manage Channels, Edit channel (opens the channel settings) and Delete channel (asks first). Long press on a category opens its edit sheet. The open channel's header menu has the same Edit and Delete. In an Ephemeral or P2P chat the header menu also has Disappearing messages (the per-chat timer). |
| Deep links | `/servers/:guildId/:channelId` and `/dms/:channelId` open that chat with the main screen underneath; `/servers/:guildId` and `/dms` open the main screen with that view selected. Signed out always lands on sign-in. |

Colours, radii and sizes are desktop's Nightglass tokens (72 pt rail, 48 pt tiles). The layout has been tested with mocks only, not yet on a device.

## Direct messages, profiles and settings

| Topic | Behaviour |
|---|---|
| DM list | Lists your 1:1 and group conversations, most recent activity first, with the person's name (their nickname if they are a friend and you set one), or the group name, or the members' names. DMs you closed on this device stay hidden until a newer message arrives. The order and the hiding come from the core DM model. |
| Opening | A row opens the same message screen as a server channel (history, composer, replies, edit, delete, reactions); there are no roles in a DM, so every participant may send, react and read. Conversations with private delivery show the same notice as private channels, never messages or an error. |
| Profile | Tap an author name, or Profile in the header of a 1:1 DM. A sheet shows the avatar (from the CDN, with the initial as fallback), display name, username, About me (refreshed from the profile endpoint, the cached one shows if that fails) and, for friends, Friends since. |
| Settings | The user panel opens the user settings (see User settings below); the old You screen is gone. |

The DM column also has Friends and New message (below), pinned conversations and a long-press menu.

## Notifications

| Topic | Behaviour |
|---|---|
| Mentions inbox | The bell in the column header opens the same list as desktop's Mentions (kept on the device, filled by the gateway): mentions of you, of your roles and @everyone, and replies to you in servers, newest first, grouped by server. Tapping an entry opens the chat at that message; a check marks one read and Mark all read clears the list (neither acknowledges the channel). Entries of servers or channels you no longer have are hidden. |
| Opening a message | The chat scrolls to the message when it is loaded and otherwise loads the window around it first. While the window is detached from the newest message, scrolling to its newest end loads newer messages, the chat acknowledges nothing, and Jump to latest reloads the newest page. The target flashes briefly. Replies, pins and search hits use the same path; a message that no longer exists shows "That message is no longer available." |
| In-app banner | While the app is open and you are not in the chat the message belongs to, a new message shows a banner at the top (tap to open it, an x to dismiss, it leaves after a few seconds). The rule is the desktop toast's (core `incomingAlert`): never your own or @silent messages, nothing for muted servers, channels or categories, the level (all, only mentions, nothing, with the server default and the device's only-mentions preference) and Do Not Disturb are respected. Push notifications are below. |
| Push notifications | In a development or store build (not Expo Go, where the Notifications page says "Not available in Expo Go"), the app registers its device token with the api on every start and when the system rotates it (the APNs token on an iPhone; on Android the FCM registration token with `platform: "fcm"`, from the Firebase project `voics-cf336` through the EAS file variable `GOOGLE_SERVICES_JSON`), with the build's APNs environment (sandbox for development builds) and two device preferences: *Show message previews* and *Only mentions*. The permission is never asked at launch: the first time a chat is open the app explains what it is for, then the system asks once (iOS, or Android 13 and later, where the app first creates the `messages` and `calls` notification channels); a refusal is final and the Notifications page offers Turn on or Open Settings. A live gateway connection does not by itself suppress server push, because a background mobile socket may linger. Server, channel, category, mute and device only-mentions rules still apply; messages in private chats never carry their text. Tapping a notification opens the chat at that message, also from a closed app. While the app is open the system banner is suppressed (the in-app banner covers it) unless the gateway is down. The icon badge follows your unread mentions while the app runs and clears at sign-out. Logging out removes the token first. See the [push notifications runbook](../runbooks/push-notifications.md). |

## Friends and direct messages

| Topic | Behaviour |
|---|---|
| Friends | The Friends row of the DM column opens the Friends page: Online, All, Pending (incoming and outgoing), Blocked and Add friend, with counts on the tabs and a search box. Pending rows have Accept and Decline (outgoing: Cancel), Blocked rows Unblock. Tapping a friend offers Message, Profile, Remove friend and Block, and removing or blocking asks first. Add friend sends a request by username; failures read as plain sentences (not found, not accepting requests, too fast, offline). |
| New message | The New message row picks people (friends first, then people from your servers, with search): one person opens their DM, several create a group DM (up to 25 people including you). |
| Pinned and closed | Long-press a conversation for Mark as read, Pin or Unpin (up to five, shown first under Pinned and synced with your other devices), Profile (1:1), Mute (durations), Close DM (hidden until a newer message; a pinned DM is unpinned) and, for groups, Leave group (after confirming). Group settings (name, icon, members) are not on mobile yet. |

## Find and navigate

| Topic | Behaviour |
|---|---|
| Channel details | Tap the chat title: name, topic, Search, Pinned messages, Threads (server text channels), Members and Copy link. In a 1:1 DM the title opens the person's profile; in a group DM, details lists the people. |
| Pinned messages | From details or the link in a pin notice. Each pin shows its author, text and attachments; Jump goes back to the chat at that message, Unpin (after confirming) needs Manage Messages in a server and is open to everyone in a DM. The list reloads when someone pins or unpins. |
| Profile | The sheet shows the banner colour, avatar with status, names, what they are doing, About me, roles and Member since in a server, your private note (saved when you leave the field, only you see it), mutual servers and mutual friends, and Friends since. Buttons: Message, Add friend, Accept friend request, Request sent, Remove friend, Block (after confirming) or Unblock, and Report (not on your own profile). Nothing relationship-related shows on your own profile. |
| Threads | Create Thread in the message menu (needs Create Public Threads, not offered inside a thread or in private channels) suggests a name from the message and opens the new thread. A message that started a thread shows a chip with its name and message count, a thread notice links to it, and a thread opens as a chat named after it (it uses the parent channel's permissions and Send Messages in Threads; a locked thread closes the composer unless you may manage threads). The Threads page lists the threads the app has been told about, active first and archived marked; the server has no list route yet (api#34), so it cannot fetch the others. |
| Search | Search from channel details or the header menu searches the whole server (or the direct message). It takes words and the desktop filters (from, mentions, in, has, before, after, during, pinned) with suggestions as you type and removable filter chips. Tabs: Messages (hits with the words marked and the messages around them), Media (images and videos in a grid), Files (documents and audio with size) and Links (by site). Tapping a hit goes back to the chat at that message (or opens it in its channel); a file or link opens in the in-app browser. Results load a page at a time. Chats with private delivery cannot be searched on mobile. |
| Join a server | The + at the end of the rail takes an invite link or code (a web link, the deep link or a bare code), shows the server with its member and online counts, and joins on Accept; a server you are already in just opens. |
| Voice text chat | A voice channel's screen has Open text chat, which shows the channel's messages with a composer (not for channels with private delivery). |

## Servers

| Topic | Behaviour |
|---|---|
| Voice channels | Listed in their category with the speaker icon, the user limit (`2/4`, red when full) and, indented under the row, the people connected right now from voice state: avatar, name (nickname first) and marks for muted, deafened (server ones in red), camera and live. A collapsed category does not hide them in the list on desktop; mobile collapses everything in it. Tapping one opens a screen with the channel name and who is in it. In Expo Go it says "Voice isn't in this test version yet"; in a development build it has a Join voice button (see Voice and calls). |
| Other channels | Ephemeral and peer-to-peer channels open on one plain sentence saying they are not in this test version, never on unreadable content or an error. Forum channels open on their posts (see Forums below). Threads are not listed (as on desktop). |
| Member list | The people icon at the right of a server channel's header opens the server's member list, which slides in from the right like any pushed screen (back returns to the chat). Groups are hoisted roles (highest first), Online and Offline, each collapsible, built by the core member rules; a row has the avatar with a status dot, the name in the role colour, a crown for the owner, an APP tag for bots, a speaker when in voice and the activity or custom status line. Search filters the loaded members and asks the gateway for more after a short pause. A swipe from the right edge to open it is not built. |
| Profile sheet | Tapping a person (also an author in a server chat) shows avatar, names, About me, their roles and Member since in the server, Friends since, and a Message button (not on your own profile) that opens or creates the DM and shows it. |
| Server menu | Tapping the server name in the column header. Invite people appears with Create Invite (choose expiry and uses, then Copy link or Share, through the first text channel as on desktop). Server settings appears with Manage Server, Manage Roles or Manage Channels. Leave server (not for the owner) asks first. Delete server, notification settings, mute and mark as read are not on mobile. |
| Server settings | A list of the pages the user may open, using the same permission rules as desktop's server settings (the shared `serverSettingsTabs` in core): Overview (Manage Server: name, icon from the photo library, only changed fields are sent), Roles (Manage Roles: hierarchy list with member counts and locks; per role name, colour, display separately, mentionable and every permission, with a switch disabled when the user lacks that permission or the role is at or above their highest; create and delete with confirmation), Members (everyone, as on desktop: search, and Kick or Ban only for people the user outranks with the matching permission, after a confirmation), Invites (Manage Server: create, copy, revoke with confirmation) and Channels (Manage Channels: create channel with kind, category and delivery mode or create category, rename, delete with confirmation). A deep link to a page the user may not open shows a note, not controls. |
| Not built | From desktop's server settings: Template and Discovery pages. Inside the pages: banner, invite splash, description, voice region, system messages, inactive channel, default notifications and prune in Overview; duplicate role, role icon, members with a role and Mod View. Reordering uses up and down buttons, not drag handles. Server administration added in wave 3 is below. |

The pages run on Expo Go modules only (`expo-clipboard`, `expo-image-picker`). Like the rest of the app they were tested with mocks, not yet on a device.

## User settings, server administration and servers (wave 3, client#279)

Plan: [mobile gap analysis](../plans/2026-11-05-mobile-gap-analysis.md), section 7. Everything here runs in Expo Go; QR login waits for gateway#17.

### User settings

The user panel opens a list with a search field over every page and row (the ranking is core `settingsSearch`, shared with desktop; a result opens its page with the row marked), then the pages in desktop's two groups, then Log out (asks first). Only settings the phone app honours are listed: desktop's Voice and video, Keybinds, Connection, Desktop, Advanced, Developer and About are desktop-only, and desktop has no Language page.

| Page | Behaviour |
|---|---|
| My account | Username, email and password changes each ask for the current password, and a new password passes the same rules as desktop. Two-factor setup asks for the password, shows the key to type in (and an Open authenticator app button that follows the `otpauth` link, because there is no QR library in Expo Go), then the six-digit code, then the backup codes once. Turning it off needs the password and an authenticator or backup code. Disable and Delete account need the password, and Delete also the username typed back. The email-verification banner appears while the email is unverified. |
| Profile | Avatar and banner from the photo library, display name, About me, colour; only changed fields are sent. Status (Online, Idle, Do not disturb, Invisible) and a custom status with an expiry are published to the gateway and saved to the account, as desktop's user panel does. |
| Privacy and delivery | The default delivery mode with the encrypted modes switched off and explained (the encryption core is not in the app yet), the calls switch (off for the same reason), per-chat overrides with Clear, and Blocked users with Unblock. |
| Devices and sessions | Logged-in devices (this one first) with Log out per device and Log out all others after a confirmation, and the encrypted-message devices. |
| Appearance | Theme (Dark, OLED, Light), accent, match the iPhone, and Text size for messages. Styles read the colour object once when their module loads, so a new theme or accent shows from the next start of the app and the page says so. |
| Accessibility, Notifications, Chat | Reduce motion (also from the iPhone), role colours (name, dot, hidden), always underline links; Only mentions for in-app banners; Display images and videos, spoiler display, reactions and emoticon conversion. Each has an effect in the app. |

Theme, accent, text size, reduce motion, role colours, link underline and only-mentions follow the account (`PrefsSync` runs on mobile as on desktop).

### Report and block

Block User is in the message menu (not for yourself, bots or people already blocked), next to Block in the profile sheet and the Friends tab, always after a confirmation; Privacy lists blocked people. Report Message is in the message menu for other people's messages in every delivery mode and Report is in the profile sheet; both open the report sheet: pick one of nine categories, add an optional note (500 characters), read what the report shares, send. For a Standard message the server copies the text itself; for an ephemeral or P2P message the sheet says the server holds no copy and offers a "Send the text of this message" switch (on by default). A failure keeps the draft, a 429 says so, and success shows a confirmation that promises no outcome. Shared logic lives in `@discordy/core` (`reportModel`, `reportCommands`); see the [moderation spec](../specs/2026-10-22-moderation-tools-and-ban-purge.md#reporting-a-message-or-a-user-api126).

### Server administration

| Topic | Behaviour |
|---|---|
| Pages | Emoji (Manage Expressions: upload, rename, delete after a question), Bans (Ban Members: search, Unban after a question), Audit log (View Audit Log: filter by action and moderator, older entries). Like desktop, the server menu shows Server settings only with Manage Server, Manage Roles or Manage Channels. |
| Members | A member's sheet (also Manage member in the profile sheet) offers Roles (roles below your highest), Change nickname or Edit server profile for yourself, Timeout with desktop's presets, Kick and Ban (message history window and a reason), each by the same hierarchy rules as desktop (`memberCapabilities`). A Timed out only filter narrows the list. |
| Order | Roles and Channels have a Reorder mode with up and down buttons (roles at or above yours never move; channel moves are one bulk request, reverted if refused, with desktop's offer to sync permissions into a new category). |
| Channel page | Name, topic, slowmode, age restriction, voice limits, Delete channel after a question, and Permissions: allow, inherit or deny per permission for roles and members. Needs Manage Channels. |
| Server menu | Mark as read, Mute server or Unmute, Notification settings (level, suppress @everyone and role mentions, hide muted channels), and for the owner Delete server, which asks for the name to be typed. |

### Create, discover, organise

| Topic | Behaviour |
|---|---|
| Add a server | The + at the end of the rail: Create my own server (empty, a built-in template, or a pasted template link), Join a server, Discover servers. |
| Discover | Public servers that opted in: search, category and tag filters, Load more, Join or Open. |
| Rail | Long-press a server or folder: move up and down, add to a folder, make a folder with another server, remove from a folder; for a folder rename, colour and ungroup. Saved to the account through core `saveRail`. |
| Group DM | Group settings in the chat details: name, icon, add friends, owner removes people, leave. In an encrypted group the member controls are hidden, because changing who is in it needs a membership commit from the encryption core. |
| Invites | A message with an invite link to this instance shows an invite card (Join or Joined); tapping such a link opens the join sheet inside the app. A `voics://invite/` link opens it too, but only from inside the app: opening it from outside needs the native build. |
| Search | Sort by newest, oldest or most relevant. |

### Forums, forwarding, drafts and offline

| Topic | Behaviour |
|---|---|
| Forums | A forum channel lists its posts (public threads, newest first); New post (title and first message) needs the same Create Public Threads check as starting a thread. |
| Forward | In the message menu for server-stored messages; a picker of recent DMs, groups and channels you may send in, with an optional comment. Encrypted chats and encrypted server channels are shown disabled. Forwarded messages show a Forwarded block. |
| Drafts | Unsent text is kept per chat (core `useDraftStore`), restored when the chat opens and cleared on send. Chats with private delivery keep nothing. |
| Offline cache | The newest 50 sent messages of up to 30 server-stored chats are saved when a chat loads and when it is left. A chat opens on them at once, and offline they stay with a note. Never unsent or private messages; emptied when the session ends. |

Not verified on a device: nothing in wave 3 has run on an iPhone yet; the tests use Jest with mocks.

## Parity polish (wave 4, client#280)

| Topic | Behaviour |
|---|---|
| Quick switcher | The magnifier in the column header opens a sheet with a search field over every channel, conversation and server, plus Friends, New message, Notifications, Discover servers and User settings. Prefixes narrow it as on desktop: `@` people, `#` text channels, `!` voice channels, `*` servers (`*server channel` searches one server's channels). With nothing typed it lists chats with mentions, then unread ones, then recent ones. Return opens the first result. The ranking and the channel items are core `quickSwitcher`, shared with desktop's Ctrl+K palette. |
| Slash commands | In a chat where you may use application commands (and delivery is standard), typing `/` lists the matching commands of the server, or of the bots and your own apps in a direct message. Choosing one opens a sheet with a control per option: choices as chips, true or false as a switch, numbers and text checked by core `validateValues`, people, roles, channels and mentionables from a searchable list inside the sheet. Run sends the interaction; an "app is thinking" row waits at the newest end of the chat until the bot answers (dropped after 15 minutes). File options are not supported on mobile yet. |
| Message components | Buttons, string selects (one choice sends at once; several choices send on Apply, within the menu's minimum and maximum) and user, role, mentionable and channel selects render under a bot's message. Link buttons open http and https addresses in the in-app browser. A form a bot opens appears as a sheet and Submit sends it back. Failures show the server's message. |
| Stickers | Not built: desktop has only the Animate stickers setting and no way to send or show stickers, so there is nothing to match. |
| Tablet layout | iPad and large screens (shorter side of the window at least 600 pt; an iPhone in landscape is not one) keep the 72 pt server rail and a 288 pt channel or conversation column on the left and open every screen, a chat, members, pins, settings, to their right. A channel replaces the chat in the pane rather than stacking; a server in the rail opens the channel you were last in. The app stays portrait (the Expo `orientation` is unchanged) and sets `requireFullScreen`, which Apple requires of an iPad app that does not rotate or support Split View. Landscape and multitasking on iPad are an owner decision. |
| User panel | The avatar shows the presence dot of your own status (the one the gateway reports, so automatic Idle shows; hollow while Invisible). Tapping the name opens a sheet with Online, Idle, Do not disturb and Invisible (the chosen one ticked), the custom status with when it clears, Edit profile and Settings; the gear still opens settings. |
| Collapsed categories | A collapsed category keeps what has activity listed, as desktop does: the open channel, mentions, unread text channels and voice channels with people in them. |
| Theme and accent | Still applied the next time the app starts, because styles are built when each screen loads. Applying them at once would mean rewriting every style to read the theme at render time; the Appearance page says a restart is needed on the Theme and Accent rows. |
| Server settings for single permissions | Someone with only Ban Members, View Audit Log or Manage Expressions cannot open server settings on desktop either (the entry needs Manage Server, Manage Roles or Manage Channels), so mobile matches desktop. Letting them in is a change to core `canOpenServerSettings` and affects both clients. |

### Owner decision: polls and voice messages

Neither exists on desktop or in the shared contracts, so a joint decision is needed before either client builds them.

- **Polls.** Needs the API and messages service to define a poll (question, its answers with optional emoji, a duration, whether several answers may be chosen), accept it on message create, add and remove a vote, list voters, close and expire it, and emit vote events; the message payload needs the poll with live counts. Both clients then need a create form (desktop's "Create poll" entry exists but is switched off by `COMPOSER_FEATURES.polls`), a poll renderer with voting, and the results after it ends. Mobile can build its half in Expo Go.
- **Voice messages.** Needs the attachment contract to carry a voice-message flag, `duration_secs` and a `waveform` (the contracts have none today) and the media pipeline to accept short audio recorded as one file. Mobile records with expo-audio (works in Expo Go, needs the microphone permission it already declares) and uploads through the existing attachment path; both clients render a waveform player. Desktop has no recorder, so it would show them only.

Not verified on a device: nothing in wave 4 has run on an iPhone or iPad yet; the tests use Jest with mocks, and the bundle exports for iOS.

## Voice and calls

Status: written and tested with fakes, not yet run on a device ([client#275](https://github.com/voics-app/client/issues/275), PR client#284). Voice needs a development or preview build, because react-native-webrtc is native and Expo Go does not contain it. The app checks for Expo Go at startup and never loads the native modules there, so Expo Go still works and shows the usual notices.

| Topic | Behaviour |
|---|---|
| Builds | `apps/mobile/eas.json` has `development` (development client, internal distribution) and `preview` (internal distribution, build number auto-increment). Run `eas build` from `apps/mobile`; the repo is a pnpm workspace with hoisted node_modules. An iPhone build needs the Apple Developer account, the registered device and the Expo account (owner steps, docs#10). The build adds the microphone and camera usage strings and the `audio` background mode. |
| Libraries | react-native-webrtc 155 (WebRTC M155) with `@config-plugins/react-native-webrtc` 15, react-native-incall-manager 4.3 (speaker or earpiece), expo-dev-client. react-native-webrtc is a legacy-style native module that React Native 0.88 runs through its interop layer; if a later React Native removes that layer, the library must move first. |
| Join and leave | Tap a voice channel, then Join voice. The call screen shows who is here, a green ring around whoever speaks, mute, deafen, speaker or earpiece and leave. A bar above the user panel shows the call while you browse and returns to the screen. |
| DM calls | The voice button in a DM opens the call screen and joins; the server rings the others. The video button does the same and turns the camera on once connected. An incoming call rings in the system call screen (see Background calls below); the app's own Accept and Decline card is the fallback in Expo Go and when the system refuses the call. |
| Video | The camera button on the call screen turns the camera on and off (front camera first, 720p at 30 frames a second); the flip button switches between the front and back camera on the same track. The stage follows desktop's VoiceStage through core `domain/stageLayout`: one to one is the other person large with your own small tile in the corner, a group is a two-column grid, and a tap enlarges a tile with the rest in a strip (tap again to go back). Without any video the screen is the participant list. Someone's screen share is a tile with Watch until you opt in. Your own front camera is mirrored. The iOS camera prompt appears on first use; when access is off the app says so and offers Open Settings. The camera turns off when the app goes to the background (iOS stops capturing there), not for a permission prompt. Video is VP8 in every call, which the encrypted frame format covers. |
| End-to-end encrypted calls | Work like on desktop (Ephemeral and P2P DMs, accounts with `e2ee_calls_default`, and any call where someone has it on). The header says "end-to-end encrypted" once keys are active; the Privacy page has the "Encrypt all my calls" switch. The phone and desktop share one frame format (protocol version 2, see the voice E2EE spec). A call that announces another version, H.264 video, or a build without the crypto module is refused with a clear message, never sent in clear. Needs the build with `@livekit/react-native-webrtc` 150.1.0; not run on a device yet. |
| Camera and encryption | The camera track reaches the connection only through the core voice session, which in an encrypted call pauses the camera sender, sets the track, attaches and enables the frame cryptor and only then resumes it; flipping the camera does not replace the sender, and after a reconnect the camera is put back through the same path. The core session now clears its camera and screen track when a peer connection closes, because the senders they were on are gone. |
| Not yet | Screen share from the phone. |
| Code | The voice session, call controller and media ports live in `@discordy/core` (`application/voice`, `application/ports/media.ts` and `voice.ts`); desktop and mobile each supply the peer connection, microphone and mixer. |

### Background calls (client#298)

Status: written and tested with fakes, not run on a device. Needs a new native build (new local module, new background mode) and the api and messages releases that carry VoIP tokens and the call push.

| Part | How it works |
|---|---|
| Audio in the background | `UIBackgroundModes` is `audio` and `voip`. Locking the phone or leaving the app keeps the call's audio. |
| System call UI | A local Expo module (`modules/voics-callkit`, Swift) owns CallKit and PushKit. DM and group calls show in the system call screen: calls that ring while the app is open, calls you start or join in the app (shown as outgoing, so they stay in the status bar and on the lock screen), with answer, decline, hang up and mute from the system UI and the app's mute mirrored back. Server voice channels do not use CallKit. |
| Closed app | A PushKit VoIP push wakes the app, which reports the call to CallKit at once: the PushKit registry is created at launch by an app delegate subscriber, so this happens in native code before JavaScript runs. Apple requires that every VoIP push is reported; a push that cannot be used, or a call already shown, is reported and ended immediately. A call nobody answers ends after the ring time (30 s). Answering on the lock screen starts the app, waits for the session and the gateway (up to 15 s) and opens the call screen, which joins. |
| Why a local module | react-native-callkeep and react-native-voip-push-notification need JavaScript (or app delegate patches) to meet the report-first rule and have no maintained release for React Native 0.88 and the new architecture. The module is about 400 lines of Swift on Apple frameworks only. |
| Token | The PushKit token is registered through `POST /users/@me/devices/voip` on every start and when the system rotates it, and works with notifications switched off. It is a different token from the notification token (api table `voip_tokens`); logout removes both, and a token APNs rejects is removed by the notifier. |
| The ring | The gateway already posts a call system message (type 3) when a DM call starts. The notifier (messages repo) turns that message into a PushKit push for every VoIP token of the other members who are not in the call and have not muted the conversation. Online status and the message level are ignored on purpose: a backgrounded phone keeps a live gateway session for a while, and a call that does not ring is worse than one that rings twice. The app shows one call per conversation: the push is reported, and the gateway's own ring finds the call already shown. The push uses `apns-expiration: 0`, so a ring is never delivered after the caller hung up. Calls rung later with Add to call produce no event and reach open apps only. |
| Privacy | The payload is `{type, channel_id, call_message_id, caller_id, private, ring_seconds, caller_name?}` and never carries message text. `caller_name` is present only when the conversation's delivery mode is exactly `standard` (the allow-list the alert pushes use); every other mode, including an unknown one, rings as an unnamed call showing only the app name, and the app applies the same rule to calls it reports itself. |
| Audio session | CallKit gives the audio session to the app; the module forwards its activation to `RTCAudioSession.audioSessionDidActivate` of the LiveKit WebRTC package so media starts when the system says so. |
| Apple setup | `voip` in `UIBackgroundModes` (`app.config.ts`). No App ID capability changes: Push Notifications is already enabled, PushKit and CallKit have no entitlement, and the APNs key that sends alert pushes sends VoIP pushes to `<bundle id>.voip`. |
| Fallback | In Expo Go, and when the system refuses a call (Do Not Disturb), the in-app Accept and Decline card rings while the app is open. |
| Not run | The Swift has not been compiled by CI (no macOS runner builds the app); the first `expo run:ios` or EAS build is the compile check. Unproven on a device: VoIP push delivery, the lock screen ring and answer on a killed app, the audio hand-over, audio after locking, mute from the lock screen. |

#### Android

The same JavaScript (`src/voice/callkit`) runs on Android; the local module has a Kotlin side (`modules/voics-callkit/android`, `platforms: ["apple", "android"]`) with the same functions and `onCallEvent` stream.

| Part | How it works |
|---|---|
| System call UI | A self-managed Telecom `ConnectionService` (`MANAGE_OWN_CALLS`, one `Connection` per call) arbitrates audio and other calls; the UI is the app's: a `calls` channel notification (ringtone, vibration, Answer and Decline, `CallStyle` on Android 12 and later) whose full-screen intent opens a small native call screen over the lock screen (its own activity, so the app is never shown over the lock screen). Answer opens the app and joins like on iOS; Decline sends the decline; an unanswered ring ends after `ring_seconds` (30 s). If Telecom refuses, the notification still rings. |
| Closed app | A data-only, high-priority FCM message with `type=call` wakes `VoicsMessagingService`, which extends expo-notifications' service (and replaces it in the manifest) and rings in native code before JavaScript runs. Every other message goes to expo-notifications. Events wait in a native queue until the app listens, as on iOS. |
| In a call | A foreground service (types `phoneCall` and `microphone`, Hang up action) keeps the microphone alive in the background; it runs only while a call is answered or started. |
| Token | There is no PushKit token: the ring goes to the FCM token registered as the push token, so calls need the notification permission. The payload is the iOS one (all values strings, `caller_name` only for standard conversations). |
| Manifest | Permissions and components live in the module's own manifest, merged by autolinking. `USE_FULL_SCREEN_INTENT` is automatic only for calling apps on Android 14 and later (Play Console declaration); without it the ring is a heads-up notification. |
| Fallback | When the app is in front, the in-app Accept and Decline card rings, not the notification. In Expo Go nothing native runs. |
| Not run | Unproven on a phone: FCM delivery of the ring, the full-screen screen and Answer on a killed app, Telecom behaviour on different makers' Android, foreground service start limits, audio in the background. The Kotlin compiles in an EAS build (client#334); nothing more is verified. |

## Ephemeral and peer-to-peer chats (native build)

Status: written and tested with fakes, the Rust and unit tests run on Windows; **not yet built or run on macOS or a device** ([client#275](https://github.com/voics-app/client/issues/275), PR client#292). In a development or preview build that contains the `VoicsCrypto` module, Ephemeral and P2P channels and DMs open as normal chats. Expo Go has neither the crypto module nor react-native-webrtc, so there the notices stay.

| Topic | Behaviour |
|---|---|
| Reading and sending | Private chats read from the encrypted store on the phone, never from the server and never from the plain offline cache. Text goes through the shared `PrivateMessaging` services of `@discordy/core` (`application/privacy`); a message that cannot be delivered stays in the chat as failed with the reason and Retry. Ephemeral sends when the group exists or can be set up; P2P opens a direct link first and needs the peer online. Nothing is ever sent unencrypted in these modes. |
| Indicators | The same as desktop: the delivery-mode badge under the header (Standard, Ephemeral E2EE, Peer-to-peer; icon and label), and above the composer the honest link state (establishing the group, connecting, direct link open and verified, peer offline, identity unverified with sending blocked, encryption unavailable) plus the safety number sheet for a 1:1 chat. |
| Not on mobile yet | Attachments in private chats (the file cipher uses WebCrypto AES-GCM, which Hermes lacks: the attach button is hidden there), editing, deleting, pinning and forwarding private messages (as on desktop), end-to-end encrypted calls, notifications for private messages while the app is closed. |
| Crypto core | One Rust core in `native/crypto` (OpenMLS, Ed25519, the encrypted SQLite store with ChaCha20-Poly1305) with two thin interface layers: napi-rs for desktop and uniffi for iOS. The uniffi layer has the same surface as the `CryptoBridge` port (base64 strings, the same limits). uniffi was chosen over a hand-written C ABI because it generates the Swift marshalling for 17 methods and 6 record types, which matters when the Swift cannot be compiled on the development PC. |
| Keys and storage | The 256-bit store key is generated by the Swift module (`SecRandomCopyBytes`) and kept in the iOS Keychain, one item per user, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` (not in backups, not migrated to a new phone, readable after the first unlock so messages can arrive while the phone is locked). It never reaches JavaScript. The database is in Application Support, excluded from backups, with file protection until first unlock; every stored row is sealed with ChaCha20-Poly1305, as on desktop. A new phone starts with no private history, as a new desktop does. |
| Build | The manual GitHub Actions workflow `crypto-ios` (client repository) builds static libraries for `aarch64-apple-ios` and `aarch64-apple-ios-sim`, creates `VoicsCryptoFFI.xcframework` and generates the Swift binding on a `macos-14` runner, and uploads the artifact `voics-crypto-ios` (90 days). The EAS build downloads it in the `eas-build-pre-install` hook (`apps/mobile/scripts/fetch-crypto-framework.mjs`), which needs the EAS secret `VOICS_CRYPTO_GITHUB_TOKEN` (a token that can read Actions artifacts of the client repository). The Expo local module `modules/voics-crypto` is autolinked, so no other EAS config is needed. |
| Cost | The org is on the GitHub Free plan: 2000 included Actions minutes a month for private repositories, macOS minutes count ten times, so about 200 macOS minutes. A build is likely 20 to 30 minutes (200 to 300 counted), so only a few runs a month fit and further minutes are billed (the org has a payment method). Run the workflow only when `native/crypto` or the Swift module changed. |
| Peer connection | `reactNativePeerConnection` is a typed seam: react-native-webrtc's `RTCPeerConnection` and `RTCDataChannel` already match the P2P service's `PeerConnectionLike` and `DataChannelLike`. Binary data channel frames cross the native bridge as base64 both ways, so a 16 KiB file chunk is 21,848 characters (4/3); a 10 MB file is 640 chunks and about 14 MB over the bridge each way; a base64 round trip of one chunk took 0.15 ms under Node (a phone is slower; not measured). |
| Hermes gaps handled in core | `TextEncoder`/`TextDecoder` and `crypto.subtle` are not guaranteed on Hermes, so core has a pure UTF-8 codec (`domain/utf8`) and a SHA-256 fallback (`domain/sha256`, used for safety numbers only when WebCrypto is missing). |

Owner decisions this raises: the app now contains encryption beyond HTTPS (OpenMLS, ChaCha20-Poly1305), so the App Store export-compliance answer (`ITSAppUsesNonExemptEncryption`) must be decided before TestFlight; it is not set in the app config. Tracked in docs#10.

**Only provable on macOS or a device:** that the XCFramework builds (the workflow has not run), that the Swift compiles and the pod links, Keychain and file-protection behaviour, that the app launches with both native modules, a real Ephemeral exchange and a real P2P link with a desktop client in both directions, and the safety number matching desktop's.

## Design and motion guide

The phone app uses desktop's design tokens and adds touch rules. Screens take sizes from shared scales in `apps/mobile/src/theme.ts` instead of writing their own:

| Scale | Values |
|---|---|
| Type | 11, 12, 13, 14, 15, 17, 20, 24, 30 (caption to hero) |
| Spacing | 4, 8, 12, 16, 24, 32, 48, 64 |
| Radius | chip 6, control 10, panel 14, sheet and dialog 20 |
| Touch target | 44 pt minimum (channel rows 44, list rows 52, buttons 44, large form buttons 48) |

Rules that follow from them:

- Text in fixed-height chrome (rows, headers, chips) grows with iOS Dynamic Type up to 1.3 times; message text and settings copy grow freely.
- Lists show skeleton placeholders while loading and an empty state (icon, headline, one sentence, at most one action) when there is nothing, never a spinner alone or a bare line of text.
- Every pressable gives feedback: a tint for full-width rows, a scale to 0.97 in 150 ms for buttons and tiles. With Reduce Motion (in the app or on the iPhone) movement becomes an instant change.
- The composer rides the keyboard frame by frame and the message list stays pinned to the newest message; dragging the list down closes the keyboard. Sheets, swipe to reply (left, 64 pt) and the member-list swipe (from the right edge of a server chat) run on the UI thread. The back swipe works from anywhere on the screen.
- Four native libraries carry this: `react-native-reanimated`, `react-native-worklets`, `react-native-gesture-handler` and `react-native-keyboard-controller`. Expo Go includes them at the pinned versions, but a development build needs a new build after they were added.

What only a phone shows: the keyboard tracking, the interactive dismissal, swipe feel and haptics, Dynamic Type at the largest sizes and the home-indicator spacing. The browser preview used while designing renders the layout but not these.

## What comes next

The rest of M1: attachments, and TestFlight through EAS (needs the Apple Developer account from the owner decisions). Order and scope are in the [plan](../plans/2026-11-03-mobile-app.md).
