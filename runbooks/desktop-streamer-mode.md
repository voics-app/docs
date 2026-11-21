# Desktop streamer mode

Desktop Settings → Notifications has a device-local streamer mode. It hides the account email and generated server invite codes in the account and invite settings, redacts direct-message notification bodies and suppresses app notification and call tones and text-to-speech. The title bar indicates when protection is active. A configurable shortcut is available under Settings → Keybinds.

Optional OBS detection checks local process names every five seconds. The process list is not sent to Voics. During startup or a failed check, protection remains active; a successful check with no OBS process turns off only the automatic part. Manual mode remains independent. Turn it on manually before broadcasting, as detection is delayed.

This does not redact user-authored messages, clipboard contents, previous OS notifications or other applications, and does not mute call participants or media. Copying an invite still copies the actual link. Do not treat the mode as a general screen-redaction system.

For acceptance, use a test account to check that already-open account and invite screens hide their values, an unfocused DM notification is redacted and silent, incoming and outgoing call tones are suppressed, and turning the mode off restores normal behavior. Assign the shortcut and check focused and supported global handling. With OBS detection enabled, start and stop OBS and observe the indicator after at least five seconds. Check that an unavailable process list keeps protection active. See the client repository's `docs/streamer-mode.md` for the user-facing checklist.
