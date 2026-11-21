# Desktop language acceptance

Client [#64](https://github.com/discordy-voics/client/issues/64) adds English and
Nederlands to Settings → Language. The client change is prepared on
`feature/desktop-localization-20261118`; this runbook records its behavior and the
independent acceptance still required before release. It does not mark the issue
complete or publish a client build.

## Behavior

The language selection is an account preference, saved through the existing
`PATCH /users/@me/settings` field `locale` (`en-US` or `nl`). A successful response
updates the interface; a failed request retains the selection for retry. Reset
discards the draft. The settings draft guard also covers this page. READY and
`USER_SETTINGS_UPDATE` carry the preference on login and between clients.

With no saved locale, the first supported system language is selected. Unsupported
or malformed explicit locales fall back to English. Regional English/Dutch tags
retain their Intl date and number conventions. Both catalogs are LTR.

The canonical English ICU catalog and key-complete Dutch catalog live in the
client's `packages/core/src/domain/locales`. Missing/broken messages fall back to
English. ICU plurals/selects and Intl dates, numbers, relative times and lists are
shared by React, pure domain helpers and native menus. The renderer sets document
`lang`/`dir` and sends its resolved locale through validated `app:locale` IPC;
main keeps no independent saved locale.

The extraction covers account/security/preferences, profiles, server/channel
administration, template creation, discovery, application consent/webhooks,
authentication, chat/friends/members/moderation, search, media, voice/calls and
native tray/editing menus. See the client
[coverage inventory](https://github.com/discordy-voics/client/blob/feature/desktop-localization-20261118/docs/localization.md)
for exact boundaries and adding messages.

Messages, names, notes, credentials, URLs, command names and user template metadata
are never machine-translated. Known built-in template identities are translated;
their snapshot channel/role names remain exactly as they will be created. Unknown
server/OS diagnostics retain their original detail alongside translated product
feedback. OS permission prompts, external website passkey pages, the developer
component gallery and mobile navigation are outside this desktop catalog rollout.

## Local evidence

The client has regressions for catalog syntax and interpolation parity, fallback,
account persistence/failure/races, translated real controls and unchanged API
payloads. Dutch interaction tests include password/MFA values, profile Unicode,
server permission bits, report consent, hardware IDs, bot installation revisions
and webhook draft/error/retry behavior. Native tests preserve unread counts/action
IDs and the browser passkey handoff's origin and nonce checks.

The headless browser command from `apps/desktop` is:

```sh
pnpm exec playwright test --config playwright.localization.config.ts
```

It uses actual components/fonts and a synthetic loopback HTTP endpoint, blocks
external requests, and checks language PATCH failure/retry, accessible controls,
940×600 layout, mixed-direction text and forced RTL. Screenshots and traces are
local artifacts under `apps/desktop/output/playwright/`. Forced RTL is a layout
stress check; there is no Arabic/Hebrew language option in this release.

## Independent Windows and backend acceptance

Use the coordinator's isolated acceptance client and API, not production.

1. In English, select Nederlands and save. Verify only `locale: "nl"` is patched.
   Inspect translated account, profile, server settings and application consent.
2. Restart the packaged app and sign in again. Confirm the saved locale from READY
   and Dutch dates/numbers/plurals. Switch the account preference from a second
   client and verify the first client reacts to `USER_SETTINGS_UPDATE`.
3. Fail one settings save. Confirm the current language stays active, the new
   selection remains, and retry succeeds. Reset and settings navigation must obey
   the existing draft guard.
4. Enter English/Arabic/emoji profile or webhook text, change the account locale
   from the other client, and save. Confirm the exact original text, resource IDs,
   permissions, consent revision and webhook credential lifetime are preserved.
5. Switch languages while unread badges are present. Confirm tray/context menu
   text and attention descriptions change without altering counts, DND, mute or
   mention rules. Exercise a notification click and a voice pop-out.
6. Check keyboard navigation and accessible names at 940×600 and a normal laptop
   size. Check long Dutch labels, errors, native menus and input text direction.

Record exact client/API heads and observed results. Unit/headless results do not
substitute for these native, real-backend and cross-device checks. The coordinator
owns issue/board completion and release publication after acceptance.
