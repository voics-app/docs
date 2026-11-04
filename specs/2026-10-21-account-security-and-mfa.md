# Account security: recovery, email verification and TOTP two-factor

- Status: implemented in api (migration `0009_account_security.sql`), contracts and client
- Issues: [api#30](https://github.com/discordy-voics/api/issues/30), [api#31](https://github.com/discordy-voics/api/issues/31), [client#53](https://github.com/discordy-voics/client/issues/53)
- Related: [ADR 0015](../adr/0015-webauthn-second-factor.md) (WebAuthn, proposed), [REST reference](../protocols/rest.md)

## Scope

Change email, password and username; verify email; reset a forgotten password; disable or delete the account; enrol, use and disable TOTP; backup codes. Route shapes follow Discord where Discord has them (`PATCH /users/@me`, `POST /users/@me/mfa/totp/*`, `POST /users/@me/mfa/codes-verification`, `POST /auth/mfa/totp`).

## Re-authentication

| Operation | Needs |
|---|---|
| Change username, email or password (`PATCH /users/@me`) | current password |
| Disable or delete the account | current password |
| Start TOTP enrolment, list or regenerate backup codes | current password |
| Disable TOTP | current password **and** a TOTP or backup code |
| Reset password by email | the emailed token (does **not** remove 2FA) |

Profile edits (display name, avatar) need nothing extra. Bots cannot use any of these.

## Passwords

argon2id as at registration, 8 to 128 characters. A password change (or reset) revokes sessions: the caller's own session survives a change, a reset signs every session out. Devices bound only to revoked sessions are removed. A notice email goes to the account address.

## Email

- Registration sends a verification email; `POST /auth/resend-verification` resends (rate limited per recipient).
- `POST /auth/verify-email {token}` marks the account verified.
- An email change stores the new address in the token, not on the account. The account keeps the old address until the new one is verified, so a typo or hijack cannot lock the owner out. The old address gets a notice. The address is re-checked for uniqueness when verified.
- Tokens: 24 random bytes, only the SHA-256 is stored, single use, 24 h (verification) or 1 h (reset). A newer token of the same kind voids the older ones.
- `POST /auth/forgot-password` always answers 204 and sends nothing for unknown addresses, so it cannot enumerate accounts.
- Links use `APP_LINK_BASE` (default `discordy://`); every mail also carries the raw token to paste into the client.
- Outbound mail is limited to 5 per recipient per hour (Valkey), plus per-caller buckets on the public endpoints.

## TOTP (RFC 6238)

SHA-1, 6 digits, 30 s step, accepts one step either side (+-30 s). Verified against the RFC 6238 appendix B vectors in `api/crates/infrastructure/src/security/totp.rs`.

1. `POST /users/@me/mfa/totp/enable {password}` generates a pending secret and returns it with an `otpauth://` URI (the client renders the QR code). 2FA stays off.
2. `POST /users/@me/mfa/totp/verify {code}` activates 2FA, sets `mfa_enabled`, dispatches `USER_UPDATE` and returns ten backup codes, shown once.
3. `POST /users/@me/mfa/totp/disable {password, code}` removes the secret and all backup codes.

Deliberate difference from Discord: the server generates the secret (Discord lets the client choose one).

## Login with 2FA

`POST /auth/login` with a correct password and 2FA on answers `401`, code `60008`, with a single-use `ticket` (5 minutes). The client calls `POST /auth/mfa/totp {ticket, code}` with a TOTP or backup code. Sending `totp` directly on `/auth/login` also works. The ticket is consumed only on success.

## Backup codes

Ten codes of 10 characters (`xxxxx-xxxxx`, unambiguous alphabet, about 49 bits each). Stored as argon2id hashes, so they cannot be shown again: `POST /users/@me/mfa/codes-verification {password}` lists consumed state only, and `{password, regenerate: true}` replaces all codes and returns the new plaintext once. A code works once.

## Lockout and rate limits

- Second-factor attempts (login, enrolment, disable, backup codes) share one budget per user: 10 per 10 minutes, then `429` with `retry_after` until the bucket refills. The right code is refused while locked.
- Password confirmations: 10 per 10 minutes per user.
- Public endpoints add per-caller buckets: forgot-password 5/h, reset-password 10/h, verify-email 20/h, `/auth/mfa/totp` 30/10 min.
- Limiter outages fall back to a per-pod in-memory limiter (as the general limiter does, api#114); they no longer fail open.

## Disable and delete

- `POST /users/@me/disable`: signs out everywhere and marks the account disabled; the next successful login reactivates it.
- `POST /users/@me/delete`: refused (code 20011) while the user owns guilds. Otherwise schedules deletion after `ACCOUNT_DELETION_RETENTION_DAYS` (default 14) and signs out everywhere. Logging in during the window cancels it. After it, an hourly task anonymizes the account: username `deleted_<id>`, email, names, avatar, credentials, backup codes and tokens are removed; messages keep the author id.

## Configuration

`MAIL_TRANSPORT` (`log` default, or `smtp`), `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_TLS` (`starttls`, `tls`, `none`), `SMTP_USERNAME` and `SMTP_PASSWORD` (secret, `discordy/smtp`), `MAIL_FROM`, `APP_LINK_BASE`, `ACCOUNT_DELETION_RETENTION_DAYS`, `ACCOUNT_PURGE_INTERVAL_SECS`. The `log` transport logs bodies (and so tokens) only when `DISCORDY_ENV=local`; in production it logs recipient and subject only.

## Known gaps

- No platform-admin audit trail for account events yet (the audit log is per guild).
- A used TOTP code can be replayed inside its 90 s window.
- Disabled and deletion-pending users are still visible to others until anonymized.
