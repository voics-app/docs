# 0017 — Signed, expiring attachment download URLs

- Status: proposed
- Date: 2026-10-20
- Deciders: @oussamaelhajoui (pending)
- Technical story: [messages#17](https://github.com/voics-app/messages/issues/17), [docs#10](https://github.com/voics-app/docs/issues/10)
- Related: [ADR 0003](0003-delivery-modes.md), [ADR 0006](0006-secrets-flow.md)

## Context and Problem Statement

Message attachments were returned as plain path-style MinIO URLs (`{CDN}/discordy-attachments/attachments/<channel>/<id>/<file>`). The bucket is private, so every Standard attachment download and every Ephemeral ciphertext download answered 403. The live delivery matrix (client#45) found it. The bucket must not become public: a leaked or guessed URL would expose a file from a private channel forever. Discord's CDN solves this with links that carry `ex` (expiry), `is` (issued) and `hm` (HMAC) query parameters, valid for about a day, and re-issued whenever the message is fetched. How should Voics serve attachment downloads?

## Decision Drivers

- The bucket stays private; a link works only with a valid signature and only until it expires.
- Fewest new moving parts on the CDN path (Caddy `/cdn/*` locally, an ingress on the `discordy-cdn` host in the cluster).
- URLs must work identically in every environment, including behind the `/cdn` path prefix that the local ingress strips.
- Ephemeral attachments are ciphertext blobs and need no extra rule; P2P never touches the bucket.
- Keys never live in source or logs.

## Considered Options

1. Make the `attachments/` prefix anonymously readable (relying on unguessable ids).
2. MinIO presigned GET URLs (SigV4), generated when messages are serialized.
3. Discord-style `ex`/`is`/`hm` URLs verified by the messages service, which streams the object from MinIO.
4. Discord-style URLs verified at the edge (nginx `auth_request` or a Caddy verifier) in front of MinIO.

## Decision Outcome

**Option 3.**

- **URL.** `{CDN_PUBLIC_URL}/attachments/{channel}/{attachment}/{filename}?ex={hex}&is={hex}&hm={hex}`. `ex` and `is` are unix seconds in hex. `hm` is the hex HMAC-SHA256 of `v1\n{channel}/{attachment}/{filename}\n{ex}\n{is}`. The signature covers the path and both timestamps, so none of them can be altered.
- **Issuing.** The messages service signs a fresh URL (`url` and `proxy_url`) every time it serializes an attachment: REST responses, history, pins and gateway events. The lifetime is 24 h (`ATTACHMENT_URL_TTL_SECONDS`).
- **Serving.** `GET /attachments/...` on the messages service checks the signature in constant time, then the expiry. It streams the object from MinIO through the internal endpoint and forwards `Range`, so media seeks work. The response carries `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`, and `Content-Disposition: attachment` for anything that is not an image, video or audio type. `Cache-Control: private, max-age` equals the remaining lifetime.
- **Failures.** A missing or wrong signature answers 403; a valid but expired one answers 410. The client reacts to either by refetching the message (which returns fresh links) and retrying once.
- **Routing.** The CDN host sends `/attachments/*` to messages. Locally Caddy routes `/cdn/attachments/*` (prefix stripped) to messages. In the cluster a second Ingress on `HOST_CDN` routes `/attachments/` to the messages service, and the longer prefix wins over MinIO's `/`. Uploads still use the presigned PUT URLs on the MinIO path. Public hashed images are unchanged.
- **Key.** `ATTACHMENT_SIGNING_KEY` (32+ characters) is a per-environment secret at OpenBao `discordy/messages` (dev: `discordy-dev/messages`), delivered by the `messages-secrets` ExternalSecret. The local stack generates its own into `local/.env` (`gen-dev-keys.sh`, `dev.sh up`). Rotating it invalidates outstanding links, which clients refresh by refetching messages.
- **Ephemeral and P2P.** Ephemeral attachments are AES-GCM ciphertext in the same bucket and use the same URLs; the key stays inside the encrypted message. P2P attachments stream over the data channel and never use the bucket.

### Why not the others

- **Option 1** exposes every file whose URL leaks, forever, and fails the private-bucket requirement.
- **Option 2** needs the signed host and path to match what MinIO sees. Behind the `/cdn` prefix that the ingress strips, and behind Cloudflare, that is the same fragile prefix trick already used for uploads. The `X-Amz-*` URL shape also differs from Discord's, leaks the bucket layout, and ties expiry to SigV4 and the MinIO root keys.
- **Option 4** adds a component per environment (a different one for Caddy and for nginx) for a verifier that is a few dozen lines in a service already running.

### Consequences

- Good, because the bucket stays private and every link expires.
- Good, because the same path works unchanged locally, in dev and in production; no signature depends on the public host.
- Good, because the URL shape matches Discord's, so clients treat it like Discord's CDN.
- Bad, because downloads flow through the messages pods. Attachments are capped at 25 MiB and are streamed without buffering, so the cost is bandwidth, not memory. If it ever dominates, a cache keyed on the full URL in front of `/attachments/` removes it without changing the URL contract.
- Bad, because rotating the key breaks cached links until a message refetch.
