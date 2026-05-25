# Changelog

## v1.0.0-beta.1

Initial public beta of OVHcloud Game Panel.

### Added

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

### Notes

- The application is distributed as an unmanaged self-hosted solution.
