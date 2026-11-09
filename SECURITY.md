# Security

## Reporting a problem

Please report security problems privately, not in a public issue:

- **On GitHub:** open the repository's **Security** tab and choose **Report a vulnerability**.
- Say what you found, how to reproduce it, and what it lets someone do.

You'll get an answer within a week. Fixes are released as soon as they're ready, and the report is
credited in the changelog unless you'd rather not be named.

## What this project protects, and how

The goal: only the people in a deployment's `MEMBERS` can reach its FigCraft server, and only
someone with the server key can publish files or manage links.

- **No public address.** The VM is created with `--no-address`. Outgoing traffic (installing the
  release) goes through Cloud NAT.
- **Google login at the door.** People reach the server only through IAP TCP forwarding. The
  firewall admits only IAP's range, `35.235.240.0/20`, and only on ports 22 and 47900.
- **Narrow tunnel permission.** The IAP role is granted per person, with a condition that limits it
  to port 47900. The tests fail if setup ever grants it to `allUsers`, `allAuthenticatedUsers` or a
  whole `domain:`.
- **SSH only for the admin,** through OS Login.
- **The server key stays in Secret Manager.** Setup moves it there straight from the VM, and
  `bin/team-list` reads it into a private temporary file that is deleted afterwards. No script
  prints it.
- **Verified downloads.** `server/provision.sh` installs a pinned FigCraft release and checks it
  against the release's `SHA256SUMS.txt`.
- **The release's hardened systemd unit,** plus a drop-in that only adds IAP's range to
  `IPAddressAllow`.

## What it doesn't protect

- **Everyone in a deployment sees and edits every file on its team list.** FigCraft has no user
  accounts. Give people who shouldn't see each other's files separate deployments.
- **Deployments that share a GCP project can reach each other's VMs,** because the tunnel
  permission is granted on the whole project. Use one project per deployment unless the same people
  use all of them.
- **Share links and join codes are passwords.** Anyone who gets one, and can also open a tunnel,
  can use it.
- **The FigCraft server itself** is FigCraft's code. Report problems in it to the
  [FigCraft project](https://github.com/storytold/figcraft).
