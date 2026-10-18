# 0014 — Gateway compression: per-connection zstd streaming, opt-in

- Status: proposed
- Date: 2026-10-18
- Deciders: @oussamaelhajoui (pending)
- Technical story: [docs#9](https://github.com/discordy-voics/docs/issues/9), [gateway#11](https://github.com/discordy-voics/gateway/issues/11)
- Related: [research note, post 8](../research/discord-engineering-comparison.md), spec section 8

## Context and Problem Statement

The gateway sends uncompressed JSON. `gateway/lib/discordy_gateway/interface/router.ex` (around line 26) sets `compress: false`, and spec section 8 defers ETF and zstd to a later version. Discord reduced gateway outbound bandwidth by about 40% with per-connection zstd streaming and delta-based passive sessions. Should Discordy add compression now, and how?

## Decision Drivers

- Bandwidth matters most for desktop clients on home links and for voice-heavy guilds.
- CPU and memory on the gateway nodes are shared with the BEAM scheduler and must stay low.
- Compression must be optional, so existing clients and the test suite keep working.
- JSON stays the default encoding in v1.

## Considered Options

1. Keep uncompressed JSON
2. zlib streaming (permessage-deflate or a per-connection zlib stream)
3. Per-connection zstd streaming, negotiated and opt-in
4. zstd with trained dictionaries

## Decision Outcome

Proposed: **option 3.** Compression is a per-connection stream negotiated at connect time, not on by default.

- **Negotiation.** The client asks for it with a query parameter on `/gateway`, for example `compress=zstd-stream`. A client that does not ask gets plain text frames, as now.
- **Context.** One compression context per connection, so later small events benefit from earlier history, as Discord measured.
- **Tuning.** Start from the zstd defaults and measure. Discord's level 6 with window log 18 is a reference point, not a target.
- **No dictionaries.** Discord found the gain small or negative for common payloads. We do not build dictionary training.
- **Order.** This ADR lands after the JSON contract is stable and with a benchmark in the repo. Passive sessions (gateway#12) are a separate decision.

### Consequences

- Good, because bandwidth drops for clients that opt in, and the gain is measured, not assumed.
- Good, because the default path and the existing tests are unchanged.
- Bad, because the gateway needs a zstd binding and the client needs a matching decoder. Both are new code to maintain on each platform.
- Bad, because allocator fragmentation under per-connection contexts was a problem for Discord. We must measure memory per connection before enabling it by default.

## Pros and Cons of the Options

### Option 1 — Keep uncompressed JSON

- Good, because nothing new to build.
- Bad, because the gap to Discord grows and bandwidth is wasted on repeated keys.

### Option 2 — zlib streaming

- Good, because it is widely supported.
- Bad, because Discord measured zstd as clearly better in ratio and time, and moved away from zlib.

### Option 3 — Per-connection zstd streaming, opt-in (chosen)

- Good, because it matches the measured best option and keeps the default safe.
- Bad, because it adds a binding on each side.

### Option 4 — zstd with dictionaries

- Good, because it helps very small payloads in theory.
- Bad, because Discord found the gain small or negative for the payloads that matter, and dictionaries need retraining and distribution.

## Validation

The benchmark in gateway#11 records bytes per event type (READY, MESSAGE_CREATE, resume) for both paths. Enable by default only after memory per connection is measured under load.
