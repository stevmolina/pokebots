// End-to-end check of the update from the app on a VPS (docs/docker.md#updates-from-the-app-on-a-vps-pokebots).
// It runs the real `docker/vps-update/openbot-vps-update` as root in an Ubuntu container, with a
// stand-in `docker` command that keeps images, tags and one OpenBot container as files. A loop in that
// container acts as `openbot-vps-update.path`. The real `HostedUpdateAdapter` of the app runs here
// and talks to the script only through the request and status folders, as the container app does.
//
// It checks that:
// - the bash rule (`newer_build`) and the app rule (`isNewerServerBuild`) give the same answers;
// - `stage` writes the version, commit and time of a newer build, and nothing for an older one;
// - the app offers the staged build as "0.73.0+<commit>", and never an older build;
// - an install request backs up the data, moves openbot-vps:current and makes the container again;
// - an image that does not come back is rolled back to the old image and the old data;
// - an install request with nothing newer only restarts the container;
// - only the newest backups stay.
//
//   bun scripts/vps-update-e2e.ts
//
// It needs Docker and the image ubuntu:24.04. The report is `.openbot-build/vps-update-e2e/report.json`.

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  HostedUpdateAdapter,
  isNewerServerBuild,
  parseStagedBuild,
  type ServerImageBuild,
  serverBuildVersion,
  serverImageBuild,
} from "../src/main/hosted-update-adapter";

const root = resolve(import.meta.dirname, "..");
const reportRoot = join(root, ".openbot-build", "vps-update-e2e");
const work = join(reportRoot, "work");
const fake = join(work, "fake");
const container = `vps-update-e2e-${randomBytes(4).toString("hex")}`;
const results: Array<{ name: string; ok: boolean; detail: string }> = [];

const OLD = { id: "sha256:aaaa", labels: "0.73.0-custom|5dfb288b7|2026-11-26T02:29:12Z" };
const NEW = { id: "sha256:bbbb", labels: "0.73.0-custom|9c41d2e07|2026-11-26T19:04:00Z" };
const OLDER = { id: "sha256:cccc", labels: "0.73.0-custom|1503cf943|2026-11-18T01:30:00Z" };
const BROKEN = { id: "sha256:dddd", labels: "0.73.0-custom|e0e0e0e0e|2026-11-27T08:00:00Z" };
const NEXT = { id: "sha256:eeee", labels: "0.74.0-custom|f1f1f1f1f|2026-11-28T08:00:00Z" };

function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  process.stdout.write(`${ok ? "pass" : "FAIL"} ${name}: ${detail}\n`);
}

function run(command: string, args: string[], input?: string) {
  const result = spawnSync(command, args, { encoding: "utf8", input, maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

/** A command as root in the Ubuntu container, with the settings of the script. */
function shell(command: string) {
  return run("docker", ["exec", "--interactive", container, "bash", "-euo", "pipefail", "-c", command]);
}

function script(...args: string[]) {
  return shell(`OPENBOT_VPS_UPDATE_CONFIG=/work/env /opt/vps-update/openbot-vps-update ${args.join(" ")}`);
}

const read = (path: string) =>
  readFile(path, "utf8").then(
    (text) => text.trim(),
    () => "",
  );

/** The stand-in for `docker`: images, tags and one container, as files in /work/fake. */
const FAKE_DOCKER = String.raw`#!/bin/bash
F=/work/fake
echo "$*" >>"$F/log"
tagfile() { echo "$F/tags/$(printf '%s' "$1" | tr '/:' '__')"; }
resolve() {
  if [ -f "$F/images/$1" ]; then echo "$1"; return 0; fi
  if [ "$1" = openbot-openbot-1 ] && [ -f "$F/container" ]; then cat "$F/container"; return 0; fi
  local t; t=$(tagfile "$1")
  if [ -f "$t" ]; then cat "$t"; return 0; fi
  return 1
}
for last; do :; done
case "$1" in
  pull) cp "$F/registry" "$(tagfile "$last")" ;;
  image)
    case "$2" in
      inspect) resolve "$last" || exit 1 ;;
      rm) echo "$3" >>"$F/removed" ;;
    esac ;;
  inspect)
    case "$3" in
      *Labels*) id=$(resolve "$4") || exit 1; cat "$F/images/$id" ;;
      *State.Running*) cat "$F/running" ;;
      *Mounts*) echo /work/data ;;
      *Image*) [ -f "$F/container" ] || exit 1; cat "$F/container" ;;
    esac ;;
  exec)
    [ "$(cat "$F/running")" = true ] || exit 1
    id=$(cat "$F/container")
    server=online
    if grep -qxF "$id" "$F/offline-images" 2>/dev/null; then server=offline; fi
    printf 'version=%s\nserver=%s\n' "$(cut -d'|' -f1 "$F/images/$id" | sed 's/-custom$//')" "$server" ;;
  tag) id=$(resolve "$2") || exit 1; echo "$id" >"$(tagfile "$3")" ;;
  stop) echo false >"$F/running" ;;
  start|restart) echo true >"$F/running" ;;
  compose)
    case "$2" in
      config) echo openbot-vps:current ;;
      up)
        cat "$(tagfile openbot-vps:current)" >"$F/container"
        echo true >"$F/running"
        # A new version changes its data when it starts, as a migration does.
        if grep -qxF "$(cat "$F/container")" "$F/offline-images" 2>/dev/null; then echo migrated >/work/data/marker; fi ;;
    esac ;;
  info) echo "[name=seccomp]" ;;
esac
`;

async function setRegistry(image: { id: string }): Promise<void> {
  await writeFile(join(fake, "registry"), `${image.id}\n`);
}

async function fakeLog(): Promise<string[]> {
  return (await read(join(fake, "log"))).split("\n").filter(Boolean);
}

async function waitFor(what: string, test: () => Promise<boolean>, limitMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + limitMs;
  while (Date.now() < deadline) {
    if (await test()) return true;
    await delay(200);
  }
  process.stdout.write(`timed out waiting for ${what}\n`);
  return false;
}

/** The bash rule, from the real script: one line of six fields for each case. */
function bashRule(cases: string[][]): boolean[] {
  const input = `${cases.map((fields) => fields.map((field) => field || "_").join("\t")).join("\n")}\n`;
  const result = shell(
    [
      `source <(sed '/^main "\\$@"$/d' /opt/vps-update/openbot-vps-update)`,
      "while IFS=$'\\t' read -r a b c d e f; do",
      '  [ "$a" = _ ] && a=; [ "$b" = _ ] && b=; [ "$c" = _ ] && c=; [ "$d" = _ ] && d=; [ "$e" = _ ] && e=; [ "$f" = _ ] && f=',
      '  if newer_build "$a" "$b" "$c" "$d" "$e" "$f"; then echo yes; else echo no; fi',
      `done <<'CASES'\n${input}CASES`,
    ].join("\n"),
  );
  if (result.status !== 0) throw new Error(`bash rule failed: ${result.stderr}`);
  return result.stdout
    .trim()
    .split("\n")
    .map((line) => line === "yes");
}

async function ruleParity(): Promise<void> {
  // version, commit, time of the candidate, then of the running image.
  const cases: Array<{ fields: string[]; newer: boolean; note: string }> = [
    {
      fields: ["0.73.0", "9c41d2e07", "2026-11-26T19:04:00Z", "0.73.0", "5dfb288b7", "2026-11-26T02:29:12Z"],
      newer: true,
      note: "same version, later commit",
    },
    {
      fields: ["0.73.0", "1503cf943", "2026-11-18T01:30:00Z", "0.73.0", "5dfb288b7", "2026-11-26T02:29:12Z"],
      newer: false,
      note: "same version, earlier commit",
    },
    {
      fields: ["0.73.0", "5dfb288b7", "2026-11-26T02:29:12Z", "0.73.0", "5dfb288b7", "2026-11-26T02:29:12Z"],
      newer: false,
      note: "same build",
    },
    {
      fields: ["0.73.0", "5dfb288b7", "2026-11-27T02:29:12Z", "0.73.0", "5dfb288b7", "2026-11-26T02:29:12Z"],
      newer: false,
      note: "same commit, later time",
    },
    {
      fields: ["0.73.0", "9c41d2e07", "2026-11-26T19:04:00Z", "0.73.0", "5dfb288b7", ""],
      newer: true,
      note: "running image has no time",
    },
    { fields: ["0.73.0", "9c41d2e07", "", "0.73.0", "5dfb288b7", ""], newer: false, note: "no times" },
    {
      fields: ["0.73.0", "", "2026-11-26T19:04:00Z", "0.73.0", "5dfb288b7", "2026-11-26T02:29:12Z"],
      newer: false,
      note: "no commit",
    },
    { fields: ["0.74.0", "", "", "0.73.0", "5dfb288b7", "2026-11-26T02:29:12Z"], newer: true, note: "newer version" },
    {
      fields: ["0.72.0", "9c41d2e07", "2026-11-30T00:00:00Z", "0.73.0", "5dfb288b7", "2026-11-26T02:29:12Z"],
      newer: false,
      note: "older version, later time",
    },
    { fields: ["0.73.10", "", "", "0.73.9", "", ""], newer: true, note: "numeric order of versions" },
    {
      fields: ["", "9c41d2e07", "2026-11-26T19:04:00Z", "0.73.0", "5dfb288b7", "2026-11-26T02:29:12Z"],
      newer: false,
      note: "no version",
    },
  ];
  const bash = bashRule(cases.map(({ fields }) => fields));
  cases.forEach(({ fields, newer, note }, index) => {
    const [version, revision, created, runningVersion, runningRevision, runningCreated] = fields;
    const candidate = serverImageBuild(version, revision, created);
    const running = serverImageBuild(runningVersion, runningRevision, runningCreated);
    const app = candidate !== null && running !== null && isNewerServerBuild(candidate, running);
    check(
      `rule: ${note}`,
      app === newer && bash[index] === newer,
      `expected ${newer}, app ${app}, bash ${bash[index]}`,
    );
  });
}

async function main(): Promise<void> {
  await rm(reportRoot, { recursive: true, force: true });
  for (const folder of [
    "fake/images",
    "fake/tags",
    "update/requests",
    "update/status",
    "update/host",
    "stack",
    "backups",
    "data",
  ])
    await mkdir(join(work, folder), { recursive: true });
  for (const image of [OLD, NEW, OLDER, BROKEN, NEXT])
    await writeFile(join(fake, "images", image.id), `${image.labels}\n`);
  await writeFile(join(fake, "container"), `${OLD.id}\n`);
  await writeFile(join(fake, "running"), "true\n");
  await writeFile(join(fake, "offline-images"), `${BROKEN.id}\n`);
  await writeFile(join(fake, "tags", "openbot-vps_current"), `${OLD.id}\n`);
  await writeFile(join(fake, "docker"), FAKE_DOCKER);
  await chmod(join(fake, "docker"), 0o755);
  await writeFile(join(work, "data", "marker"), "original\n");
  await writeFile(join(work, "data", "openbot.db"), "database\n");
  await writeFile(
    join(work, "env"),
    [
      "DOCKER=/work/fake/docker",
      "STACK_DIR=/work/stack",
      "UPDATE_DIR=/work/update",
      "BACKUP_DIR=/work/backups",
      "BACKUP_NAME=e2e",
      "BACKUP_KEEP=3",
      "VOLUME_DIR=/work/data",
      "LOCK_FILE=/work/lock",
      "HEALTH_TIMEOUT_SECONDS=4",
      "POLL_SECONDS=0.2",
      "",
    ].join("\n"),
  );
  // Three older backups of this stack, and one of another stack that must stay.
  for (const stamp of ["20261101T000000Z", "20261102T000000Z", "20261103T000000Z"]) {
    await writeFile(join(work, "backups", `openbot-e2e-${stamp}.tgz`), "old\n");
    await writeFile(join(work, "backups", `openbot-e2e-${stamp}.tgz.sha256`), "old\n");
  }
  await writeFile(join(work, "backups", "openbot-renzo-server-20261101T000000Z.tgz"), "other\n");

  const started = run("docker", [
    "run",
    "--detach",
    "--name",
    container,
    "--volume",
    `${work}:/work`,
    "--volume",
    `${join(root, "docker", "vps-update")}:/opt/vps-update:ro`,
    "ubuntu:24.04",
    "sleep",
    "infinity",
  ]);
  if (started.status !== 0) throw new Error(`docker run failed: ${started.stderr}`);
  try {
    await ruleParity();

    // `stage` with a newer build of the same version.
    await setRegistry(NEW);
    let result = script("stage");
    check(
      "stage writes a newer build",
      (await read(join(work, "update/status/staged.ready"))) === "0.73.0 9c41d2e07 2026-11-26T19:04:00Z",
      `exit ${result.status}: ${await read(join(work, "update/status/staged.ready"))}`,
    );
    check(
      "stage never replaces the container",
      (await read(join(fake, "container"))) === OLD.id &&
        !(await fakeLog()).some((line) => line.startsWith("compose up")),
      "the container still runs the old image",
    );

    // `stage` with an older build removes the offer.
    await setRegistry(OLDER);
    result = script("stage");
    const olderStaged = await read(join(work, "update/status/staged.ready"));
    check(
      "stage offers no older build",
      result.status === 0 && olderStaged === "",
      `exit ${result.status}, staged "${olderStaged}", ${result.stderr.trim().split("\n").at(-1)}`,
    );

    // The app side: the real adapter, through the folders only. A loop acts as the path unit.
    shell(
      "nohup bash -c 'while [ ! -e /work/stop-watcher ] && sleep 0.2; do if [ -e /work/update/requests/update-stage ] || [ -e /work/update/requests/update-install ]; then OPENBOT_VPS_UPDATE_CONFIG=/work/env /opt/vps-update/openbot-vps-update request >>/work/path-unit.log 2>&1 || true; fi; done; touch /work/watcher-stopped' >/dev/null 2>&1 &",
    );
    const running: ServerImageBuild | null = serverImageBuild("0.73.0", "5dfb288b7", "2026-11-26T02:29:12Z");
    if (!running) throw new Error("The running build is not valid.");
    const adapter = new HostedUpdateAdapter({
      currentVersion: "0.73.0",
      arch: "x64",
      paths: {
        requests: join(work, "update/requests"),
        state: join(work, "update/status/state"),
        stagedReady: join(work, "update/status/staged.ready"),
      },
      imageBuild: running,
      pollIntervalMs: 200,
      checkWaitMs: 20_000,
    });
    const older = await adapter.checkForUpdates();
    check(
      "app offers no older build",
      older.isUpdateAvailable === false,
      `available ${older.isUpdateAvailable}, version ${older.updateInfo.version}`,
    );

    await setRegistry(NEW);
    const offer = await adapter.checkForUpdates();
    check(
      "app check stages and offers the build",
      offer.isUpdateAvailable && offer.updateInfo.version === "0.73.0+9c41d2e07",
      `available ${offer.isUpdateAvailable}, version ${offer.updateInfo.version}`,
    );
    let downloaded = "";
    adapter.on("update-downloaded", (info) => {
      downloaded = info.version;
    });
    await adapter.downloadUpdate();
    check("app download ends with the build", downloaded === "0.73.0+9c41d2e07", `update-downloaded ${downloaded}`);

    // Install, as the app does after its shutdown.
    const logBefore = (await fakeLog()).length;
    adapter.quitAndInstall();
    const installed = await waitFor(
      "the install",
      async () =>
        (await read(join(fake, "container"))) === NEW.id &&
        (await read(join(work, "update/host/installs.log"))).includes('"installed"'),
    );
    const installLog = (await fakeLog()).slice(logBefore);
    const stopAt = installLog.findIndex((line) => line.startsWith("stop"));
    const tagAt = installLog.indexOf(`tag ${NEW.id} openbot-vps:current`);
    const upAt = installLog.findIndex((line) => line.startsWith("compose up -d --pull never openbot"));
    check(
      "install request swaps the container",
      installed && stopAt >= 0 && stopAt < tagAt && tagAt < upAt,
      `container ${await read(join(fake, "container"))}, steps ${JSON.stringify(installLog.filter((line) => /^(stop|tag|compose up)/u.test(line)))}`,
    );
    const backups = (await readdir(join(work, "backups")))
      .filter((name) => /^openbot-e2e-\d{8}T\d{6}Z\.tgz$/u.test(name))
      .sort();
    check(
      "install backs up first and keeps 3",
      backups.length === 3 &&
        !backups.includes("openbot-e2e-20261101T000000Z.tgz") &&
        (await readdir(join(work, "backups"))).includes("openbot-renzo-server-20261101T000000Z.tgz"),
      backups.join(", "),
    );
    const installRecord = JSON.parse((await read(join(work, "update/host/installs.log"))).split("\n").at(-1) ?? "{}");
    check(
      "install records the downtime",
      typeof installRecord.downtimeSeconds === "number" && installRecord.to === "0.73.0 9c41d2e07",
      JSON.stringify(installRecord),
    );
    check(
      "install clears the offer",
      (await read(join(work, "update/status/staged.ready"))) === "",
      "staged.ready is gone",
    );

    // The new app runs NEW now. The old image is not offered again.
    const nowRunning = serverImageBuild("0.73.0", "9c41d2e07", "2026-11-26T19:04:00Z");
    if (!nowRunning) throw new Error("The new build is not valid.");
    const afterInstall = new HostedUpdateAdapter({
      currentVersion: "0.73.0",
      arch: "x64",
      paths: {
        requests: join(work, "update/requests"),
        state: join(work, "update/status/state"),
        stagedReady: join(work, "update/status/staged.ready"),
      },
      imageBuild: nowRunning,
      pollIntervalMs: 200,
    });
    await setRegistry(OLD);
    const downgrade = await afterInstall.checkForUpdates();
    check(
      "no downgrade after the install",
      downgrade.isUpdateAvailable === false,
      `available ${downgrade.isUpdateAvailable}`,
    );

    // A newer version is offered as a plain version.
    await setRegistry(NEXT);
    const next = await afterInstall.checkForUpdates();
    check(
      "a newer version is offered",
      next.isUpdateAvailable && next.updateInfo.version === "0.74.0+f1f1f1f1f",
      `version ${next.updateInfo.version}`,
    );
    const staged = parseStagedBuild(await read(join(work, "update/status/staged.ready")));
    check(
      "staged text reads back",
      staged !== null && serverBuildVersion(staged) === "0.74.0+f1f1f1f1f",
      JSON.stringify(staged),
    );

    // The script runs directly from here on, so the path unit stops.
    await writeFile(join(work, "stop-watcher"), "");
    await waitFor(
      "the path unit loop to stop",
      async () =>
        (await read(join(work, "watcher-stopped"))) !== "" || (await readdir(work)).includes("watcher-stopped"),
    );

    // An image that does not come back online is rolled back with the data from before.
    await setRegistry(BROKEN);
    await writeFile(join(work, "update/host/server-state"), "online\n");
    result = script("stage");
    result = script("install");
    const rolledBack = (await read(join(fake, "container"))) === NEW.id;
    const marker = await read(join(work, "data", "marker"));
    check(
      "a failed install rolls back image and data",
      result.status !== 0 &&
        rolledBack &&
        marker === "original" &&
        (await read(join(work, "update/host/failed-image"))) === BROKEN.id,
      `exit ${result.status}, container ${await read(join(fake, "container"))}, marker ${marker}`,
    );
    result = script("stage");
    check(
      "the failed image is not offered again",
      (await read(join(work, "update/status/staged.ready"))) === "",
      `staged "${await read(join(work, "update/status/staged.ready"))}"`,
    );

    // An install request with nothing newer only restarts the container.
    const beforeRestart = (await fakeLog()).length;
    result = script("install");
    const restartLog = (await fakeLog()).slice(beforeRestart);
    check(
      "install with nothing staged restarts only",
      result.status === 0 &&
        restartLog.some((line) => line.startsWith("restart")) &&
        !restartLog.some((line) => line.startsWith("compose up")),
      JSON.stringify(restartLog.filter((line) => /^(restart|compose)/u.test(line))),
    );
  } finally {
    await writeFile(join(reportRoot, "path-unit.log"), await read(join(work, "path-unit.log")));
    run("docker", ["rm", "--force", container]);
  }
}

let failure: unknown = null;
try {
  await main();
} catch (error) {
  failure = error;
  check("run", false, error instanceof Error ? error.message : String(error));
}
const passed = results.every((result) => result.ok);
await mkdir(reportRoot, { recursive: true });
await writeFile(
  join(reportRoot, "report.json"),
  `${JSON.stringify({ passed, checkedAt: new Date().toISOString(), results }, null, 2)}\n`,
);
process.stdout.write(`${passed ? "PASS" : "FAIL"} ${join(reportRoot, "report.json")}\n`);
if (failure || !passed) process.exit(1);
