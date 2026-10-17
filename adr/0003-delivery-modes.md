# 0003 — Three message delivery modes: Standard, Ephemeral (MLS) and P2P

- Status: accepted
- Date: 2026-10-16
- Deciders: @oussamaelhajoui
- Technical story: [spec §6.4](../specs/2026-10-16-voics-platform-design.md#64-delivery-modes), master plan P11

## Context and Problem Statement

Users want Discord's convenience: history, bots and multiple devices. Some conversations also need content the server can't read, or must not store at all. How do we offer that privacy without taking the Discord feature set away from everyone else?

## Decision Drivers

- Discord parity for ordinary chats: bots, embeds, server-side history, edit and delete
- A real end-to-end guarantee where users ask for one, not "trust us" encryption
- Offline delivery for private messages where possible
- One understandable rule for which mode applies in a given chat
- Server metadata in private modes limited to sender, recipients, timestamp and size

## Considered Options

1. Three per-chat modes: Standard, Ephemeral (MLS E2EE relay) and P2P (WebRTC data channel)
2. E2EE everywhere (the Signal/Matrix model)
3. Standard only, with TLS in transit and encryption at rest
4. Two modes: Standard and E2EE

## Decision Outcome

Chosen option: **1**.

| Mode | How it works |
|---|---|
| **Standard** | Plaintext in ScyllaDB; every feature is available. |
| **Ephemeral** | MLS (RFC 9420, OpenMLS) ciphertext is kept in a per-recipient-device Valkey stream. Each entry is deleted when that device ACKs it, with a hard TTL of 7 days. It is never written to Postgres or ScyllaDB. |
| **P2P** | A WebRTC DTLS data channel whose fingerprint is signed by the device identity key. The gateway relays only SDP and ICE, and coturn relays DTLS bytes only when NAT requires it. Nothing is persisted. |

**How the effective mode is resolved** (P11, implemented once in `api`):

- **DMs and group DMs:** the strictest participant setting wins (P2P > Ephemeral > Standard). Each participant's setting is their per-chat override, falling back to their account default.
- **Guild channels:** members with MANAGE_CHANNELS set the mode.
- **Ephemeral limits:** allowed in guild channels with at most 100 members.
- **P2P limits:** allowed only in DMs and in group DMs with at most 10 members.

### Consequences

- Good, because privacy is opt-in per chat, and communities that rely on bots and history keep them.
- Good, because the server sees only metadata for private modes. Admin dashboards count these messages but never see their content.
- Bad, because the client carries three code paths, and private modes lose bots, embeds and server-side history. To keep this visible, the composer always shows the active mode and every mode change posts a system notice.
- Bad, because P2P needs both peers online; otherwise the client shows "peer offline".

### Confirmation

- `messages` returns 409 with code 50160 for any channel that is not in Standard mode.
- The WS11 end-to-end tests assert two things: an ephemeral entry disappears from Valkey after the recipient ACKs it, and a P2P message causes zero server writes.

## Pros and Cons of the Options

### Option 2 — E2EE everywhere

- Good, because it gives the strongest privacy by default.
- Bad, because it breaks bots, moderation, server features and large guilds, so Discord parity is lost.

### Option 3 — Standard only

- Good, because it is the simplest.
- Bad, because it offers no end-to-end guarantee, which fails the privacy goal.

### Option 4 — Standard and E2EE

- Good, because there are fewer code paths.
- Bad, because there is no "nothing stored anywhere" option for the most sensitive conversations.
