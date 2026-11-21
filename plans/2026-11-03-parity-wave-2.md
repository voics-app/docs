# Parity wave 2: plan and handover (2026-11-03)

Summary: 12 tickets, worked by at most 3 agents in 3 lanes. This page holds the order, the scope and approach per ticket, the ideas, the agent brief and the live status, so anyone (a person or another agent) can continue where the last one stopped.

Owner of the plan and of the GitHub board: the coordinating agent (lead). Agents report to the lead; the lead reviews the code, merges, and updates the tickets and the board. **Agents never edit issues, the board, or merge.**

## How the lanes work

Tickets that edit the same files run in the same lane, one after the other, so two agents never change `MessageItem.tsx` or the settings shell at the same time. Each lane has one agent at a time. When an agent finishes, the lead reviews and merges its PRs, updates this page, and starts the next ticket of that lane with a fresh agent (cheapest capable model).

| Lane | Area (files it owns while active) | Order |
|---|---|---|
| **A: messages** | `chat/MessageItem.tsx`, `chat/MarkdownView.tsx`, `chat/ReplyPreview`, member list tags; later `voice/VoiceStage.tsx`, `voice/Participants.tsx`, `voiceStore` | client#86 → client#87 → client#182 (wire Chat toggles) → client#95 |
| **B: settings and composer** | `settings/SettingsHost.tsx` and tabs, a shared `UnsavedBar`; `chat/Composer.tsx`, `chat/ChatView.tsx` `TypingBar`; later `channels/UserPanel.tsx`, `shell/customStatus.ts`, `members/ProfileDialog.tsx`, `home/HomeSidebar.tsx` | client#89 → client#88 → client#85 |
| **C: navigation, header, apps, ops** | `palette/CommandPalette.tsx`, `app/shortcuts.ts`, `useUiStore` history; `chat/ChatView.tsx` header part, `panels/SidePanelHost.tsx` pins; app menus and a developer page; gitops alert rules | client#90 → client#93 → client#77 → gitops#61 → gitops#48 |
| Lead | | gitops#56 (verify and close) |

`ChatView.tsx` is touched by lane B (`TypingBar`, #88) and lane C (header, #93). They edit different components in it. Whoever lands second rebases.

Why this order:

- **#89 before #88:** the "Send with Ctrl+Enter" preference lives in the Chat tab that #89 creates.
- **#86 before #87:** both reshape the message row; #86 adds the timestamp, tooltip and tag primitives that #87 reuses.
- **#90 before #93:** navigation history (#90) is used by "Jump" in the pins panel (#93).
- **gitops#48 last:** it is an evaluation and design, and depends on a second always-on OpenBao that does not exist yet.

## Per-ticket plan

### Lane A

**client#86: message rendering details (P1).**

- **Do:**
  - Timestamp formatter: Today at / Yesterday at / locale date. It is a pure function in `domain/`, with unit tests.
  - Full-date tooltip on the header and gutter `<time>`, and an edited tooltip with the edit time.
  - Emoji-only detection (at most 27 emoji, nothing else) renders 2x, with a unit test.
  - APP tag next to bot names in the message header and `MemberList`.
  - Role mentions in the role colour, and the row highlighted when the viewer has the role.
  - Reply preview shows "@name"; a deleted original shows "Original message was deleted".
  - Invite card for links to this instance's invite host (taken from the brand module, not hardcoded): `GET /invites/{code}?with_counts=true`, with Join or Joined.
- **Ideas:**
  - Cache invite lookups per code for the session.
  - Render the card lazily when the message scrolls into view.
- **Backend:** none.

**client#87: system messages (P1).**

- **Do:**
  - A renderer table by message type (1, 2, 3, 4, 5, 6, 7, 18) with an icon, links and a safe fallback ("Unknown system message (type N)").
  - Join messages: a rotating greeting (deterministic from the message id) and a Wave button that sends 👋 as a reply.
  - Hover toolbar and context menu (Delete for MANAGE_MESSAGES, Copy ID, Mark unread).
  - Call message (type 3): duration and a Join call button.
- **Backend check (do first):** do api/messages emit types 3 and 18? Look at the producers and `contracts/schemas/objects/message.json`. If not, render what exists and report the gap to the lead, who files the backend issue. Group DM types depend on api#29.
- **Idea:** greetings as a list in the brand-neutral i18n strings.

**client#182: wire the Chat settings toggles (P1, follow-up of client#89).** Six Chat tab prefs (`inlineMedia`, `inlineEmbeds`, `spoilerDisplay`, `showReactions`, `compactReplyPreview`, `convertEmoticons`) only store their value. Wire them into `MessageItem.tsx` / `MarkdownView.tsx` (and the composer for emoticons), with a unit test per toggle.

**client#95: call view interactions (P1).**

- **Do:**
  - Remote screen shares as a preview with Watch Stream; Stop watching drops the subscription.
  - Viewer count and avatars for the streamer.
  - Invite button in the stage header, and Add to call for DM calls.
  - A hide-self-view toggle.
  - `voiceStore` subscription-state tests.
- **Backend check (do first):** does `voice/signaling` (Elixir) plus the SFU support a per-stream subscribe/unsubscribe and report subscribers? If not, implement the client side behind the existing auto-subscribe (Watch Stream just reveals it), and report the gap so the lead files a voice issue. Do not change the voice repo without the lead.
- **Idea:** start muted at low quality for previews (a simulcast layer, if the SFU supports it).

### Lane B

**client#89: settings structure (P1).**

- **Do:**
  - Chat tab: image, embed and link-preview toggles; show spoilers (on click / servers I moderate / always); convert emoticons; show reactions; send with Ctrl+Enter (only stored here; #88 uses it); compact reply preview.
  - Advanced tab: Developer mode, which gates every Copy ID entry.
  - Settings search over tabs and rows, jumping to the row.
  - Log out at the bottom of the nav, with a confirm.
  - A shared `UnsavedBar` plus a `useUnsavedChanges` hook, used by Profile, Server overview, Roles and Channel settings. Closing with unsaved changes shakes the bar and blocks Esc once.
  - Tests for the hook and the search index.
- **Ideas:**
  - Build the search index from a static list of `{tab, rowId, label, keywords}` next to each tab, so new settings register themselves.
  - Settings that must sync go through the existing user-settings resource.

**client#88: composer details (P2).**

- **Do:**
  - "+" menu: Upload a file now; Thread, Poll and Apps entries behind feature flags.
  - Floating format toolbar on selection (keyboard accessible, reusing the wrap helpers).
  - `@here` suggestion.
  - Typing line for three names.
  - Honour "Send with Ctrl+Enter" from #89.
  - Paste over 2000 characters offers Convert to file / Send as message.
- **Backend check:** does messages distinguish `@here` from `@everyone` (mention_everyone and online-only)? If not, send `@here` as text and report.

**client#85: custom status shown to others (P1).**

- **Do:**
  - Send the custom status as a type 4 activity in `PRESENCE_UPDATE` on connect and on change, and clear it on expiry.
  - Show it in the member list, DM list and profile, with truncation and a tooltip.
  - Editor with an emoji picker and Clear after (Don't clear / 30 min / 1 h / 4 h / Today).
  - Anchor the status menu above the user panel instead of `top - 280`.
- **Backend check (do first):** does gateway forward `activities` in PRESENCE_UPDATE dispatches? Add `expires_at` to `contracts/schemas/objects/user-settings.json` if missing (contracts PR first). If gateway drops activities, report it; the lead files a gateway issue or assigns it.

### Lane C

**client#90: navigation and quick switcher (P1).**

- **Do:**
  - Palette prefixes `@ # ! *` with a mode chip; an empty query lists recent and unread channels first.
  - A navigation history stack (Ctrl+[ / Ctrl+], mouse back/forward).
  - Alt+Shift+Up/Down for unread channels (mentions first), Ctrl+Alt+Shift across servers.
  - Alt+Up/Down includes voice channels without joining them.
  - Unit tests for the ranking and the history stack.
- **Idea:** keep the history in `useUiStore` as a bounded array (50 entries) with an index, not in the router.

**client#93: chat header interactions (P1).**

- **Do:**
  - A topic popout (markdown, editable with MANAGE_CHANNELS).
  - A notification bell menu, reusing client#50 settings.
  - Pins panel: Jump (uses #90 navigation), Unpin for moderators, attachments and embeds visible.
  - DM header: Video call and a profile side panel.
  - Threads button: only if api#34's list route exists, otherwise hidden and reported.
  - Add friends to DM: only if api#29 exists, otherwise hidden and reported.
  - Tests for the popout and pin actions.

**client#77: context-menu apps and developer page (P2).**

- **Do:**
  - Apps submenu on message and user context menus for USER and MESSAGE command types (already supported by the API).
  - In-client developer page: create an application, show the bot token once, manage commands.
  - The app directory is out of scope; note it as a follow-up.
- **Backend:** none for the submenu and the developer page.

**gitops#61: image-reflector incident follow-ups (P1).**

- **Do:** in `infrastructure/controllers/alerting/rules.yml`, add:
  - `FluxImageScanStale`: an ImageRepository scan older than 30 min, from the Flux `gotk_*` metrics or kube-state-metrics custom resource state; check which metrics exist on the cluster first.
  - A crash-loop alert for `flux-system` pods (check whether `KubePodCrashLooping` already covers it).
  - Keep the dev overlay in step. Update `docs/runbooks/alerting.md`.
  - The runbook `incident-2026-11-02-image-reflector.md` already exists (docs#67).
- **Rules:** never apply anything to the cluster by hand. Only the gitops PR, through Flux.

**gitops#48: OpenBao transit seal evaluation.**

- **Do:**
  - A design note or ADR draft (`docs/adr/0023-openbao-transit-seal.md`, status "proposed"): what a transit seal against a second OpenBao needs (where that one runs, how it stays unsealed, failure modes, migration from the static key, rollback).
  - Recommend whether to do it on the 3-node cluster (gitops#20/#21).
- **Rules:** no cluster changes. Documentation only until the owner decides.

### Lead

**gitops#56: ops-alerts webhook Secret.** The owner created the Secret on 2026-11-03, and the relay delivered the webhook test and an alert without a 403. Close it with that evidence. The dev cluster needs its own Secret once a dev cluster runs alerting.

## Release cadence (owner rule, 2026-11-03)

- **Client:** a release every 2 to 3 merged features (desktop installer plus update feed), so users get the auto-update. The lead counts the merged `feat` commits on `develop` since the last tag (`git log --oneline origin/main..origin/develop --no-merges | grep -c ' feat'`) after every merge; at 2 or more, release.
- **Website:** released together with the client whenever its `develop` has changes.
- **Backend services:** feature-based, in dependency order. contracts → api and messages (and gateway or voice when changed) → client → website → gitops (production config). After each service release, check the pod is 1/1 Ready within 3 minutes, otherwise roll back.
- **How:** `scripts/release.sh <repo> <version>` (the `.github` repo). It runs develop → release/X.Y.Z → PR to main → waits for green → merge → tag → back-merge, and tags only after main CI is green. Minor bump for features, patch for fixes only.
- After a client release, run the live smoke check of the new features against production, and note the result on the tickets before moving them to Done.

## Agent brief (paste into every lane agent)

- Repos are under `C:\Users\Karma\Projects\discordy\voics\<repo>` on Windows; use Bash (Git Bash). `gh` is authenticated.
- **Git-flow:** branch `feature/<repo>-<issue>-<slug>` from `origin/develop`, PR into `develop`. Work in a separate worktree (`git -C ../<repo> worktree add ../<repo>-wt-<issue> -b <branch> origin/develop`), never the main checkout. Never use bare `git stash`. Rebase on develop right before pushing.
- **Commits** end with `Co-Authored-By: Claude Sonnet <noreply@anthropic.com>`. PR bodies reference the issue ("Refs") and end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Before pushing**, run the repo checks locally:
  - client: `pnpm -C apps/desktop typecheck && pnpm -C apps/desktop lint && pnpm -C apps/desktop test`;
  - Rust: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`;
  - gitops: `bash scripts/check-brand.sh` plus the validator if available.
  - No Docker image builds.
- **Tests:** add unit tests for every domain/application change (TDD where practical). Update docs in the docs repo (the relevant `specs/` file) in a docs PR.
- **Brand:** no product name or domain in user-visible strings; use the client brand module (`apps/desktop/brand.json`). A test enforces this.
- **Do not:** edit issues, comments, labels or the board; merge PRs; touch production (kubectl, Cloudflare, VM 192.168.1.204); put secrets in code or output; change another lane's files beyond a rebase.
- **CI:** do not wait for it in long polling loops. Check once or twice after pushing, fix failures, and report.
- **Backend gaps:** if a criterion needs a backend change that does not exist, implement the client side that works today, hide the rest behind a feature check, and list the gap in the report.
- **Report (final message):** PR links and CI state, what was done per acceptance criterion (done / partial / not done and why), the tests added and run with results, backend gaps found, and follow-up ideas.

## Live status

Updated by the lead after every hand-back. GitHub board: <https://github.com/orgs/voics-app/projects/1>.

| Ticket | Lane | Status | PRs | Notes |
|---|---|---|---|---|
| client#86 | A | released 0.5.0 | client#179, docs#80 | prod smoke 30/30 on 0.5.0 (client#196 fixed a stale member-list selector) |
| client#87 | A | released 0.5.0 | client#183, docs#83 | the lead fixed content types 21/23; producers for 3/6/7/18: messages#54 |
| client#182 | A | released 0.5.0 | client#191 (replaced #186), docs#86 | wires the six Chat toggles from #89 |
| client#95 | A | released 0.5.0 | client#189, docs#90 | backend gaps: voice#22 (screen unsubscribe), voice#23 (viewers), gateway#36 (ring) |
| client#89 | B | released 0.5.0 | client#181, docs#82 | |
| client#88 | B | released 0.5.0 | client#185, docs#85 | `@here` online-only: messages#53 |
| client#85 | B | released 0.5.0 | client#187, docs#88 | gateway validation of activities: gateway#35 (P1 security) |
| client#90 | C | released 0.5.0 | client#180, docs#81 | |
| client#93 | C | released 0.5.0 | client#192 (replaced #184), docs#84 | Threads button waits for api#34 |
| client#77 | C | released 0.5.0 | client#190 (replaced #188), docs#87 | app directory is a follow-up |
| gitops#61 | C | done (verified live on gitops 0.14.0) | gitops#66, docs#91, docs#93 | the lead added `FluxImageScanMetricMissing` and the dev memory patch |
| gitops#48 | C | ADR proposed | docs#92 | 5 owner questions in ADR-0023 |
| gitops#56 | lead | done | | owner created the Secret |

**Merging note (2026-11-03):** the client PRs were built in parallel and all append CSS at the same spot in `app.css`, so each merge conflicts the next one. They are merged one at a time: merge `develop` into the branch, keep both CSS sides, wait for CI, merge. Force-push is not allowed, so a stale stacked PR is replaced by a new PR that carries only its own commit.

## If you take over

1. Read this page and the board. Tickets marked "in progress" have an open agent or open PRs: check `gh pr list --search "Refs <repo>#<n>"` in each repo.
2. Review open PRs (read the diff, check CI), merge green ones into `develop`, and update the ticket with what was verified.
3. Start the next queued ticket of a free lane with the brief above, at most 3 at a time.
4. Releases are feature-based. After a release, check the pod is 1/1 Ready within 3 minutes, otherwise roll back (`docs/runbooks/release.md`). The release script lives in the `.github` repo (`scripts/release.sh`).

**Releases (2026-11-03):** contracts 0.3.0, api 0.8.0, messages 0.6.0, admin 0.2.0, client 0.5.0, website 0.3.1, gitops 0.14.0, .github 0.6.5. Every service pod was 1/1 Ready after rollout. Lane work is complete; what's open is the backend follow-ups named in the notes above and ADR-0023 (owner questions in docs#10).
