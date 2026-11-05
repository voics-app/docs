# Mobile client (Expo, React Native)

Summary: what exists of the mobile app today (the M0 skeleton plus the first M1 slices: sign-in, gateway, server list and text channels), how it is built in the client monorepo, how its name and bundle id are configured, how CI checks it, and what comes next. The plan is [Mobile app plan](../plans/2026-11-03-mobile-app.md); the stack choice is [ADR 0024](../adr/0024-mobile-client-stack.md).

Last reviewed: 2026-11-05 (settings, server administration, forums and offline messages: [client#279](https://github.com/discordy-voics/client/issues/279); find and navigate, notifications and DMs: [client#278](https://github.com/discordy-voics/client/issues/278); servers: [client#274](https://github.com/discordy-voics/client/issues/274); [client#206](https://github.com/discordy-voics/client/issues/206), PRs client#256, client#257 and client#258; skeleton: client#205, PR client#232).

## Status

M0 skeleton plus the first M1 slices. `apps/mobile` in the `client` repository is an Expo app laid out like the desktop client, with no bottom tabs (see Layout below). You can sign in (email and password, then the authenticator or backup code when the account has two-factor sign-in) and sign out from the Settings pages (the user panel opens them). The app keeps a gateway connection and the server rail lists your servers and, per server, the text channels you can see, grouped by category. Tapping a text channel opens its messages (see Messages below). The DM column lists your conversations and the You screen has your account and a few settings (see Direct messages, profiles and settings below). Notifications is the mentions inbox, and DMs, friends, pins, threads, search and joining a server are in (see Notifications, Friends and direct messages, and Find and navigate below). All stores, the session manager and the protocol clients come from `@discordy/core`; nothing is published to an app store, and these slices have been tested with mocks only, not yet on a device or simulator.

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
| Long press | A bottom sheet with quick reactions, Reply, Copy Text, Select Text, Edit and Delete. Only what you may do is shown: Edit on your own messages, Delete on your own or with Manage Messages, reactions with Add Reactions, Reply and the composer with Send Messages, Copy Text and Select Text on messages that have text. The rules come from the core permission and message menu code, the same as desktop. Delete asks for confirmation. Select Text opens a sheet with natively selectable text; links and mentions stay tappable. |
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
| In-app banner | While the app is open and you are not in the chat the message belongs to, a new message shows a banner at the top (tap to open it, an x to dismiss, it leaves after a few seconds). The rule is the desktop toast's (core `incomingAlert`): never your own or @silent messages, nothing for muted servers, channels or categories, the level (all, only mentions, nothing, with the server default and the device's only-mentions preference) and Do Not Disturb are respected. Push notifications for a closed app come with the native build. |

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
| Profile | The sheet shows the banner colour, avatar with status, names, what they are doing, About me, roles and Member since in a server, your private note (saved when you leave the field, only you see it), mutual servers and mutual friends, and Friends since. Buttons: Message, Add friend, Accept friend request, Request sent, Remove friend, Block (after confirming) or Unblock. Nothing relationship-related shows on your own profile. |
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

Block User is in the message menu (not for yourself, bots or people already blocked), next to Block in the profile sheet and the Friends tab, always after a confirmation; Privacy lists blocked people. **There is no report function: the api has no report endpoint** (the [moderation spec](../specs/2026-10-22-moderation-tools-and-ban-purge.md) lists one as not built), so the app shows no Report control. App Store review for user-generated content needs one, so it needs an api change first.

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

Status: written and tested with fakes, not yet run on a device ([client#275](https://github.com/discordy-voics/client/issues/275), PR client#284). Voice needs a development or preview build, because react-native-webrtc is native and Expo Go does not contain it. The app checks for Expo Go at startup and never loads the native modules there, so Expo Go still works and shows the usual notices.

| Topic | Behaviour |
|---|---|
| Builds | `apps/mobile/eas.json` has `development` (development client, internal distribution) and `preview` (internal distribution, build number auto-increment). Run `eas build` from `apps/mobile`; the repo is a pnpm workspace with hoisted node_modules. An iPhone build needs the Apple Developer account, the registered device and the Expo account (owner steps, docs#10). The build adds the microphone and camera usage strings and the `audio` background mode. |
| Libraries | react-native-webrtc 155 (WebRTC M155) with `@config-plugins/react-native-webrtc` 15, react-native-incall-manager 4.3 (speaker or earpiece), expo-dev-client. react-native-webrtc is a legacy-style native module that React Native 0.88 runs through its interop layer; if a later React Native removes that layer, the library must move first. |
| Join and leave | Tap a voice channel, then Join voice. The call screen shows who is here, a green ring around whoever speaks, mute, deafen, speaker or earpiece and leave. A bar above the user panel shows the call while you browse and returns to the screen. |
| DM calls | The voice button in a DM opens the call screen and joins; the server rings the others. An incoming call shows Accept and Decline over any screen while the app is open. Ringing when the app is closed needs CallKit and PushKit (later). |
| Not yet | Video, screen share, end-to-end encrypted calls (Ephemeral and P2P DMs, accounts with `e2ee_calls_default`: the call closes with a plain message because iOS has no frame cryptor yet), CallKit, PushKit. |
| Code | The voice session, call controller and media ports live in `@discordy/core` (`application/voice`, `application/ports/media.ts` and `voice.ts`); desktop and mobile each supply the peer connection, microphone and mixer. |

## Ephemeral and peer-to-peer chats (native build)

Status: written and tested with fakes, the Rust and unit tests run on Windows; **not yet built or run on macOS or a device** ([client#275](https://github.com/discordy-voics/client/issues/275), PR client#292). In a development or preview build that contains the `VoicsCrypto` module, Ephemeral and P2P channels and DMs open as normal chats. Expo Go has neither the crypto module nor react-native-webrtc, so there the notices stay.

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

## What comes next

The rest of M1: attachments, push notifications, and TestFlight through EAS (needs the Apple Developer account from the owner decisions). Order and scope are in the [plan](../plans/2026-11-03-mobile-app.md).
