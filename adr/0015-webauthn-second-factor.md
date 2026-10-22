# 0015 — WebAuthn as a second factor next to TOTP

- Status: proposed
- Date: 2026-10-18
- Deciders: @oussamaelhajoui (pending)
- Technical story: [docs#9](https://github.com/discordy-voics/docs/issues/9), [api#19](https://github.com/discordy-voics/api/issues/19)
- Related: [research note, post 7](../research/discord-engineering-comparison.md), spec section 5

## Context and Problem Statement

Login uses argon2id passwords and optional TOTP (spec section 5). The `api` service implements TOTP through `TotpVerifier` (`api/crates/application/src/ports/services.rs`) and `totp-rs` (`api/Cargo.toml`). Discord moved MFA to WebAuthn, which resists phishing because credentials are bound to the origin and never leave the device. Should Discordy add WebAuthn, and what does recovery look like?

## Decision Drivers

- Phishing resistance for the admin portal and for accounts with moderation or bot-owner permissions.
- The desktop client is Electron. Platform authenticator support differs by OS, and Discord needed native bridges on macOS.
- Recovery must not lock a user out when a passkey is lost.
- The API is Rust with Clean Architecture ports, so the authenticator logic belongs behind a port.

## Considered Options

1. Keep TOTP only
2. Add WebAuthn using a Rust WebAuthn library (for example `webauthn-rs`) behind a port
3. Add WebAuthn with a hosted identity provider
4. Replace TOTP with WebAuthn

## Decision Outcome

Proposed: **option 2.** WebAuthn is added as a second factor. TOTP remains.

- **Port.** A `WebauthnVerifier` port in `api/crates/application/src/ports/services.rs`, next to `TotpVerifier`. The Rust library sits in `infrastructure`.
- **Storage.** Credential ID, public key, sign counter and transports, in Postgres through the existing repository pattern. The private key never reaches the server.
- **Challenges.** Server-issued, single use, with a short expiry. A successful MFA result may be cached for a few minutes, as Discord does.
- **Recovery.** One-time backup codes, stored hashed. Losing every factor means an admin-assisted reset, documented in a runbook when built.
- **Desktop.** The Electron client must reach the platform authenticator. The approach is decided in the client issue, not here.
- **No hosted IdP.** Discordy keeps identity in its own API.

### Consequences

- Good, because phishing-resistant MFA is available for sensitive accounts.
- Good, because TOTP users are unaffected.
- Bad, because backup codes and the desktop bridge are new surface to test and maintain.
- Bad, because a second factor type doubles the MFA test matrix.

## Pros and Cons of the Options

### Option 1 — TOTP only

- Good, because nothing new to build.
- Bad, because TOTP codes can be phished in real time.

### Option 2 — WebAuthn with a Rust library, behind a port (chosen)

- Good, because it fits the existing ports and adds no external service.
- Bad, because the library's attestation and counter handling must be tested with a software authenticator.

### Option 3 — Hosted identity provider

- Good, because the provider handles the protocol.
- Bad, because identity moves out of the platform and adds a cost and a dependency. It conflicts with the self-hosting goal in spec section 12.

### Option 4 — WebAuthn only

- Good, because it is the strongest option.
- Bad, because users without a passkey-capable device would be locked out.

## Validation

The acceptance criteria in api#19 require a software-authenticator integration test, a passkey-only login path, and single-use backup codes.
