# Local development

This guide runs the whole platform on one workstation. The dependencies run in Docker through `gitops/local/compose.yaml`. Each service runs either natively with `make dev`, for fast iteration, or as a container under the `full` profile.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Docker | 28+ | Docker Desktop on Windows/macOS. Give it **≥ 8 GB RAM**, because ScyllaDB and Redpanda need it. |
| Git | 2.45+ | Run `git config --global core.autocrlf false`. Every repository has `.gitattributes` with `eol=lf`. |
| Rust | 1.99 (`rustup`) | api, messages, admin-bff, sfu, client native module |
| Elixir / OTP | 1.20 / 29 | gateway, voice-signaling |
| Node / pnpm | 24 / 10 | client, admin-web, bots-sdk, contracts, docs |
| make | any | On Windows, use Git Bash or WSL |

**Windows notes**:

- Use **Git Bash** or **WSL2** for the Makefiles.
- On WSL2, keep repositories inside the Linux filesystem for speed. On Git Bash, `C:\Users\<you>\Projects\discordy\voics` is fine.
- If `rdkafka` fails to build natively, the Rust services use a pure-Rust Kafka client, or the `cmake-build` feature (see the brief). No action is needed.
- Desktop capture and loopback audio work only when the client runs natively on Windows, not in WSL.

## 1. Clone

```bash
mkdir -p ~/Projects/discordy/voics && cd ~/Projects/discordy/voics
for r in api gateway messages voice admin client bots-sdk contracts gitops docs .github; do
  gh repo clone discordy-voics/$r -- --branch develop
done
```

## 2. Start the dependencies

```bash
cd gitops/local
cp .env.example .env          # dev-only values; never commit .env
docker compose --profile deps up -d
./smoke.sh                    # waits until every dependency is healthy
```

| Component | Host port | Notes |
|---|---|---|
| Postgres | 5432 | DBs `discordy` and `discordy_admin` |
| ScyllaDB | 9042 | `--smp 1 --memory 1G --developer-mode 1` |
| Redpanda | 19092 (Kafka), 9644 (admin) | Topics from P6 are created by the init container |
| Valkey | 6379 | |
| etcd | 2379 | |
| MinIO | 9000 (API), 9001 (console) | Buckets are created by the init container |
| coturn | 3478 | |
| VictoriaMetrics | 8428 | |
| Grafana | 3000 | |
| Caddy (local ingress) | 8000 | Mirrors the production routing (below) |

**Caddy routes** on `http://localhost:8000` (P1):

| Path | Service |
|---|---|
| `/api/v1/channels/*/messages*` | messages `:8082` |
| `/api/v1/*` | api `:8080` |
| `/gateway` | gateway `:4000` |
| `/voice` | voice-signaling `:4100` |
| `/cdn/*` | MinIO `:9000` |

## 3. Run the services natively

Each repository ships an `.env.example` with dev values that point at the compose dependencies. In each repository:

```bash
cp .env.example .env
make dev
```

| Repo | Command | Port |
|---|---|---|
| api | `make dev` (runs sqlx migrations first) | 8080 |
| messages | `make dev` (applies CQL migrations) | 8082 |
| gateway | `make dev` (`iex -S mix phx.server`) | 4000 |
| voice | `make dev` (signaling + sfu) | 4100, UDP 50000 |
| admin | `make dev` (BFF + Vite) | 8090, 5174 |
| client | `pnpm install && pnpm dev` | 5173 (renderer) + Electron window |

**Shared secrets** must match across the services' `.env` files: `INTERNAL_SERVICE_TOKEN`, `JWT_PUBLIC_KEY` / `JWT_PRIVATE_KEY` and `VOICE_TOKEN_SECRET`. The dev values in each `.env.example` already match. If you regenerate them, update every repository.

**Snowflake worker IDs** must stay inside each component's range (P5): api 0–63, messages 64–127, gateway 128–191, voice 192–255.

## 4. Or run everything in containers

```bash
cd gitops/local
docker compose --profile full up -d       # every service at :develop
docker compose --profile full ps
```

To run one service natively and the rest in containers, stop its container (`docker compose stop api`) and start it with `make dev`. Caddy routes to `host.docker.internal`.

## 5. Try it

1. Start the client (`pnpm dev` in `client`). It points at `http://localhost:8000` by default.
2. Register two users. Use a second client profile (`pnpm dev -- --profile=b`) or a second machine on the LAN.
3. Create a guild, send a message, and check that the second user receives it.
4. Join a voice channel with both clients. Locally, `VOICE_PUBLIC_IP` is `127.0.0.1`, or your LAN IP for a second machine.

**Useful dev UIs**:

- MinIO console: <http://localhost:9001>
- Grafana: <http://localhost:3000>
- Redpanda admin API: <http://localhost:9644/v1/cluster/health_overview>

## 6. Tests and linters

Every repository uses the same targets:

```bash
make test     # unit + integration (testcontainers use random ports; compose is not required)
make lint     # clippy -D warnings / mix format --check-formatted + credo / eslint + tsc --noEmit
make build
make docker   # multi-stage, non-root image
```

> **Never bind** the fixed ports in the table above from tests. Use testcontainers (random ports) or `docker run -P`.

## 7. Reset

```bash
cd gitops/local
docker compose --profile full down -v      # removes containers AND volumes (all local data)
```

## Troubleshooting

| Problem | Fix |
|---|---|
| ScyllaDB exits with `std::bad_alloc` | Raise the Docker memory to at least 8 GB |
| `address already in use :5432` | A local Postgres is running. Stop it, or change the host port in `.env`. |
| Services fail with `401` on internal calls | The `INTERNAL_SERVICE_TOKEN` values differ between `.env` files |
| Gateway READY fails | api isn't running, or `API_INTERNAL_URL` is wrong |
| Voice connects but there is no audio locally | Set `VOICE_PUBLIC_IP` / `SFU_PUBLIC_IP` to an address the client can reach (`127.0.0.1` on the same machine) |
| CRLF breaks shell scripts on Windows | Run `git config core.autocrlf false`, then `git rm --cached -r . && git reset --hard` |
| Redpanda topics missing | Run `docker compose --profile deps up redpanda-init` |
