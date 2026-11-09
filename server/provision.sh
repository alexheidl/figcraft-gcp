#!/usr/bin/env bash
# Runs ON the VM (as root), copied there by bin/setup with server.toml and iap.conf in /tmp.
#
#   sudo bash /tmp/provision.sh 0.17.0
#
# Installs figcraft-server from the release (checksum verified), with the release's own hardened
# systemd unit and nightly backup timer, plus our drop-in that admits IAP's range. Safe to re-run:
# it is also how the server is upgraded (pass the new version).
set -euo pipefail

VERSION="${1:?usage: provision.sh VERSION}"
ARCH="$(uname -m)"
NAME="figcraft-server-$VERSION-linux-$ARCH"
BASE="https://github.com/storytold/figcraft/releases/download/v$VERSION"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cd "$work"
curl -fsSLO "$BASE/$NAME.tar.gz"
curl -fsSLO "$BASE/SHA256SUMS.txt"
grep " $NAME.tar.gz\$" SHA256SUMS.txt | sha256sum -c -
tar xzf "$NAME.tar.gz"

id -u figcraft >/dev/null 2>&1 || useradd --system --home-dir /var/lib/figcraft-server --shell /usr/sbin/nologin figcraft
install -d -o figcraft -g figcraft -m 700 /var/lib/figcraft-server
install -d -m 755 /etc/figcraft-server /etc/systemd/system/figcraft-server.service.d
install -m 755 "$NAME/figcraft-server" /usr/local/bin/figcraft-server
install -m 644 /tmp/server.toml /etc/figcraft-server/server.toml
install -m 644 "$NAME/figcraft-server.service" "$NAME/figcraft-backup.service" "$NAME/figcraft-backup.timer" /etc/systemd/system/
install -m 644 /tmp/iap.conf /etc/systemd/system/figcraft-server.service.d/iap.conf

sudo -u figcraft /usr/local/bin/figcraft-server check --config /etc/figcraft-server/server.toml

systemctl daemon-reload
systemctl enable --quiet figcraft-server
systemctl restart figcraft-server
systemctl enable --now --quiet figcraft-backup.timer

for _ in $(seq 1 20); do
	curl -fsS http://127.0.0.1:47900/healthz && echo && exit 0
	sleep 1
done
echo "figcraft-server did not answer /healthz; see: journalctl -u figcraft-server" >&2
exit 1
