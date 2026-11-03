# How to rebrand

Summary: the checklist for changing the product name (today "Discordy") or its domain: which file or variable to change per repository, what to rebuild or redeploy, and the Cloudflare and DNS steps the owner performs by hand.

Defaults today: name `Discordy`, domain `voics.nl`, hosts `discordy-*.voics.nl`. Everything user-visible reads the name and hosts from one brand source per repository. Each repository also has a rebrand check that fails CI when the literal name or domain creeps back into user-visible code ([Guards](#guards)).

Two kinds of change exist:

- **Rename the product (display name only):** the name people see in the app, emails, alerts, website and admin. Cheap and safe. Follow [Rename the product](#rename-the-product).
- **Move to a new domain:** hosts change, so DNS, certificates and the update feed change too. Follow [Change the domain](#change-the-domain) after the rename.

## Rename the product

Change these, then rebuild and redeploy as the last column says. Open one PR per repository, into `develop`, and follow the normal [release](release.md).

| Repository | Where to change it | What it controls | Rebuild or redeploy |
|---|---|---|---|
| gitops | `infrastructure/configs/cluster-config/cluster-config.yaml` `BRAND_NAME` (and `infrastructure/environments/dev/cluster-config/cluster-config.yaml` for dev) | Alert titles (alert relay), ops portal pages, and, through the api and messages ConfigMaps, the `BRAND_NAME` / `BRAND_URL` variables of those services | Merge to `main`. Flux applies it; the api, messages and alert relay pods roll because their ConfigMaps change |
| gitops | `site/invite/index.html`, the `BRAND` block at the top of the script | Invite landing page text, deep-link scheme | Merge to `main` touching `site/**` (`publish-site` runs), and rebuild the website, which copies this file |
| api | env `BRAND_NAME` (set from gitops, see above; default in `crates/application/src/context.rs`) | Subject and body of verification, reset and security emails, TOTP issuer in authenticator apps | Roll the api; no rebuild when the variable comes from gitops |
| messages | env `BRAND_NAME` and `BRAND_URL` (defaults in `bin/messages/src/config.rs`) | User-Agent of link previews (`<name>Bot`) | Roll the messages service |
| client | `apps/desktop/brand.json` | Window title, tray, UI copy, installer name (`productName`), appId, deep-link scheme, publisher, update feed host, default api, gateway, cdn and landing URLs, CSP wildcard | Tag a client release: new installer and update feed |
| client | `apps/desktop/build/icon.*` and the other `build/` assets | Icons and installer art | Same release |
| website | `brand.json` (`name`, `tagline`, `description`, `domain`, `colors.*`, `logo`, `downloads.*`, `contact.*`), `src/assets/logo.svg` | The whole marketing site | Merge to `main` (publishes) or run `deploy/deploy.sh` |
| admin | `web/src/brand.json` (`name`, `adminTitle`) | Admin header and page title | Release admin: new image, Flux rolls it |
| bots-sdk | `src/brand.ts` (`name`, `webUrl`, `apiUrl`, `gatewayUrl`) | SDK default hosts, REST User-Agent, invite URL builder | Release the SDK; bot authors upgrade |
| docs | `README.md`, handbook, the client `PRODUCT.md` | Prose only | Merge; no deploy |

Notes:

- `BRAND_NAME` is plain configuration, not a secret. No secret changes for a rename.
- Changing `protocolScheme` in the client `brand.json` also needs `APP_LINK_BASE` in `apps/api/base/configmap.yaml` (gitops) and the `scheme` in the invite page `BRAND` block, or email links stop opening the app. Installed clients keep the old scheme until they update, so keep both for one release if you can.
- Changing `appId` makes electron-updater treat the new build as a different app: installed users do not auto-update across it. Keep `appId` unless you accept a fresh install.
- The Windows installer file name comes from `productName` (`<productName>-Setup-<version>.exe`). The client release workflow and the website `downloads.windows` hold that name literally, see [CI files that still hold the name](#ci-files-that-still-hold-the-name).

## Change the domain

All hosts live in one file per environment: gitops `cluster-config.yaml` (`DISCORDY_DOMAIN`, `HOST_LANDING`, `HOST_API`, `HOST_GATEWAY`, `HOST_ADMIN`, `HOST_CDN`, `HOST_UPDATES`, the ops hosts and `RTC_HOST_PREFIX`). Ingresses, the Cloudflare tunnel config, CORS and the api public URLs substitute them. The other repositories carry the same hosts as defaults in their brand source:

| Repository | Domain variables |
|---|---|
| client | `apps/desktop/brand.json`: `baseDomain`, `landingUrl`, `apiUrl`, `gatewayUrl`, `cdnUrl`, `updateFeedHost`. Runtime overrides stay available: `DISCORDY_API_URL`, `DISCORDY_GATEWAY_URL`, `DISCORDY_CDN_URL`, `UPDATE_FEED_URL` |
| website | `brand.json`: `domain`, `downloads.windows`, `contact.*` |
| bots-sdk | `src/brand.ts` |
| gitops | `cluster-config.yaml` (both environments), the invite page `BRAND` block |
| messages | `BRAND_URL` (from `HOST_LANDING`) |
| api | `PUBLIC_API_URL`, `PUBLIC_GATEWAY_URL`, `CDN_PUBLIC_URL` and `CORS_ALLOWED_ORIGINS` from `HOST_*` in the api ConfigMap; `MAIL_FROM` when SMTP is on |

### Steps

1. **Owner, Cloudflare (by hand; this runbook only describes it):**
   1. Put the new domain's zone on the Cloudflare account, or confirm the existing one covers it.
   2. Free Universal SSL covers only one level (`*.newdomain`). Keep every host exactly one level below the zone, like the current `discordy-*` names.
   3. Existing records stay untouched. Do not edit or delete DNS for `voics.nl`, `app.voics.nl` or any other product on the account.
   4. The tunnel (`TUNNEL_NAME`) can serve several zones. Its ingress rules come from gitops, so the tunnel itself needs no change beyond the new hostnames. `bootstrap/40-cloudflare.sh` creates the proxied CNAMEs to `<tunnel-id>.cfargotunnel.com` for every `HOST_*` and `<RTC_HOST_PREFIX>-<region>`; run it with `DRY_RUN=true` first. The Access applications for the ops hosts follow the same keys.
   5. Voice hosts are DNS-only (not proxied) records to the public IP, one per region, see [Cloudflare setup](cloudflare-setup.md) and [Adding a voice region](voice-regions/adding-a-region.md).
2. **gitops:** edit `DISCORDY_DOMAIN` and every `HOST_*` in both `cluster-config.yaml` files. The safety checks in `bootstrap/lib.sh` (`assert_not_protected`, `PROTECTED_HOSTS`) assume the current domain and the `discordy*` prefix; update them in the same PR, otherwise the Cloudflare script refuses the new hosts. Merge to `main`; Flux reconciles ingress and tunnel.
3. **client:** update the hosts in `apps/desktop/brand.json` and tag a release. Installed old builds keep polling the old feed, so keep the old `HOST_UPDATES` serving `latest.yml` until clients have updated.
4. **website:** `brand.json` `domain` and `downloads.windows`, then publish. The bucket stays `discordy-site` (an internal name).
5. **api and messages:** nothing beyond the ConfigMap values above.
6. **bots-sdk:** `src/brand.ts`, then release the package. Bots on an old SDK keep working only while the old hosts answer, so keep the old hosts as aliases for a deprecation window.
7. **Verify** with the [production smoke test](production-smoke-test.md) against the new hosts.

## What stays as it is

These are internal identifiers. They are not user-visible, renaming them is a **separate migration** (data, secrets and deployment change together), and a rebrand does not need it:

- Crate, package and image names: `discordy-*` crates, `@discordy/*`, `@discordy-voics/bots`, `ghcr.io/discordy-voics/*`, class names such as `DiscordyApi`.
- The GitHub organisation `discordy-voics` and the repository names.
- Kubernetes namespaces (`voics-apps`, `voics-data`, `voics-system`, `voics-voice`), the IngressClass `discordy-nginx`, ConfigMap and Secret names.
- Env var prefixes such as `DISCORDY_ENV`, `DISCORDY_PROFILE`, `DISCORDY_DOMAIN`.
- Object storage buckets (`discordy-site`, `discordy-assets`, `discordy-attachments`, `discordy-updates`), the Scylla keyspace `discordy`, the OpenBao `kv/discordy/*` paths and the `RTC_HOST_PREFIX` value.
- Seed and local-development data ("Discordy HQ", `alice@discordy.local`, the dev password), the `window.discordy` bridge and the `%USERPROFILE%\.discordy` owner folders.
- Voice-region tooling (`regionctl` examples and tests) and the gateway and voice service module names. They appear only in logs, tests and operator output.

## CI files that still hold the name

These are build scripts rather than user-visible code, and the guards do not cover them. Update them by hand on a rename:

- client `.github/workflows/release.yml`: `FEED`, the installer file names `Discordy-Setup-...`, the GitHub release title.
- client `.env.example` and the README table: the `UPDATE_FEED_URL` default.
- client `apps/desktop/package.json` `homepage`.
- gitops `apps/image-automation*/image-update-automation.yaml`: commit author email and message.
- Docker image description labels (`org.opencontainers.image.description`) in the Dockerfiles and the `description:` inputs in the CI files.

## Guards

A rebrand check runs in CI (and the pre-push hook, where the repository has one). It fails on the literal name or the brand domain in user-visible code outside the brand source:

| Repository | Check |
|---|---|
| client | `apps/desktop/tests/unit/brand/brand.test.ts` (name and base domain in `src/` outside `shared/brand.ts`) |
| website | `scripts/check.mjs` (name and base domain in `src/`) |
| admin | `web/src/brand.test.ts` |
| bots-sdk | `test/brand.test.ts` (string literals in `src/`) |
| api, messages | `scripts/check-brand.sh`, CI job `brand` (string literals in non-test Rust). A line may opt out with the marker `brand-check: allow` |
| gitops | `scripts/check-brand.sh`, CI job `brand` (apps manifests, ops pages, invite page outside its `BRAND` block) |

The TypeScript checks read the name from the brand source, so after a rename they ban the **new** name outside it. The shell checks take `BRAND_NAME` and `BRAND_DOMAIN` from the environment and default to today's values (gitops hardcodes them at the top of the script): change those defaults after a rename so they guard the new name.

See also: [Marketing website and rebranding](../handbook/08-website-and-branding.md) and [Desktop client release](../handbook/09-desktop-client-release.md#branding).
