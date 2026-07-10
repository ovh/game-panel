# Minecraft Docker Images

This directory contains the Minecraft game server images used by OVHcloud Game Panel.

The images provide a predictable Docker runtime for Minecraft Java Edition and Minecraft Bedrock Edition, with scripts for console commands, backups, restores, health checks, and graceful shutdown.

## 🧱 Images

| Image family | Variants | Main purpose |
| --- | --- | --- |
| Minecraft Java Edition | Java 8, 17, 21, 25 | Runs the official Minecraft Java server. |
| Minecraft Paper | Java 8, 17, 21, 25 | Runs Paper server. |
| Minecraft Fabric | Java 8, 17, 21, 25 | Runs Fabric server. |
| Minecraft NeoForge | Java 8, 17, 21, 25 | Runs NeoForge server. |
| Minecraft Bedrock Edition | - | Runs the official Bedrock dedicated server. |

## ✅ Capabilities

| Capability | Java images | Bedrock image |
| --- | --- | --- |
| Console commands | Supported | Supported |
| Hot backup while running | Supported | Supported |
| Cold backup while stopped | Supported | Supported |
| Restore | Supported | Supported |
| Health check | Process and TCP check | Process check |
| Mods / plugins | Paper: plugins; Fabric/NeoForge: mods; Vanilla: none | Not supported |
| Persistent data | `/data` | `/data` |
| Backup directory | `/backups` | `/backups` |

## ⚙️ Runtime inputs

All Minecraft images require the Minecraft EULA to be accepted through `EULA=TRUE`.

Common image inputs:

| Image family | Required inputs |
| --- | --- |
| Vanilla | `EULA`, `MC_VERSION` |
| Paper | `EULA`, `MC_VERSION`, `PAPER_BUILD`, `PAPERMC_USER_AGENT` |
| Fabric | `EULA`, `MC_VERSION`, `FABRIC_LOADER_VERSION`, `FABRIC_INSTALLER_VERSION` |
| NeoForge | `EULA`, `NEOFORGE_VERSION` |
| Bedrock | `EULA`, `MC_VERSION`, `BEDROCK_DOWNLOAD_URL` |

Boolean inputs accept `true` / `false` (and `1`, `yes`, `on` / `0`, `no`, `off`), case-insensitive.

Common tuning inputs (version inputs above are catalog-driven and have no default):

| Input | Default | Allowed values | Purpose |
| --- | --- | --- | --- |
| `EULA` | *(required)* | `TRUE` | Accept the Minecraft EULA; the server refuses to start otherwise. |
| `JAVA_XMS` | *(unset)* | e.g. `2G`, `2048M` | Initial JVM heap size (Java images). |
| `JAVA_XMX` | *(unset)* | e.g. `4G`, `4096M` | Maximum JVM heap size (Java images). |
| `JAVA_OPTS`, `JVM_OPTS` | *(unset)* | JVM flags | Extra JVM options (Java images). |
| `BACKUP_INCLUDE_SERVER_ARTIFACT` | `false` | boolean | Include the downloadable server artifact in backup archives. |

## 🔌 Paths and ports

- Java server data: `/data`
- Java backup directory: `/backups`
- Java default port: `25565/tcp`
- Bedrock server data: `/data`
- Bedrock backup directory: `/backups`
- Bedrock default ports: `19132/udp` and `19133/udp`

## 🛠️ Operational scripts

The images expose the following scripts:

| Script | Purpose |
| --- | --- |
| `/app/send-command.sh` | Sends a command to the running game server. |
| `/app/backup.sh` | Creates a backup archive. |
| `/app/restore.sh` | Restores a supported backup archive. |
| `/app/healthcheck.sh` | Reports container health to Docker. |

Backups are stored as `.tar.gz` archives. Downloadable server artifacts are excluded by default and can be included by setting `BACKUP_INCLUDE_SERVER_ARTIFACT=true`. Restore operations validate backup metadata before replacing the current server data.

## 🧩 Mods

Mod and plugin support depends on the image family:

- **Paper** — server plugins (`.jar`) placed in `/data/plugins`.
- **Fabric / NeoForge** — mods (`.jar`) placed in `/data/mods`; the mod loader is part of the server image.
- **Vanilla** and **Bedrock** — no plugin or mod support.

A restart is required for changes to take effect.
