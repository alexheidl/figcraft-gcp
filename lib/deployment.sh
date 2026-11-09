# Sourced by the scripts in bin/. Loads one deployment's settings from deployments/<name>.env.
# Written for bash 3.2 (macOS) and newer: no mapfile, associative arrays or ${var,,}.
#
# Pick the deployment with --deployment NAME (or FIGCRAFT_DEPLOYMENT=NAME). With only one deployment,
# it is used without asking. deployments/example.env is never picked on its own.
# Keep your deployments in deployments/ (git ignores them) or in any folder: FIGCRAFT_DEPLOYMENTS=DIR.

# The variables set here are read by the scripts that source this file.
# shellcheck disable=SC2034
FIGCRAFT_ROOT="$(cd "${BASH_SOURCE[0]%/*}/.." && pwd)"
FIGCRAFT_DEPLOYMENTS="${FIGCRAFT_DEPLOYMENTS:-$FIGCRAFT_ROOT/deployments}"

# FigCraft's own port on the VM. The firewall rule, the IAP condition and server.toml all use it.
SERVER_PORT=47900

# Takes --deployment NAME out of the arguments; what is left is in ARGS.
take_deployment_flag() {
	ARGS=()
	while (($#)); do
		case $1 in
		--deployment)
			FIGCRAFT_DEPLOYMENT="${2:?--deployment needs a name}"
			shift 2
			;;
		--deployment=*)
			FIGCRAFT_DEPLOYMENT="${1#*=}"
			shift
			;;
		*)
			ARGS+=("$1")
			shift
			;;
		esac
	done
}

deployment_names() {
	local f
	for f in "$FIGCRAFT_DEPLOYMENTS"/*.env; do
		[[ -f $f ]] || continue
		f="${f##*/}"
		[[ $f == example.env ]] && continue
		echo "${f%.env}"
	done
}

# Sets DEPLOYMENT and every variable from its file, or explains what is missing and returns 2.
load_deployment() {
	local name="${FIGCRAFT_DEPLOYMENT:-}"
	if [[ -z $name ]]; then
		local names=() n
		while IFS= read -r n; do names+=("$n"); done < <(deployment_names)
		if ((${#names[@]} == 1)); then
			name="${names[0]}"
		else
			echo "Name a deployment with --deployment NAME. There are: ${names[*]:-none}" >&2
			return 2
		fi
	fi
	local file="$FIGCRAFT_DEPLOYMENTS/$name.env"
	if [[ ! -f $file ]]; then
		echo "There is no deployment called $name ($file)." >&2
		return 2
	fi
	# shellcheck source=/dev/null
	source "$file"
	local v
	for v in PROJECT REGION ZONE VM MEMBERS ADMIN SECRET FIGCRAFT_VERSION LOCAL_PORT; do
		if [[ -z ${!v:-} ]]; then
			echo "$file doesn't set $v." >&2
			return 2
		fi
	done
	MACHINE_TYPE="${MACHINE_TYPE:-e2-small}"
	CONTROL_PORT="${CONTROL_PORT:-47800}"
	DEPLOYMENT="$name"
}
