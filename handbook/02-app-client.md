# client

Summary: the Electron and React desktop app, with a Rust native crypto module.

| | |
|---|---|
| Repository | `discordy-voics/client` |
| Output | Windows NSIS installer on the update feed `https://discordy-updates.voics.nl`; macOS and Linux build from the same sources but CI does not publish them yet |
| Tech | Electron, React, Zustand, WebRTC, Rust (napi-rs, OpenMLS) |
| Catalog entry | [Service catalog: Desktop client](../services/catalog.md#desktop-client) |

## Folder map

| Path | What is there |
|---|---|
| `apps/desktop/src/main` | Main process: hardened window, typed IPC, tray, deep links, capture, push-to-talk, **updater**, crypto host. |
| `apps/desktop/src/preload` | The `window.discordy` bridge (context isolation, sandbox). |
| `apps/desktop/src/shared` | IPC contract and the local `contracts` module (REST, gateway, voice). |
| `apps/desktop/src/renderer/domain` | Pure logic: permissions, delivery modes, SDP synthesis, markdown, frame format. |
| `apps/desktop/src/renderer/application` | Zustand stores, use cases (session, privacy, voice, watch) and ports. |
| `apps/desktop/src/renderer/infrastructure` | HTTP and gateway clients, WebRTC, audio, workers. |
| `apps/desktop/src/renderer/interface` | React UI: design system, features, composition root. The component gallery is at `#/__gallery`. |
| `apps/desktop/brand.json` | The single source of branding (name, app id, protocol scheme, update feed host). |
| `apps/desktop/electron-builder.config.cjs` | Installer configuration; reads `brand.json`. |
| `native/crypto` | napi-rs module: OpenMLS, Ed25519 identity, encrypted local store. |
| `DESIGN.md`, `PRODUCT.md`, `ARCHITECTURE.md` | Design system, product notes, layering. |

## Configuration

`DISCORDY_PROFILE` (`production`, `local`, `custom`), `DISCORDY_API_URL`, `DISCORDY_GATEWAY_URL`, `DISCORDY_CDN_URL`, `UPDATE_FEED_URL`, `DISCORDY_USER_DATA_DIR` and `RENDERER_PORT` (to run a second client). Users can switch profile on the sign-in screen.

## Run, test, release

```bash
pnpm install
pnpm build:native    # native/crypto for this platform
pnpm dev             # electron-vite with HMR
pnpm test:unit && pnpm typecheck && pnpm lint
pnpm test:e2e        # Playwright against the real Electron app and a fake backend
```

Releases and the auto-updater are explained in [Desktop client release and auto-update](09-desktop-client-release.md). Renaming the app is a `brand.json` edit.
