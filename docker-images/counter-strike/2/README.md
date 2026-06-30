# 🔫 Counter-Strike 2 Docker Image

This directory contains the Counter-Strike 2 dedicated server image used by OVHcloud Game Panel.

The image installs and runs a CS2 dedicated server through SteamCMD. It also includes helper scripts for console commands and optional framework management (MetaMod:Source and CounterStrikeSharp).

## ✅ Capabilities

| Capability | Support |
| --- | --- |
| Console commands | Supported |
| Backups | Not supported |
| Restores | Not supported |
| Health check | Supported |
| MetaMod installation | Supported |
| CounterStrikeSharp installation | Supported |
| Framework repair | Supported |

## ⚙️ Runtime model

Important paths:

- `/data`: persistent data path;
- `/data/server`: CS2 installation directory;
- `/run/counter-strike2`: temporary runtime state.

Default exposed ports:

- `27015/tcp`
- `27015/udp`

## 🔧 Runtime inputs

Common inputs include:

| Input | Purpose |
| --- | --- |
| `CS2_START_PARAMS` | Startup parameters passed to the dedicated server. |
| `CS2_UPDATE_ON_START` | Enables server update checks on startup. |
| `CS2_VALIDATE_ON_START` | Enables SteamCMD validation on startup. |

## 🛠️ Operational scripts

| Script | Purpose |
| --- | --- |
| `/app/send-command.sh` | Sends a command to the running CS2 server. |
| `/app/install-metamod.sh [version]` | Installs or updates MetaMod:Source. |
| `/app/install-counterstrikesharp.sh [version]` | Installs or updates CounterStrikeSharp. |
| `/app/repair-cs2-frameworks.sh` | Reconciles the MetaMod `gameinfo.gi` search path. |
| `/app/healthcheck.sh` | Reports container health to Docker. |

MetaMod must be installed before CounterStrikeSharp.
