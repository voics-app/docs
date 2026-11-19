# Member screening, onboarding and welcome screens

Status: implementation under review for [api#40](https://github.com/discordy-voics/api/issues/40).
The drafts have not been deployed. Verify the complete user flow on an isolated QA stack before release.

## Rules and membership

Server managers can configure up to twenty rules. Invite and discovery joins create a pending membership when screening is enabled; existing members are not retroactively marked pending. Members see the current rules and explicitly accept the revision shown. A changed revision returns a conflict and the client must show the new rules before accepting again. Join and acceptance serialize with configuration changes. The member update and its event share a transaction. Ordinary member edits preserve pending status.

The API removes both normal and thread send permissions from pending members, including the administrator bit that downstream services treat as an implicit grant. Messages refresh authorization for ordinary sends and forwards. Gateway encrypted envelopes and P2P signalling also require effective view and send permissions. This needs coordinated deployment of the API, messages, gateway, contracts and client changes; do not enable screening with a partial deployment.

## Choices and welcome

Managers may configure up to five questions, each with one to ten options. An option can suggest a channel, grant an eligible role, or do both. Onboarding is optional for the new member and follows rule acceptance. A member completes a particular join's onboarding at most once; leaving removes that completion with the membership. The submitted revision must still be current. Assignable roles require the configuring manager to hold `MANAGE_ROLES` and outrank the role. Managed roles, the everyone role, privileged base permissions and privileged channel overwrites are rejected. The final role and overwrite checks run under database locks when applying choices.

The welcome screen can contain an introduction and up to five suggested text or announcement channels. The API filters the list to channels the requesting member can view. Desktop settings provide editors; desktop and mobile join flows show questions and the welcome screen when enabled. A failure to load optional onboarding or welcome information does not prevent access after rules are accepted.

## Storage and verification

API migration `0092_member_screening.sql` adds server configuration, revisions and onboarding completion records. No new secrets or infrastructure are required. The API PR includes a PostgreSQL-backed HTTP test covering join, pending access, stale rules, acceptance, welcome visibility and onboarding role selection. Messages and gateway PRs cover fresh access and private relay checks respectively. A desktop live test exercises the first message after accepting rules, but has not yet run on a stack containing the matching PR heads. CI and live-test results must be checked for the final commits, not inferred from earlier revisions.
