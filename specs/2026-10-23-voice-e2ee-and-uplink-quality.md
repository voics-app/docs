# Voice: end-to-end encrypted calls and camera uplink quality

Status: implemented (client#155, client#158, client#126; voice#0.1.6 adds the founder flag).

## 1. End-to-end encrypted calls (client#155)

A call is end-to-end encrypted when the gateway marks the voice token `e2ee`: a DM or group whose delivery mode is Ephemeral or
P2P, or an account with `e2ee_calls_default`. Media frames are then encrypted in a worker (AES-GCM, key derived per sender and
epoch from the MLS exporter secret), so a member without the group key hears nothing. Voice ops 25-31 carry the MLS control plane;
the voice node is only the delivery service.

### Wire contract (what the client and the node actually exchange)

| Op | Direction | Payload |
| --- | --- | --- |
| 25 `DAVE_MLS_EXTERNAL_SENDER` | node -> member, right after READY | `{ protocol_version, founder, external_sender }`. `founder` is true for the first member of the room (voice 0.1.6+). |
| 26 `DAVE_MLS_KEY_PACKAGE` | member -> node -> others | `{ key_package_b64 }`, relayed with `user_id`. |
| 28 `DAVE_MLS_COMMIT_WELCOME` | committer -> node | `{ transition_id, commit, welcome?, recipient_ids? }`. Omit `welcome` for a removal. |
| 29 `DAVE_MLS_ANNOUNCE_COMMIT` | node -> everybody else | `{ transition_id, commit, user_id }` (also reaches the joiner, which ignores it: it has no group yet). |
| 30 `DAVE_MLS_WELCOME` | node -> `recipient_ids` | `{ transition_id, welcome, user_id }`. |

The node never sends 21/22 (prepare/execute); a client that answered 21 with 21 would loop through the relay, so every epoch is
activated locally as soon as its key is installed.

### Group lifecycle

1. The founder creates the group on op 25 (`founder: true`; older nodes send no flag, then "nobody else was in the call at join" is used).
2. Every other member sends a key package; the founder commits an Add and sends commit + welcome.
3. A joiner installs the epoch from the welcome and starts sending; frames from epochs it does not hold yet are dropped, never played in clear.
4. When a participant leaves, the committer removes their devices and everybody rotates to the new epoch.

### Root causes of "no sound in an Ephemeral / P2P voice channel"

* The node announced `commit` / `welcome` / `recipient_ids`; the client sent and read `commit_b64` / `welcome_b64` / `user_ids`: no commit or welcome was ever relayed.
* The node never sent `founder`, so nobody created the group and every encrypted frame was dropped for lack of a key (silent audio, no error).
* Op 25 arrives before the offer/answer creates the DAVE session and was dropped; DAVE ops were handled concurrently, so the commit announced to a joiner (error: unknown group) could wipe the keys its welcome had just installed.
* Not E2EE specific, but it hit the same calls: a remote source whose ssrc was corrected (speaking op: node's planned ssrc, video op: the browser's) had its stream removed from the mixer and never re-attached, because the receiver does not fire `track` again.

## 2. Camera and screen uplink quality (client#158)

Measured with getStats in `tests/live/camera-quality.spec.ts` (two clients, local stack, fake camera, 720p30 default preset):

| | sent | received | bitrate | limited by |
| --- | --- | --- | --- | --- |
| before | 320x180 to 640x360, 7-20 fps | same | about 35 kbps | bandwidth |
| after | 1280x720, about 20 fps (encoder bound in the test VM) | 1280x720, about 20 fps | about 730 kbps (target 2.5 Mbps) | none |

Cause: Chromium's send-side estimator never applied the voice node's transport-wide-cc reports and decayed to its floor
(`availableOutgoingBitrate` about 60 kbps with audio alone), so the encoder was given 30 kbps whatever the preset asked for. The
node does generate the reports (trace of `str0m::session`): why Chromium discards them is open (see voice backlog).

Fix: the client's own uplink sections are answered without the transport-cc header extension and feedback (loss based, REMB), with
`x-google-start-bitrate=1500; x-google-min-bitrate=600; x-google-max-bitrate=4500` on the video codec, so 720p30 starts immediately
and 1080p30 is allowed. Downlink sections keep transport-cc for the node's per-receiver estimate. Camera and screen share together
were re-checked (`dm-call.spec.ts`: camera 1280x720, screen 1920x1080, both decoded by the peer).

Known limits: one encoding per source (no simulcast yet, so a weak receiver cannot get a lower layer); no delay-based congestion
control on the uplink until the node's reports are accepted.

## 3. Incoming call ringtone (client#126)

The ringtone code is hardened against an unknown synced tone id, a non-numeric volume, a stale output device (falls back to the system
default) and a suspended AudioContext (resumed every cycle). `tests/live/ringtone-audible.spec.ts` asserts output energy at the
destination node, not just `AudioContext.state`. DND does not silence incoming calls (they ring, as designed).

## 4. Troubleshooting

* No sound in an encrypted call: check the voice node version (>= 0.1.6 sends `founder`), the call badge (E2EE active only after the epoch key is installed) and the renderer console for `DAVE error`.
* Camera stuck at low resolution: `getStats` outbound-rtp `qualityLimitationReason` and candidate-pair `availableOutgoingBitrate`; a value near 60-90 kbps means the estimator decayed.
* Run the live specs against the local stack: `voice-e2ee-audio`, `camera-quality`, `ringtone-audible` under `apps/desktop/tests/live`.
