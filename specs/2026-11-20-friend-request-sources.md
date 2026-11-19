# Friend request sources

The account setting `friend_source_flags` controls new friend requests. Existing accounts and new accounts default to `all: true`, preserving existing behavior. When `all` is false, either enabled and matching source (`mutual_friends` or `mutual_guilds`) permits a request. Shared friends must be friends of both users; a shared server requires current membership by both.

Both username and user ID routes enforce the same rule. Existing friendships and already pending requests remain usable, including acceptance after a change to the setting. A target's block takes precedence over all sources. Denial returns 403 / 50007 without creating a request. Partial PATCH updates preserve omitted flags, and account settings events synchronize full values to sessions. Desktop and mobile show the controls only when the API returns the field.

The current general settings path reads and then writes a full settings row. Simultaneous updates from different sessions can overwrite one another; partial PATCH does not provide atomic conflict detection. Avoid treating a successful write as proof that a concurrent write could not subsequently replace it. A versioned or transactional settings update is still needed for reliable concurrent changes.

This feature does not implement message requests, stranger-DM policy or spam filtering; those remain in api#41. API migration 0120 adds columns with backward-compatible defaults. Contracts and API should ship before clients. CI includes synthetic HTTP checks for both routes, source resolution, acceptance and blocks, plus desktop and mobile settings tests. No production verification is implied.
