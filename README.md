<div align="center">

# 🎮 OVHcloud Game Panel

> **This fork** adds tools for **Call of Duty 4 (CoD4X)** and **B3**. Instructions are right below, details in [cod4/README.md](cod4/README.md).


### Deploy and manage your game servers in minutes — from one clean, modern web interface.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
![Platform](https://img.shields.io/badge/Platform-Linux-1793D1)
[![Made by OVHcloud](https://img.shields.io/badge/Made%20by-OVHcloud-000e9c)](https://www.ovhcloud.com/)

<img src="docs/assets/game-panel.png" alt="OVHcloud Game Panel" width="900">

</div>

<br>

## 🔫 Call of Duty 4 (CoD4X) + B3: how to use

Additions for CoD4 servers installed through LinuxGSM (Game Panel 1.6.0). Everything was built and tested on **Ubuntu 24.04**.

### What you get

| Where in the panel | What |
|---|---|
| Server → **Settings → Game config → Command line** | Slots, `sv_authtoken`, Materials / Xanims / Xmodels, mod (`fs_game`), `rcon_password`. Nothing is written to `server.cfg`, and the RCON password works even if `server.cfg` has its own. |
| Server → **Settings → Game config → B3 (BigBrotherBot)** | Install / Start / Stop / Restart / Uninstall, console, `b3.xml` editor, logs. |
| **Installing a new CoD4 server** | a **Slots** field; the game files come from your own folder `/opt/gamepanel/cod4-linux` (hard links: no extra disk space, ready in seconds) and **nothing is downloaded**, not even LinuxGSM from GitHub. The form checks the folder first and does not start the install while files are missing. |
| `https://<panel domain>/pma/` | **phpMyAdmin** for the B3 database (MariaDB). |
| `http://<panel domain>:8080/cod4/<server>` | **FastDL** for mods and custom maps: every server its own folder and link by server number (`/var/www/html/cod4/<server>`), kept in sync by itself; on for new servers, on/off in the Command line card. |
| Sidebar → **Admin** (Super Admins) | **Overview**: every server (status, players, CPU, RAM, B3, FastDL) with group Start / Stop / Restart and what needs attention. **Players & RCON**: live players with kick / temp ban / ban, message to everybody, RCON console. **Maps**: change the map, edit the rotation. **Mods & maps**: upload a .zip, copy to another server, delete. **B3**: start / stop, plugins on / off, admins (B3 groups), bans and unban, database backup. **FastDL**, **System** (load, memory, disk, folder sizes, containers), **Activity** (who changed what) and **Panel** (name, news, users). |
| Sidebar → **✨** next to the light/dark button | **Neon** theme: animated aurora lights and grid, glass cards, neon edges and buttons (stops for reduced motion). Click again for the **orange** variant, once more to turn it off. |
| User menu **⋮** → **Panel name** (admins) | Your own panel name instead of the *OVHcloud Game Panel* logo, for all users: sidebar, login page, mobile header, browser tab. *Use the logo* brings the logo back. |

### Install (on the panel server, as root)

```bash
cd ~
for f in gp-cod4-cmdline.sh gp-b3.sh gp-cod4-linux.sh gp-pma.sh gp-db-root.sh gp-fastdl.sh; do
  curl -fsSLO https://raw.githubusercontent.com/ProGameCro/game-panel/main/cod4/install/$f
done

bash gp-cod4-cmdline.sh      # 1. Command line card
bash gp-b3.sh                # 2. B3 card + B3 + MariaDB database
bash gp-cod4-linux.sh 5      # 3. the panel: CoD4 from /opt/gamepanel/cod4-linux (filled from server 5), Admin page, theme, news, …
bash gp-pma.sh               # 4. (optional) phpMyAdmin
bash gp-fastdl.sh            # 6. (optional) FastDL for mods and maps
```

Then reload the panel in the browser with **Ctrl+Shift+R**. All scripts can be run again, and **after every panel update** run 1–3 again (`gp-cod4-linux.sh` without a number).

### B3 step by step

1. In the **Command line** card set `rcon_password` (or *Generate*) → **Save** → restart the server.
2. In the **B3** card press **Install B3**: B3 is unpacked into the server folder `b3/` and `b3/b3/conf/b3.xml` is created with the RCON password, port, game log and database.
3. Press **Start B3**, join the server and type **`!iamgod`** (you become Super Admin).

- Config: card → **Edit b3/b3/conf/b3.xml** → *Save and restart B3*.
- Plugins: `b3/b3/extplugins`, plugin configs: `b3/b3/conf` (file manager).
- Parser **`cod4x18`** works without the b3hide plugin; if the server loads b3hide, `cod4x` works too.
- B3 sees the server folder as `/data` (e.g. `game_log: /data/serverfiles/main/games_mp.log`).

### Game files for new CoD4 servers (`/opt/gamepanel/cod4-linux`)

```bash
bash ~/gp-cod4-linux.sh        # set up the folder, the local image and the panel; shows what is in the folder
bash ~/gp-cod4-linux.sh 5      # fill the folder with the files of server 5 (replaces what is there)
bash ~/gp-cod4-linux.sh --relink 8   # server 8's files that are the same as the folder's become hard links (frees space)
```

Or put the CoD4X files into `/opt/gamepanel/cod4-linux` yourself (FTP, `cp -a`): `cod4x18_dedrun`, `main` (with the
`.iwd` files), `zone`, and `mods` / `usermaps` if you want them on every new server. `main/cod4server.cfg` in the folder
is the starting config of new servers.

- A new server gets **hard links** to the big files (no extra disk space, instant) and copies of the small ones, so
  editing a config on one server never changes another one. (Symbolic links would not work here: the game containers
  cannot see paths outside their own folder, and the panel's file manager does not open symbolic links.)
- To change a big file for **new** servers only, delete it in the folder and copy the new one in (or use `rsync`).
  Overwriting it in place (`cp` over it) also changes it on every server installed from the folder.
- Servers use the local image `gamepanel-local/cod4` (the LinuxGSM image plus the files LinuxGSM would fetch from
  GitHub). After `docker pull gameservermanagers/gameserver:cod4`, run the script again to rebuild it.
- Servers installed before keep running as they are.

**Keeping the folder for a reinstall.** The CoD4 game files (`main/*.iwd`, `zone/*.ff`) belong to Activision: keep them
in a **private** repository or on your own server, never in a public one.

```bash
bash ~/gp-cod4-linux.sh --pack     # /root/cod4-linux.tar.part-00, -01 ... (max 1.9 GB each)
```

Upload the parts to a release of a private GitHub repository (Releases → Draft a new release → drop the files →
Publish). After reinstalling the server and the panel:

```bash
export GH_TOKEN=<GitHub token with read access to that repository>
bash ~/gp-cod4-linux.sh --from https://github.com/<you>/<repo>/releases/tag/<tag>
```

`--from` also takes direct links to the parts (in order), e.g. from your own web server.

### FastDL (`gp-fastdl.sh`)

Players download mods and custom maps over HTTP. Every CoD4 server has its own FastDL by server
number: server 5 → `/var/www/html/cod4/5` at `http://<panel domain>:8080/cod4/5`, so servers with different versions of
the same mod never mix. The service `gamepanel-fastdl` copies the `.ff` and `.iwd` files from each server's `mods/` and
`usermaps/` and keeps them in sync every 10 seconds: new or changed files appear by themselves, deleted ones disappear,
and a new server gets its folder on its own. Opening the address or a folder in a browser gives 403.
The game uses plain HTTP (`http://<panel domain>:8080/cod4/<server>`). Browsers open the panel's domain only over HTTPS
(the panel sends HSTS), so the same port also answers HTTPS, with the panel's Let's Encrypt certificate (the service
copies it from Traefik and picks up renewals): the same link works in a browser. Without the port:
`https://<panel domain>/fastdl/<server>/mods/<mod>/mod.ff` (through the panel's Traefik). Configs and
other files are never published. A small web server (nginx container `gamepanel-fastdl`) serves the folder on port 8080
(`FASTDL_PORT=8090 bash gp-fastdl.sh` for another one), because the panel's port 80 always redirects to HTTPS.

New CoD4 servers get it turned on at install. For existing ones: **Settings → Game config → Command line → FastDL**
(the card also shows the server's link, whether the web server runs and which of its mods / maps are published). It puts the FastDL settings on
the startup line; a `sv_wwwBaseURL` in `server.cfg` would override it, so remove that line there. Or by hand in `server.cfg`:

```
set sv_allowDownload "1"
set sv_wwwDownload "1"
set sv_wwwBaseURL "http://<panel domain>:8080/cod4/<server number>"
set sv_wwwDlDisconnected "0"
```

### Troubleshooting

| Problem | Fix |
|---|---|
| `Bad rcon` in the server console | the same password must be in the Command line card and in `b3.xml` (*Write these values into …*), then restart the server and B3. |
| `!iamgod` does nothing | the parser must be `cod4x18` (or `cod4x` with the b3hide plugin); B3 must be running before you type the command. |
| root login fails in phpMyAdmin | `bash ~/gp-db-root.sh` |
| the panel shows an old card | Ctrl+Shift+R or a private window. |

Database and phpMyAdmin passwords: `cat /etc/gamepanel-b3/db.env /etc/gamepanel-b3/pma.env`.

<br>

OVHcloud Game Panel is an **open-source, self-hosted** control panel to deploy, run, and monitor your game servers — **without ever touching the command line**. Spin up a Minecraft, Counter-Strike 2, Hytale, Palworld, Project Zomboid, Rust, Valheim or Garry's Mod server in a few clicks, then manage its files, backups, player access, and performance from a single modern dashboard. 🚀

## ✨ Features

- 🎛️ Complete server lifecycle management (create, start, stop, restart…).
- 📊 Live status, logs, metrics, and installation tracking.
- 👥 Live player counts and online player lists.
- 🕹️ Interactive in-browser game console.
- 📁 Powerful built-in file manager.
- 💾 One-click backups and restores.
- 🧩 In-panel mods installation.
- ⏰ Flexible task scheduling.
- 🐳 Advanced container configuration.
- 🔐 Fine-grained user permissions.
- 📈 Real-time host monitoring.
- 💻 Integrated container terminal.
- 🔄 Built-in one-click panel updater.

## 🕹️ Supported games

**Natively supported**, ready to deploy with OVHcloud-maintained images:

- **Minecraft** — Java Edition, Paper, Fabric, NeoForge, Forge, and Bedrock Edition
- **Counter-Strike 2**
- **Hytale**
- **Palworld**
- **Project Zomboid**
- **Rust**
- **Valheim**
- **Garry's Mod**

**And many more.** Game Panel integrates the full [LinuxGSM](https://linuxgsm.com/servers/) library, giving you a huge catalogue of additional dedicated game servers out of the box.

Your game isn't listed? You can also **add any external Docker image** and run it straight from the panel. 🐳

## 🚀 Installation

### ⚡ Automatic — OVHcloud VPS or Dedicated Server (recommended)

Game Panel can be installed **automatically, in one click**, when you deploy an OVHcloud **VPS** or **Dedicated Server**. See the [installation guide](https://docs.ovhcloud.com/en/guides/bare-metal-cloud/virtual-private-servers/game-panel-install-on-vps).

### 🛠️ Manual installation

**Prerequisites:**

- a Linux machine running Debian 12/13 or Ubuntu 22.04 / 24.04 / 25.10 / 26.04;
- a domain name pointing to the machine's public IP address;
- shell access with administrative privileges.

Don't have the infrastructure yet? 🌐 [Domain name](https://www.ovhcloud.com/en-ie/domains/) · 🖥️ [VPS](https://www.ovhcloud.com/en-ie/vps/) · 🗄️ [Dedicated server](https://www.ovhcloud.com/en-ie/bare-metal/)

**Command to run:**

```bash
sudo apt install git
git clone https://github.com/ProGameCro/game-panel.git
cd game-panel
sudo bash ./deploy/install.sh
```

> This installs the panel from this fork, so the CoD4 **Command line** and **B3** cards are already in it. For B3 itself
> (image, MariaDB, service), and the CoD4 game files folder still run `gp-b3.sh` and `gp-cod4-linux.sh` from
> [the CoD4 instructions](#-call-of-duty-4-cod4x--b3-how-to-use); they skip the panel parts that are already there.

During installation, you'll be prompted for:

- Domain name
- Admin password
- Admin username (optional, default: `admin`)
- Let's Encrypt email

Once installed, your panel is live at **`https://<your-domain>`** 🎉

> 📡 OVHcloud Game Panel sends usage telemetry by default. You can disable it at install with `--telemetry-disabled`. See [docs/TELEMETRY.md](docs/TELEMETRY.md).

## 🏗️ Architecture

Under the hood, a **React + Vite** frontend talks to a **Node.js** backend (Express, WebSocket, SQLite) that orchestrates the full server lifecycle — files, backups, permissions, metrics, and container configuration — through the **Docker** engine.

- `frontend/` — React and Vite user interface.
- `backend/` — Node.js, Express, WebSocket, and SQLite backend.
- `docker-images/` — OVHcloud game server images and operational images.
- `deploy/` — self-hosted installation and update scripts.

## 📚 Documentation & support

- 📋 [Changelog](CHANGELOG.md)
- 📡 [Telemetry](docs/TELEMETRY.md)
- 💬 [Contact OVHcloud support](https://www.ovhcloud.com/en/contact/)
- 🎮 [OVHcloud Discord](https://discord.gg/ovhcloud)

## 📄 License

Licensed under the **Apache License 2.0** — see [LICENSE](LICENSE).
