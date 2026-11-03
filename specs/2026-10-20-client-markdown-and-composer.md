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
- Attachments: at most 10 per message, size limits per mode; pasted text over 2000 characters shows an inline choice, Convert to file (`message.txt`) or Send as message (inserts the text), see below.

## Reply ping and @silent (client#113)

- The reply bar shows an "@ ON/OFF" toggle (not for your own messages). Off sends `allowed_mentions: {"replied_user": false}` with the message reference: the replied-to author is neither mentioned nor notified. The last choice is remembered on this device (`discordy.reply-ping.v1`), as in Discord.
- A message starting with `@silent ` (case-insensitive, text required after it) is sent with `flags: 4096` (`SUPPRESS_NOTIFICATIONS`, `1 << 12`) and the prefix stripped. Standard chats only; in ephemeral and P2P chats the text is sent as typed. Silent messages show a small bell-off mark next to the text.
- messages service, `POST /channels/{id}/messages`: `flags` accepts only `SUPPRESS_NOTIFICATIONS` from users (every other bit, including EPHEMERAL, is dropped) and is stored and echoed on the message and its `MESSAGE_CREATE` event. `allowed_mentions.replied_user` is honoured; `parse`, `roles` and `users` are accepted and ignored. A reply adds the replied-to author (not a webhook) to `mentions` unless `replied_user` is false, so the existing mention badge logic covers replies.
- Suppression, end to end: for a `SUPPRESS_NOTIFICATIONS` message messages bumps no read-state mention counter (the `mentions` array is kept, as in Discord); the client treats a silent message as never mentioning the viewer (`isMentioned`), so there is no mention badge or inbox entry, and `notifyIncoming` returns before any desktop notification, sound or taskbar flash. The gateway forwards message objects and flags unchanged.

## Composer details (client#88)

- Plus button opens a menu ("Add to message"): Upload a file. Create thread, Create poll and Use apps are listed only when their flag in `COMPOSER_FEATURES` (`domain/composerFormat.ts`) is on; all are off until threads, messages#14 polls and the apps picker exist.
- Selecting text shows a format toolbar (bold, italic, strikethrough, spoiler, code, quote). Buttons are tabbable and keep the selection; shortcuts: Ctrl/Cmd+B, Ctrl/Cmd+I, Ctrl/Cmd+Shift+X. Wrapping again removes the mark; quote toggles `> ` on every touched line. Logic is pure (`wrapRange`, `quoteRange`, `applyFormat`).
- `@here` is suggested next to `@everyone` for users with MENTION_EVERYONE. Gap: the messages service (`domain/mentions.rs`) treats `@here` exactly like `@everyone` (`mention_everyone` set, no online-only filtering); a distinct online-only semantic needs a messages and gateway change.
- Typing line (`TypingBar`): "A is typing", "A and B are typing", "A, B, and C are typing", then "Several people are typing" (`typingLine`).
- Settings, Chat, "Send with Ctrl+Enter": when on, Enter inserts a newline and Ctrl/Cmd+Enter sends (`enterAction`); when off Enter sends and Shift+Enter inserts a newline.
- Pasting more than 2000 characters no longer converts silently: an inline bar offers Convert to file or Send as message (text goes into the input; sending still needs it under 2000).
