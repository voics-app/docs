# 0018 — Link unfurling and the embed media proxy

- Status: proposed
- Date: 2026-10-21
- Deciders: @oussamaelhajoui (pending)
- Technical story: [messages#12](https://github.com/discordy-voics/messages/issues/12), [client#54](https://github.com/discordy-voics/client/issues/54)
- Related: [ADR 0003](0003-delivery-modes.md), [ADR 0017](0017-signed-attachment-download-urls.md)

## Context and Problem Statement

Discord shows a preview (embed) for links in messages, and proxies the images so clients never contact the linked site. Discordy had embed rendering for bot embeds only. Fetching arbitrary user-supplied URLs from a server is a classic SSRF vector, and a proxy that fetches URLs on request is an open relay unless it is authenticated. Ephemeral and P2P chats exist so that content never reaches the server, so they must not be unfurled by it.

## Decision Outcome

**The messages service unfurls links asynchronously and serves embed media through a signed proxy.**

- **Flow.** After a Standard message is stored (create, or edit of the content), a background task extracts up to 5 distinct `http(s)` links (not `<url>`, not inside code), builds embeds, stores them and publishes MESSAGE_UPDATE. The REST reply never waits for the fetch. `edited_timestamp` is not touched. Embeds with type `link`, `image`, `video`, `gifv` or `article` are generated; `rich` embeds belong to bots and are never replaced.
- **Sources.** Direct image and video links become `image` and `video` embeds (image size is read from the first 256 KiB). HTML pages give OpenGraph, Twitter card and `<title>` data. YouTube, Vimeo, Spotify and SoundCloud, and any page that advertises `application/json+oembed`, are enriched through oEmbed. A player iframe is only emitted for the hosts in `PLAYER_IFRAME_HOSTS`; clients render a `video.url` on those hosts in a sandboxed iframe and everything else in a `<video>` element via the proxy.
- **Cache.** Per URL: 1 h for a result, 5 min for a miss, 10 000 entries, concurrent requests for one URL coalesce. At most 16 unfurls run at once per pod; one URL has a 12 s budget.
- **Suppression.** `<url>` skips the preview. Flag `SUPPRESS_EMBEDS` (4) skips it and removes generated embeds; the author or a member with MANAGE_MESSAGES sets it with `PATCH {flags: 4}` (the hover "x" in the client), clearing it re-unfurls. Setting the flag is not an edit.
- **Delivery modes.** Nothing is fetched for channels whose effective mode is not Standard, nor for ephemeral relays (never stored). The unfurl task re-checks the channel before fetching. An end-to-end encrypted client may unfurl locally only after an explicit opt-in; the default is no preview.

### SSRF protection (mandatory)

1. **URL shape.** Only `http` and `https`, no credentials, ports 80 and 443 only, no `localhost`, `.local`, `.internal`, `.localdomain`, `.home.arpa` or single-label names. The URL parser has already normalised decimal, octal and hex IPv4 forms, so `http://2130706433/` is checked as 127.0.0.1.
2. **Address ranges.** Forbidden after DNS resolution and for IP literals: 0/8, 10/8, 100.64/10 (CGNAT, includes Alibaba metadata), 127/8, 169.254/16 (cloud metadata), 172.16/12, 192.0.0/24, TEST-NETs, 192.88.99/24, 192.168/16, 198.18/15, multicast, 240/4 and broadcast; IPv6 `::`, `::1`, fc00::/7, fe80::/10, fec0::/10, ff00::/8, Teredo, documentation and discard ranges, and IPv4-mapped, IPv4-compatible, NAT64 (`64:ff9b::/96`) and 6to4 (`2002::/16`) forms whose embedded IPv4 is forbidden.
3. **No rebinding window.** The HTTP client's only resolver filters forbidden addresses out of the answer and fails when none remain; the connection goes to the addresses it returned, with no second lookup. A host that answers with one public and one private record only ever sees the public one.
4. **Redirects** are followed by hand, at most 3, and each hop repeats checks 1 to 3.
5. **Limits.** 3 s connect, 8 s per request including the body, 1 MiB of HTML, 64 KiB of oEmbed JSON, 256 KiB of image head, no proxy, no cookies, no decompression, the body is never read beyond its limit.
6. **Egress.** The messages pods need outbound internet access on 80 and 443. If a NetworkPolicy is added later it must also deny the cluster, node and metadata ranges, because the application check is the second layer, not the only one.

### Media proxy

- **URL.** `{CDN_PUBLIC_URL}/external/{base64url(remote URL)}?ex={hex}&is={hex}&hm={hex}`. `hm` is the HMAC-SHA256 under `ATTACHMENT_SIGNING_KEY` of `v1-media\n{token}\n{ex}\n{is}`. The distinct domain tag stops an attachment signature from being replayed as a proxy signature. Only messages can mint one, so the endpoint is not an open proxy; it is signed per serialization like attachment URLs (24 h, re-issued whenever a message is fetched or dispatched).
- **Embeds.** The stored embed keeps the remote address in `url`; on the wire every `image`, `thumbnail`, `video` (non-iframe) and `footer`/`author` icon gets `proxy_url` or `proxy_icon_url`. Any client-supplied `proxy_url` is dropped. Clients must load `proxy_url` only.
- **Serving.** `GET /external/{token}` verifies the signature (403 invalid, 410 expired), fetches through the same guarded client, forwards `Range`, and answers only for PNG, JPEG, GIF, WebP, AVIF, APNG, BMP, ICO, MP4, WebM, Ogg and QuickTime (415 otherwise; SVG is excluded because it can carry script). Files above 32 MiB are refused (413), and a stream that exceeds the limit mid-way is cut. Responses carry `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; default-src 'none'` and `Content-Disposition: inline`. At most 64 proxied streams run per pod (502 beyond).
- **Routing.** The CDN host sends `/external/*` to messages: local Caddy `/cdn/external/*` with the prefix stripped, and a path on the shared `messages-cdn` ingress for dev and production.

### Consequences

- Good, because users get Discord-style previews, remote hosts never see client IPs, and there is one audited place that touches the outside world.
- Bad, because proxied media costs messages bandwidth (capped per file and per pod). A cache in front of `/external/` removes it without changing URLs.
- Bad, because an expired proxy URL (24 h) in a long-open client needs a message refetch, like attachments.
- Bad, because the unfurler trusts remote HTML only for text and image URLs it then re-fetches; text is rendered by the client as plain text.
