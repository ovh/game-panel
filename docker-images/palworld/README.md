# Palworld Docker Image

This directory contains the Palworld dedicated server image used by OVHcloud Game Panel.

The image installs and runs a Palworld dedicated server through SteamCMD (Steam app id `2394010`).

## ✅ Capabilities

| Capability | Support |
| --- | --- |
| Console commands | Supported (REST API) |
| Hot backup while running | Native (game-managed) + on-demand save |
| Cold backup while stopped | Not supported |
| Restores | Supported |
| Health check | Supported |

## ⚙️ Runtime model

Important paths:

- `/data`: persistent data path;
- `/data/server`: Palworld installation directory;
- `/run/palworld`: temporary runtime state.

Default exposed ports:

- `8211/udp` (game)
- `27015/udp` (Steam query)
- `8212/tcp` (REST API)

The REST API is enabled automatically on port `8212` (bound inside the container, not
published to the host) using `PALWORLD_ADMIN_PASSWORD`, so the panel can trigger saves and
send commands. Only `RESTAPIEnabled`, `RESTAPIPort` and `AdminPassword` are managed by the
image — every other game setting keeps its own default.

## 🔧 Runtime inputs

Boolean inputs accept `true` / `false` (and `1`, `yes`, `on` / `0`, `no`, `off`), case-insensitive.

| Input | Default | Allowed values | Purpose |
| --- | --- | --- | --- |
| `PALWORLD_START_PARAMS` | *(empty)* | any launch args | Startup parameters passed to the dedicated server. |
| `PALWORLD_ADMIN_PASSWORD` | *(generated)* | any string | REST API + in-game admin password. Generated randomly if unset. |
| `PALWORLD_UPDATE_ON_START` | `false` | boolean | Run a SteamCMD update on every start. |
| `PALWORLD_VALIDATE_ON_START` | `false` | boolean | Validate installed files via SteamCMD on start. |
| `HEALTHCHECK_PORT` | `8211` | `1024`–`65535` | UDP game port the health check expects the server to bind. |
| `HEALTHCHECK_REQUIRE_BIND` | `true` | boolean | Require the game port to be bound for the container to be healthy. |
| `STOP_TIMEOUT_SECONDS` | `60` | integer seconds | Grace period before the server is force-killed on stop. |

## 🛠️ Operational scripts

| Script | Purpose |
| --- | --- |
| `/app/restore.sh <backup>` | Restores a native backup (by name or path) over the world save; the server must be stopped. |
| `/app/send-command.sh <command>` | Runs an admin command via the REST API: `announce <msg>`, `save`, `stop`, `kick <id> [reason]`, `ban <id> [reason]`, `unban <id>`, `shutdown <sec> [msg]`, `info`, `players`, `settings`, `metrics`. |
| `/app/backup.sh` | Triggers an on-demand world save via the REST API. |
| `/app/healthcheck.sh` | Reports container health to Docker. |
