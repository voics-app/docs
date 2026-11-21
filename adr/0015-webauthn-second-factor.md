# 0015 — WebAuthn as a second factor next to TOTP

- Status: accepted (implementation in progress)
- Date: 2026-10-18
- Deciders: @oussamaelhajoui (feature implementation authorized 2026-11-18)
- Technical story: [docs#9](https://github.com/voics-app/docs/issues/9), [api#19](https://github.com/voics-app/api/issues/19)
- Related: [research note, post 7](../research/discord-engineering-comparison.md), spec section 5

## Context and Problem Statement

Login uses argon2id passwords and optional TOTP (spec section 5). The `api` service implements TOTP through `TotpVerifier` (`api/crates/application/src/ports/services.rs`) and `totp-rs` (`api/Cargo.toml`). Discord moved MFA to WebAuthn, which resists phishing because credentials are bound to the origin and never leave the device. Should Voics add WebAuthn, and what does recovery look like?

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

**Option 2.** WebAuthn is added as a second factor. TOTP remains.

- **Port.** A `WebauthnVerifier` port in `api/crates/application/src/ports/services.rs`, next to `TotpVerifier`. The Rust library sits in `infrastructure`.
- **Storage.** Credential ID, public key, sign counter and transports, in Postgres through the existing repository pattern. The private key never reaches the server.
- **Challenges.** Server-issued, single use, with a short expiry. A successful MFA result may be cached for a few minutes, as Discord does.
- **Recovery.** One-time backup codes, stored hashed. Losing every factor means an admin-assisted reset, documented in a runbook when built.
- **Desktop.** The Electron client must reach the platform authenticator. The approach is decided in the client issue, not here.
- **No hosted IdP.** Voics keeps identity in its own API.

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

## Implementation contract (2026-11-18)

The routes and schemas below specify the implementation to build. The API adapter,
runtime configuration and client authenticator flow are not delivered yet.

- Library: patched upstream `webauthn-rs` 0.5.5 with vendored OpenSSL 3.6.3 behind the verifier port. This is compatible with the existing JWT 12 dependency graph; 0.6.2's crypto-glue/RSA requirements conflict with it. Serialized ceremony state is retained only in Postgres; it is never trusted from a client. Runtime implementation and client integration still require their own verification before release.
- Registration requires an authenticated session and password confirmation. Assertion requires a password-authenticated MFA ticket. Both ceremonies expire after five minutes and are single use.
- Each credential has an account-private name, creation time and last-used time. Authenticators with nonzero counters must advance them; a database compare-and-set prevents concurrent assertions from accepting a stale counter.
- TOTP remains available. Passkey-only users can log in with their passkey or a hashed, single-use recovery code. Removing the final factor disables MFA only after password and second-factor confirmation.
- `WEBAUTHN_RP_ID` and `WEBAUTHN_RP_ORIGIN` enable the adapter together. The origin is an explicit HTTPS origin (HTTP localhost is allowed only for development). No request-controlled host or origin is used to configure the relying party.
- Public routes and request schemas are in the generated [REST reference](../protocols/rest.md). Native/Electron clients must use a platform authenticator with that relying-party origin; a `file://` renderer cannot substitute its own origin.
