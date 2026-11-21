# Client UX: message toolbar, contextual menus and channel menus

Status: implemented in [client#81](https://github.com/voics-app/client/issues/81) and [client#83](https://github.com/voics-app/client/issues/83) (PR client#102). Part of the Discord parity plan ([2026-10-20-discord-parity-gap](../plans/2026-10-20-discord-parity-gap.md), P0). Companion to the user context menu spec (client#80), which covers right-click on people.

## Design

Every menu is a pure function from a context object (permissions, state, target) to a `MenuModel` tree (`domain/menuModel.ts`: item, separator, label, submenu). The shared `Menu` component renders the model through `menuAdapter`; handlers receive the chosen item id and argument. Entries that lack permission or backend support are omitted rather than disabled (exception: Mark as read is disabled when nothing is unread, like Discord). `Menu` gained a `submenu` entry kind (hover, click, ArrowRight to open, ArrowLeft to close).

Models: `domain/messageMenuModel.ts` (message menu, toolbar), `domain/channelMenuModel.ts` (channel, category, duplicate body), `domain/channelActivity.ts` (collapsed-category visibility, mention pill, private-channel detection), `domain/mute.ts` (durations and expiry), `domain/quickReactions.ts`.

## Message hover toolbar

Visible while the message is hovered, has keyboard focus inside it (`focus-within`), or while its menu or emoji picker is open. Hidden while editing, sending or failed.

| Button | Shown when |
| --- | --- |
| Up to 4 quick reactions (toggle) | standard delivery and ADD_REACTIONS; most recently used first, topped up from the defaults 👍 ❤️ 😂 🎉 |
| Add reaction (picker) | same |
| Edit | own message, standard delivery (not while Shift is held) |
| Reply | always (not while Shift is held) |
| Forward | standard delivery (disabled with a tooltip for E2EE and P2P messages); opens the picker |
| Copy message ID | Shift held |
| Pin / Unpin | Shift held, standard delivery and MANAGE_MESSAGES |
| Delete, no confirmation | Shift held, own message or MANAGE_MESSAGES; a click without Shift still asks |
| More | always (opens the message menu) |

Recently used emoji are stored in device prefs (`recentReactions`, max 8) until a synced setting exists.

## Message menu matrix

Right-click picks a target from `data-ctx` attributes on the clicked element (`contextTarget.ts`). Target entries come first, then a separator, then the message entries. A selection inside the message adds Copy and Search with Google above the target entries.

| Entry | Link | Image | Custom emoji | Selection | Message |
| --- | --- | --- | --- | --- | --- |
| Copy (selection) |  |  |  | top |  |
| Search with Google |  |  |  | top |  |
| Open Link | yes |  |  |  |  |
| Copy Link | yes | yes |  |  |  |
| Copy Image |  | yes |  |  |  |
| Save Image |  | yes |  |  |  |
| Open Original |  | yes |  |  |  |
| Copy Emoji Link |  |  | yes |  |  |
| Add to Server |  |  | if CREATE or MANAGE_GUILD_EXPRESSIONS and emoji not already in the server |  |  |

Message entries (always below the target block):

| Entry | Shown when | Backend |
| --- | --- | --- |
| Add Reaction (submenu: quick emoji, More reactions) | standard delivery and ADD_REACTIONS | `PUT /channels/{id}/messages/{id}/reactions/...` |
| Edit Message | own message, standard delivery | PATCH message |
| Pin / Unpin Message | standard delivery and MANAGE_MESSAGES | `PUT/DELETE /channels/{id}/pins/{id}` |
| Reply | always | client state |
| Forward | always listed (`FORWARD_SUPPORTED = true`); disabled with a tooltip for E2EE and P2P | `POST` with `message_reference.type = 1`, [ADR 0020](../adr/0020-message-forwarding.md) |
| Create Thread | standard delivery, guild channel, CREATE_PUBLIC_THREADS | `POST` thread from message |
| Copy Text | message has text | none |
| Mark Unread | always | local read marker plus best-effort `ack` of the previous message; no server mark-unread endpoint |
| Copy Message Link | always | none (`voics://channels/{guild or @me}/{channel}/{message}`) |
| Speak Message | text and speech synthesis available | none (Web Speech) |
| Delete Message | own message, or MANAGE_MESSAGES on standard delivery | privacy sender |
| Copy Message ID | always | none |

Ephemeral and P2P messages drop reactions, pin, thread and others-delete (they cannot be applied to them).

The Forward destination picker shows a one-to-one DM recipient's global avatar from `/avatars/{recipient_user_id}/{hash}`. The recipient ID owns the image; the DM channel ID remains the send target. A source server's profile override does not apply to a DM destination. Static and animated images use the shared asset resolver, and recipients without an avatar hash retain their initials. Group and server-channel destinations keep their existing icons.

## Channel menu matrix

| Entry | Shown when |
| --- | --- |
| Mark As Read | always, disabled without unread or mentions |
| Invite People | guild channel and CREATE_INSTANT_INVITE |
| Copy Link | guild channel (`voics://channels/{guild}/{channel}`) |
| Mute Channel (submenu) / Unmute Channel | always: 15 minutes, 1 hour, 3 hours, 8 hours, 24 hours, until turned back on |
| Notification Settings | always (dialog: all, only mentions, nothing) |
| Edit Channel | guild channel and MANAGE_CHANNELS |
| Duplicate Channel | MANAGE_CHANNELS (copies type, topic, nsfw, slowmode, overwrites, parent, delivery mode, limits, name `-copy`) via `POST /guilds/{id}/channels` |
| Create Channel | MANAGE_CHANNELS |
| Delete Channel | MANAGE_CHANNELS, confirmation |
| Copy Channel ID | always |

DM channels get only Mark As Read, Mute, Notification Settings and Copy Channel ID.

## Category menu matrix

| Entry | Shown when |
| --- | --- |
| Mark As Read | disabled without unread or mentions in any child |
| Collapse Category / Expand Category | always |
| Collapse All Categories | more than one category (also in the server menu) |
| Mute Category (submenu) / Unmute Category | always; a muted category mutes its channels |
| Notification Settings | always; applies to channels without their own setting |
| Edit Category, Create Channel, Delete Category | MANAGE_CHANNELS |
| Copy Category ID | always |

Delete Category first moves the children out (`PATCH parent_id: null`): the API has no foreign key on `channels.parent_id`, so children would otherwise disappear from the list.

## Channel list behaviour

- Collapsed categories keep visible: the active channel, channels with mentions (even muted), voice channels with people in them, and unread channels that are not muted.
- Edit gear is shown with MANAGE_CHANNELS, independent of CREATE_INSTANT_INVITE (which gates only the invite button).
- Lock icon when the channel's overwrites deny VIEW_CHANNEL to @everyone; `18+` marker for `nsfw`; muted (timed mutes respected, category mute inherited) channels are dimmed and never count as unread.
- A floating pill ("New mentions above/below" or "New unreads ...") appears when a channel needing attention is scrolled out of the list and scrolls to the nearest one.

## Backend gaps

| Need | State | Tracking |
| --- | --- | --- |
| Per-server and per-channel notification levels, mute durations synced across devices | missing; stored per device, honoured by desktop notifications | api#28 |
| Server-side mark unread | missing; local marker plus ack of the previous message | follow-up on api |
| Forward message | implemented | [ADR 0020](../adr/0020-message-forwarding.md) |
| Category deletion re-parenting children | client does it, no server rule | follow-up on api |

## Verification

Unit tests for every model (permission matrices, collapsed-category filter, mute expiry, pill geometry) and component tests for hover, focus-within, Shift swap, right-click on message, link, image, emoji and selection, category and channel menus, collapse all, mute, gear gating and lock/age markers. See client PR #102.

## Reactions and message actions (client#55, client#56)

Messages routes (contracts `openapi/discordy.yaml`): `GET /channels/{id}/messages/{id}/reactions/{emoji}` lists reacting users (partial user objects, oldest first, capped at 100; needs READ_MESSAGE_HISTORY). `DELETE .../reactions` (all), `DELETE .../reactions/{emoji}` and `DELETE .../reactions/{emoji}/{user_id}` need MANAGE_MESSAGES, except that a user may delete their own reaction through the user route. Removing one emoji emits one `MESSAGE_REACTION_REMOVE` per user; clearing all emits `MESSAGE_REACTION_REMOVE_ALL`.

Client behaviour:

| Feature | Rule |
|---|---|
| Reaction chip tooltip | names of up to three reactors plus "and N others", fetched on first hover |
| Full list | long-press (500 ms) or context menu "See who reacted"; one tab per emoji; moderators get Remove per user |
| Chip context menu | See who reacted, React / Remove my reaction, Remove this emoji and Remove all reactions (MANAGE_MESSAGES, confirmed) |
| Picker | Frequently used row (`recentReactions`), skin tone selector (`skinTone` pref, applies to hand emoji), category bar with jump, one section per server |
| External emoji | other servers' emoji (animated included) only with USE_EXTERNAL_EMOJIS in the channel |
| Edited marker | `(edited)` with a full-date tooltip |
| Deleted reply | "Original message was deleted" when `referenced_message` is null |
| Report | "Report Message" on other people's messages, in every delivery mode; opens the report dialog ([moderation spec](2026-10-22-moderation-tools-and-ban-purge.md#reporting-a-message-or-a-user-api126)). Forward is implemented, see ADR 0020 |

Already covered earlier: Copy Message Link (`voics://channels/{guild}/{channel}/{message}`, handled by `main/deepLinks.ts`), delete confirmation with Shift to skip, Mark Unread. An https link form is deferred until a web origin for messages exists.

## System messages (client#87)

Server-generated messages (every `type` other than 0, 19 and 20) render as an icon row (`SystemMessage.tsx`, table in `domain/systemMessage.ts`) with a coloured icon, text with bold names and links, the time (full date on hover) and a hover toolbar and context menu.

| Type | Row | Interaction |
|---|---|---|
| 1 recipient add | "X added Y to the group." | |
| 2 recipient remove | "X removed Y from the group." or "X left the group." | |
| 3 call | "X started a call." then "X started a call that lasted 7 minutes." once `call.ended_timestamp` is set | Join call button while the call is running |
| 4 name change | "X changed the group name to N." | |
| 5 icon change | "X changed the group icon." | |
| 6 pin | "X pinned a message to this channel. See all pinned messages." | "a message" jumps to `message_reference`, "pinned messages" opens the pins panel |
| 7 join | one of 10 greetings, picked from the message id (same line on every client) | "Wave to say hi" replies with a wave emoji (`replyTo` the join message) |
| 18 thread created | "X started a thread: name." | the name opens the thread side panel |
| other | "Unknown system message (type N)" | |

- Hover toolbar: React (first quick reaction, only with Add Reactions), Delete (Manage Messages), More. Context menu: Mark Unread, Delete (Manage Messages, confirm), Copy Message ID (hidden unless Developer mode is on). Reactions render under the row.
- Producers today: messages emits 1, 2, 4, 5 (api posts them through `POST /internal/channels/{id}/messages`, standard-mode group DMs only). Nothing emits 3, 6, 7 or 18 yet; the messages `MessageKind` maps those codes to default and the internal route rejects them, and `contracts/schemas/objects/message.json` documents only types 0 and 19 and has no `call` object. The client renders them as soon as they are produced; `call` is read as `{ participants?, ended_timestamp? }` (Discord shape).
