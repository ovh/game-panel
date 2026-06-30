Deploy migrations are optional shell scripts executed by the panel updater.

Use this directory for host/deployment changes that cannot be represented by
database migrations, such as adding runtime directories, changing generated
compose files, or adjusting host-side state.

Migration scripts must be idempotent. The updater records applied script names
in `/opt/gamepanel/data/deploy-migrations.applied`.
