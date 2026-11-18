# Scheduled dispatch account eligibility

Status: account eligibility correction implemented on API `develop` in
[PR150](https://github.com/discordy-voics/api/pull/150), supporting messages#61
and ADR0028. The API change has not been released to production; the scheduler
remains under implementation and disabled by default.

Previously, `GET /internal/v1/channels/{channel_id}/access/{user_id}` checked
channel membership and permissions but could authorize a disabled or suspended author.
Offline execution cannot depend on a JWT session expiring or being revoked first.

The API now loads the current user and account lifecycle state on every lookup.
A missing user, disabled account, pending deletion or active suspension returns
403 with the existing missing-access error. Expired suspensions permit the usual
channel checks again. Eligible bot accounts keep their existing behavior; the
scheduling public routes separately require user credentials. An absent live
session does not deny an otherwise eligible offline author. The success payload
and internal service-token authentication are unchanged.

Messages' fresh access method must issue its own HTTP request. Invalidating a cache
and immediately entering a coalescer can reuse a request that observed access
before a worker claimed the schedule. A deterministic interleaving test holds
that earlier request open, revokes access and requires the refresh to see denial
without waiting for the old answer.

Scheduling checks eligibility, Standard mode and send/TTS permissions before claim
and again afterward, with a five-second timeout before insertion. Known denial or
dependency failure after claim is terminal without insertion. Revocation after the
last check retains the ordinary cross-service check/write race; no distributed
permission transaction is claimed. Deploy the API correction before enabling the
executor. Other existing access consumers also receive the stricter 403 result.

Root independently verified real PostgreSQL/HTTP cases for disabled,
pending-deletion, missing, suspended and reactivated/expired users, plus eligible
bots and channel membership behavior. The disabled-account regression returned
200 before the correction and 403 afterward; the final source passed local
tests and CI before merge. This addendum does not enable a scheduler or alter
production. Scheduler storage, HTTP, client and dispatch acceptance remain
separate requirements.
