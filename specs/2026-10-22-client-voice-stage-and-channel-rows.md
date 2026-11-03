# Client voice UI: channel-list rows and call stage (client#92, client#57)

Status: implemented in the desktop client. Pure rules live in `domain/voiceOccupant.ts` and `domain/stageLayout.ts`.

## Voice channel rows (client#92)

- Occupants show a speaking ring on the avatar and Phosphor icons for: muted (`MicrophoneSlash`), deafened (`SpeakerSlash`), camera (`VideoCamera`) and a red `LIVE` pill with a `Broadcast` icon for streams. Server mute/deafen (red, label "Server muted"/"Server deafened") is distinguished from self mute/deafen (label "Muted"/"Deafened") through the accessible name and tooltip.
- A channel with `user_limit` shows `n/limit` (on hover, always when full). A full channel shows a lock and `aria-disabled` join with the tooltip "Channel is full". Users with MOVE_MEMBERS can still join, matching Discord.
- Drag an occupant onto another voice or stage channel of the same guild to move them: the source requires MOVE_MEMBERS (guild-level check), you cannot drag yourself, same-channel and text-channel drops are rejected, and the target row highlights while valid. The move uses `PATCH /guilds/{id}/members/{user}` with `channel_id` (api#24), shared with the user menu "Move to" action.
- Clicking an occupant opens the profile; right-click uses the shared user menu (client#80). Clicking a voice channel joins it (single click, as in Discord).
- Channel settings Overview has User limit (0 to 99, 0 is unlimited) and Bitrate (8 to 384 kbps) for voice channels.
- "Open chat" on a voice row navigates to the channel and opens the voice text chat panel (also shown in the lobby, so it works without joining) when `text_chat_enabled` is not false.

Deferred: channel status text under the name needs an API field.

## Call stage (client#57)

- Layouts: grid, focus (main tile plus filmstrip) and spotlight (main tile only). Pin/unpin a tile from the tile toolbar; a pin beats the transient focus. "Hide participants without video" drops avatar-only tiles (never the main tile). Mode, pin and hide-non-video persist per voice channel in device-local prefs (`stageLayouts`).
- Pop-out: the renderer calls `window.open('about:blank', 'discordy-call-popout')`. The main process allows exactly that named about:blank child in `setWindowOpenHandler` (everything else stays denied), and the child cannot navigate or open further windows. The stage is rendered into the pop-out through a React portal with the app styles copied over, so live MediaStreams, speaking rings and call controls work unchanged because both windows share one renderer process. Closing the pop-out or the main window docks the call again.
- Picture-in-picture: per-tile button using Chromium `requestPictureInPicture()` for a single video (camera or screen).

Deferred: per-stream volume (user volume exists in the user menu) and viewer-side simulcast quality selection, which needs a layer-selection call in the voice session that does not exist yet; mirrored self-view and fullscreen shortcuts (client#32).

## Moving members: server prerequisites and click handling (client#156)

- Dragging an occupant, the user menu "Move to" panel and the channel drag-reorder all work in the client; the member move is only a request (`PATCH /guilds/{id}/members/{user}` `channel_id`, api#24). It takes effect when the **gateway** applies `VOICE_MEMBER_MOVE` to the member's live voice session (gateway commit 27188f3, 2026-10-20). A local stack whose `e2e/gateway:develop` image predates it answers 200 and nothing moves; rebuild it from gateway `develop` (`dev.sh up --rebuild`, or build that one image) before testing.
- The user menu and its panels render in portals inside the occupant row. Their clicks bubble through the React tree, so the row only opens the profile for clicks that originate inside the row's own DOM.
- Live regression: `tests/live/voice-move-drag.spec.ts` (owner drags a member, uses "Move to", reorders channels).

## Call view interactions (client#95)

- **Watch Stream:** a remote screen share shows as a blurred preview tile with a "Watch Stream" button; the user opts in per stream (`voiceStore.watching`, keyed `userId:screen`). "Stop watching" in the tile toolbar returns it to the preview and drops focus or pin-in-picture on it. The opt-in is forgotten when the share ends or the call resets. Your own shares are never gated.
- **Hide self view:** a stage toolbar toggle (`voiceStore.hideSelfPreview`, kept across calls, not persisted) removes your own camera and screen tiles; your avatar tile stays.
- **Invite:** guild voice stages have an Invite button in the header that opens the existing invite dialog for the channel.
- **Backend reality (checked 2026-11-03):** the SFU keys `MEDIA_SINK_WANTS` (op 15) by the publisher's audio or primary camera SSRC; quality 0 stops forwarding that audio or camera track. Screen-share packets (`TrackKind::Screen`) are forwarded to every subscriber regardless of wants, so Stop watching only hides the track client-side and saves no bandwidth. Nothing reports who watches a stream (no subscriber or viewer events in signaling, SFU or the gateway voice state; only `self_stream` exists), so the streamer's viewer count and avatars are built behind `STREAM_VIEWER_REPORTING` (false, hidden).
- **Deferred (need backend):** per-screen-share subscribe/pause in the SFU, viewer events, and "Add to call" for DM calls (the gateway rings recipients only when the first participant joins; there is no add-participant or ring op).
