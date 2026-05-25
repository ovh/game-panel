# OVHcloud Game Panel

OVHcloud Game Panel is a self-hosted web control panel for operating Dockerized
game servers from a browser.

Version `v1.0.0-beta.1` is the first public beta of the project. It focuses on
LinuxGSM-based game servers and provides the core workflows required to install,
operate, observe, and maintain game server containers.

## What It Provides

- LinuxGSM-based game server installation and management.
- Docker container orchestration for each game server.
- Server lifecycle actions: install, start, stop, restart, rename, and delete.
- Real-time installation progress, server status, logs, and console workflows.
- Per-server CPU and memory metrics with history views.
- Host status monitoring for CPU, memory, disk, and network usage.
- Built-in file management for server data and backup directories.
- LinuxGSM backup creation, listing, download, deletion, and retention settings.
- Backup and game update scheduling through LinuxGSM cron workflows.
- SFTP access management for server files.
- User management with global permissions and per-server permissions.
- Operational views for resources, activity, and day-to-day server management.

## Server Support

This beta is designed for LinuxGSM-compatible servers. Game availability follows
the LinuxGSM catalog and the Docker images used by the LinuxGSM workflow.

LinuxGSM server catalog: <https://linuxgsm.com/servers/>

## Architecture

- `frontend/`: React and Vite user interface.
- `backend/`: Node.js, Express, WebSocket, and SQLite backend.
- Docker: container runtime for managed game servers.
- SQLite: local application database.
- LinuxGSM: game server installation and operation layer.

## Deployment Model

> OVHcloud Game Panel is distributed as an unmanaged self-hosted application. It is
intended for operators who run the panel on their own Linux machine.

Before installation, you need:

- a Linux machine running Debian 12, Debian 13, or Ubuntu 24.04;
- a domain name pointing to the public IP address of the machine;
- access to a shell with administrative privileges.

If you still need infrastructure:

- Domain name: <https://www.ovhcloud.com/en-ie/domains/>
- VPS: <https://www.ovhcloud.com/en-ie/vps/>
- Dedicated server: <https://www.ovhcloud.com/en-ie/bare-metal/>

Example installation:

```bash
sudo apt install git
git clone https://github.com/ovh/game-panel.git
cd game-panel
sudo bash ./deploy/install.sh
```

During installation, you will be prompted for:

- Domain name
- Admin password
- Admin username (optional, default: `admin`)
- Let's Encrypt email

After installation, the panel is available at:

```text
https://<your-domain>
```

## Updating

From the installation directory:

```bash
git pull --ff-only origin main
sudo bash ./deploy/update.sh
```

To update from another branch, switch to that branch first, pull it, then run the
update script.
