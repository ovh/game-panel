# Hytale Docker Image

This directory contains the Hytale game server runtime image used by OVHcloud Game Panel.

The Hytale image is a runtime image. It expects the Hytale server files to be prepared before the container starts.

## ✅ Capabilities

| Capability | Support |
| --- | --- |
| Console commands | Supported |
| Hot backup while running | Native (game-managed) + on-demand save |
| Cold backup while stopped | Not supported |
| Restores | Supported |
| Health check | Supported |
| Mods | Supported (drop-in, server-side) |
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

Boolean inputs accept `true` / `false` (and `1`, `yes`, `on` / `0`, `no`, `off`), case-insensitive.

| Input | Default | Allowed values | Purpose |
| --- | --- | --- | --- |
| `HYTALE_VERSION` | *(from prepared files)* | version string | Hytale server version used for runtime metadata. |
| `JAVA_XMS` | *(unset)* | e.g. `2G`, `2048M` | Initial JVM heap size. |
| `JAVA_XMX` | *(unset)* | e.g. `4G`, `4096M` | Maximum JVM heap size. |
| `HYTALE_START_PARAMS` | *(empty)* | any launch args | Extra launch arguments passed to the server. |
| `HEALTHCHECK_PORT` | `5520` | `1024`–`65535` | UDP game port the health check expects the server to bind. |
| `HEALTHCHECK_REQUIRE_BIND` | `true` | boolean | Require the UDP game port to be bound for the container to be healthy. |
| `STOP_TIMEOUT_SECONDS` | `60` | integer seconds | Grace period before the server is force-killed on stop. |

Authentication is configured through Hytale `config.json` with an `AuthCredentialStore` entry managed by the Game Panel backend. The credential store file is persisted under `/data/.gamepanel/hytale-credential-store.json`.

## 🛠️ Operational scripts

| Script | Purpose |
| --- | --- |
| `/app/send-command.sh` | Sends a command to the running Hytale server. |
| `/app/restore.sh` | Restores a Hytale universe backup. |
| `/app/healthcheck.sh` | Reports container health to Docker. |

Hytale backups are native `.zip` archives stored under the Hytale server backup directory. Restore operations are limited to Hytale universe data.

## 🧩 Mods

Hytale mods are drop-in files placed under the server mods directory (`/data/game/Server/mods`). The
image also installs the Game Panel credential-store plugin there at startup. A restart is required
for mod changes to take effect.
