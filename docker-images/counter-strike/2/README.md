# Counter-Strike 2 Docker Image

This directory contains the Counter-Strike 2 dedicated server image used by OVHcloud Game Panel.

The image installs and runs a CS2 dedicated server through SteamCMD. It also includes helper scripts for console commands and optional framework management (MetaMod:Source and CounterStrikeSharp).

## ✅ Capabilities

| Capability | Support |
| --- | --- |
| Console commands | Supported |
| Backups | Not supported |
| Restores | Not supported |
| Health check | Supported |
| Mods | Frameworks: MetaMod:Source + CounterStrikeSharp (see Mods) |

## ⚙️ Runtime model

Important paths:

- `/data`: persistent data path;
- `/data/server`: CS2 installation directory;
- `/run/counter-strike2`: temporary runtime state.

Default exposed ports:

- `27015/tcp`
- `27015/udp`

## 🔧 Runtime inputs

Boolean inputs accept `true` / `false` (and `1`, `yes`, `on` / `0`, `no`, `off`), case-insensitive.

| Input | Default | Allowed values | Purpose |
| --- | --- | --- | --- |
| `CS2_START_PARAMS` | *(empty)* | any launch args | Startup parameters passed to the dedicated server. |
| `CS2_UPDATE_ON_START` | `true` | boolean | Run a SteamCMD update on every start. |
| `CS2_VALIDATE_ON_START` | `false` | boolean | Validate installed files via SteamCMD on start. |
| `HEALTHCHECK_REQUIRE_TCP` | `true` | boolean | Require the game port to accept a TCP connection for the container to be healthy. |
| `HEALTHCHECK_PORT` | `27015` | `1024`–`65535` | Port the TCP health check probes. |
| `HEALTHCHECK_HOST` | *(container IP)* | hostname / IP | Host the TCP health check probes. |
| `HEALTHCHECK_CONNECT_TIMEOUT_SECONDS` | `2` | integer seconds | TCP health check connection timeout. |
| `STOP_TIMEOUT_SECONDS` | `60` | integer seconds | Grace period before the server is force-killed on stop. |

## 🛠️ Operational scripts

| Script | Purpose |
| --- | --- |
| `/app/send-command.sh` | Sends a command to the running CS2 server. |
| `/app/install-metamod.sh [version]` | Installs or updates MetaMod:Source. |
| `/app/install-counterstrikesharp.sh [version]` | Installs or updates CounterStrikeSharp. |
| `/app/repair-cs2-frameworks.sh` | Reconciles the MetaMod `gameinfo.gi` search path. |
| `/app/healthcheck.sh` | Reports container health to Docker. |

MetaMod must be installed before CounterStrikeSharp.

## 🧩 Mods

Counter-Strike 2 is modded through **frameworks**, not drop-in files. Install **MetaMod:Source**
first, then **CounterStrikeSharp**, with the install scripts above (the server must be stopped);
`/app/repair-cs2-frameworks.sh` reconciles the MetaMod `gameinfo.gi` search path if it is lost after
a game update. Frameworks install under `game/csgo/addons/`, and CounterStrikeSharp plugins go in
`game/csgo/addons/counterstrikesharp/plugins/`. A restart is required for changes to take effect.
