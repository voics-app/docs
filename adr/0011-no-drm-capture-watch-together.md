# 0011 — No capture of DRM-protected video; offer Watch Together instead

- Status: accepted
- Date: 2026-10-16
- Deciders: @oussamaelhajoui
- Technical story: [spec §1 non-goals and §7 "Screen share"](../specs/2026-10-16-voics-platform-design.md#7-voice-video-and-screen-share)

## Context and Problem Statement

Users want to watch Netflix and similar services together over screen share. These services protect playback with DRM (Widevine or PlayReady with hardware protection), so captured frames render black. Should the client try to capture DRM-protected content?

## Decision Drivers

- Legality: circumventing copy protection is prohibited (EU Copyright Directive art. 6, DMCA §1201)
- Platform risk: distributing a circumvention tool endangers the project and its hosting
- User experience: "watch together" is the real need
- Technical reality: hardware-protected paths can't be captured anyway

## Considered Options

1. Respect DRM (black frames) and build **Watch Together**: synchronised play, pause and seek, with each participant playing from their own account
2. Ship a DRM-free capture path (a patched Chromium, or disabling hardware protection)
3. Do nothing special

## Decision Outcome

Chosen option: **1**.

- **Capture.** Screen share uses Electron `desktopCapturer` (Windows Graphics Capture) and never attempts to bypass protected content, which therefore renders black.
- **Watch Together.** Gateway op 24 `WATCH_TOGETHER` carries `{channel_id, action: load|play|pause|seek, url?, position_ms, at_server_ms}`. The gateway relays it with the server clock, and the voice server's Watch Together clock keeps participants aligned. Each participant plays the title locally through their own subscription.

### Consequences

- Good, because there is no legal exposure, and users get better quality than a re-encoded screen share.
- Good, because it costs no SFU bandwidth for the video itself.
- Bad, because every participant needs their own account on the streaming service.
- Bad, because users who try to screen-share protected content still see a black window. The client shows a hint that points to Watch Together.

### Confirmation

Code review rejects any change that disables hardware media protection or patches the Chromium DRM paths.

## Pros and Cons of the Options

### Option 2 — Circumvention

- Good, because it would "just work" for users.
- Bad, because it is unlawful circumvention and a project-ending risk.

### Option 3 — Do nothing

- Good, because it requires no work.
- Bad, because a common use case ends in a confusing black screen with no alternative.
