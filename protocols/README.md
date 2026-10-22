# Protocol references

These pages are the human-readable view of the wire protocols. They are written from the pinned interfaces P3–P9 in the master plan. The machine-readable source of truth is the `contracts` repository: OpenAPI 3.1 and JSON Schema. Once `contracts` publishes its first release, these pages will be regenerated from it, and any difference counts as a bug in this copy.

| Reference | Covers |
|---|---|
| [Gateway](gateway.md) | Client ↔ gateway WebSocket: frames, opcodes, dispatch events, close codes, intents, sessions, E2EE inbox |
| [Voice](voice.md) | Voice allocation, etcd discovery, voice WebSocket opcodes, SFU control protocol, voice token |
| [Events](events.md) | Redpanda envelope, topics, keys, producers, gateway routing |
| [REST](rest.md) | Public `/api/v1` and internal `/internal/v1` endpoints, auth tokens, errors, rate limits, Snowflakes |
| [Delivery mode guarantees](delivery-modes.md) | Per mode: who can read, where data lives, what survives restart, offline recipients and removed members |
