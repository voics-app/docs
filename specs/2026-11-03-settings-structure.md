# Settings structure: Chat, Advanced, search, log out, unsaved changes (client#89)

Status: implemented in client#89 (PR linked from the ticket).

The user settings shell gets the structure Discord has: a search box, a Chat page, an Advanced page with Developer mode, Log out at the bottom of the nav, and one shared "unsaved changes" bar on every page that edits several fields.

## Chat tab

All options are device-local preferences in `prefsStore` (only link previews already followed the account, and keeps doing so). Moved here from Appearance: "Show link previews".

| Row | Pref | Default | Used by |
|---|---|---|---|
| Display images and videos | `inlineMedia` | on | stored only; message rendering reads it in a follow-up |
| Show embeds | `inlineEmbeds` | on | stored only |
| Show link previews | `linkPreviews` (synced) | on | existing link preview cards |
| Show spoiler content: On click, On servers I moderate, Always | `spoilerDisplay` | On click | stored only |
| Show reactions | `showReactions` | on | stored only |
| Compact reply preview | `compactReplyPreview` | off | stored only |
| Convert emoticons | `convertEmoticons` | on | stored only |
| Send with Ctrl+Enter | `sendWithCtrlEnter` | off | the composer (client#88) reads it with the `selectSendWithCtrlEnter` selector |

## Advanced tab and Developer mode

`developerMode` (device-local, default off) gates every Copy ID entry: Copy Channel ID, Copy Category ID, Copy Message ID (context menu and the Shift hover toolbar), Copy user ID (user context menu and the profile dialog). The gate is a `developerMode` flag on each menu model context (`channelMenuModel`, `messageMenuModel`, `userMenuModel`); the models omit the entry when it is not set. Copy Link entries stay visible because they are useful without debugging. A link to hardware acceleration is added when client#68 lands.

## Settings search

A search box tops the user settings nav. It matches every word against tab names, row titles and keywords, ranks title prefix first, and shows tab hits and "row, tab" hits. Enter picks the first hit; Esc clears the box. Choosing a row switches tab and scrolls to the row, which flashes.

The index is a static list in `settings/searchIndex.ts` (`{ tab, label, keywords }`). `SettingRow` stamps `data-row` with `rowSlug(title)`, so the index entry and the DOM row stay linked by the title. A unit test fails when an indexed title is not a `SettingRow` title in the user tabs. A new setting registers itself with one line in the index. Server and channel settings have no search.

## Log out

The nav footer has a red Log out entry. It asks for confirmation ("Log out?"), closes settings and calls `session.logout()`. My account's row uses the same `confirmLogout()` helper.

## Unsaved changes

`UnsavedBar` (`shared/ui`) is the shared bar: "Careful, you have unsaved changes." with Reset and Save changes. It renders only while `dirty`, and registers the page through `useUnsavedChanges(dirty)` into `unsavedStore`. Used by Profile, Server overview, Roles and Channel settings (Overview and Permissions).

While any page is dirty:

- The close button and tab changes are refused and shake the bar.
- Esc is refused once and shakes the bar; a second Esc closes and discards.
- Saving or resetting makes the page clean, which also forgets the blocked Esc.

Unmounting a page clears its registration. Switching between roles inside Roles still resets the draft as before.

## Gaps and follow-ups

- Chat toggles other than Ctrl+Enter and link previews only store the value. Wiring them into message rendering touches `MessageItem.tsx` and is left for after the message rendering tickets.
- None of the new prefs sync across devices; that needs new `preferences` fields in contracts first.
- Search covers user settings only.
