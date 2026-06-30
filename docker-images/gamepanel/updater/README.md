# 🔄 Game Panel Updater Docker Image

This directory contains the Game Panel Updater image used by OVHcloud Game Panel.

The updater is a Game Panel operational image. It is not a game server image. It is designed to run as a one-shot container that updates an installed panel.

## 🎯 Purpose

The updater image can:

- fetch a target Game Panel version from a Git tag;
- take a timestamped snapshot of the panel data, environment, and compose files before updating;
- synchronize application sources;
- run deploy migrations;
- rebuild and restart the Docker Compose stack;
- wait for the panel to become healthy before completing the update;
- capture its full run log to the host for troubleshooting;
- update the panel update job status in SQLite.

## 📦 Runtime requirements

The updater is expected to be launched with:

- the panel installation directory mounted into the container;
- the host Docker socket mounted at `/var/run/docker.sock`;
- environment variables describing the target version and update job.

Required inputs:

| Input | Purpose |
| --- | --- |
| `GP_UPDATE_JOB_ID` | Panel update job identifier. |
| `GP_UPDATE_VERSION` | Target application version. |
| `GP_UPDATE_FROM_VERSION` | Current application version, recorded in the backup manifest. |
| `GP_UPDATE_TAG` | Git tag to checkout. |
| `GP_UPDATE_REPO_URL` | Repository URL to fetch. |

Common optional inputs:

| Input | Purpose |
| --- | --- |
| `GP_APP_ROOT` | Panel installation root. Defaults to `/opt/gamepanel`. |
| `GP_COMPOSE_PROJECT_NAME` | Docker Compose project name. |
| `GP_UPDATER_IMAGE` | Updater image reference stored in panel configuration. |

## 📝 Notes

The updater modifies an existing panel installation and controls Docker Compose. It should be run only by trusted automation.
