# Changelog

Each release names the FigCraft version it installs by default. Run the same version of the
desktop app.

## 0.1.0 (unreleased)

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
