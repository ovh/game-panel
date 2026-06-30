# 📡 Telemetry

OVHcloud Game Panel sends anonymous usage telemetry by default. The collected data helps guide development priorities and improve support for the most-used games.

## Sent on panel install / update

| Field | Description |
|---|---|
| `instanceId` | Identifier generated for this panel instance. |
| `instanceSecret` | Secret paired with the instance id, used to authenticate and de-duplicate instances. |
| `version` | Panel version being installed or updated. |
| `domain` | The domain configured for the panel. |
| `eventType` | `panel.updated` _(update only)_. |
| `at` | Event timestamp, UTC _(update only)_. |

## Sent when a game server is installed or uninstalled

| Field | Description |
|---|---|
| `instanceId` | Identifier of the panel instance. |
| `instanceSecret` | Secret paired with the instance id. |
| `eventType` | `game.installed` or `game.uninstalled`. |
| `provider` | Server provider: `ovhcloud`, `linuxgsm`, or `external`. |
| `catalogId` | Identifier of the game (which kind of server). |
| `dockerImage` | Image name — sent for the `external` provider only. |
| `at` | Event timestamp, UTC. |

## How to disable it

- **At install:** add `--telemetry-disabled` to the install command.
- **At any time:** set `TELEMETRY_ENABLED=false` in the panel environment (`.env`)
  and restart the stack.
