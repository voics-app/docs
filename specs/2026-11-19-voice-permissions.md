# Voice channel permissions and AFK moves

Status: proposed; depends on gateway#66 and client#372. These changes do not yet
provide server-side enforcement of media publication and must not be described
as a complete authorization boundary.

`STREAM` controls the camera and screen-share voice-state flags. The gateway
checks effective channel permissions, including role and member overwrites,
before accepting either flag. A refused update to an existing valid call echoes
the previous voice state to that session. Desktop and mobile clients refuse to
start camera or screen capture without `STREAM` and stop active capture when
the permission is revoked. Actual media publication needs a
separate server-side capability and live revocation; the gateway flag alone
cannot prevent a modified client from sending media.

When `USE_VAD` is absent, desktop uses its push-to-talk key without changing
the saved input-mode preference. Mobile shows a hold-to-talk control and keeps
the native microphone track disabled while the control is released. Mute takes
precedence. Backgrounding or leaving the screen releases the control.

Clients use effective `PRIORITY_SPEAKER` permission and speaking state for the
current channel to halve the gain of other participants while a priority member
speaks. Per-user volume and local mute remain the starting point for gain.

For an enabled guild AFK channel, the gateway starts the configured timeout
when all current sessions report automatic AFK. Invisible sessions count too;
activity on any session cancels the timer. On expiry the gateway checks current
presence and the target channel again, then uses the existing voice-move path.
Unknown presence does not trigger a move. A move sends a fresh voice server
update to the caller. The timeout starts when clients report AFK, not at the
last OS interaction; client idle-detection delay can therefore postpone a move
beyond the configured timeout.

Before calling this complete, exercise real calls on desktop and mobile,
including role and channel overrides, active second devices, cancellation,
permission changes during a call, audio ducking, and media publication denial
and revocation at the voice server.
