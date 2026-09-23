# 📋 Changelog

## v1.6.0 — 2026-09-22

Adds **Garry's Mod** and shows the **players connected** to each of your game servers, live.

### ✨ Added

- **Garry's Mod** — new OVHcloud game server image with full panel integration: installation with Steam branch selection and optional Counter-Strike: Source content, game settings, console commands, hard wipe, and Steam Workshop collection support.
- **Online players** — the game server list now shows how many players are connected to each server, live, in both the table and the grid view. Click the count to see who is online. Available on the compatible games; who can open the list is controlled by a new per-server permission.

### 🔧 Changed

- Minor UI polish and consistency improvements.

### 🐛 Fixed

- **Installation — domain check** — installing on a machine whose `/etc/hosts` maps the domain to a loopback address used to fail with a generic domain/IP mismatch; the installer now names the actual cause and how to fix it.
- **Counter-Strike 2 — server name** — a server name containing spaces is now kept whole instead of being cut at the first space when the settings are saved.
- **Updates — environment file** — the file holding the panel's settings is now completed by the same step that generates the container stack, so a panel updated from an older version can no longer end up missing a value the new stack expects.
- Various minor UI fixes.

## v1.5.0 — 2026-09-10

Adds **Valheim**, rebuilds the **game settings** screen for every OVHcloud game, and puts the panel and its game servers on a **shared Docker network**.

### ✨ Added

- **Valheim** — new OVHcloud game server image with full panel integration: installation, game settings, backups & restore, soft and hard wipe, and BepInEx installation with mod management.

### 🔧 Changed

- **Game settings, rebuilt** — game settings are now grouped by theme (World, Gameplay, Players, Security & access, Performance…) instead of one long flat list, and are checked before being saved. Under the hood the whole settings layer was rewritten on a single shared foundation, so it stays cleaner to maintain and quicker to extend.
- **Panel ↔ game server networking** — the panel now runs on two explicit Docker networks, one for the web entry point and one shared with the game containers, so the backend reaches the game servers directly. Existing servers are moved onto it automatically on update.
- **Security refresh** — panel dependencies and the game server images were reviewed and updated again to cut down on known vulnerabilities.
- Minor UI polish and consistency improvements.

### 🐛 Fixed

- **File Manager — editor search** — the search panel in the file editor no longer closes on its own while you type.
- Various minor UI, installation, and update fixes.

## v1.4.0 — 2026-08-25

Adds **Minecraft Forge**, a **mods & plugins catalog** for Minecraft Java servers, and **automatic Java version selection**.

### ✨ Added

- **Minecraft Forge** — new OVHcloud game server image with full panel integration: installation with Minecraft and Forge version selection, game settings, console commands, backups & restore, operators, whitelist and bans, and mods. Available on Java 8, 17, 21, and 25.
- **Mods & plugins catalog** — browse and install Minecraft mods and plugins from Modrinth without leaving the panel: search, pick a compatible version, and install in one click (plugins on Paper, mods on Fabric, NeoForge, and Forge). Installed addons can be updated, enabled, or disabled from the panel.
- **Automatic Java version** — when installing a Minecraft Java server, the Java runtime is now resolved from the selected Minecraft version instead of being left to you; the recommended one is marked and can still be overridden.

### 🔧 Changed

- **Console performance** — the live console copes with high log volume much better: updates are batched, timestamps are computed once, and switching between date and time no longer reprocesses the whole buffer.
- **Security refresh** — panel dependencies and container base images were reviewed and updated across the app and the game server images.
- Minor UI polish and consistency improvements.

### 🐛 Fixed

- Various minor UI fixes.

## v1.3.0 — 2026-08-11

Adds **Rust**, a **Grid view** for the server list, and **native browser downloads** in the File Manager.

### ✨ Added

- **Rust** — new OVHcloud game server image with full panel integration: installation, game settings, console commands, backups & restore, soft and hard wipe, and Oxide/uMod installation with plugin management.
- **Grid view for game servers** — switch the server list between the classic table and a card grid; the choice is remembered across sessions.

### 🔧 Changed

- **File Manager — downloads** — files and folders are now downloaded natively by the browser through a single-use link instead of being buffered in the page: real download progress, no size ceiling, and no more failures on large folder archives.
- **Duplicate server names** — a name already in use no longer blocks the install form: it is automatically suffixed with ` (1)`, ` (2)`… so deploying several servers for the same game just works.
- Minor UI polish and consistency improvements.

### 🐛 Fixed

- **Steam-based installs** — the automatic retry now only applies to the transient SteamCMD "Missing configuration" error; any other SteamCMD failure now stops immediately with its exit code instead of being retried in a loop (Counter-Strike 2, Palworld, Project Zomboid, Rust).
- **Project Zomboid — Advanced Configuration** — the configuration links pointed at the `servertest` files whatever the server's actual name; they now follow it, and also expose the spawn points and spawn regions files.
- Various minor UI and console fixes.

## v1.2.0 — 2026-07-29

Adds **Project Zomboid**, a generic **server wipe**, and **archive extraction** in the File Manager.

### ✨ Added

- **Project Zomboid** — new OVHcloud game server image with full panel integration: installation, game settings, console commands, backups & restore, a build/branch selector, and a mods manager that auto-resolves Steam Workshop items (Workshop ID → Mod ID) with per-mod enable/ordering.
- **Server wipe** — reset a server without rebuilding it by hand: a *soft wipe* resets the world and player progression while keeping the configuration, mods, and backups; a *hard wipe* reinstalls the server from scratch while keeping its configuration. Available per game.
- **File Manager — archive extraction** — upload a `.zip`, `.tar.gz`, `.tgz`, or `.tar` and extract it directly on the server in one action, instead of uploading hundreds of files one by one.

### 🔧 Changed

- **Minecraft & Hytale memory** — the JVM heap now sizes itself to about 75% of the container's RAM when `JAVA_XMX` is unset, instead of defaulting to a fixed 6 GB.
- **File Manager** — hidden files (dotfiles) are hidden by default, with a toggle to reveal them.
- Minor UI polish and consistency improvements.

### 🐛 Fixed

- **File Manager — uploads** — large multi-file uploads are now reliable: files upload with bounded concurrency and automatic retry instead of all at once, which previously caused random upload failures.

## v1.1.0 — 2026-07-10

Adds **Palworld** support, improves live logs and server status tracking, and reworks the per-game configuration UI.

### ✨ Added

- **Palworld** — new OVHcloud game server image with full panel integration: installation, game settings (with a generated admin password), console commands, backups & restore, and Advanced Configuration links (`PalWorldSettings.ini`).
- **"Update on start" toggle** for Steam-based games (Counter-Strike 2 and Palworld): optionally run a SteamCMD update on every start (backed by an environment variable).
- **Resizable console** — drag the bottom handle to grow or shrink the console (height persisted across sessions), plus a fullscreen mode to view logs on the whole screen.
- GitHub issue templates for the project.

### 🔧 Changed

- **Live logs** are more reliable: the stream now auto-reattaches after a container restart, replays the recent backlog, and no longer mixes logs between servers/tabs.
- **Server status & health** reporting is more accurate and deterministic: `unhealthy` / `failed` states are shown distinctly instead of collapsing to "stopped", and install lifecycle/health tracking was hardened (Hytale now requires its UDP game port to be bound, not just the process).
- **Game settings UI** is unified across OVHcloud games (Minecraft / Hytale / Palworld) through a shared settings section with family-based detection; saving is scoped to environment variables (Save / Save & Restart).
- Console command input is disabled for images without a console (external images), consistent with the backend.
- Port labels clarified (Counter-Strike 2: "RCON" on TCP 27015; Palworld: "Steam Query" on UDP 27015).

### 🐛 Fixed

- Steam-based game installs (Counter-Strike 2, Palworld) now retry automatically on the transient SteamCMD "Missing configuration" error, so first-time installs no longer fail intermittently.
- Hytale installation progress bar is now proportional to the number of install steps.
- Various UI fixes (Advanced Settings opens only on config errors, boolean settings row layout, light-mode button label) and minor fixes.

## v1.0.0 — 2026-06-30

Stable release of OVHcloud Game Panel with a broader provider model, curated OVHcloud Docker images, improved file management, scheduled tasks, and container configuration workflows.

### ✨ Added

- Multi-provider server model — OVHcloud, LinuxGSM, and external — with every feature (installation, backups, console, configuration…) adapted per provider.
- OVHcloud game server images: Minecraft (Java Edition, Bedrock Edition, Paper, Fabric, NeoForge), Hytale, and Counter-Strike 2.
- Per-game management: settings & configuration, operators/admins, plugins & mods, whitelist & bans, and framework management (MetaMod / CounterStrikeSharp).
- External Docker image support with custom ports, environment variables, mounts, runtime identity, resource limits, and health checks.
- Container configuration for ports, mounts, environment variables, health checks, and CPU/RAM limits.
- File Manager with multi-mount browsing, file editing, uploads, downloads, and folder downloads.
- Scheduled tasks for restarts, backups, and custom commands.
- Backups and restores (provider-aware; restore supported for OVHcloud game server images).
- More detailed server, container, and health status tracking.
- Light theme.
- Built-in panel self-update.

### 🔧 Changed

- OVHcloud Game Panel is no longer limited to LinuxGSM workflows.
- Server configuration now stores provider, image, ports, mounts, environment, health check, resource limit, and runtime metadata.
- Server lifecycle actions are handled through Docker and provider-specific hooks instead of a LinuxGSM-only command model.
- Backup scheduling is handled through panel scheduled tasks instead of the beta LinuxGSM cron workflow.
- File access is handled through the built-in File Manager instead of SFTP.
- Console command workflows and container terminal workflows are separate.
- API and WebSocket timestamps are normalized to UTC ISO 8601 strings.
- User permissions were expanded to cover provider-specific features and scheduled tasks.
- Deployment scripts include updater configuration and deploy migration support.

### 🗑️ Removed

- SFTP management and host user management for server file access.
- SFTP host agent and SSH configuration assets.
- Beta-era LinuxGSM-only assumptions in server installation and lifecycle management.

### ⚠️ Upgrade Notes

- Data migration from `v1.0.0-beta.1` is not available in this release.
- A fresh OVHcloud Game Panel installation is required to use `v1.0.0`.

## 🎉 v1.0.0-beta.1 — 2026-04-21

Initial public beta of OVHcloud Game Panel.

### ✨ Added

- LinuxGSM-based game server management.
- Docker-based runtime for managed game servers.
- Game server installation from LinuxGSM-compatible server images.
- Server lifecycle actions: install, start, stop, restart, rename, and delete.
- Real-time installation progress through WebSocket updates.
- Server status, port information, live logs, and interactive console workflows.
- Per-server CPU and memory metrics with history views.
- Host monitoring for CPU, memory, disk, and network usage.
- Built-in file manager for server data and backup directories.
- LinuxGSM backup creation, listing, download, deletion, and retention settings.
- Backup and game update scheduling through LinuxGSM cron workflows.
- SFTP management for server file access.
- User administration with global permissions and per-server permissions.
- Activity history for server operations.
- Self-hosted deployment scripts with Docker, Traefik, HTTPS, and SQLite.

### 📝 Notes

- The application is distributed as an unmanaged self-hosted solution.
