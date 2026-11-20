# Sticker delivery proposal (api#33)

Status: draft for coordinated review. This document describes the proposed branches,
not a production rollout. No production deployment is authorized by this document.

## User flow

Server managers with `MANAGE_GUILD_EXPRESSIONS` can list, upload, rename, retag
and remove stickers. A server has 50 available slots; PNG, APNG, GIF and Lottie
uploads are limited to 512 KiB and 320 × 320 pixels. Uploads go to the existing
CDN bucket as `stickers/{id}.{png|gif|json}`. Lottie containing external asset
references or expressions is rejected. Removing a sticker hides it from new
sends but retains its stored metadata and object for historical messages.

In Standard chats the desktop picker offers a three-item built-in pack. Guild
channels additionally offer that guild's stickers. Built-in IDs 1–3 and their
self-contained Lottie assets are served by the API. The sender submits up to
three distinct IDs. Messages resolves each against the current author, destination,
permissions and delivery mode through the API, stores display metadata on the
message, and includes it in events, history and forwarded snapshots. Resolution
and message storage are separate operations, not a cross-service transaction.
Private delivery modes reject sticker sends; no plaintext fallback is attempted.

Gateway routes `GUILD_STICKERS_UPDATE` through the guild expressions intent;
the desktop client invalidates its server-sticker query on this event. The
client's sticker animation preference controls playback where the renderer can
produce a still frame.

## Dependencies and review

- contracts#64 defines the public and internal schemas.
- api#163 adds sticker management, the built-in pack, internal resolution and
  Postgres migration 0083.
- gateway#74 maps the sticker update event to the expressions intent.
- messages#89 stores snapshots and adds Scylla migration 0012. Coordinate its
  migration and rebase with voice messages#88, which reserves 0011.
- client#385 implements the desktop flow. Its composer and server settings changes
  overlap the GIF picker and soundboard tracks.

All linked PRs are drafts until reviewed together. The upload is written to object
storage before the database transaction; a failed transaction can leave an orphan
object. Image decoding currently checks the first decoded frame, not every frame
of an animated upload. Review resource bounds, complete animation validation,
Lottie rendering and asset-retention policy before release. The API resolver and
messages write do not atomically fence membership or sticker removal across services.
Mobile can select and send stickers in Standard chats and uses the Expo-compatible native Lottie renderer. Animated GIF/APNG show an accessible label when animation is disabled; invalid or unavailable Lottie also falls back to a label. A native rebuild, device acceptance and compatibility with older clients remain unverified.

## Verification before release

In an existing non-production stack, use two test members in a disposable guild:

1. Upload a valid image as a manager; check slot count, rename and emoji tag, and
   confirm a member without expression permission cannot manage it. Reject malformed,
   oversized and wrong-dimension inputs; exercise PNG, APNG, GIF and Lottie.
2. Send a guild sticker, and a built-in sticker in a Standard DM. Confirm both
   clients see the event, image, history after reload and forwarded snapshot.
3. Delete the guild sticker; confirm it disappears from the picker and cannot be
   newly sent while earlier messages and forwards still render. Check the 50-slot
   boundary and concurrent uploads.
4. Confirm a maximum of three distinct IDs, cross-guild denial and account/channel
   access checks. Switch the channel to private delivery and confirm no sticker is
   sent in cleartext or retried privately.
5. Check animation preferences, narrow desktop layouts and failure states, and
   exercise mobile before claiming platform parity. Verify CDN CORS for Lottie.

Ship only after green CI, migration/rollout review and the normal user route have
been independently verified; this document is not a deployment instruction.
