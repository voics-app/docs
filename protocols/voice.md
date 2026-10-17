# Voice protocol

See also [ADR-0004](../adr/0004-custom-sfu.md), the [VoiceAllocator code view](../c4/rendered/structurizr-C4-VoiceAllocator.svg) and the [voice-region runbooks](../runbooks/README.md).

## Discovery (etcd)

Each voice node keeps a key at `/discordy/voice/nodes/<region>/<node_id>`, under a **10-second lease** that it refreshes every **3 seconds**:

```json
{ "node_id": "nl-home-1", "region": "nl-home", "ws_url": "wss://discordy-rtc-nl-home.voics.nl",
  "public_ip": "203.0.113.10", "udp_port": 50000, "users": 12, "cpu_pct": 7.5,
  "egress_bps": 1840000, "draining": false, "version": "0.1.0" }
```

## Allocation

Allocation runs in the gateway guild process. DM calls use a per-channel process instead.

1. **Choose the region**: the channel override if set, otherwise the guild's `voice_region`, otherwise `DEFAULT_VOICE_REGION` (default `nl-home`).
2. **Choose the node**: the non-draining node with the lowest `users`, with ties broken by `cpu_pct`.
3. **Record the choice**: store it at Valkey `voice:alloc:<srv_id>` = `node_id`. **Every user in the guild or DM shares the node.**
4. **Recover from node loss**: if the node disappears from etcd, the gateway reallocates and re-sends `VOICE_SERVER_UPDATE`.

Drain endpoints on the gateway: `POST /internal/v1/voice/nodes/{node_id}/drain` and `/undrain`.

## Voice token

The voice token is a JWT signed with HS256 using `VOICE_TOKEN_SECRET`. It lives **60 seconds**.

| Claim | Meaning |
|---|---|
| `sub` | User ID |
| `sid` | Gateway session ID |
| `srv` | `guild_id`, or the DM `channel_id` |
| `chn` | Voice `channel_id` |
| `node` | Voice node ID |
| `e2ee` | Whether DAVE media E2EE is required |

## Voice WebSocket

The client connects to `wss://<ws_url>/voice`. Frames have the form `{op, d}`.

| Op | Name | Direction | Payload `d` |
|---|---|---|---|
| 8 | HELLO | ← | `{heartbeat_interval: 13750}` |
| 0 | IDENTIFY | → | `{server_id, user_id, session_id, token, video}` |
| 2 | READY | ← | `{ssrc, ip, port, modes: ["dtls-srtp"], streams: [{type: "video", rid, quality, ssrc, rtx_ssrc}]}` |
| 1 | SELECT_PROTOCOL | → | `{protocol: "webrtc", data: {ice_ufrag, ice_pwd, fingerprint, setup: "actpass"}, codecs: [{name: "opus", type: "audio", priority, payload_type}, {name: "VP9"\|"AV1"\|"H264", type: "video", priority, payload_type, rtx_payload_type}]}` |
| 4 | SESSION_DESCRIPTION | ← | `{ice_ufrag, ice_pwd, fingerprint, candidates: [{ip, port, protocol: "udp"}], audio_codec, video_codec, e2ee: {protocol_version}\|null}` |
| 3 | HEARTBEAT | → | `{t: nonce}` |
| 6 | HEARTBEAT_ACK | ← | `{t}` |
| 5 | SPEAKING | ↔ | `{speaking: bitmask (1 mic, 2 soundshare, 4 priority), ssrc, user_id?}` |
| 11 | CLIENTS_CONNECT | ← | `{user_ids: [...]}` |
| 12 | VIDEO | ↔ | `{audio_ssrc, video_ssrc, rtx_ssrc, streams: [...]}` |
| 13 | CLIENT_DISCONNECT | ← | `{user_id}` |
| 15 | MEDIA_SINK_WANTS | → | `{"<ssrc>": quality 0-100}`: the viewer picks a simulcast layer |
| 21 | DAVE_PREPARE_TRANSITION | ↔ | MLS media E2EE |
| 22 | DAVE_EXECUTE_TRANSITION | ↔ | |
| 25 | DAVE_MLS_EXTERNAL_SENDER | ↔ | |
| 26 | DAVE_MLS_KEY_PACKAGE | ↔ | |
| 27 | DAVE_MLS_PROPOSALS | ↔ | |
| 28 | DAVE_MLS_COMMIT_WELCOME | ↔ | |
| 29 | DAVE_MLS_ANNOUNCE_COMMIT | ↔ | |
| 30 | DAVE_MLS_WELCOME | ↔ | |
| 31 | DAVE_MLS_INVALID_COMMIT | ↔ | |

The client **synthesises the remote SDP** from SESSION_DESCRIPTION. The server is ICE-lite and offers a single UDP candidate (`public_ip:udp_port`). There is no TURN for voice, and client IPs are never exposed to other peers.

## SFU control (internal)

The control channel is TCP `127.0.0.1:4101`, carrying newline-delimited JSON. It is reachable only from `voice-signaling` in the same pod.

Commands from signaling to the SFU:

```json
{"cmd":"create_session","session_id":"…","ice_ufrag":"…","ice_pwd":"…","remote_fingerprint":"…","codecs":[…]}
{"cmd":"close_session","session_id":"…"}
{"cmd":"set_sink_wants","session_id":"…","wants":{"<ssrc>":100}}
```

Events from the SFU to signaling:

```json
{"evt":"session_created","session_id":"…","local_ufrag":"…","local_pwd":"…","fingerprint":"…"}
{"evt":"speaking","session_id":"…","ssrc":123,"speaking":1}
{"evt":"stats","sessions":[…]}
```

**Crash recovery**: when the SFU restarts, signaling replays `create_session` for every live session.
