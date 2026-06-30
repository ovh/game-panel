# 🗡️ Hytale Docker Image

This directory contains the Hytale game server runtime image used by OVHcloud Game Panel.

The Hytale image is a runtime image. It expects the Hytale server files to be prepared before the container starts.

## ✅ Capabilities

| Capability | Support |
| --- | --- |
| Console commands | Supported |
| Backups | Supported |
| Restores | Supported |
| Health check | Supported |
| Persistent data | `/data` |
| Default game port | `5520/udp` |

## ⚙️ Runtime model

The image expects prepared Hytale files under `/data/game`.

Important paths:

- `/data`: persistent data path;
- `/data/game`: prepared Hytale game directory;
- `/data/game/Server`: Hytale server directory;
- `/data/game/Server/backups`: Hytale backup directory;
- `/run/hytale`: temporary runtime state.

The image checks that the required game files are present before starting the server. It also installs the Game Panel Hytale credential store plugin into the server mods directory at startup.

## 🔧 Runtime inputs

Important inputs include:

| Input | Purpose |
| --- | --- |
| `HYTALE_VERSION` | Hytale server version used for runtime metadata. |
| `JAVA_XMS`, `JAVA_XMX` | Optional Java memory settings. |

Authentication is configured through Hytale `config.json` with an `AuthCredentialStore` entry managed by the Game Panel backend. The credential store file is persisted under `/data/.gamepanel/hytale-credential-store.json`.

## 🛠️ Operational scripts

| Script | Purpose |
| --- | --- |
| `/app/send-command.sh` | Sends a command to the running Hytale server. |
| `/app/restore.sh` | Restores a Hytale universe backup. |
| `/app/healthcheck.sh` | Reports container health to Docker. |

Hytale backups are native `.zip` archives stored under the Hytale server backup directory. Restore operations are limited to Hytale universe data.
