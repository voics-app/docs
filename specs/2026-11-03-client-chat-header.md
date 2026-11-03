# Desktop client: chat header interactions

Status: implemented in client PR for client#93 (builds on client#90 navigation history and client#50 notification settings).

The channel header was extracted from `ChatView.tsx` into `chat/ChannelHeader.tsx`. Pure rules live in `renderer/domain/chatHeader.ts`.

## Topic popout

- The topic in the header is a button. Clicking opens a popout under it with the full topic, rendered as markdown (`MarkdownView`).
- With `MANAGE_CHANNELS` (server channels only) the popout has Edit topic: a textarea with a 1024 character counter, Save (`PATCH /channels/{id}` with `topic`, empty clears it) and Cancel. Users with the permission also see "Add a topic" in the header when there is no topic.
- Esc leaves edit mode first, then closes. Clicking outside closes. DM topics do not exist, so DMs never show it.

## Notification bell

A bell button in every header (channels and DMs) opens a menu on the same synced settings as the channel context menu (client#50): Mute channel (durations) or Unmute, "Notify me for" (Default, All messages, Only @mentions, Nothing; the active one is marked) and Notification settings (the existing dialog). The bell shows as crossed out and active while the channel has its own mute.

## Pins panel (`panels/PinsPanel.tsx`)

- Each pin shows author, date, content, attachments (`MessageAttachments`) and embeds (`MessageEmbeds`).
- Jump scrolls to the message in the message list through `jumpToMessage` (which goes through `openChannel` and the navigation history when the channel differs).
- Unpin (`DELETE /channels/{id}/pins/{message}`) is shown with `MANAGE_MESSAGES` in a server, and to everyone in a DM. The card disappears at once; the gateway `CHANNEL_PINS_UPDATE` refreshes other clients.

## DM header

| Button | 1:1 DM | Group DM | Server channel |
|---|---|---|---|
| Start voice call / Join call | yes | yes | no |
| Start video call (joins, then turns the camera on) | yes | yes | no |
| Add friends to DM | opens "New message" with the peer preselected, which creates a group | opens the group dialog (add friends) | no |
| User profile (side panel: bio, mutual servers and friends, View full profile) | yes | no | no |
| Member list | no | no | yes |

## Threads button (not shipped)

Hidden: the API has no thread list route yet (api#34 is open; only `POST /channels/{id}/threads` exists). `THREADS_LIST_AVAILABLE` in `domain/chatHeader.ts` is the switch to flip once the list route exists.

## Verification

Unit tests: `tests/unit/domain/chatHeader.test.ts` (topic, pin and button rules) and `tests/unit/interface/chatHeader.test.tsx` (popout markdown, edit and save, Esc, Unpin visibility and action, Jump).
