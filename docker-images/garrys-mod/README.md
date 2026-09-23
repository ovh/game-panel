# Garry's Mod Docker Image

This directory contains the Garry's Mod dedicated server image used by OVHcloud Game Panel.

The image installs and runs a Garry's Mod dedicated server through SteamCMD (Steam app id `4020`).
It also includes a helper script for console commands.

## ✅ Capabilities

| Capability | Support |
| --- | --- |
| Install / update via SteamCMD | Supported (with automatic retry on the transient SteamCMD "Missing configuration" error) |
| Steam branch selection | Supported (via `GMOD_BRANCH`) |
| Console commands | Supported (stdin, via `/app/send-command.sh`) |
| Backups | Not supported |
| Restores | Not supported |
| Health check | Supported |
| Mods | Supported (Steam Workshop collection) |

## ⚙️ Runtime model

Important paths:

- `/data`: persistent data path;
- `/data/server`: Garry's Mod installation directory (SteamCMD);
- `/data/server/garrysmod`: the game tree — config (`cfg/`), manual addons (`addons/`), gamemodes
  (`gamemodes/`), addon data (`data/`, `sv.db`), admin list (`settings/users.txt`) and the workshop
  download cache (`cache/`);
- `/data/content/counter-strike-source`: Counter-Strike: Source content, when `GMOD_MOUNT_CSS` is
  enabled;
- `/run/garrys-mod`: temporary runtime state (stdin FIFO, PID file).

Default exposed ports:

- `27015/udp` (game and Steam query)
- `27015/tcp` (RCON)

Gameplay and the Steam query share the same UDP port, which is advertised to clients and must be
mapped 1:1 with the host. The same port number on TCP is the Source RCON socket, which the panel
does not use: the console reads from a stdin FIFO. SourceTV binds `27020/udp` even when unused and
is not exposed.

The server runs on the `x86-64` Steam branch by default (64-bit binaries, `srcds_run_x64`); setting
`GMOD_BRANCH` to an empty value installs the 32-bit public branch instead. Runtime libraries for
both are installed.

`GMOD_MOUNT_CSS` installs Counter-Strike: Source content (Steam app id `232330`) and adds its
`cstrike` entry to `garrysmod/cfg/mount.cfg`. Other entries in that file are preserved, and
disabling the input removes only the entry the image wrote.

## 🔧 Runtime inputs

Boolean inputs accept `true` / `false` (and `1`, `yes`, `on` / `0`, `no`, `off`), case-insensitive.

| Input | Default | Allowed values | Purpose |
| --- | --- | --- | --- |
| `GMOD_START_PARAMS` | *(empty)* | any launch args | Startup parameters appended to the server (e.g. `+gamemode sandbox +map gm_construct +maxplayers 32 +sv_setsteamaccount <token> +host_workshop_collection 1234567890`). Panel-driven. |
| `GMOD_SERVER_PORT` | `27015` | `1`–`65535` | Game and Steam query port (`-port`). Advertised → map 1:1. |
| `GMOD_BRANCH` | `x86-64` | Steam branch name, or empty | Steam branch (`-beta`). Empty installs the 32-bit public branch. |
| `GMOD_MOUNT_CSS` | `false` | boolean | Install Counter-Strike: Source content and mount it in `mount.cfg`. |
| `GMOD_UPDATE_ON_START` | `true` | boolean | Run a SteamCMD update on every start. |
| `GMOD_VALIDATE_ON_START` | `false` | boolean | Validate installed files via SteamCMD on start. |
| `HEALTHCHECK_REQUIRE_TCP` | `true` | boolean | Require the game port to accept a TCP connection for the container to be healthy. |
| `HEALTHCHECK_PORT` | `27015` | `1024`–`65535` | Port the TCP health check probes. |
| `HEALTHCHECK_HOST` | *(container IP)* | hostname / IP | Host the TCP health check probes. |
| `HEALTHCHECK_CONNECT_TIMEOUT_SECONDS` | `2` | integer seconds | TCP health check connection timeout. |
| `STOP_TIMEOUT_SECONDS` | `60` | integer seconds | Grace period before the server is force-killed on stop. |

## 🛠️ Operational scripts

| Script | Purpose |
| --- | --- |
| `/app/send-command.sh <command>` | Sends a command to the running server console (via stdin), e.g. `status`, `say`, `changelevel`. |
| `/app/healthcheck.sh` | Reports container health to Docker. |

## 🧩 Mods

Garry's Mod addons come from a **Steam Workshop collection**, passed as
`+host_workshop_collection <collection id>` in `GMOD_START_PARAMS`. The collection must be public or
unlisted; the server downloads and mounts it on every start into `garrysmod/cache/`. Adding
`+host_workshop_autoupdate 0` pins the addons to their downloaded version instead of updating them
on each start.

Addons that are not on the Workshop go into `garrysmod/addons/`, as extracted folders — a `.gma`
file placed there is not reliably mounted.

`base`, `sandbox` and `terrortown` ship with the game; any other gamemode comes from the collection
or from `garrysmod/gamemodes/`, and is selected with `+gamemode <name>`.

A restart is required for changes to take effect.
