# 🐳 OVHcloud Game Panel Docker Images

This directory holds the Docker image sources maintained alongside OVHcloud Game Panel — the game server runtimes it deploys, and the panel's own operational images.

## 🎮 Game server images

| Image family | Path | Purpose |
| --- | --- | --- |
| Minecraft | `minecraft/` | Minecraft Java and Bedrock server runtimes. |
| Hytale | `hytale/` | Runtime image for prepared Hytale dedicated server files. |
| Counter-Strike 2 | `counter-strike/2/` | CS2 dedicated server runtime with optional framework support. |

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

| Image family | Console commands | Backups | Restores | Notes |
| --- | --- | --- | --- | --- |
| Minecraft Java | Supported | Supported | Supported | Vanilla, Paper, Fabric, and NeoForge variants. |
| Minecraft Bedrock | Supported | Supported | Supported | Uses the official Bedrock server archive supplied at runtime. |
| Hytale | Supported | Supported | Supported | Requires prepared Hytale server files before startup. |
| Counter-Strike 2 | Supported | Not supported | Not supported | Includes MetaMod and CounterStrikeSharp helper scripts. |

## 📚 Documentation

- [⛏️ Minecraft images](minecraft/README.md)
- [🗡️ Hytale image](hytale/README.md)
- [🔫 Counter-Strike 2 image](counter-strike/2/README.md)
- [🔄 Game Panel Updater image](gamepanel/updater/README.md)

## 📝 Notes

These images wrap official game server distribution mechanisms. They do not provide game licenses, bypass upstream authentication, or replace the terms of service of the upstream games and tools they use.
