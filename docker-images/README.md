# 🐳 OVHcloud Game Panel Docker Images

This directory holds the Docker image sources maintained alongside OVHcloud Game Panel — the game server runtimes it deploys, and the panel's own operational images.

## 🎮 Game server images

| Image family | Path | Purpose |
| --- | --- | --- |
| Minecraft | `minecraft/` | Minecraft Java and Bedrock server runtimes. |
| Hytale | `hytale/` | Runtime image for prepared Hytale dedicated server files. |
| Counter-Strike 2 | `counter-strike/2/` | CS2 dedicated server runtime with optional framework support. |
| Palworld | `palworld/` | Palworld dedicated server runtime. |
| Project Zomboid | `project-zomboid/` | Project Zomboid dedicated server runtime. |
| Rust | `rust/` | Rust dedicated server runtime. |
| Valheim | `valheim/` | Valheim dedicated server runtime. |
| Garry's Mod | `garrys-mod/` | Garry's Mod dedicated server runtime with optional Counter-Strike: Source content. |

## 🛠️ Game Panel images

| Image | Path | Purpose |
| --- | --- | --- |
| Game Panel Updater | `gamepanel/updater/` | One-shot runtime used to update an installed panel. |

## ⚙️ Common runtime model

Game server images follow the same general conventions:

- persistent game data is stored in `/data`;
- backup data is stored in `/backups` when the image supports a dedicated backup mount;
- runtime state is stored in `/run/...` and is not meant to be persisted;
- game server containers run as the `gameserver` user with UID/GID `10001`;
- logs are written to stdout and stderr;
- health checks are lightweight and local to the container;
- operational actions are exposed through small scripts under `/app`.

## ✅ Capability summary

| Image family | Console commands | Backups | Restores | Mods | Notes |
| --- | --- | --- | --- | --- | --- |
| Minecraft Java | Supported | Supported | Supported | Paper: plugins; Fabric/NeoForge/Forge: mods | Vanilla, Paper, Fabric, NeoForge, and Forge variants. |
| Minecraft Bedrock | Supported | Supported | Supported | Not supported | Uses the official Bedrock server archive supplied at runtime. |
| Hytale | Supported | Supported | Supported | Supported | Requires prepared Hytale server files before startup. |
| Counter-Strike 2 | Supported | Not supported | Not supported | Frameworks (MetaMod + CounterStrikeSharp) | Includes MetaMod and CounterStrikeSharp helper scripts. |
| Palworld | Supported (REST API) | Native (game-managed) | Supported | Not supported | Steam app id 2394010; on-demand save via REST. |
| Project Zomboid | Supported | Supported | Supported | Steam Workshop | Steam app id 380870; SteamCMD install; branch selection via `PZ_BRANCH`. |
| Rust | Supported | Supported | Supported | Oxide/uMod | Steam app id 258550; SteamCMD install; Rust+ companion app. |
| Valheim | Not supported | Native (game-managed) | Supported | BepInEx | Steam app id 896660; SteamCMD install; every option is a launch argument. |
| Garry's Mod | Supported | Not supported | Not supported | Steam Workshop collection | Steam app id 4020; SteamCMD install; branch selection via `GMOD_BRANCH`; optional Counter-Strike: Source content. |

## 📚 Documentation

- [Minecraft images](minecraft/README.md)
- [Hytale image](hytale/README.md)
- [Counter-Strike 2 image](counter-strike/2/README.md)
- [Palworld image](palworld/README.md)
- [Project Zomboid image](project-zomboid/README.md)
- [Rust image](rust/README.md)
- [Valheim image](valheim/README.md)
- [Garry's Mod image](garrys-mod/README.md)
- [Game Panel Updater image](gamepanel/updater/README.md)

## 📝 Notes

These images wrap official game server distribution mechanisms. They do not provide game licenses, bypass upstream authentication, or replace the terms of service of the upstream games and tools they use.
