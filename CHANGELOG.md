# Changelog

Each release names the FigCraft version it installs by default. Run the same version of the
desktop app.

## Unreleased

Supports FigCraft 0.18.1.

- `bin/figcraft-connect` caps the tunnel and app logs in `~/.cache/figcraft/<deployment>/`: each
  keeps its newest 1 MiB and moves the 1 MiB before that to `<name>.log.1`. Before, a tunnel that
  kept failing to sign in wrote one log of 130 MB. `FIGCRAFT_LOG_MAX_BYTES` changes the size.
- Installs FigCraft 0.18.1 by default (`deployments/example.env`). Upgrade the desktop apps to the
  same version.

## 0.1.2 (2026-11-10)

Supports FigCraft 0.17.0.

- `bin/install-launcher` writes `FIGCRAFT_DEPLOYMENTS` into the app-menu entry when your
  deployments live outside the checkout. Before, the menu entry couldn't find them.

## 0.1.1 (2026-11-10)

Supports FigCraft 0.17.0.

- `docs/setup-with-claude.md`: a prompt that has Claude ask for the details and set up a
  server, with a `/setup` command for Claude Code.

## 0.1.0 (2026-11-10)

Supports FigCraft 0.17.0.

- `bin/setup` creates a private FigCraft server on Google Cloud: a VM with no public address,
  reached only through IAP, with Cloud NAT, nightly backups, a daily disk snapshot and the server
  key in Secret Manager. `--dry-run` prints every `gcloud` command.
- Deployments: one settings file per server, so one checkout runs several.
- `bin/figcraft-connect` opens the tunnel and starts FigCraft (Linux). `bin/install-launcher` puts
  it in the app menu.
- `bin/team-list` puts a published file on the server's team list without showing the key.
- `bin/setup` and `bin/team-list` run on Linux and macOS.
- `RESOURCE_PREFIX` and `NETWORK` let several deployments share one GCP project.
- FigCraft's automation port (`CONTROL_PORT`, default 47800) can be turned off with
  `CONTROL_PORT=off`.
