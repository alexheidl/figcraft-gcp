# Set up a FigCraft server with Claude

This file is a prompt for Claude (or another coding agent with a shell). To use it, tell your agent:

> Read https://raw.githubusercontent.com/alexheidl/figcraft-gcp/main/docs/setup-with-claude.md and
> follow it to set up a FigCraft server for me.

In Claude Code, inside a clone of this repository, you can also run `/setup`.

Everything below is addressed to the agent.

---

## Your job

Set up a private FigCraft collaboration server on Google Cloud for the person you're working with,
using this repository (`figcraft-gcp`). By the end:

- a deployment file describes their server
- the server is running, reachable only through IAP
- they can open the tunnel, start FigCraft, publish a file, and share it with their team

Work step by step, say what you're doing in plain words, and stop at the checkpoints marked
**Ask first**.

## Rules

- **Never read, print or store the server key.** It lives in Secret Manager. When the person needs
  it (to publish a file), give them the command to run in their own terminal.
- **Ask before anything that costs money or changes their cloud.** `bin/setup` creates billable
  resources (about $15 a month per server). Always show a dry run first and get a clear yes.
- **Never commit or upload the deployment file.** It holds their project and people's email
  addresses. Git already ignores `deployments/*.env`; don't change that.
- **Don't widen access.** Never grant the IAP role without the port condition, and never to
  `allUsers`, `allAuthenticatedUsers` or a whole `domain:`.
- **Don't guess values.** If something is unclear, ask.
- **Don't run `gcloud auth login` for them** if it needs a browser they can't see; ask them to run
  it.

## 1. Get the repository

If you aren't already in a clone, clone it:

```bash
git clone https://github.com/alexheidl/figcraft-gcp.git ~/figcraft-gcp && cd ~/figcraft-gcp
```

Read `README.md` and `deployments/example.env` before you go on. The README is the runbook; this
file only adds the conversation around it.

## 2. Check the tools

Run these and note what's missing. Don't install anything without asking.

| Check                | Command                                                             | Needed for                    |
| -------------------- | ------------------------------------------------------------------- | ----------------------------- |
| Google Cloud CLI     | `gcloud --version`                                                  | everything                    |
| Signed-in account    | `gcloud auth list --filter=status:ACTIVE --format='value(account)'` | everything                    |
| bash                 | `bash --version` (3.2 or newer)                                     | the scripts                   |
| Node.js 20+          | `node --version`                                                    | `bin/figcraft-connect`        |
| jq                   | `jq --version`                                                      | `bin/team-list`               |
| FigCraft app and CLI | `figcraft --version`, `figcraft-cli --version`                      | using the server, `team-list` |
| Operating system     | `uname -s`                                                          | the launcher is Linux-only    |

- **No gcloud:** point them to https://cloud.google.com/sdk/docs/install.
- **Not signed in:** ask them to run `gcloud auth login` themselves.
- **No FigCraft:** point them to https://github.com/storytold/figcraft. The server will run the same
  version as their app, so note the version.
- **Not on Linux:** the server can still be set up from macOS. They'll open the tunnel by hand or
  with another tool instead of `bin/figcraft-connect` (see the README's Connect section).

## 3. Ask the questions

**Ask first.** Ask these in one go, using your question tool if you have one. Offer the suggested
answer for each, so they can just confirm.

1. **A name for this server** (the deployment name, used as the file name).
   Suggest: their team or project name in lowercase, such as `design-team`.
2. **Google Cloud project:** an existing project ID, or should you help create a new one?
   Recommend a new project just for this server: access is granted on the whole project.
3. **Where:** which region and zone? Suggest one close to where most of the team works, for example
   `europe-west3` / `europe-west3-a` for Germany or `us-central1` / `us-central1-a` for the US.
4. **Who gets in:** the Google accounts of everyone who should open files, and which of them is the
   admin (gets SSH to the VM). Remind them: everyone listed sees and edits every shared file.
5. **Size:** `e2-small` (2 GB, about $15 a month, fine for files up to about 40 MiB) or bigger,
   such as `e2-medium` (4 GB)?
6. **FigCraft version:** use the version their app reports (from step 2) unless they say otherwise.
7. **Local port:** keep `47900` unless they already use it or run another FigCraft server.
   Everyone in the deployment uses the same one.
8. **Automation port:** keep FigCraft's automation port on (`CONTROL_PORT`, default 47800)? It's
   needed for `bin/team-list` and for agents like you to drive the app. Recommend on.
9. **Only if the project already holds another FigCraft server:** a `RESOURCE_PREFIX` for this one,
   and the network to use (`NETWORK`, default `default`).

Keep the VM name `figcraft` and the secret name `figcraft-server-key` unless the project already has
something with those names.

## 4. Check the project

With their answers, check the project before writing anything:

```bash
gcloud projects describe PROJECT --format='value(projectId,lifecycleState)'
gcloud billing projects describe PROJECT --format='value(billingEnabled)'
gcloud compute networks describe NETWORK --project=PROJECT --format='value(name,autoCreateSubnetworks)'
```

- **The project doesn't exist:** **Ask first**, then create it with
  `gcloud projects create PROJECT`. They have to link billing themselves (in the console, or with
  `gcloud billing projects link PROJECT --billing-account=…` if they give you the account).
- **Billing is off:** setup can't create a VM. Ask them to turn billing on.
- **The network is missing:** a new project gets `default` once the Compute Engine API is on. If
  it's still missing after `bin/setup` enables the API, ask them which network to use.
- **The network is custom-mode** (`autoCreateSubnetworks` is `False`): tell them, and ask whether to
  use it anyway. Setup expects an auto-mode network.

## 5. Write the deployment file

Copy `deployments/example.env` to `deployments/NAME.env` and fill in their answers. Keep the
comments. Then show them the file and ask them to confirm it.

Confirm git ignores it: `git check-ignore deployments/NAME.env` must print the path.

## 6. Dry run, then set up

1. Run `bin/setup --deployment NAME --dry-run`.
2. Summarise for them, in plain words, what it would create:
   - the VM, with no public address
   - the firewall rule, Cloud NAT and the snapshot schedule
   - tunnel access for each person, limited to port 47900
   - SSH for the admin
   - the secret for the server key
   - the cost
3. **Ask first:** get a clear yes.
4. Run `bin/setup --deployment NAME`. It takes a few minutes. Report each stage as it finishes. If
   it fails, read the error, explain it, and suggest the fix. Setup is safe to run again once
   that's fixed.

## 7. Connect and check

1. **Open the tunnel:**
   - **On Linux:** run `bin/install-launcher --deployment NAME` once, then
     `bin/figcraft-connect --deployment NAME`. It opens the tunnel and starts FigCraft.
   - **On GNOME:** they may prefer [IAP Tunnels for GNOME](https://github.com/alexheidl/gnome-iap-tunnels)
     (see the README).
   - **Elsewhere:**
     `gcloud compute start-iap-tunnel VM 47900 --local-host-port=localhost:LOCAL_PORT --zone=ZONE --project=PROJECT`
2. **Check the server answers:** `curl -s http://127.0.0.1:LOCAL_PORT/healthz` must print `ok`.
3. **Check the server is the same version as their app.** Use the README's "Health" command to read
   the log.

## 8. First file

Walk them through it; these steps happen in their FigCraft app and their terminal.

1. **Publish a file.** In FigCraft: **File ▸ Publish to server…**. For the address, they run this in
   their own terminal and paste the `ws://…?key=…` line:
   `gcloud secrets versions access latest --secret=SECRET --project=PROJECT`.
   Tell them it's a password: don't paste it into chats or issues.
2. **Get the file's id.** It's in the link FigCraft shows after publishing (`file=<id>`).
3. **Share it with the team:** `bin/team-list --deployment NAME <id>`. It must print
   `shared: true`.
4. **Tell everyone else what to do:**
   - install FigCraft (same version)
   - install `gcloud` and sign in with the account that was added
   - get the tunnel up
   - open the file from **Home ▸ Online ▸ Shared by your team**

## 9. Hand over

Finish with a short summary for them:

- the deployment name, project, zone and VM
- who has access, and how to add someone (README: "Add or remove a person")
- how to connect next time
- the cost, and how to stop paying: stop the VM, or delete the project
- where the runbook is: README sections Upgrade, Restore from a backup, Rotate the server key and
  Health
- the size limit: the server caps files at 64 MiB and needs about 30 times a file's size in memory
