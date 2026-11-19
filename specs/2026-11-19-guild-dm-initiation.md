# Guild-related DM initiation

This slice adds an account preference for starting private conversations with server members. The default remains permissive for existing users. The desktop server menu exposes a per-server override.

`preferences.default_guilds_restricted` is a boolean, default false. The sparse `guild_dm_restrictions` map overrides it per server. The settings PATCH merges map entries; null removes an override. Values are stored in the existing user settings JSONB, and the full settings event synchronizes them to the account's sessions.

The API checks each affected sender and recipient before creating a new DM or group DM, and before adding someone to a group. A recipient block takes precedence. Friends and pairs with an existing one-to-one DM may initiate; if at least one shared server permits DMs, initiation is allowed. With no shared server, the existing direct-message behavior remains allowed. A group add checks both directions for each existing member. A denial returns 403 / 50007 and does not create the channel or add the recipient.

This is an initiation rule, not a general stranger-DM filter. Existing conversations remain usable, and changing a preference does not close an established P2P connection. A user can still receive a new DM from someone with no shared server. Friend-request controls, message requests, spam filtering and stronger revocation remain separate work in api#41. No server-side claim is made that established P2P traffic can be revoked.

The synthetic HTTP integration test covers denied initiation, group creation and addition, friends, existing DMs, defaults and server overrides. Desktop unit coverage checks the menu resolution, explanation and settings write. Contracts CI validates the schemas and generated artifacts. The API, contracts and client changes must ship together in that order; until the API supports the preference, the client save fails with an error. No production verification is implied.

The existing settings update reads and then writes the full settings row. Concurrent updates from separate sessions can overwrite each other even though individual server entries are merged within one PATCH. Versioned or transactional settings updates are needed to eliminate that race.
