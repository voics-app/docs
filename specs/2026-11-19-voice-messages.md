# Voice messages (implementation in review)

Related: [messages#15](https://github.com/discordy-voics/messages/issues/15),
[contracts#55](https://github.com/discordy-voics/contracts/pull/55),
[messages#88](https://github.com/discordy-voics/messages/pull/88), and
[client#373](https://github.com/discordy-voics/client/pull/373).

This describes proposed behavior; the draft changes are not deployed or accepted yet.
A standard voice message carries `IS_VOICE_MESSAGE` (8192), one uploaded audio
attachment, a positive duration in seconds and a base64 waveform. The messages
service checks `SEND_VOICE_MESSAGES` along with ordinary send and attachment
permissions, rejects mixed text or multiple attachments, and stores duration and
waveform with the attachment. The current recorder limit is five minutes.

The desktop private-message path encrypts the audio bytes with the existing
attachment cipher. The file key and voice metadata travel inside the encrypted
message payload. Ephemeral delivery uploads ciphertext under an opaque filename;
P2P delivery sends ciphertext directly. The server does not receive those
private metadata fields. Private delivery requires a working encryption bridge
and the existing private attachment route.

Android 10 and newer can record Ogg/Opus through the native recorder; permission
failure and unsupported devices must fail without sending. The desktop recorder
prefers Ogg/Opus and currently falls back to WebM/Opus when Chromium lacks Ogg
recording. Mobile private file delivery and iOS recording remain open work.
Do not present this feature as satisfying messages#15 until those gaps and normal
user-route verification are resolved.

## Rollout and verification

The messages change adds two fields to the Scylla attachment UDT. Before any
deployment, test old and new binaries against both schema versions in an isolated
environment, including history, forwarding snapshots, restart and rollback; a
mixed-version rolling upgrade has not been certified. Coordinate contract,
service and client releases so a client cannot send the flag to a service that
silently strips it. This document does not authorize a deployment or migration.

Verify recording, microphone denial, preview, discard, send, reload, playback,
waveform and all three speeds. Exercise ordinary, Ephemeral and P2P paths using
two endpoints, confirm private uploads and transfers contain ciphertext rather
than audio or metadata, and test cancellation and failure handling. Verify Android
on a supported device and an unsupported API level. CI and fixture tests do not
replace these checks.
