# Account email through Cloudflare

How Voics sends account email (verification, password reset, security notices) and receives mail for `support@voics.nl` through Cloudflare. Sending needs no api code change: the api's `smtp` transport talks to Cloudflare's authenticated SMTP endpoint.

## What Cloudflare offers (checked 2026-11-06)

| Fact | Value | Source |
|---|---|---|
| Email Routing (inbound forwarding) | Free, unlimited, 200 rules and 200 destination addresses | [limits](https://developers.cloudflare.com/email-service/platform/limits/) |
| Email Sending (outbound transactional) | Labelled **Beta** on the product overview; requires **Workers Paid** to send to arbitrary recipients | [Email Service](https://developers.cloudflare.com/email-service/) |
| Pricing | 3,000 outbound emails per month included, then $0.35 per 1,000; sends to verified destination addresses are free | [pricing](https://developers.cloudflare.com/email-service/platform/pricing/) |
| Daily limit | Low for new accounts, grows with sending behaviour; raise through the limit increase form | [limits](https://developers.cloudflare.com/email-service/platform/limits/) |
| Interfaces | Workers binding, REST API (`POST /client/v4/accounts/{account_id}/email/sending/send`), authenticated SMTP | [send emails](https://developers.cloudflare.com/email-service/get-started/send-emails/) |
| SMTP | `smtp.mx.cloudflare.net`, port 465, implicit TLS only, username `api_token`, password a Cloudflare API token with **Email Sending: Edit**, AUTH PLAIN or LOGIN. No STARTTLS or port 587 | [SMTP](https://developers.cloudflare.com/email-service/api/send-emails/smtp/) |

Until the sending domain is onboarded, mail can only go to verified destination addresses. After onboarding any recipient works, but only on a Workers Paid plan. Because the product is in beta, treat the daily quota and the beta label as a risk and keep the `log` transport as the fallback.

## DNS records

Cloudflare adds these itself when the domain is onboarded (zone `voics.nl` is on Cloudflare DNS). The names below are what to expect; verify them in the dashboard before accepting.

| Purpose | Type | Name | Value |
|---|---|---|---|
| Inbound routing | MX | `voics.nl` | `route1.mx.cloudflare.net`, `route2.mx.cloudflare.net`, `route3.mx.cloudflare.net` (priorities assigned by Cloudflare) |
| Inbound routing SPF | TXT | `voics.nl` | `v=spf1 include:_spf.mx.cloudflare.net ~all` |
| Inbound routing DKIM | TXT | `cf2024-1._domainkey.voics.nl` | public key supplied by Cloudflare |
| Sending bounces | MX | `cf-bounce.voics.nl` | `route1.mx.cloudflare.net`, `route2.mx.cloudflare.net`, `route3.mx.cloudflare.net` |
| Sending SPF | TXT | `cf-bounce.voics.nl` | `v=spf1 include:_spf.mx.cloudflare.net ~all` |
| Sending DKIM | TXT | `cf-bounce._domainkey.voics.nl` | public key supplied by Cloudflare |
| DMARC | TXT | `_dmarc.voics.nl` | start with `v=DMARC1; p=none;`, tighten to `quarantine` then `reject` once reports are clean |

### Conflicts

- A public DNS lookup on 2026-11-06 showed no MX, no TXT (so no SPF) and no `_dmarc` record at the `voics.nl` apex, and nothing at `cf-bounce.voics.nl`. Nothing to merge.
- Email Routing refuses to onboard (error 2008) if non-Cloudflare MX records exist at the apex; none are visible now. The earlier product's records live on other names (`accounts`, `clerk`, `clkmail`, its DKIM selectors) and do not collide with the `cf-bounce` name or the `cf2024-1` and `cf-bounce` DKIM selectors. Confirm in the dashboard that none of them sits at the apex before enabling routing.
- Only one `v=spf1` record may exist per name. If an apex SPF is added later for another provider, merge it with the Cloudflare include (10 lookup limit).

## Steps (owner and coordinator)

1. Upgrade the Cloudflare account to Workers Paid.
2. Dashboard > Email Service > Email Routing: enable for `voics.nl`, verify the destination mailbox, add the address `support@voics.nl` forwarding to it.
3. Dashboard > Email Service > Email Sending: Onboard Domain `voics.nl`.
4. Add a `_dmarc` TXT record (`p=none`) if onboarding did not.
5. Create an API token (account-owned) with the **Email Sending: Edit** permission.
6. Store it as the GitHub production-environment secrets `SMTP_USERNAME` (value `api_token`) and `SMTP_PASSWORD` (the token); run `secrets-sync`. See [secrets inventory](../secrets/README.md#smtp-credentials).
7. In gitops set `MAIL_TRANSPORT: smtp` in `apps/api/base/configmap.yaml` and let Flux roll the api. The other settings are already there.
8. Request a password reset for a test account and check delivery, then watch the Email Sending logs.

## Api settings

| Variable | Value |
|---|---|
| `MAIL_TRANSPORT` | `smtp` (stays `log` until step 7) |
| `SMTP_HOST` | `smtp.mx.cloudflare.net` |
| `SMTP_PORT` | `465` |
| `SMTP_TLS` | `tls` (implicit TLS) |
| `MAIL_FROM` | `Voics <no-reply@voics.nl>` |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | OpenBao `discordy/smtp` |

Local development keeps the log transport. To rotate the token, create a new one, update the GitHub secret, run `secrets-sync`, then delete the old token.
