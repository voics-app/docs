# Sending mail through Brevo

Account mail (address verification, password reset) goes out through Brevo. Incoming mail for `support@voics.nl` uses Cloudflare Email Routing, see [email-cloudflare.md](email-cloudflare.md).

- SMTP: `smtp-relay.brevo.com`, port 587, STARTTLS. These settings are in the api configmap in gitops.
- Sender: `no-reply@voics.nl`, verified in Brevo. The domain is authenticated with the `brevo1` and `brevo2` DKIM records.
- Credentials: the SMTP login and key are GitHub `production` environment secrets in gitops, synced to OpenBao.

## Rotating the key

1. Create a new SMTP key in Brevo.
2. Update the secret in the gitops `production` environment and run the secrets sync.
3. Restart the api: `kubectl -n voics-apps rollout restart deployment/api`.
4. Request a password reset and confirm the mail arrives.
5. Delete the old key in Brevo.
