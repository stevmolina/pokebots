// Installs Keeper Commander (`keepercommander`, Keeper's official CLI) into a folder that OpenBot owns.
// OpenBot runs Commander as a separate program; it does not include or change its code.
//
// Keeper publishes Commander as a Python package. The install downloads a pinned `uv` release (its
// SHA-256 is pinned here), lets `uv` install a pinned Python build, and installs the pinned package
// list of `keeper-requirements.ts` into a virtual environment. The bridge script goes next to it.

import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { access, chmod, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sourceText } from "@openbot/i18n/source";
import { createOpenBotLogger } from "@openbot/logging";
import { Effect } from "effect";
import { causeHelpers } from "../../backend/effect-boundary";
import { downloadArchive } from "../onepassword-cli-installer";
import { assertSafeArchive, extractArchive, extractZipFiles } from "../provider-runtime-archive";
import type { RuntimeTarget } from "../provider-runtime-descriptors";
import { PasswordManagerError, passwordManagerFailure } from "./driver";
import { KEEPER_HELPER_FILE_NAME, KEEPER_HELPER_SCRIPT } from "./keeper-helper-script";
import { KEEPER_COMMANDER_REQUIREMENTS, KEEPER_COMMANDER_VERSION } from "./keeper-requirements";

const logger = createOpenBotLogger("keeper-install");
const { io } = causeHelpers(PasswordManagerError);

const UV_VERSION = "0.13.1";
const PYTHON_VERSION = "3.12.15";
/** A full install downloads Python and about 70 packages. */
const INSTALL_STEP_MS = 10 * 60_000;
const MAX_LOG_CHARS = 4_000;

interface UvRelease {
  /** The file name at Astral's GitHub release. */
  name: string;
  /** The SHA-256 that Astral publishes for this file. */
  sha256: string;
  /** The path of `uv` inside the archive. */
  entry: string;
}

const UV_FILES: Record<RuntimeTarget, UvRelease> = {
  "darwin-arm64": tarball("aarch64-apple-darwin", "cfe454573412ff7380d15fc7dae5997ab53ffce72fce0a78e91ddbc84001acd2"),
  "darwin-x64": tarball("x86_64-apple-darwin", "bb7b805bdcf3d0bc8c74ceb94569e6b3e8aa35bd492acdbb9d46bf46d9d4ff6b"),
  "linux-arm64": tarball(
    "aarch64-unknown-linux-gnu",
    "9041c73c99fdc5892cf128140beb354eca9231d502068cc36e6cb53a8e59ad14",
  ),
  "linux-x64": tarball("x86_64-unknown-linux-gnu", "eadd9d27c134ab5ac1ffd4473b97a741407f3ea238288f03121fc4deddf90220"),
  "win32-x64": {
    name: "uv-x86_64-pc-windows-msvc.zip",
    sha256: "3b2661a463a5baea7f5076ea2b25ab71d77f36a6c0d809e5350651792f80a672",
    entry: "uv.exe",
  },
};

function tarball(triple: string, sha256: string): UvRelease {
  return { name: `uv-${triple}.tar.gz`, sha256, entry: `uv-${triple}/uv` };
}

/** How the driver starts the bridge: `command` with `args`, then the request on stdin. */
export interface KeeperCommander {
  command: string;
  args: readonly string[];
}

/** The folder of one install. A new pin gives a new folder, and the old folders are removed. */
function installName(): string {
  const pins = createHash("sha256")
    .update([UV_VERSION, PYTHON_VERSION, ...KEEPER_COMMANDER_REQUIREMENTS].join("\n"))
    .digest("hex")
    .slice(0, 12);
  return `commander-${KEEPER_COMMANDER_VERSION}-${pins}`;
}

function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

/** Runs `uv` with only the variables that it needs. Its output has no secrets; a failure logs its end. */
function runUv(executable: string, args: readonly string[], env: Record<string, string>, signal: AbortSignal) {
  const failed = sourceText("error.connector.keeperCliInstallFailed");
  return new Promise<void>((resolve, reject) => {
    const base: NodeJS.ProcessEnv = {};
    for (const name of [
      "HOME",
      "USERPROFILE",
      "APPDATA",
      "LOCALAPPDATA",
      "SystemRoot",
      "PATH",
      "TMPDIR",
      "TEMP",
      "TMP",
    ])
      if (process.env[name]) base[name] = process.env[name];
    const child = spawn(executable, [...args], {
      env: { ...base, ...env },
      signal,
      timeout: INSTALL_STEP_MS,
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let output = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (text: string) => {
      output = (output + text).slice(-MAX_LOG_CHARS);
    });
    child.once("error", () => reject(new Error(failed)));
    child.once("close", (code) => {
      if (code === 0) return resolve();
      logger.warn("uv could not install Keeper Commander.", { args: args[0] ?? "", output });
      reject(new Error(failed));
    });
  });
}

/**
 * The installed Commander when its install finished, or else a new install. A failed or stopped
 * install leaves nothing behind. The bridge script is written again each time, so a new app version
 * uses its own bridge with the same Commander.
 */
export const managedKeeperCommander = Effect.fn("KeeperCommander.managed")(function* (options: {
  directory: string;
  target: RuntimeTarget;
  signal: AbortSignal;
  fetch?: typeof fetch;
}): Effect.fn.Return<KeeperCommander, PasswordManagerError> {
  const { directory, target, signal } = options;
  const windows = target === "win32-x64";
  const root = join(directory, installName());
  const venv = join(root, "venv");
  const python = windows ? join(venv, "Scripts", "python.exe") : join(venv, "bin", "python");
  const helper = join(root, KEEPER_HELPER_FILE_NAME);
  const marker = join(root, "installed");
  const commander: KeeperCommander = { command: python, args: ["-I", "-B", helper] };
  const failed = sourceText("error.connector.keeperCliInstallFailed");

  if ((yield* Effect.promise(() => exists(marker))) && (yield* Effect.promise(() => exists(python)))) {
    yield* io(() => writeFile(helper, KEEPER_HELPER_SCRIPT, { mode: 0o600 }));
    return commander;
  }

  const release = UV_FILES[target];
  const request = options.fetch ?? fetch;
  const work = join(directory, `.work-${randomBytes(6).toString("hex")}`);
  const archive = join(work, release.name);
  const unpacked = join(work, "uv");
  yield* io(() => rm(root, { recursive: true, force: true }));
  yield* io(() => mkdir(work, { recursive: true, mode: 0o700 }));
  return yield* Effect.gen(function* () {
    const digest = yield* io((interrupted) =>
      downloadArchive({
        url: `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${release.name}`,
        archive,
        failed,
        signal: AbortSignal.any([signal, interrupted]),
        fetch: (input, init) => request(input, init),
      }),
    );
    if (digest !== release.sha256) return yield* passwordManagerFailure(failed);
    yield* io(() => mkdir(unpacked));
    if (windows) {
      yield* extractZipFiles(archive, unpacked, [release.entry], failed).pipe(
        Effect.mapError(({ cause }) => new PasswordManagerError({ cause })),
      );
    } else {
      yield* assertSafeArchive(archive, [release.entry.split("/")[0] ?? ""], failed).pipe(
        Effect.mapError(({ cause }) => new PasswordManagerError({ cause })),
      );
      yield* extractArchive(archive, unpacked).pipe(
        Effect.mapError(({ cause }) => new PasswordManagerError({ cause })),
      );
    }
    const uv = join(unpacked, release.entry);
    if (!windows) yield* io(() => chmod(uv, 0o755));

    yield* io(() => mkdir(root, { recursive: true, mode: 0o700 }));
    const env = {
      UV_NO_CONFIG: "1",
      UV_CACHE_DIR: join(work, "cache"),
      UV_PYTHON_INSTALL_DIR: join(root, "python"),
      UV_PYTHON_DOWNLOADS: "automatic",
      UV_NO_PROGRESS: "1",
    };
    const requirements = join(work, "requirements.txt");
    yield* io(() => writeFile(requirements, `${KEEPER_COMMANDER_REQUIREMENTS.join("\n")}\n`));
    yield* io((interrupted) =>
      runUv(
        uv,
        ["venv", "--python", PYTHON_VERSION, "--managed-python", "--no-project", venv],
        env,
        AbortSignal.any([signal, interrupted]),
      ),
    );
    yield* io((interrupted) =>
      runUv(
        uv,
        ["pip", "install", "--python", python, "--no-deps", "--requirement", requirements],
        env,
        AbortSignal.any([signal, interrupted]),
      ),
    );
    yield* io(() => writeFile(helper, KEEPER_HELPER_SCRIPT, { mode: 0o600 }));
    yield* io(async () => {
      await writeFile(`${marker}.tmp`, `${KEEPER_COMMANDER_VERSION}\n`);
      await rename(`${marker}.tmp`, marker);
    });
    // An older install has other pins, and a work folder that a quit left behind is not used again.
    for (const name of yield* io(() => readdir(directory)))
      if (name !== installName() && join(directory, name) !== work)
        yield* io(() => rm(join(directory, name), { recursive: true, force: true })).pipe(Effect.ignore);
    return commander;
  }).pipe(
    Effect.onError(() => io(() => rm(root, { recursive: true, force: true })).pipe(Effect.ignore)),
    Effect.ensuring(io(() => rm(work, { recursive: true, force: true })).pipe(Effect.ignore)),
  );
});
