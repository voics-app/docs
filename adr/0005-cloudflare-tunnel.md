# 0005 — Cloudflare Tunnel ingress with one-level hostnames under `voics.nl`

- Status: accepted
- Date: 2026-10-16
- Deciders: @oussamaelhajoui
- Technical story: [spec §12](../specs/2026-10-16-voics-platform-design.md#12-infrastructure)

## Context and Problem Statement

The platform runs on a home Proxmox VM (`gen-serv`, 192.168.1.212). `voics.nl` is already hosted on Cloudflare and serves an unrelated product at `voics.nl` and `app.voics.nl`. How do we expose the HTTPS and WebSocket endpoints safely, with valid TLS, without opening inbound TCP ports and without interfering with the existing product?

## Decision Drivers

- No inbound TCP port forwards to the home network
- Free, automatic TLS
- Zero impact on `voics.nl` and `app.voics.nl`
- Hostnames that are configurable and creatable through an API
- Admin surfaces (admin portal, Headlamp) protected by identity, not only by a password

## Considered Options

1. Cloudflare Tunnel (`cloudflared` → ingress-nginx), one-level `discordy-*.voics.nl` hostnames, Cloudflare Access for admin surfaces
2. Port-forward 443 to ingress-nginx with cert-manager and Let's Encrypt
3. A `discordy.voics.nl` subzone with nested hostnames (`api.discordy.voics.nl`)
4. A VPS reverse proxy with WireGuard back to the house

## Decision Outcome

Chosen option: **1**.

- **Traffic path:** `cloudflared` runs in `voics-system` and dials out to Cloudflare. Traffic flows Cloudflare edge → tunnel → ingress-nginx → services, with TLS terminated at Cloudflare.
- **Hostnames are exactly one level deep:**
  - `discordy`, `discordy-api`, `discordy-gateway`, `discordy-rtc-<region>`, `discordy-admin`, `discordy-headlamp`, `discordy-updates` and `discordy-cdn`, all under `.voics.nl`.
  - The reason is that Cloudflare's free Universal SSL covers `*.voics.nl` but not `*.discordy.voics.nl`.
- **Configuration:**
  - Hostnames live in the `cluster-config` ConfigMap and are substituted by Flux `postBuild`.
  - DNS records are created through the Cloudflare API by the gitops and `regionctl` workflows.
- **Access control:** `discordy-admin` and `discordy-headlamp` sit behind Cloudflare Access.
- **Exception:** UDP cannot traverse the proxy. Voice media (UDP 50000) and coturn (UDP/TCP 3478) are port-forwarded on the router instead. Each region's public IP is sent to clients in the voice join payload.

### Consequences

- Good, because the home network has no inbound TCP exposure, and TLS and DDoS protection come free.
- Good, because the Discordy records are additive in the zone and never touch `voics.nl` or `app.voics.nl`.
- Bad, because the hyphenated names (`discordy-api`) are less elegant than a subzone.
- Bad, because the voice UDP ports are directly exposed. The SFU accepts only ICE-authenticated, DTLS-SRTP traffic.
- Bad, because the platform depends on Cloudflare's availability for every TCP surface.

### Confirmation

- Ingress manifests in `gitops` reference only `${*_HOST}` variables.
- The [Cloudflare setup runbook](../runbooks/cloudflare-setup.md) lists every record.
- A lint step in `gitops` rejects any hostname with more than one label under the zone.

## Pros and Cons of the Options

### Option 2 — Direct port forward

- Good, because it has no third-party dependency.
- Bad, because it exposes 443 at home, depends on a stable public IP, and requires an extra WAF and access layer.

### Option 3 — Nested subzone

- Good, because the names are cleaner.
- Bad, because covering `*.discordy.voics.nl` requires Advanced Certificate Manager, a paid add-on.

### Option 4 — VPS and WireGuard

- Good, because it gives full control.
- Bad, because it adds another server to pay for, patch and secure.
