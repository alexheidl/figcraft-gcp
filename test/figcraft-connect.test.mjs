import { test as nodeTest } from "node:test";

// The launcher is Linux-only (setsid, notify-send, .desktop files): its tests run only there.
const test = (name, fn) => nodeTest(name, { skip: process.platform !== "linux" }, fn);
import assert from "node:assert/strict";
import {
	mkdtempSync,
	mkdirSync,
	writeFileSync,
	readFileSync,
	existsSync,
	chmodSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const bin = join(dirname(fileURLToPath(import.meta.url)), "..", "bin");
const launcher = join(bin, "figcraft-connect");
const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "deployments");

// Stub commands log their argv to <log>/<name>.log; behaviour is steered by files in <state>.
function sandbox({
	account = "ada@example.com",
	healthy = "never-until-tunnel",
	appRunning = false,
	tokenValid = true,
	loginFixes = true,
} = {}) {
	const root = mkdtempSync(join(tmpdir(), "connect-"));
	const stubs = join(root, "bin");
	const home = join(root, "home");
	const log = join(root, "log");
	for (const d of [stubs, home, log]) mkdirSync(d);
	const stub = (name, body) => {
		const p = join(stubs, name);
		writeFileSync(p, `#!/bin/bash\necho "$*" >> "${log}/${name}.log"\n${body}\n`);
		chmodSync(p, 0o755);
	};
	stub(
		"gcloud",
		`
case "$*" in
  *"auth list"*) ${account ? `echo "${account}"` : "true"} ;;
  *print-access-token*) [ -e "${root}/token-ok" ] && echo token && exit 0; exit 1 ;;
  *"auth login"*) ${loginFixes ? `touch "${root}/token-ok"` : "true"} ;;
  *start-iap-tunnel*) touch "${root}/tunnel-up"; exec sleep 0 ;;
esac`,
	);
	const health = {
		"never-until-tunnel": `[ -e "${root}/tunnel-up" ] && echo ok && exit 0; exit 7`,
		always: "echo ok",
	}[healthy];
	stub("curl", health);
	stub("pgrep", appRunning ? "exit 0" : "exit 1");
	stub("figcraft", "exit 0");
	stub("notify-send", "exit 0");
	if (tokenValid) writeFileSync(join(root, "token-ok"), "");
	stub("sleep", "exit 0");
	const run = (args = [], env = {}) =>
		spawnSync("/bin/bash", [launcher, ...args], {
			encoding: "utf8",
			env: {
				HOME: home,
				PATH: `${stubs}:${dirname(process.execPath)}:/usr/bin:/bin`,
				FIGCRAFT_CONNECT_NO_DETACH: "1",
				FIGCRAFT_DEPLOYMENTS: fixtures,
				...env,
			},
		});
	const logOf = (name) =>
		existsSync(join(log, `${name}.log`)) ? readFileSync(join(log, `${name}.log`), "utf8") : "";
	return { root, home, run, logOf };
}

test("starts the tunnel and the app when neither runs", () => {
	const s = sandbox();
	const r = s.run();
	assert.equal(r.status, 0, r.stderr + r.stdout);
	const tunnels = s
		.logOf("gcloud")
		.split("\n")
		.filter((l) => l.includes("start-iap-tunnel"));
	assert.equal(tunnels.length, 1);
	assert.match(
		tunnels[0],
		/figcraft 47900 --local-host-port=localhost:47900 --zone=europe-west3-a --project=my-figcraft-project/,
	);
	assert.match(s.logOf("figcraft"), /--control 47800/);
	// Automation roots switch off every network feature in FigCraft (publish, live sessions).
	assert.doesNotMatch(s.logOf("figcraft"), /--automation-/);
	assert.match(r.stdout, /ws:\/\/127\.0\.0\.1:47900\//);
});

test("restarts a dead tunnel and does not duplicate a live one", () => {
	const live = sandbox({ healthy: "always", appRunning: true });
	assert.equal(live.run().status, 0);
	assert.doesNotMatch(live.logOf("gcloud"), /start-iap-tunnel/);
	assert.equal(live.logOf("figcraft"), "", "app already running: not started again");

	const dead = sandbox();
	mkdirSync(join(dead.home, ".cache", "figcraft", "demo"), {
		recursive: true,
	});
	writeFileSync(join(dead.home, ".cache", "figcraft", "demo", "tunnel.pid"), "999999\n");
	assert.equal(dead.run().status, 0);
	assert.equal(
		dead
			.logOf("gcloud")
			.split("\n")
			.filter((l) => l.includes("start-iap-tunnel")).length,
		1,
	);
	assert.notEqual(
		readFileSync(join(dead.home, ".cache", "figcraft", "demo", "tunnel.pid"), "utf8").trim(),
		"999999",
	);
});

test("names the active account when it is not allowed", () => {
	const s = sandbox({ account: "someone@gmail.com" });
	const r = s.run();
	assert.equal(r.status, 3);
	assert.match(r.stdout + r.stderr, /someone@gmail\.com/);
	assert.match(r.stdout + r.stderr, /ada@example\.com/);
	assert.doesNotMatch(s.logOf("gcloud"), /start-iap-tunnel/);
});

test("logs in when no account is active", () => {
	const s = sandbox({ account: "" });
	s.run();
	assert.match(s.logOf("gcloud"), /auth login/);
});

test("install-launcher points the app menu entry at figcraft-connect", () => {
	const s = sandbox();
	const r = spawnSync("/bin/bash", [join(bin, "install-launcher")], {
		encoding: "utf8",
		env: {
			HOME: s.home,
			PATH: `${join(s.root, "bin")}:${dirname(process.execPath)}:/usr/bin:/bin`,
			FIGCRAFT_DEPLOYMENTS: fixtures,
		},
	});
	assert.equal(r.status, 0, r.stderr);
	const entry = readFileSync(
		join(s.home, ".local", "share", "applications", "ai.storyteller.figcraft.desktop"),
		"utf8",
	);
	const esc = (x) => x.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
	// The fixtures folder isn't this checkout's deployments/, so the entry carries it along.
	assert.match(
		entry,
		new RegExp(
			`^Exec=env "FIGCRAFT_DEPLOYMENTS=${esc(fixtures)}" "${esc(launcher)}" --deployment demo %U$`,
			"m",
		),
	);
	assert.match(entry, /^Name=FigCraft$/m);

	// Started the way the menu starts it, without FIGCRAFT_DEPLOYMENTS in the environment, it works.
	const exec = entry.match(/^Exec=(.*) %U$/m)[1];
	const started = spawnSync("/bin/bash", ["-c", exec], {
		encoding: "utf8",
		env: {
			HOME: s.home,
			PATH: `${join(s.root, "bin")}:${dirname(process.execPath)}:/usr/bin:/bin`,
			FIGCRAFT_CONNECT_NO_DETACH: "1",
		},
	});
	assert.equal(started.status, 0, started.stderr + started.stdout);
	assert.match(s.logOf("gcloud"), /start-iap-tunnel figcraft 47900/);
});

test("points FigCraft sharing at our server before starting the app", () => {
	const s = sandbox();
	const config = join(s.home, ".config", "FigCraft");
	mkdirSync(config, { recursive: true });
	writeFileSync(
		join(config, "state.json"),
		JSON.stringify({
			prefs: { publish_server: "wss://collab.craftapps.dev/", theme: "system" },
		}),
	);
	assert.equal(s.run().status, 0);
	const state = JSON.parse(readFileSync(join(config, "state.json"), "utf8"));
	assert.equal(state.prefs.publish_server, "ws://127.0.0.1:47900/");
	assert.equal(state.prefs.theme, "system", "other preferences are kept");
	assert.equal(state.prefs.user_name, "Ada", "comments are signed with the Google account name");
});

test("leaves FigCraft settings alone while the app is running", () => {
	const s = sandbox({ healthy: "always", appRunning: true });
	const config = join(s.home, ".config", "FigCraft");
	mkdirSync(config, { recursive: true });
	writeFileSync(
		join(config, "state.json"),
		JSON.stringify({
			prefs: { publish_server: "wss://collab.craftapps.dev/" },
		}),
	);
	assert.equal(s.run().status, 0);
	assert.equal(
		JSON.parse(readFileSync(join(config, "state.json"), "utf8")).prefs.publish_server,
		"wss://collab.craftapps.dev/",
	);
});

test("asks for a new Google login when the session has expired", () => {
	const s = sandbox({ tokenValid: false });
	const r = s.run();
	assert.equal(r.status, 0, r.stderr + r.stdout);
	assert.match(s.logOf("gcloud"), /auth login/);
	assert.match(s.logOf("gcloud"), /start-iap-tunnel/);
});

test("stops, and says so on screen, when the login stays expired", () => {
	const s = sandbox({ tokenValid: false, loginFixes: false });
	const r = s.run();
	assert.equal(r.status, 4);
	assert.doesNotMatch(s.logOf("gcloud"), /start-iap-tunnel/);
	assert.match(s.logOf("notify-send"), /gcloud auth login/);
});

test("shows failures on screen, not only in a terminal nobody sees", () => {
	const s = sandbox({ account: "someone@gmail.com" });
	assert.equal(s.run().status, 3);
	assert.match(s.logOf("notify-send"), /someone@gmail\.com/);
});

test("writes the server setting on a first run, before FigCraft ever saved its settings", () => {
	const s = sandbox();
	assert.equal(s.run().status, 0);
	const state = JSON.parse(readFileSync(join(s.home, ".config", "FigCraft", "state.json"), "utf8"));
	assert.equal(state.prefs.publish_server, "ws://127.0.0.1:47900/");
	assert.equal(state.prefs.user_name, "Ada");
});

test("another deployment gets its own project, accounts and local port", () => {
	const dir = mkdtempSync(join(tmpdir(), "deployments-"));
	writeFileSync(
		join(dir, "other.env"),
		[
			"PROJECT=other-project",
			"REGION=europe-west3",
			"ZONE=europe-west3-a",
			"VM=figcraft-other",
			'MEMBERS="sam@example.com"',
			"ADMIN=sam@example.com",
			"SECRET=other-key",
			"FIGCRAFT_VERSION=0.17.0",
			"LOCAL_PORT=47901",
		].join("\n"),
	);
	const s = sandbox({ account: "sam@example.com" });
	const r = s.run(["--deployment", "other"], { FIGCRAFT_DEPLOYMENTS: dir });
	assert.equal(r.status, 0, r.stderr + r.stdout);
	assert.match(
		s.logOf("gcloud"),
		/start-iap-tunnel figcraft-other 47900 --local-host-port=localhost:47901 --zone=europe-west3-a --project=other-project/,
	);
	assert.match(r.stdout, /ws:\/\/127\.0\.0\.1:47901\//);
});

test("off Linux, the launcher explains how to connect instead of failing halfway", () => {
	const s = sandbox();
	writeFileSync(join(s.root, "bin", "uname"), "#!/bin/bash\necho Darwin\n");
	chmodSync(join(s.root, "bin", "uname"), 0o755);
	const r = s.run();
	assert.equal(r.status, 5);
	assert.match(r.stderr, /Linux only/);
	assert.match(r.stderr, /start-iap-tunnel figcraft 47900 --local-host-port=localhost:47900/);
	assert.doesNotMatch(s.logOf("gcloud"), /start-iap-tunnel/);
});

test("CONTROL_PORT=off starts FigCraft without its automation port", () => {
	const dir = mkdtempSync(join(tmpdir(), "deployments-"));
	writeFileSync(
		join(dir, "quiet.env"),
		readFileSync(join(fixtures, "demo.env"), "utf8") + "\nCONTROL_PORT=off\n",
	);
	const s = sandbox();
	const r = s.run([], { FIGCRAFT_DEPLOYMENTS: dir });
	assert.equal(r.status, 0, r.stderr + r.stdout);
	assert.match(s.logOf("figcraft"), /^\s*$/m);
	assert.doesNotMatch(s.logOf("figcraft"), /--control/);
});
