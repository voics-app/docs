# Age-restricted channels

Status: proposed implementation for [client#76](https://github.com/discordy-voics/client/issues/76).
This extends the existing `Channel.nsfw` flag. It introduces no date of birth,
verified-age state, age-verification service or server permission.

## Account preference

`UserSettings.preferences.hide_age_restricted_channels` is an optional boolean.
An absent key means false. The existing `PATCH /users/@me/settings` merges the
preference key by key; GET, READY and `USER_SETTINGS_UPDATE` carry the stored value.
Other preferences survive the PATCH. Null, strings and numbers are rejected.

True hides restricted channels from navigation and prevents their content from
opening, including direct links. False makes channels discoverable but does not
confirm any channel. The setting follows the authenticated account across devices;
changing it must not copy another account's local preference into this account.
Failed saves retain the confirmed server preference and offer retry.

## Confirmation and safe boundaries

Before restricted text, forum, thread or voice content mounts, show a confirmation
interstitial with Continue, a safe way out, and report/leave actions supported by
the actual report and guild-membership contracts. Explain the setting and provide
access to Privacy settings. Do not show message snippets, attachments, link previews,
thread previews or automatically join a call before confirmation.

Continue is an acknowledgement for this channel in the current authenticated
session. It is not evidence of adulthood. Bind it to instance, account, channel and
the relevant channel/parent restriction context. A thread inherits its parent's
restriction. Missing or malformed channel/parent metadata is blocked until known;
never infer permission to show content from cached messages.

Clear confirmations on logout, session reset, account/instance change and relevant
restriction/parent-context changes. Enabling Hide revokes existing confirmations;
turning it off requires Continue again. Channel renames alone do not revoke consent.
Server-side VIEW_CHANNEL, membership and send permissions remain authoritative.

## Verification and release boundary

### Reporting without opening content

The interstitial uses `POST /reports` with `target: "channel"`, `channel_id`, an
existing report category and an optional note of at most 500 characters. The API
requires current guild membership and VIEW_CHANNEL, including thread-parent access.
The server snapshots exactly the channel ID, server ID, parent ID, channel name,
channel type and age-restricted flag. It does not fetch messages, attachments, topics
or member lists. Client-supplied message/user IDs and content are rejected for this
target. The disclosure lists these fields before the person submits.

The moderation queue identifies the target as a channel and the associated account
as the server owner. The report is not converted to a user report. Owners may report
their own channel; self-user reports remain disallowed. Repeated open reports by the
same account are idempotent and share the existing hourly limit. The separate guild
target continues to capture only a currently public discovery listing.

### Acceptance evidence

Required client evidence covers desktop and mobile direct routes, sidebar filtering,
threads/forums/voice, search/pins/inbox snippets, cached media, account/instance
isolation, remote preference changes, failed-save retry and logout. English and Dutch
desktop copy must use the shared catalog. Authored channel names remain unchanged.

Required API evidence covers true/false persistence, sparse default, typed rejection,
key-by-key merge and account isolation. Contract generation and API tests must run on
the owned warm environment before approval. A client unit test is not native or live
acceptance; root owns those checks and release publication.
