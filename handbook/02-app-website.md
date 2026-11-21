# website

Summary: the static marketing site at discordy.voics.nl, rendered from templates and brand.json.

| | |
|---|---|
| Repository | `voics-app/website` |
| URL | `https://discordy.voics.nl` (bucket `discordy-site` in cluster MinIO) |
| Tech | Node scripts with no dependencies, HTML and CSS templates |

## Folder map

| Path | What is there |
|---|---|
| `brand.json` | The single source of branding: name, tagline, description, domain, logo, colours, download links, contact, year. |
| `src/` | HTML and CSS templates using `{{tokens}}` such as `{{name}}` or `{{colors.accent}}`. `src/assets/logo.svg` is the logo. |
| `src/privacy.html`, `src/support.html` | The privacy policy page (a **draft** with `[OWNER: ...]` placeholders, `noindex`, to be checked and completed by the owner before it is published or given to App Store Connect) and the support page. English only; links come from `pages.*` and `contactEmail` in `brand.json`. |
| `scripts/build.mjs` | Renders `src/` into `dist/`. |
| `scripts/check.mjs` | Fails on a hard-coded brand name or an unresolved token. |
| `deploy/deploy.sh` | Publishes `dist/` to MinIO through an in-cluster Job. |

How to rebrand and how it deploys is in [Marketing website and rebranding](08-website-and-branding.md).
