# Profile badge visibility

Status: proposed in [API pull request 158](https://github.com/discordy-voics/api/pull/158) and [desktop pull request 368](https://github.com/discordy-voics/client/pull/368). These changes are not a production rollout.

Profile badges are explicit grants stored separately from user flags. A grant is initially visible; its owner can switch visibility in **User settings → Profile**. The owner sees every grant and its current setting. Public profile requests return only visible grants. Visibility changes do not add or remove grants, and users cannot grant themselves badges through this API. Account anonymization removes badge grants in the same transaction. Desktop presents the badge ID as readable words until a product catalog supplies names. The catalog, grant policy and award process have not been defined.

## API

- `GET /api/v1/users/@me/badges` returns the authenticated owner's grants as `{ "id", "visible" }` objects.
- `PUT /api/v1/users/@me/badges/{id}` with `{ "visible": false }` or `true` updates an existing grant owned by the caller. An unknown or unowned ID returns 404.
- `GET /api/v1/users/{id}/badges` returns an array of visible badge IDs. The caller must be authenticated.

## Verification and limits

The API integration test `crates/infrastructure/tests/http_badges.rs` uses a disposable Postgres database and two fixture grants. It hides one, checks the owner list and a second user's public list, checks that the second user cannot modify the owner's grant, and verifies removal during account anonymization. The pull-request CI runs this HTTP test explicitly because normal pull-request Rust checks skip integration tests. Desktop's Electron test uses the existing fake backend and fixture profile; it exercises the settings and public profile rendering independently of the real database. Neither test adds grants to real accounts. For a combined test, use an isolated QA stack with the API branch and dedicated test accounts; never seed a production account for this check.

The app must be rebuilt with the matching client change and API migration before the settings can be used. This runbook does not authorize a deployment. If badges fail to load, check that both changes and the API database migration are present and inspect the API response; do not assume an empty list means a grant was removed.
