import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const setup = join(root, "bin", "setup");
const server = (f) => join(root, "server", f);
const fixtures = join(root, "test", "fixtures", "deployments");
const dry = (args = [], env = {}) => {
	const r = spawnSync("bash", [setup, "--dry-run", ...args], {
		encoding: "utf8",
		env: { ...process.env, FIGCRAFT_DEPLOYMENTS: fixtures, ...env },
	});
	assert.equal(r.status, 0, r.stderr);
	return r.stdout;
};

test("dry run creates a private VM reachable only through IAP", () => {
	const out = dry();
	for (const flag of [
		"--no-address",
		"--zone=europe-west3-a",
		"--machine-type=e2-small",
		"--source-ranges=35.235.240.0/20",
		"--rules=tcp:22,tcp:47900",
		"--action=ALLOW",
		"--max-retention-days=7",
		"--tunnel-through-iap",
		"--metadata=enable-oslogin=TRUE",
		"--project=my-figcraft-project",
	]) {
		assert.ok(out.includes(flag), `missing ${flag}`);
	}
});

test("dry run grants IAP tunnel access to the deployment's members only", () => {
	const lines = dry()
		.split("\n")
		.filter((l) => l.includes("roles/iap.tunnelResourceAccessor"));
	assert.equal(lines.length, 2);
	assert.ok(lines.some((l) => l.includes("--member=user:ada@example.com")));
	assert.ok(lines.some((l) => l.includes("--member=user:grace@example.com")));
	for (const l of lines) {
		assert.match(
			l,
			/projects add-iam-policy-binding my-figcraft-project/,
			"IAP TCP roles bind at project level",
		);
		assert.match(
			l,
			/--condition=expression=destination\.port == 47900,title=figcraft-tunnel-only/,
			"scoped to the FigCraft port",
		);
	}
});

test("dry run never opens the server to everyone", () => {
	const out = dry();
	for (const forbidden of ["allUsers", "allAuthenticatedUsers", "domain:", "0.0.0.0/0"]) {
		assert.ok(!out.includes(forbidden), `found ${forbidden}`);
	}
});

test("dry run runs nothing", () => {
	const r = spawnSync("/bin/bash", [setup, "--dry-run"], {
		encoding: "utf8",
		env: {
			...process.env,
			PATH: "/nonexistent",
			FIGCRAFT_DEPLOYMENTS: fixtures,
		},
	});
	assert.equal(r.status, 0, "dry run must not need gcloud on PATH");
});

test("provisioning verifies the release checksum and pins the version", () => {
	const provision = readFileSync(server("provision.sh"), "utf8");
	assert.match(provision, /sha256sum -c/);
	assert.match(
		readFileSync(join(root, "deployments", "example.env"), "utf8"),
		/^FIGCRAFT_VERSION=0\.17\.0$/m,
	);
});

test("server config points share links at the local tunnel port of the deployment", () => {
	const toml = readFileSync(server("server.toml"), "utf8");
	assert.match(toml, /^public_url = "ws:\/\/127\.0\.0\.1:@LOCAL_PORT@\/"$/m);
	assert.match(toml, /^open_publish = false$/m);
});

test("server config keeps the team list on, with edit access", () => {
	const toml = readFileSync(server("server.toml"), "utf8");
	assert.match(toml, /^team_files = "edit"$/m);
});

test("scripts parse", () => {
	for (const f of [
		"bin/setup",
		"bin/figcraft-connect",
		"bin/install-launcher",
		"bin/team-list",
		"server/provision.sh",
		"lib/deployment.sh",
	]) {
		const r = spawnSync("bash", ["-n", join(root, f)], { encoding: "utf8" });
		assert.equal(r.status, 0, `${f}: ${r.stderr}`);
	}
});

test("the systemd drop-in admits IAP on top of the release unit", () => {
	const dropIn = readFileSync(server("iap.conf"), "utf8");
	assert.match(dropIn, /^\[Service\]$/m);
	assert.match(dropIn, /^IPAddressAllow=localhost 35\.235\.240\.0\/20$/m);
	assert.match(
		readFileSync(server("provision.sh"), "utf8"),
		/figcraft-server\.service\.d\/iap\.conf/,
	);
});

test("the runbook grants tunnel access the way setup.sh does: project-level, port 47900 only", () => {
	const readme = readFileSync(join(root, "README.md"), "utf8");
	const section = readme.split("## Add or remove a person")[1].split("\n## ")[0];
	assert.match(section, /projects add-iam-policy-binding "\$PROJECT"/);
	assert.match(section, /projects remove-iam-policy-binding "\$PROJECT"/);
	assert.match(
		section,
		/--condition=expression=destination\.port == 47900,title=figcraft-tunnel-only/,
	);
	assert.doesNotMatch(section, /compute instances add-iam-policy-binding/);
});

const otherDeployment = (extra = []) => {
	const dir = mkdtempSync(join(tmpdir(), "deployments-"));
	const lines = [
		"PROJECT=other-project",
		"REGION=europe-west3",
		"ZONE=europe-west3-a",
		"VM=figcraft-other",
		'MEMBERS="sam@example.com kim@example.com"',
		"ADMIN=sam@example.com",
		"SECRET=other-key",
		"FIGCRAFT_VERSION=0.17.0",
		"LOCAL_PORT=47901",
		...extra,
	];
	writeFileSync(join(dir, "other.env"), lines.join("\n"));
	return dir;
};

test("another deployment sets up its own project, VM and people", () => {
	const out = dry(["--deployment", "other"], {
		FIGCRAFT_DEPLOYMENTS: otherDeployment(["MACHINE_TYPE=e2-medium"]),
	});
	assert.match(
		out,
		/--project=other-project compute instances create figcraft-other --zone=europe-west3-a/,
	);
	assert.match(out, /--machine-type=e2-medium/);
	assert.match(out, /--member=user:sam@example\.com/);
	assert.match(out, /--member=user:kim@example\.com/);
	assert.doesNotMatch(out, /my-figcraft-project|ada@example\.com/);
	assert.match(out, /secrets create other-key/);
});

test("with several deployments, setup asks which one", () => {
	const dir = otherDeployment();
	writeFileSync(join(dir, "second.env"), "PROJECT=x\n");
	const r = spawnSync("bash", [setup, "--dry-run"], {
		encoding: "utf8",
		env: { ...process.env, FIGCRAFT_DEPLOYMENTS: dir },
	});
	assert.equal(r.status, 2);
	assert.match(r.stderr, /--deployment NAME/);
	assert.match(r.stderr, /other/);
	assert.match(r.stderr, /second/);
});

test("a deployment missing a setting is refused, naming the setting", () => {
	const dir = mkdtempSync(join(tmpdir(), "deployments-"));
	writeFileSync(join(dir, "broken.env"), "PROJECT=x\nREGION=y\n");
	const r = spawnSync("bash", [setup, "--dry-run"], {
		encoding: "utf8",
		env: { ...process.env, FIGCRAFT_DEPLOYMENTS: dir },
	});
	assert.equal(r.status, 2);
	assert.match(r.stderr, /doesn't set ZONE/);
});

test("a real run copies server.toml with the deployment's local port filled in", () => {
	const root2 = mkdtempSync(join(tmpdir(), "setup-"));
	const stubs = join(root2, "bin");
	const copied = join(root2, "copied");
	mkdirSync(stubs);
	mkdirSync(copied);
	// gcloud says every resource exists; scp copies the staged files so the test can read them.
	writeFileSync(
		join(stubs, "gcloud"),
		`#!/bin/bash\nif [[ " $* " == *" compute scp "* ]]; then for a in "$@"; do [[ -f $a ]] && cp "$a" "${copied}/"; done; fi\nexit 0\n`,
	);
	chmodSync(join(stubs, "gcloud"), 0o755);
	writeFileSync(join(stubs, "sleep"), "#!/bin/bash\nexit 0\n");
	chmodSync(join(stubs, "sleep"), 0o755);
	const r = spawnSync("bash", [setup, "--deployment", "other"], {
		encoding: "utf8",
		env: {
			...process.env,
			PATH: `${stubs}:/usr/bin:/bin`,
			FIGCRAFT_DEPLOYMENTS: otherDeployment(),
		},
	});
	assert.equal(r.status, 0, r.stderr + r.stdout);
	const toml = readFileSync(join(copied, "server.toml"), "utf8");
	assert.match(toml, /^public_url = "ws:\/\/127\.0\.0\.1:47901\/"$/m);
	assert.doesNotMatch(toml, /@LOCAL_PORT@/);
});

test("the example deployment is never picked on its own", () => {
	const dir = mkdtempSync(join(tmpdir(), "deployments-"));
	writeFileSync(join(dir, "example.env"), readFileSync(join(root, "deployments", "example.env")));
	const r = spawnSync("bash", [setup, "--dry-run"], {
		encoding: "utf8",
		env: { ...process.env, FIGCRAFT_DEPLOYMENTS: dir },
	});
	assert.equal(r.status, 2);
	assert.match(r.stderr, /There are: none/);
});

test("the example deployment is complete: a copy of it sets up", () => {
	const dir = mkdtempSync(join(tmpdir(), "deployments-"));
	writeFileSync(join(dir, "mine.env"), readFileSync(join(root, "deployments", "example.env")));
	const out = dry([], { FIGCRAFT_DEPLOYMENTS: dir });
	assert.match(out, /--project=my-figcraft-project/);
});
