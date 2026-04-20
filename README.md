# OVHcloud GamePanel

GamePanel is a modern web control panel designed to simplify game server operations.  
It combines a React frontend and a Node.js backend to orchestrate Dockerized game servers powered by LinuxGSM workflows.

## What OVHcloud GamePanel Provides

- Centralized server lifecycle controls: install, start, stop, restart, ect.
- Real-time observability with host status, per-server CPU/RAM metrics, and history views.
- Live logs and interactive console workflows over WebSocket.
- Built-in file management: create, read, edit, rename, etc.
- Backup tools: listing, download, scheduling, retention policies, etc.
- SFTP operations: enable/disable, credential access.
- User and permission management with global and per-server scopes.
- Practical day-to-day UI modules, including resources and operational views.

## LinuxGSM Server Coverage

OVHcloud GamePanel targets LinuxGSM-compatible server workflows. Current LinuxGSM game server list from the official catalog:

Source: <https://linuxgsm.com/servers/>

<details>
<summary>Show LinuxGSM servers (139 entries)</summary>

- [7 Days to Die](https://linuxgsm.com/servers/sdtdserver/)
- [Action Half-Life](https://linuxgsm.com/servers/ahlserver/)
- [Action: Source](https://linuxgsm.com/servers/ahl2server/)
- [American Truck Simulator](https://linuxgsm.com/servers/atsserver/)
- [ARK: Survival Evolved](https://linuxgsm.com/servers/arkserver/)
- [ARMA 3](https://linuxgsm.com/servers/arma3server/)
- [Arma Reforger](https://linuxgsm.com/servers/armarserver/)
- [Assetto Corsa](https://linuxgsm.com/servers/acserver/)
- [Avorion](https://linuxgsm.com/servers/avserver/)
- [Ballistic Overkill](https://linuxgsm.com/servers/boserver/)
- [Barotrauma](https://linuxgsm.com/servers/btserver/)
- [Base Defense](https://linuxgsm.com/servers/bdserver/)
- [BATTALION: Legacy](https://linuxgsm.com/servers/btlserver/)
- [Battlefield 1942](https://linuxgsm.com/servers/bf1942server/)
- [Battlefield: Vietnam](https://linuxgsm.com/servers/bfvserver/)
- [Black Mesa: Deathmatch](https://linuxgsm.com/servers/bmdmserver/)
- [Blade Symphony](https://linuxgsm.com/servers/bsserver/)
- [Brainbread](https://linuxgsm.com/servers/bbserver/)
- [BrainBread 2](https://linuxgsm.com/servers/bb2server/)
- [Call of Duty](https://linuxgsm.com/servers/codserver/)
- [Call of Duty 2](https://linuxgsm.com/servers/cod2server/)
- [Call of Duty 4](https://linuxgsm.com/servers/cod4server/)
- [Call of Duty: United Offensive](https://linuxgsm.com/servers/coduoserver/)
- [Call of Duty: World at War](https://linuxgsm.com/servers/codwawserver/)
- [Chivalry: Medieval Warfare](https://linuxgsm.com/servers/cmwserver/)
- [Codename CURE](https://linuxgsm.com/servers/ccserver/)
- [Colony Survival](https://linuxgsm.com/servers/colserver/)
- [Core Keeper](https://linuxgsm.com/servers/ckserver/)
- [Counter-Strike](https://linuxgsm.com/servers/csserver/)
- [Counter-Strike 2](https://linuxgsm.com/servers/cs2server/)
- [Counter-Strike: Condition Zero](https://linuxgsm.com/servers/csczserver/)
- [Counter-Strike: Global Offensive](https://linuxgsm.com/servers/csgoserver/)
- [Counter-Strike: Source](https://linuxgsm.com/servers/cssserver/)
- [Craftopia](https://linuxgsm.com/servers/craftopia/)
- [Day of Defeat](https://linuxgsm.com/servers/dodserver/)
- [Day of Defeat: Source](https://linuxgsm.com/servers/dodsserver/)
- [Day of Dragons](https://linuxgsm.com/servers/dodrserver/)
- [Day of Infamy](https://linuxgsm.com/servers/doiserver/)
- [DayZ](https://linuxgsm.com/servers/dayzserver/)
- [Deathmatch Classic](https://linuxgsm.com/servers/dmcserver/)
- [Don't Starve Together](https://linuxgsm.com/servers/dstserver/)
- [Double Action: Boogaloo](https://linuxgsm.com/servers/dabserver/)
- [Dystopia](https://linuxgsm.com/servers/dysserver/)
- [Eco](https://linuxgsm.com/servers/ecoserver/)
- [Empires Mod](https://linuxgsm.com/servers/emserver/)
- [ET: Legacy](https://linuxgsm.com/servers/etlserver/)
- [Euro Truck Simulator 2](https://linuxgsm.com/servers/ets2server/)
- [Factorio](https://linuxgsm.com/servers/fctrserver/)
- [Fistful of Frags](https://linuxgsm.com/servers/fofserver/)
- [Garry’s Mod](https://linuxgsm.com/servers/gmodserver/)
- [Half-Life 2: Deathmatch](https://linuxgsm.com/servers/hl2dmserver/)
- [Half-Life Deathmatch: Source](https://linuxgsm.com/servers/hldmsserver/)
- [Half-Life: Deathmatch](https://linuxgsm.com/servers/hldmserver/)
- [Humanitz](https://linuxgsm.com/servers/hzserver/)
- [Hurtworld](https://linuxgsm.com/servers/hwserver/)
- [HYPERCHARGE: Unboxed](https://linuxgsm.com/servers/hcuserver/)
- [Insurgency](https://linuxgsm.com/servers/insserver/)
- [Insurgency: Sandstorm](https://linuxgsm.com/servers/inssserver/)
- [IOSoccer](https://linuxgsm.com/servers/iosserver/)
- [Jedi Knight II: Jedi Outcast](https://linuxgsm.com/servers/jk2server/)
- [Just Cause 2](https://linuxgsm.com/servers/jc2server/)
- [Just Cause 3](https://linuxgsm.com/servers/jc3server/)
- [Killing Floor](https://linuxgsm.com/servers/kfserver/)
- [Killing Floor 2](https://linuxgsm.com/servers/kf2server/)
- [Left 4 Dead](https://linuxgsm.com/servers/l4dserver/)
- [Left 4 Dead 2](https://linuxgsm.com/servers/l4d2server/)
- [Medal of Honor: Allied Assault](https://linuxgsm.com/servers/mohaaserver/)
- [Memories of Mars](https://linuxgsm.com/servers/momserver/)
- [Minecraft: Bedrock Edition](https://linuxgsm.com/servers/mcbserver/)
- [Minecraft: Java Edition](https://linuxgsm.com/servers/mcserver/)
- [Mordhau](https://linuxgsm.com/servers/mhserver/)
- [Multi Theft Auto](https://linuxgsm.com/servers/mtaserver/)
- [Mumble](https://linuxgsm.com/servers/mumbleserver/)
- [Natural Selection](https://linuxgsm.com/servers/nsserver/)
- [Natural Selection 2](https://linuxgsm.com/servers/ns2server/)
- [Necesse](https://linuxgsm.com/servers/necserver/)
- [No More Room in Hell](https://linuxgsm.com/servers/nmrihserver/)
- [NS2: Combat](https://linuxgsm.com/servers/ns2cserver/)
- [Nuclear Dawn](https://linuxgsm.com/servers/ndserver/)
- [Onset](https://linuxgsm.com/servers/onsetserver/)
- [Operation: Harsh Doorstop](https://linuxgsm.com/servers/ohdserver/)
- [Opposing Force](https://linuxgsm.com/servers/opforserver/)
- [Palworld](https://linuxgsm.com/servers/pwserver/)
- [PaperMC](https://linuxgsm.com/servers/pmcserver/)
- [Pavlov VR](https://linuxgsm.com/servers/pvrserver/)
- [Pirates, Vikings, & Knights II](https://linuxgsm.com/servers/pvkiiserver/)
- [Project Cars](https://linuxgsm.com/servers/pcserver/)
- [Project CARS 2](https://linuxgsm.com/servers/pc2server/)
- [Project Zomboid](https://linuxgsm.com/servers/pzserver/)
- [Quake 2](https://linuxgsm.com/servers/q2server/)
- [Quake 3: Arena](https://linuxgsm.com/servers/q3server/)
- [Quake 4](https://linuxgsm.com/servers/q4server/)
- [Quake Live](https://linuxgsm.com/servers/qlserver/)
- [Quake World](https://linuxgsm.com/servers/qwserver/)
- [Red Orchestra: Ostfront 41-45](https://linuxgsm.com/servers/roserver/)
- [Return to Castle Wolfenstein](https://linuxgsm.com/servers/rtcwserver/)
- [Ricochet](https://linuxgsm.com/servers/ricochetserver/)
- [Rising World](https://linuxgsm.com/servers/rwserver/)
- [Rust](https://linuxgsm.com/servers/rustserver/)
- [San Andreas Multiplayer](https://linuxgsm.com/servers/sampserver/)
- [Satisfactory](https://linuxgsm.com/servers/sfserver/)
- [SCP: Secret Laboratory](https://linuxgsm.com/servers/scpslserver/)
- [SCP: Secret Laboratory ServerMod](https://linuxgsm.com/servers/scpslsmserver/)
- [Soldat](https://linuxgsm.com/servers/solserver/)
- [Soldier of Fortune 2: Double Helix Gold](https://linuxgsm.com/servers/sof2server/)
- [Soulmask](https://linuxgsm.com/servers/smserver/)
- [Source Forts Classic](https://linuxgsm.com/servers/sfcserver/)
- [Squad](https://linuxgsm.com/servers/squadserver/)
- [Squad 44](https://linuxgsm.com/servers/pstbsserver/)
- [Starbound](https://linuxgsm.com/servers/sbserver/)
- [Stationeers](https://linuxgsm.com/servers/stserver/)
- [StickyBots](https://linuxgsm.com/servers/sbotsserver/)
- [Survive the Nights](https://linuxgsm.com/servers/stnserver/)
- [Sven Co-op](https://linuxgsm.com/servers/svenserver/)
- [Team Fortress 2](https://linuxgsm.com/servers/tf2server/)
- [Team Fortress Classic](https://linuxgsm.com/servers/tfcserver/)
- [Teamspeak 3](https://linuxgsm.com/servers/ts3server/)
- [Teeworlds](https://linuxgsm.com/servers/twserver/)
- [Terraria](https://linuxgsm.com/servers/terrariaserver/)
- [The Front](https://linuxgsm.com/servers/tfserver/)
- [The Isle](https://linuxgsm.com/servers/tiserver/)
- [The Specialists](https://linuxgsm.com/servers/tsserver/)
- [Tower Unite](https://linuxgsm.com/servers/tuserver/)
- [Unreal Tournament](https://linuxgsm.com/servers/utserver/)
- [Unreal Tournament 2004](https://linuxgsm.com/servers/ut2k4server/)
- [Unreal Tournament 3](https://linuxgsm.com/servers/ut3server/)
- [Unreal Tournament 99](https://linuxgsm.com/servers/ut99server/)
- [Unturned](https://linuxgsm.com/servers/untserver/)
- [Valheim](https://linuxgsm.com/servers/vhserver/)
- [Vampire Slayer](https://linuxgsm.com/servers/vsserver/)
- [Velocity Proxy](https://linuxgsm.com/servers/vpmcserver/)
- [Vintage Story](https://linuxgsm.com/servers/vintsserver/)
- [Warfork](https://linuxgsm.com/servers/wfserver/)
- [WaterfallMC](https://linuxgsm.com/servers/wmcserver/)
- [Wolfenstein: Enemy Territory](https://linuxgsm.com/servers/wetserver/)
- [Wurm Unlimited](https://linuxgsm.com/servers/wurmserver/)
- [Xonotic](https://linuxgsm.com/servers/xntserver/)
- [Zombie Master: Reborn](https://linuxgsm.com/servers/zmrserver/)
- [Zombie Panic! Source](https://linuxgsm.com/servers/zpsserver/)

</details>

## Architecture

- Frontend: React + Vite (TypeScript) in `frontend/`
- Backend: Node.js + Express + WebSocket (TypeScript) in `backend/`
- Runtime: Docker-based game server management
- Database: SQLite (managed by backend bootstrap)

## Deployment

> **Deployment Model**  
> OVHcloud GamePanel is distributed as an **unmanaged** self-hosted solution, intended for teams operating their own infrastructure and runtime workflows.

Before starting:

- You need a Linux machine.
- You need your own domain name and you must point it to the public IP of your machine before installation.

If you still need infrastructure:

- Domain name: <https://www.ovhcloud.com/en-ie/domains/>
- VPS: <https://www.ovhcloud.com/en-ie/vps/>
- Dedicated server: <https://www.ovhcloud.com/en-ie/bare-metal/>

From your Linux shell, run:

```bash
curl -fsSL https://raw.github.com/ovh/game-panel/main/deploy/install.sh | sudo bash
```

During installation, you will be prompted for:

- Domain name
- Admin password
- Admin username (optional, default: `admin`)
- Let's Encrypt email

The installer automatically generates secure internal values such as the JWT secret.

Once the prompts are completed, wait a short moment while dependencies and containers are provisioned.
Your GamePanel will then be available at:

`https://<your-domain>`

## Update

From your Linux shell, update your current installation with:

```bash
sudo bash ./deploy/update.sh
```

If you need to update from a specific branch, use:

```bash
sudo GP_REPO_BRANCH="main" bash ./deploy/update.sh
```
