# Marketing website and rebranding

Summary: how the site is built from templates and brand.json, how to rename or restyle it, and how it deploys.

The site is a static page set served at `https://discordy.voics.nl` from the MinIO bucket `discordy-site`. It lives in the `website` repository ([website](02-app-website.md)).

## Structure

| Path | Role |
|---|---|
| `brand.json` | The single source of branding: `name`, `tagline`, `description`, `domain`, `logo`, `colors.*`, `downloads.*`, contact and year. |
| `src/` | HTML and CSS templates with `{{tokens}}` (`{{name}}`, `{{colors.accent}}`). No brand string is hard-coded. |
| `src/assets/logo.svg` | The logo. |
| `scripts/build.mjs` | Renders `src/` into `dist/` (Node 18 or newer, no dependencies). It also copies `gitops/site/invite/index.html` into `dist/invite/` so the invite page always ships with the site. |
| `scripts/check.mjs` | Fails on a hard-coded brand name, a hard-coded base domain or an unresolved token. |
| `deploy/deploy.sh` | Publishes `dist/` to MinIO. |

## Rebrand step by step

1. Edit `brand.json`: `name`, `tagline`, `description`, `domain`, `colors.*` and `logo`.
2. To change the logo, replace `src/assets/logo.svg`, or point `logo` at another file under `src/`.
3. Build and check:

   ```bash
   npm run build && npm run check
   ```

4. Open a PR to `develop` as usual. The CI job builds and checks the site on every push.
5. Release to `main`: the merge publishes the site.

The full cross-repository checklist (client, api emails, admin, bots-sdk, gitops hosts, DNS and Cloudflare, what to redeploy) is the [How to rebrand](../runbooks/rebrand.md) runbook. The desktop client has its own `brand.json` with the same idea ([Desktop client release](09-desktop-client-release.md#branding)); rename both to rename the product.

## Product name and logo

The product is named **Voics** (`brand.json` `name`); the site domain stays `discordy.voics.nl` and must never point at the separate `voics.nl` production product. `src/assets/logo.svg` is the V mark, the same geometry and gradient as the desktop app icon, and doubles as the favicon.

## Download buttons

Every Download button links to `downloads.windows` in `brand.json`, the stable URL of the latest installer (`https://updates.voics.nl/Voics-Setup-latest.exe`); the Android buttons link to `downloads.android` (`https://updates.voics.nl/Voics-latest.apk`). macOS and Linux show "coming soon".

## Deploy

The site goes live on every merge to `main` and on every `v*` tag: CI builds, checks and uploads the `site-dist` artifact, and within 10 minutes the private gitops workflow `publish-public` (on the in-cluster runner; the website repo is public and may not use it) uploads it into `discordy-site`. Run `publish-public` by hand in gitops to go live right away. No MinIO key is stored in GitHub; the job reads the Kubernetes Secret `voics-data/minio` over the cluster network. Manual deploy:

```bash
npm run build
KUBECONFIG=~/.kube/discordy-gen-serv.yaml bash deploy/deploy.sh
```

The script uploads `dist/` as a temporary ConfigMap and runs a Job that mirrors it into the bucket. It never deletes other objects, so `invite/index.html` (owned by gitops) survives.

## Invite page

`https://discordy.voics.nl/invite/<code>` is a static landing page owned by `gitops` (`site/invite/`). It is published by `gitops` `publish-site.yml` on a merge to `main` touching `site/**`, and by the website build.
