# Production smoke test

End-to-end check of the production stack with the real desktop client build and the production defaults
(`https://discordy-api.voics.nl`, `wss://discordy-gateway.voics.nl`, `https://discordy-cdn.voics.nl`).

## How to run

```bash
git -C client worktree add ../client-wt-prod origin/main
cd client-wt-prod && pnpm install --frozen-lockfile && pnpm build:native
cd apps/desktop && pnpm build
unset DISCORDY_API_URL DISCORDY_GATEWAY_URL DISCORDY_CDN_URL   # use the built-in production defaults
LIVE_BASE=https://discordy-api.voics.nl pnpm exec playwright test -c tests/live/playwright.live.config.ts prod-smoke
```

The spec is `apps/desktop/tests/live/prod-smoke.spec.ts` in the client repo. It registers two throwaway accounts
(`discordy-e2e-<id>-a/b@example.com`, no email verification is required on production), creates a server, runs the
checklist below, then deletes the server and schedules deletion of both accounts. Fake media devices are used for
voice. Set `PROD_SMOKE_OUT` for the JSON result and `PROD_SMOKE_SHOTS` for failure screenshots and logs.
Never point it at VM 192.168.1.204 (another product).

## Latest results (2026-10-22, client 0.3.1 from main, api 0.3.0, gateway 0.2.1, messages 0.3.1, voice 0.1.0)

- [x] Register A and B through the UI, READY, gateway on `wss://discordy-gateway.voics.nl`, no localhost origins contacted
- [x] Logout and login again; 2FA settings section opens
- [x] Create server, invite link page on the website renders, B joins via the invite link
- [x] Standard: send/receive, markdown, mention, typing indicator, edit, react, delete, unread "New" divider, search
- [x] Ephemeral (MLS) in DM and in a server channel; P2P in DM (P2P is not offered in server channels by design)
- [x] Image and small video attachments inline; signed URLs on `discordy-cdn.voics.nl`; link preview of a public URL
- [x] DM call: incoming-call ring shown, ringtone AudioContext running
- [ ] Voice channel join, remote audio, camera, screen share: both stay on "Connecting" (ICE to the public SFU address; test machine is behind the same NAT, so possible hairpin issue). voice#13
- [x] Notification sounds toggle; settings X close button
- [ ] Notification settings sync to the server: not implemented yet (client#123, known gap)
- [x] Update feed `latest.yml` 0.3.1 matches `Discordy-Setup-0.3.1.exe` (99281492 bytes); website download button (`Discordy-Setup-latest.exe`) serves the same size
- [x] Cleanup: server deleted, test accounts scheduled for deletion (14 days)

Other findings: member list shows everyone offline while connected (client#135). Message history via REST lags the
live delivery by a few seconds right after a UI send.
