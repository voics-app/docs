# Server integrations and bot authorizations

Contract-first implementation plan for client#61 and client#69. These additions use the existing bot-install scopes; they do not introduce personal-data OAuth scopes, authorization codes, access tokens or refresh tokens.

## Webhook management

Server Settings > Integrations lists the guild's incoming webhooks for members with `MANAGE_WEBHOOKS`. Members can create or edit a name, avatar and eligible channel, delete a webhook, and regenerate its execution credential. Creation/editing uses the existing image validation and hashed asset storage. Moving a webhook must remain inside its original guild and require access to the destination channel.

`POST /webhooks/{webhook_id}/reset-token` requires authenticated `MANAGE_WEBHOOKS` authorization and returns the updated Webhook object with its newly generated token and execution URL exactly once. Old tokens stop authorizing requests after rotation commits. Ordinary GET/list/edit responses never expose a token or token hash; their inability to recover an existing URL is intentional. The client retains create/reset credentials in component state only, offers Copy URL and Hide, and discards them on tab/scope change or close. The regenerated credential response is not cacheable.

Create, metadata edit, rotation and deletion use existing WebhookCreate/Update/Delete audit actions. Rotation records only a `token_rotated: true` marker, never a token, hash or full execution URL. The Integrations page links to audit entries filtered by the webhook target, subject to `VIEW_AUDIT_LOG`.

Metadata updates patch only explicitly provided metadata fields and never write credential state. Rotation changes only the token hash. A stale edit must not restore a retired token, overwrite another metadata edit, or recreate a deleted webhook. Rotation after deletion fails. Committed state determines the returned metadata.

## Supported consent and authorization records

The supported scope set is `bot`, optionally accompanied by `applications.commands`. `bot` is required. Unknown scopes and unknown permission bits are rejected instead of being silently accepted. The existing `GET /oauth2/authorize` response includes normalized requested `scopes`, requested `permissions`, application information, the current user and the guilds where the user has `MANAGE_GUILD`. Each guild includes nullable `bot_permissions`: null when absent, otherwise the installed bot's current effective permissions. The consent screen explains and displays those existing permissions before confirming. Private applications remain available only to their owner. Permission grants remain bounded by the caller's grantable guild permissions.

`POST /oauth2/authorize` installs a bot with its managed role and records the caller's explicit consent in the same transaction. It returns the documented `200` response with a relative in-app `location`; it never redirects to an arbitrary supplied URL. A repeated authorization does not duplicate the bot or managed role. When the bot is already installed, authorization records its current effective guild permissions and does not silently change the shared installation's permissions. Permission changes belong to normal server role management or an explicit remove/reinstall flow.

For an existing installation, POST `permissions` must equal the effective `bot_permissions` shown by the consent preview. A different set returns `409` and requires a fresh review; a role change between preview and submission must not create an acknowledgment of unseen permissions. Fresh installations continue to use requested bot-role permissions and disclose inherited everyone-role permissions.

Every guild in `GET /oauth2/authorize` also supplies a required, non-null `installation_revision`. POST must echo the selected guild's displayed value unchanged. The value distinguishes an active installation, initial absence and absence after removal; clients treat it as opaque. A bot removed after a consent-only preview cannot be reinstalled by that stale submission, and a replacement installation cannot inherit acknowledgment of its predecessor even when their permission bits match. The API compares the preview revision before preparing writes and repeats that exact comparison under the transactional installation lock. A mismatch returns `409` with no installation or consent writes; the client fetches a new preview and requires the checkbox again.

This is an explicit compatibility boundary for the unreleased integration flow. Missing, null or malformed POST `installation_revision` is `400`; there is no legacy fallback that substitutes the current revision. Old clients must update before authorizing, and the new client requires the matching API/contracts release. The deep-link query does not accept a caller-supplied revision; the revision comes from the authenticated preview. No additional migration is required beyond 0070 and its existing retained-generation ledger.

Each record is identified by an opaque snowflake and belongs to one user, application and guild. It stores canonical supported scopes, the effective permissions acknowledged, and creation/last-authorization times. Application ownership is not authorization. Records are returned by `GET /oauth2/tokens` only for the authenticated user; the response contains no credentials. The historic route name describes authorization management, not a new token-exchange API.

`DELETE /oauth2/tokens/{authorization_id}` revokes only the caller's recorded consent. Another user's record is never removable or exposed. Revoking personal consent does **not** uninstall a shared server bot, delete an owned application or rotate its bot token. The confirmation explains this distinction and directs server managers to Integrations for removal. Re-authorizing explicitly creates or refreshes consent again. Users can revoke their own records without current `MANAGE_GUILD`; account deletion clears them.

## Installed server applications

`GET /guilds/{guild_id}/integrations` requires `MANAGE_GUILD` and lists actually installed application bots, including application information and current effective guild permissions. It is not the application's owner list or a list of arbitrary bot accounts.

`DELETE /guilds/{guild_id}/integrations/{application_id}` requires `MANAGE_GUILD`, `KICK_MEMBERS` and current role hierarchy. Removal deletes the bot's membership, its managed roles and all associated authorization records for that guild, with the ordinary member/guild/role events and a MemberKick audit entry identifying the application. Other guild installations and application credentials remain unchanged. Reinstall starts from a fresh managed role and consent. Concurrent authorize/remove/revoke operations serialize on the same guild/application installation and verify its private generation so a stale action cannot attach consent to a replacement installation or create duplicate roles. An installation changed since the initial read produces `409`, allowing the user to review the new state and retry.

## Desktop interaction

The `voics://oauth2/authorize` deep link and legacy `discordy://oauth2/authorize` alias open a consent dialog. URL input is parsed as data: validate snowflakes, supported scopes and the permission bitset, and reject unknown privileged redirect/code-flow parameters. The dialog shows the real application, supported scope explanations, an eligible guild selector and requested permission checklist. The review acknowledgment binds to the account, application, guild, installation revision, installed/absent action, permission bits and scopes. Cancel makes no API call. Failed authorization retains the selection and offers retry; success navigates within Voics.

Settings > Authorized apps reads personal authorization records, shows the actual application, guild, scopes and permissions, and provides the precise consent-revocation flow described above. Developer settings continue to list applications owned by the user. Empty, loading, permission-denied and retry states do not masquerade as successful operations.

Server Integrations independently gates webhook controls with `MANAGE_WEBHOOKS` and application controls with `MANAGE_GUILD`. Mutations preserve drafts on errors, confirm destructive removal/rotation, and invalidate the corresponding lists after success. Raw webhook credentials never enter persistent state, the query cache, analytics or audit entries.

After creating a webhook, choosing New webhook starts a new blank draft and disposes of the prior editor's credential. Unsaved edits still block that transition until saved or reset.

## Persistence and verification

Migration `0070_application_authorizations.sql` is reserved for this stream. Existing installations are not backfilled with invented consenting users. Authorization records begin only with a real explicit consent action after this migration. Existing member deletion paths remove associated records, so kicking/leaving a bot cannot leave stale installations in authorization lists. A private last-generation ledger survives member removal: a delayed request that originally observed no installation cannot resurrect a bot after an intervening installation and administrator removal. Guild/application deletion removes the ledger with its parent.

Required backend evidence includes real PostgreSQL HTTP tests for create/edit/rotate/delete, a controlled edit-versus-rotation interleaving, stale edits after deletion, private application visibility, supported-scope and permission rejection, personal list/revoke isolation, actual guild membership/managed roles, repeat authorize, remove/reinstall, rollback and concurrent lifecycle operations. Client evidence includes pure URL/permission models, real component tests, and local/native acceptance of scope consent, retry, ephemeral credential handling and list refresh. No live account or production deployment is part of implementation verification.
