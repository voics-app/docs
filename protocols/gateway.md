# Gateway protocol

Clients connect to `wss://discordy-gateway.voics.nl/gateway?v=1&encoding=json`; locally, the URL is `ws://localhost:8000/gateway`. v1 uses JSON encoding only; ETF and zstd come later.

## Frame

```json
{ "op": 0, "d": {}, "s": 42, "t": "MESSAGE_CREATE" }
```

`s` (sequence) and `t` (event name) are set only for op 0 DISPATCH.

## Opcodes

| Op | Name | Direction | Payload `d` |
|---|---|---|---|
| 0 | DISPATCH | ← | Event payload; `t` is the event name and `s` the sequence |
| 1 | HEARTBEAT | ↔ | Last `s` received |
| 2 | IDENTIFY | → | `{token, device_id, intents, properties:{os, client, version}, presence?}` |
| 3 | PRESENCE_UPDATE | → | `{status: online\|idle\|dnd\|invisible, activities: [], afk}` |
| 4 | VOICE_STATE_UPDATE | → | `{guild_id\|null, channel_id\|null, self_mute, self_deaf, self_video, self_stream}` |
| 6 | RESUME | → | `{token, session_id, seq}` |
| 7 | RECONNECT | ← | — |
| 8 | REQUEST_GUILD_MEMBERS | → | `{guild_id, query?, limit, user_ids?, nonce}` |
| 9 | INVALID_SESSION | ← | `resumable: bool` |
| 10 | HELLO | ← | `{heartbeat_interval: 41250}` |
| 11 | HEARTBEAT_ACK | ← | — |
| 20 | E2EE_ENVELOPE | ↔ | `{channel_id, message_id, sender_device_id, recipients: [{user_id, device_id, ciphertext_b64}], mls_epoch, content_type: application\|commit\|welcome\|proposal}` |
| 21 | E2EE_ACK | → | `{message_ids: [...]}` |
| 22 | P2P_SIGNAL | ↔ | `{channel_id, to_user_id, to_device_id, from_user_id, from_device_id, kind: offer\|answer\|ice\|bye, payload, identity_sig_b64}` |
| 23 | VOICE_TELEMETRY | → | `{channel_id, jitter_ms, loss_pct, rtt_ms, bitrate_kbps}` |
| 24 | WATCH_TOGETHER | ↔ | `{channel_id, action: load\|play\|pause\|seek, url?, position_ms, at_server_ms}` |

Notes:

- **Op 20, client → gateway**: the frame carries every recipient's entry.
- **Op 20, gateway → client**: the frame carries only the entry for the receiving device.
- **Op 21**: deletes the listed entries from this device's inbox.
- **Op 22**: relayed, never persisted. If the target device is offline, the sender receives DISPATCH `P2P_SIGNAL_FAILED` with `{"error":"peer_offline"}`.
- **Op 23**: published to `discordy.telemetry.v1`.

## Connection lifecycle

```text
client                               gateway
  |-------- WebSocket upgrade --------->|
  |<------- op 10 HELLO ----------------|  heartbeat_interval 41250 ms
  |-------- op 2 IDENTIFY ------------->|  JWT verified locally; bot tokens via api introspect
  |<------- op 0 READY -----------------|  built from api /internal/v1/users/{id}/ready
  |<------- op 0 (E2EE inbox replay) ---|
  |-------- op 1 HEARTBEAT ------------>|  every interval (first one jittered)
  |<------- op 11 HEARTBEAT_ACK --------|
```

- **Resume**: within 120 s of a disconnect, send op 6 RESUME `{token, session_id, seq}`. Missed dispatches are replayed from the Valkey list `gw:resume:<session_id>` (at most 1000 entries), followed by `RESUMED`. If the session can't be resumed, the gateway sends op 9 with `false`, and the client must IDENTIFY again.
- **Rate limit**: 120 frames per 60 s per session. Exceeding it closes the connection with code 4008.

## Dispatch events emitted by the gateway itself

These are `READY`, `RESUMED`, `PRESENCE_UPDATE`, `TYPING_START`, `VOICE_STATE_UPDATE`, `VOICE_SERVER_UPDATE`, `GUILD_MEMBERS_CHUNK` and `P2P_SIGNAL_FAILED`.

`VOICE_SERVER_UPDATE` has the shape `{token, guild_id|null, channel_id, endpoint, region}`. The client uses it to open the [voice WebSocket](voice.md).

Every other dispatch originates on the [event bus](events.md). The envelope's `data` field is exactly the dispatch payload.

## Close codes

| Code | Meaning | Reconnect? |
|---|---|---|
| 4000 | Unknown error | Yes (resume) |
| 4001 | Unknown opcode | Yes |
| 4002 | Decode error | Yes |
| 4003 | Not authenticated | Yes |
| 4004 | Authentication failed | **No**: refresh the token first |
| 4005 | Already authenticated | Yes |
| 4007 | Invalid seq | Yes (IDENTIFY) |
| 4008 | Rate limited | Yes (back off) |
| 4009 | Session timed out | Yes (IDENTIFY) |
| 4013 | Invalid intents | **No** |
| 4014 | Disallowed intents | **No** |

## Intents

The bit values are Discord's. User sessions implicitly receive all intents, while bots must request them.

| Bit | Intent | Privileged |
|---|---|---|
| 1<<0 | GUILDS | |
| 1<<1 | GUILD_MEMBERS | yes |
| 1<<2 | GUILD_MODERATION | |
| 1<<3 | GUILD_EMOJIS | |
| 1<<4 | GUILD_INTEGRATIONS | |
| 1<<5 | GUILD_WEBHOOKS | |
| 1<<6 | GUILD_INVITES | |
| 1<<7 | GUILD_VOICE_STATES | |
| 1<<8 | GUILD_PRESENCES | yes |
| 1<<9 | GUILD_MESSAGES | |
| 1<<10 | GUILD_MESSAGE_REACTIONS | |
| 1<<11 | GUILD_MESSAGE_TYPING | |
| 1<<12 | DIRECT_MESSAGES | |
| 1<<13 | DIRECT_MESSAGE_REACTIONS | |
| 1<<14 | DIRECT_MESSAGE_TYPING | |
| 1<<15 | MESSAGE_CONTENT | yes |

## Ephemeral inbox (server side)

- Each device has one Valkey stream, `e2ee:inbox:<device_id>`, with entries `{message_id, json}` and `MAXLEN ~ 10000`.
- A sorted set, `e2ee:ttl`, is scored by expiry (7 days). A sweeper process deletes expired entries every minute.
- An entry is deleted when its device sends op 21.
- **Nothing ephemeral is ever written to Postgres or ScyllaDB** ([ADR-0003](../adr/0003-delivery-modes.md)).
