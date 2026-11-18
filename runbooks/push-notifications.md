# Push notifications

How a message becomes a notification on an iPhone or an Android phone, what the owner must provide before it works, how to turn it on, and what to check when it does not. Plan: [mobile app](../plans/2026-11-03-mobile-app.md) (Notifier, Back-pressure and Privacy rows). Decision record for the bounded queue: [ADR 0016](../adr/0016-push-backpressure.md).

## Verified deployment status, 18 November 2026

Production notifier is 1/1 Ready on `messages-notifier:0.15.0`; the coordinator independently verified `notifier-secrets` and `notifier-fcm` as Ready/SecretSynced. Deployment card gitops#69 is closed. This is **not proof of actual APNs/FCM device delivery**. The credential setup below is for rotation/recovery or an unconfigured separate environment, not an instruction to recreate existing keys. Keep singleton/Recreate semantics.

## How it works

```mermaid
flowchart LR
    app[iPhone app] -->|POST /users/@me/devices/push| api
    api -->|outbox| rp[(Redpanda<br/>discordy.message.v1)]
    messages -->|MESSAGE_CREATE| rp
    rp --> notifier
    notifier -->|GET /internal/v1/channels/id/push-targets| api
    notifier -->|HTTP/2, token auth| apns[APNs]
    notifier -->|HTTPS, OAuth2| fcm[FCM]
    apns --> app
    fcm --> app
```

1. The app registers its APNs device token with the api, one per login session, together with the APNs environment it was issued for (`sandbox` or `production`) and two device preferences (message previews, only mentions). It registers again on every start. The api removes the token with its session (logout, remote revoke, logout everywhere, suspension), with its encrypted-message device, and when it was not refreshed for `DEVICE_MAX_IDLE_DAYS`.
2. The **notifier** (`messages` repo, image `ghcr.io/discordy-voics/messages-notifier`, namespace `voics-apps`, port 8085) reads `MESSAGE_CREATE` from `discordy.message.v1`. For each message it asks the api for the members who can view the channel, are not the author and hold a token on a live session.
3. It applies the clients' rules to each of them: a live gateway socket alone does not suppress push, because a mobile socket may linger in the background; the client handles foreground duplicate suppression. Then apply mute (guild, channel or category), the effective level (channel, category, guild, server default), direct messages, direct mentions, role mentions, `@everyone` (unless suppressed), `@here` (never reaches an offline member), `@silent`, and the device's own only-mentions preference.
4. It sends through APNs over HTTP/2 with a provider token signed by the `.p8` key. Each token goes to the sandbox or the production host it was issued for; on `BadDeviceToken` the other host gets one try, and a host that works is remembered. A token APNs rejects for good (`410`, `BadDeviceToken` on both hosts, `DeviceTokenNotForTopic`) is deleted through the api.

Android goes the same way with Firebase Cloud Messaging (HTTP v1): the app registers its FCM token with `platform: "fcm"`, and the notifier signs a JWT with the Firebase service-account key, exchanges it at `oauth2.googleapis.com/token` for an access token (scope `firebase.messaging`, cached until two minutes before it expires) and posts to `fcm.googleapis.com/v1/projects/{project_id}/messages:send`. A message push is a notification plus data message (Android priority high, notification channel `messages`, data `type=message`, `channel_id`, `message_id`, `guild_id` when there is one). A rejected FCM token (`UNREGISTERED`, `INVALID_ARGUMENT`, `SENDER_ID_MISMATCH`, 404) is deleted through the api; `401` drops the cached access token; `429` and `5xx` are retried. Each provider is optional: a provider without credentials has no sender and its tokens are counted `unsupported` while the other provider keeps working (a partial APNs setup is still a startup error, and an unusable FCM key stops the pod at startup with `FCM service account ...`).

**Calls on Android.** A DM call has no PushKit on Android, so the ring is a **data-only** FCM message with Android priority high and a 30 second time to live, sent to the user's FCM tokens (no notification permission, mute and in-call rules as for the iPhone ring). The app wakes on it and shows its own full-screen incoming-call screen. Data (all values are strings): `type=call`, `channel_id`, `call_message_id` and `call_id` (the same value), `caller_id`, `private` (`true`/`false`), `ring_seconds` (`30`), and `caller_name` only when the channel's delivery mode is exactly `standard`.

**Privacy.** Only a channel whose delivery mode is exactly `standard` may put message text, the author or the channel and server names into a push. Every other mode, and any mode the notifier does not know, gets the title "New message" and nothing else. A device that turned previews off gets "New message" as the body in standard chats too. Encrypted (Ephemeral) and peer-to-peer messages do not travel on the message topic at all (the gateway relays them), so today no push is produced for them; the rule is in place for the day one is.

**Back-pressure (ADR 0016).** Pushes wait in a bounded queue (`PUSH_QUEUE_CAPACITY`, default 10000). At most `PUSH_MAX_IN_FLIGHT` (default 100) provider requests run at once. When the queue is full new pushes are dropped and counted, never blocking the event consumer. Failed sends are retried with backoff (`PUSH_MAX_ATTEMPTS`, default 3) and then recorded as failed. Events older than `PUSH_MAX_EVENT_AGE_SECS` (default 120) are not pushed.

**One replica only.** The notifier has no consumer group and stores no offset: it starts at the end of the topic. A second pod would push every message twice, so the Deployment uses the `Recreate` strategy and one replica. A restart loses at most the messages sent while it was down, which is intended: a push for an old message only annoys.

## What the owner must provide

Production already runs at **1 replica** with synced APNs and FCM secrets. The values below document prerequisites for a new, separately authorized environment or key rotation. Do not create duplicate provider keys merely because this historical setup section exists.

| What | Where it comes from | Where it goes |
|---|---|---|
| The APNs auth key, a `.p8` file | Apple Developer account, Certificates, Identifiers & Profiles, Keys, **+**, tick *Apple Push Notifications service (APNs)*, Register, **Download** (Apple shows it once) | GitHub secret `NOTIFIER_APNS_KEY` (the whole file, BEGIN and END lines included) |
| Its Key ID (10 characters, shown beside the key) | Same page | GitHub secret `NOTIFIER_APNS_KEY_ID` |
| The Team ID (10 characters) | Apple Developer account, Membership details | GitHub secret `NOTIFIER_APNS_TEAM_ID` |

One key serves the sandbox and production hosts. The bundle id (`nl.voics.app`, the APNs topic) is not a secret and is already in the ConfigMap. The app's App ID must also have the **Push Notifications** capability: the first iOS build after this change adds the `aps-environment` entitlement, and EAS syncs the capability and regenerates the provisioning profile when you build interactively (owner steps, [docs#10](https://github.com/discordy-voics/docs/issues/10)). Nothing in the repositories can create these values.

### Android (FCM)

| What | Where it comes from | Where it goes |
|---|---|---|
| The Firebase service-account key, a JSON file | Firebase console, Project settings (project `voics-cf336`), Service accounts, **Generate new private key** | GitHub secret `NOTIFIER_FCM_SERVICE_ACCOUNT` (the whole file) |

```bash
gh secret set NOTIFIER_FCM_SERVICE_ACCOUNT --repo discordy-voics/gitops --env production < key.json
gh workflow run secrets-sync.yml --repo discordy-voics/gitops -f paths=discordy/notifier-fcm
```

The project id is read from the key file. The value lands in `kv/discordy/notifier-fcm` (dev: `kv/discordy-dev/notifier-fcm`, written by hand) and the ExternalSecret `notifier-fcm` turns it into the Secret `notifier-fcm`, which the notifier reads as the optional env var `NOTIFIER_FCM_SERVICE_ACCOUNT` (locally `FCM_SERVICE_ACCOUNT_FILE` may name a file instead). It is a separate path on purpose: iOS and Android credentials can be provided in either order, and until this one exists `secrets-sync` reports `skip kv/discordy/notifier-fcm: optional` without failing. Restart the notifier after the Secret appears (`kubectl -n voics-apps rollout restart deploy/notifier`); the log line `FCM is not configured` is gone once it works. The notifier must be scaled to 1 as in the steps below, which needs either provider's credentials. The Android app registers the token with `POST /users/@me/devices/push` `{"platform":"fcm","token":"<FCM registration token>"}` (`environment` is ignored for FCM; `previews` and `only_mentions` work as on iOS).

## Turning push on

Use this checklist only for a genuinely unconfigured environment or an authorized rotation. Production setup is already complete; verify existing state first. Do not perform a new environment deployment under the prepare-only server request.

1. **Store the values** in the gitops repository's `production` environment. Pipe the key from the file, never as an argument:

   ```bash
   gh secret set NOTIFIER_APNS_KEY --repo discordy-voics/gitops --env production < AuthKey_XXXXXXXXXX.p8
   gh secret set NOTIFIER_APNS_KEY_ID --repo discordy-voics/gitops --env production --body XXXXXXXXXX
   gh secret set NOTIFIER_APNS_TEAM_ID --repo discordy-voics/gitops --env production --body YYYYYYYYYY
   ```

2. **Sync to OpenBao**: `gh workflow run secrets-sync.yml --repo discordy-voics/gitops -f paths=discordy/notifier`, then `gh run watch`. Until the three GitHub secrets exist, every `secrets-sync` run reports `skip kv/discordy/notifier: missing GitHub secret(s)` for this path and ends red, as it does for any unprovisioned path (the other paths are still written). For dev write the same three values to `kv/discordy-dev/notifier` (`25-secrets.sh` skips this path on purpose).
3. **Check the secret reached the cluster**: `kubectl -n voics-apps get externalsecret notifier-secrets` shows `SecretSynced`, and `kubectl -n voics-apps get secret notifier-secrets` exists. Force a refresh with `kubectl -n voics-apps annotate externalsecret notifier-secrets force-sync="$(date +%s)" --overwrite`.
4. **Check desired replicas**: production is already one. For a separately authorized unconfigured environment, set that environment’s notifier overlay to one through the normal [release flow](release.md). Do not change another environment or add concurrent notifier replicas.
5. **Verify**: `kubectl -n voics-apps rollout status deploy/notifier`; `kubectl -n voics-apps logs deploy/notifier` shows `notifier listening` and `consumer started` once per partition; `curl` of `/readyz` through a port-forward answers `ok`. A wrong key makes the pod exit at startup with `APNs key is not a valid .p8`.
6. **Smoke test with a real phone** (see below). The metric `notifier_pushes_total{outcome="sent"}` must move.

Turning it off again is the same one-line change back to `0`.

## Sending a notification by hand

The owner can push a notification to one user or to everyone from the admin panel: <https://admin.voics.nl/notify> (sidebar *Send notification*, [admin handbook](../handbook/02-app-admin.md#send-notification)).

1. Choose **One user** (search by username, email or id, then *Choose*) or **Everyone**. Write the title (at most 64 characters) and the message (at most 240). The preview shows what the lock screen will roughly look like.
2. Press **Review and send**. The dialog states how many devices will receive it. For everyone this is the exact number of devices with a live token (iOS and Android, one per login session, PushKit call tokens excluded). A user with no registered device cannot be sent to (the button stays off).
3. Press **Send**. The page then reports how many devices were handed to the push queue and, if any, how many could not be queued.

What happens behind it: the admin BFF checks the admin (Cloudflare Access plus allow-list), writes the audit entry `notification.send`, and calls the notifier's `POST /internal/v1/manual-push` (cluster-internal, `X-Internal-Token`, no ingress route; the cluster has no NetworkPolicies, so none is involved). The notifier asks the api for the devices (`GET /internal/v1/users/{id}/push-tokens`, or `GET /internal/v1/push-tokens` page by page), and submits each device to the same bounded queue as message pushes: at most `PUSH_MAX_IN_FLIGHT` provider requests at once, retries with backoff, dead tokens removed. A broadcast waits up to 30 seconds per device for room in the queue instead of bypassing it, only one broadcast to everyone runs at a time (a second one gets "still being sent"), and one send covers at most 50000 devices.

Good to know:

- It ignores the users' mute, level and only-mentions settings and a live gateway session on purpose: it is an announcement. A notification cannot be recalled once sent.
- The push carries data `type=manual` and no channel, so tapping it only opens the app.
- It reaches only devices that registered a token (the app asks for permission when a chat is first opened). "Everyone" therefore means everyone with a live push token, not every account.
- Audit and logs: the entry is in the admin *Audit log* (actor, time, target, title, never the message). The notifier logs each request (`manual push`: actor, target, title, devices, queued, dropped) and counts every queued device in `notifier_pushes_total{outcome="manual"}`; the usual `sent`, `failed`, `invalid_token` counters follow as the queue drains. `manual` is not part of the `PushSendFailures` ratio.
- Without a running notifier (0 replicas, see above) or without `NOTIFIER_INTERNAL_URL` the page shows a dependency error and nothing is sent.

| Symptom | Check |
|---|---|
| "dependency unavailable" on review | Notifier at 0 replicas, or `NOTIFIER_INTERNAL_URL` missing in `admin-config` |
| 0 devices for a user | No row in `push_tokens` for that user, or the session was revoked (see the smoke test query) |
| "still being sent" | Another broadcast is running; wait for it to finish |
| Some devices "could not be queued" | The queue stayed full for 30 seconds per device: look at `notifier_queue_depth` and `notifier_push_duration_seconds` |

## Smoke test

Needs an iPhone with a development or preview build of the app, signed in, notifications allowed.

1. Open a chat once (the app then holds a registered token). Check in pgweb: `select user_id, platform, environment, previews, only_mentions, updated_at from push_tokens order by updated_at desc limit 5;`.
2. Close the app (swipe it away; a live gateway session suppresses the push).
3. From another account send a message to the phone's account. A notification with the sender and text arrives within a few seconds. Tapping it opens the chat at that message.
4. In the app set the chat to mentions only and send again: no push; mention the account: a push.
5. Switch the app's *Show message previews* off: the body becomes "New message".
6. Open the app while a message arrives: no system banner (the in-app banner shows).

## Sandbox and production tokens

A build signed with a development provisioning profile (a local `expo run:ios`, or an EAS `development` build installed through Xcode) gets sandbox tokens. TestFlight, App Store and ad-hoc builds get production tokens, and EAS `internal` distribution is ad-hoc. The app reports the environment from its build profile and the notifier falls back to the other host once when APNs answers `BadDeviceToken`, so a wrong guess costs one extra request and not a lost push (`notifier_apns_host_corrections_total` counts them). `APNS_ENVIRONMENT=sandbox` or `production` in `notifier-config` forces one host for every token and turns the fallback off.

## Metrics and alerts

Scrape job `notifier` on port 8085 (not listed in the admin health page while it runs at 0 replicas).

| Metric | Meaning |
|---|---|
| `notifier_events_total{result}` | `processed`, `duplicate`, `stale`, `unparsable`, `not_pushable`, `directory_error` |
| `notifier_decisions_total{verdict}` | `notify`, `online`, `muted`, `level_nothing`, `not_mentioned`, `device_only_mentions` |
| `notifier_pushes_total{provider,outcome}` | `sent`, `failed`, `invalid_token` (token removed), `dropped` (queue full), `unsupported` (no sender configured for that provider), `manual` (a device accepted for a notification sent by hand; counted on top of the final outcome) |
| `notifier_push_retries_total`, `notifier_push_duration_seconds` | retries and provider latency |
| `notifier_queue_depth` | jobs waiting for a free slot |
| `notifier_apns_errors_total{status,reason}` | APNs error answers |
| `notifier_fcm_errors_total{status,reason}` | FCM and OAuth error answers (`reason` is the FCM error code, or `oauth`) |
| `notifier_apns_host_corrections_total` | tokens found on the other APNs host |

Alerts (`push` group, [alerting](alerting.md)): `PushSendFailures`, `PushDropped`, `ApnsCredentialsRejected`; `ServiceDown` and `PodCrashLooping` cover the pod itself.

## When something is wrong

| Symptom | Check |
|---|---|
| No push at all | `push_tokens` has a row for the user? The app asks for permission the first time a chat is open, and a refusal is final (Settings, Notifications, Open Settings). Deployment at 0 replicas? `notifier_events_total{result="processed"}` moving? |
| Push for some people only | `notifier_decisions_total`: `online` (a live session suppresses it), `muted`, `level_nothing`, `not_mentioned`, `device_only_mentions` explain skips |
| `ApnsCredentialsRejected` | Key, Key ID or Team ID is wrong or revoked: [secret rotation, APNs key](secret-rotation.md#apns-key) |
| `notifier_pushes_total{outcome="dropped"}` rising | Burst or slow APNs: look at `notifier_push_duration_seconds` and `notifier_queue_depth`; raise `PUSH_QUEUE_CAPACITY` or `PUSH_MAX_IN_FLIGHT` in `notifier-config` only after checking memory (limit 96Mi) |
| `BadDeviceToken` for every token | The App ID or topic does not match (`APNS_TOPIC`), or the build has no push entitlement |
| Every message pushes twice | A second notifier pod is running: scale to one |
| `directory_error` events | The api is unreachable or answering errors on `push-targets` |

## Not covered yet

- Android: a rejected service-account key (`oauth` errors) shows as `notifier_fcm_errors_total{reason="oauth"}` and failed pushes, no alert rule yet.
- VoIP pushes for calls ([separate ticket](https://github.com/discordy-voics/messages/issues/56)): the APNs sender already supports the `.voip` topic and `OutboundPush::Voip`; nothing produces them.
- A badge count in the push payload: the app sets its own badge from the unread mentions while it runs.
- Pushes for Ephemeral and peer-to-peer messages: they bypass the message topic, so there is nothing for the notifier to read.
