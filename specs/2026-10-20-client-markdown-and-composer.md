# Client: message markdown and composer parity

Status: implemented (client#46, client#49, PR client#110).

## Markdown

Parser: `apps/desktop/src/renderer/domain/markdown.ts`, a pure function from source text to an AST. The renderer (`MarkdownView.tsx`) builds React nodes from the AST. Raw HTML is never injected: unknown markup stays literal text, links are only produced for `http(s)` URLs, and code highlighter output is parsed by `domain/highlightHtml.ts` into nodes instead of being set as HTML.

| Syntax | Notes |
| --- | --- |
| `# `, `## `, `### ` | Line start, space required. `####` stays text. |
| `-# ` | Subtext (small, muted). |
| `- `, `* `, `1. ` | Lists, nesting by indentation, ordered lists keep their start number. |
| `> `, `>>> ` | Consecutive `> ` lines merge; `>>> ` quotes to the end of the message. |
| `[text](url)` | Masked link. Label cannot contain links. Untrusted domains show a confirm dialog with the real URL and a "trust this domain" option (stored locally). Trusted: the product domains, the connected instance host, user-trusted hosts. |
| `<https://url>` | Autolink. |
| `\|\|x\|\|` | Spoiler. |
| `` `x` `` and fenced blocks | Fenced blocks are highlighted for about 25 languages (highlight.js core, one lazy chunk per language, nothing on the boot path). Unknown languages render plain. |
| `<t:unix:style>` | Styles t T d D f F R, rendered in local time; hover shows the full local date; relative style ticks. |
| `\` + punctuation | Escapes the character. |

Nesting depth is capped (8) so hostile input cannot exhaust the stack.

## Composer

- `:name` (2+ characters) suggests server emoji then unicode shortcodes (`domain/emojiShortcodes.ts`); Tab or Enter inserts.
- Slowmode: `rate_limit_per_user` counts down from the last send on the send button and blocks sending. Users with MANAGE_CHANNELS or MANAGE_MESSAGES, and DMs, bypass. Private delivery modes are not subject to it.
- Drafts: text and reply target per channel, persisted in local storage (`discordy.drafts.v1`, max 100). Only standard-mode channels are persisted; ephemeral and P2P chats never write drafts.
- ArrowUp in an empty input edits the last own delivered text message; Escape cancels an edit, then a reply.
- Counter appears at 200 characters remaining, turns red when over; sending over 2000 is blocked.
- Shift+Enter inserts a newline.
- Attachments: at most 10 per message, size limits per mode; pasted text over 2000 characters becomes `message.txt`.

## Deferred

Reply @ping toggle (`allowed_mentions.replied_user`) and `@silent` (suppress-notifications flag) need sender and contract work.
