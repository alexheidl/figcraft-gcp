# Contributing

Thanks for helping. Bug reports, fixes and documentation are all welcome.

## Before you open a pull request

1. **Run the tests:** `npm test`. They need Node.js 20 or newer and nothing else: every `gcloud`
   call is either a dry run or a stub, so no Google Cloud account is involved.
2. **Check the formatting:** `npx prettier@3 --check .` (tabs, 100 columns; see `.prettierrc.json`).
3. **Lint the scripts** if you have shellcheck:
   `shellcheck --severity=warning bin/* lib/*.sh server/provision.sh`. CI runs it too.
4. **Keep the scripts working on macOS's bash 3.2:** no `mapfile`, associative arrays, `${var,,}`
   or GNU `timeout`. A test checks for these. The launcher (`bin/figcraft-connect`,
   `bin/install-launcher`) is Linux-only.
5. **Try a change to `bin/setup` with `--dry-run`** and compare the `gcloud` commands before and
   after.

## Ground rules

- **Never commit a real deployment.** Git ignores `deployments/*.env` except the example; keep it
  that way. Tests use the made-up `test/fixtures/deployments/demo.env`.
- **Never print or log the server key,** and never put it in a file outside a private temporary
  folder.
- **Keep the server private.** Changes that add a public address or widen who can open a tunnel
  need a very good reason and a test.
- **Upgrading FigCraft:** change `FIGCRAFT_VERSION` in `deployments/example.env` and the fixture,
  and note it in `CHANGELOG.md`.

## Licence

By contributing, you agree that your contribution is licensed under MIT OR Apache-2.0, like the
rest of the project (see [README](README.md#licence)).
