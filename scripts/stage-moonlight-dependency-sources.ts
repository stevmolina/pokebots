// Usage: bun scripts/stage-moonlight-dependency-sources.ts <pinned-source.tar.gz> <new-output-directory>
// Run on a staging runner with Git, tar, Cargo, npm, and access to the locked sources.
// The output contains the inputs for web asset generation, including the patched build recipe.
// Asset generation itself requires the Cargo binding export and belongs on the build runner.
// Verify SHA256SUMS.txt, unpack the upstream archive, and apply runtime.patch.
// At the patched source root, copy cargo/vendor and merge cargo/config.toml into .cargo/config.toml.
// Seed a fresh npm cache with npm cache add <each staged .tgz> --ignore-scripts, then use
// npm ci --offline --ignore-scripts --include=dev with that cache before the explicit asset build.
// Notice paths in the manifest refer to the vendored crate or to files inside the npm archive.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  createReadStream,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { TOML } from "bun";

const root = resolve(import.meta.dirname, "..");
const noticeName = /^(?:(?:licen[cs]es?|copying|copyright|notices?)(?:$|[._ -])|third[-_ ]?party)/iu;

function run(command: string, args: string[], cwd: string, env = process.env): string {
  return execFileSync(command, args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

function digest(path: string, algorithm = "sha256", encoding: "hex" | "base64" = "hex"): string {
  return createHash(algorithm).update(readFileSync(path)).digest(encoding);
}

function checkDigest(path: string, expected: string): void {
  if (digest(path) !== expected) throw new Error(`SHA-256 mismatch for ${basename(path)}`);
}

function files(rootPath: string, prefix = ""): string[] {
  return readdirSync(join(rootPath, prefix))
    .sort()
    .flatMap((name) => {
      const path = join(prefix, name);
      const stat = lstatSync(join(rootPath, path));
      if (stat.isDirectory()) return files(rootPath, path);
      if (!stat.isFile()) throw new Error(`Unsupported file type in staging input: ${path}`);
      return [path];
    });
}

function json(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function stageCargo(source: string, stage: string, work: string) {
  const lockPath = join(source, "Cargo.lock");
  const lockDigest = digest(lockPath);
  const lock = TOML.parse(readFileSync(lockPath, "utf8")) as {
    package: { name: string; version: string; source?: string; checksum?: string }[];
  };
  const dependencies = lock.package.filter((entry) => entry.source);
  for (const entry of dependencies) {
    const identity = `${entry.name}@${entry.version}`;
    if (entry.source?.startsWith("git+") && /#[0-9a-f]{40}$/u.test(entry.source)) continue;
    if (entry.source?.startsWith("registry+") && /^[0-9a-f]{64}$/u.test(entry.checksum ?? "")) continue;
    throw new Error(`Cargo source is missing a locked revision or checksum: ${identity}`);
  }

  const cargoOutput = join(stage, "cargo");
  mkdirSync(cargoOutput);
  const vendor = join(cargoOutput, "vendor");
  const env = { ...process.env, CARGO_HOME: join(work, "cargo-home") };
  mkdirSync(vendor);
  const config = run("cargo", ["vendor", "--locked", "--versioned-dirs", vendor], source, env);
  checkDigest(lockPath, lockDigest);
  if (dependencies.length > 0 && !config.includes(`directory = "${vendor}"`)) {
    throw new Error("Cargo did not emit a vendor source configuration");
  }
  const portableConfig = config.replace(`directory = "${vendor}"`, 'directory = "cargo/vendor"');
  writeFileSync(join(cargoOutput, "config.toml"), `${portableConfig}\n`);
  cpSync(lockPath, join(cargoOutput, "Cargo.lock"));

  return dependencies.map((entry) => {
    const directory = `${entry.name}-${entry.version}`;
    const path = join(vendor, directory);
    const checksums = JSON.parse(readFileSync(join(path, ".cargo-checksum.json"), "utf8")) as {
      files: Record<string, string>;
      package: string | null;
    };
    if (checksums.package !== (entry.checksum ?? null)) {
      throw new Error(`Cargo vendor checksum mismatch for ${directory}`);
    }
    const paths = files(path).filter((name) => name !== ".cargo-checksum.json");
    for (const name of paths) {
      const expected = checksums.files[name];
      if (expected === undefined) throw new Error(`Missing Cargo vendor checksum for ${directory}/${name}`);
      checkDigest(join(path, name), expected);
    }
    if (paths.length !== Object.keys(checksums.files).length) {
      throw new Error(`Incomplete Cargo vendor tree for ${directory}`);
    }
    return { ...entry, directory, notices: paths.filter((name) => noticeName.test(basename(name))) };
  });
}

function stageNpm(source: string, stage: string, work: string) {
  const output = join(stage, "npm");
  mkdirSync(output);
  const lockPath = join(source, "package-lock.json");
  const lock = JSON.parse(readFileSync(lockPath, "utf8")) as {
    lockfileVersion: number;
    packages?: Record<string, { version: string; resolved?: string; integrity?: string }>;
  };
  if (lock.lockfileVersion !== 3 || !lock.packages?.[""]) throw new Error("Expected an npm v3 package lock");
  const cache = join(work, "npm-cache");
  const args = ["--ignore-scripts", "--cache", cache, "--no-audit", "--no-fund"];
  const dependencies = Object.entries(lock.packages).filter(([name]) => name !== "");
  const inventory = dependencies
    .sort(([left], [right]) => (left < right ? -1 : Number(left > right)))
    .map(([path, entry], index) => {
      const url = entry.resolved ? new URL(entry.resolved) : undefined;
      if (
        url?.origin !== "https://registry.npmjs.org" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !url.pathname.endsWith(".tgz") ||
        !/^sha512-[A-Za-z0-9+/]{86}==$/u.test(entry.integrity ?? "")
      ) {
        throw new Error(`Expected an npm registry tarball with SHA-512 integrity for ${path}`);
      }
      const scratch = mkdtempSync(join(work, "npm-pack-"));
      run("npm", ["pack", url.href, ...args], scratch);
      const [name, ...extra] = readdirSync(scratch);
      if (!name?.endsWith(".tgz") || extra.length) throw new Error(`Expected one npm archive for ${path}`);
      const tarball = join(scratch, name);
      if (`sha512-${digest(tarball, "sha512", "base64")}` !== entry.integrity) {
        throw new Error(`npm integrity mismatch for ${path}`);
      }
      const archive = `${index}-${name}`;
      renameSync(tarball, join(output, archive));
      const notices = run("tar", ["-tf", join(output, archive)], scratch)
        .split("\n")
        .filter((name) => noticeName.test(basename(name)) && !name.endsWith("/"))
        .sort();
      return { path, ...entry, archive, notices };
    });

  // Check that the lock and manifest agree using only the archives fetched above.
  run("npm", ["ci", "--offline", "--include=dev", ...args], source);
  cpSync(lockPath, join(output, "package-lock.json"));
  cpSync(join(source, "package.json"), join(output, "package.json"));
  return inventory;
}

async function stageSources(input: string, output: string): Promise<void> {
  const lock = JSON.parse(readFileSync(join(root, "native-runtime.lock.json"), "utf8")).remoteDesktop.moonlightWeb;
  if (lock.sourceMode !== "upstream-with-patch" || lock.overrides.length || Object.keys(lock.submodules).length) {
    throw new Error("Unsupported Moonlight source layout in the runtime lock");
  }
  const work = mkdtempSync(join(dirname(output), ".moonlight-staging-"));
  try {
    const stage = join(work, "output");
    const source = join(work, "source");
    mkdirSync(stage);
    mkdirSync(source);
    const upstream = join(stage, "upstream.tar.gz");
    cpSync(input, upstream);
    checkDigest(upstream, lock.sourceSha256);
    const patch = join(stage, "runtime.patch");
    cpSync(join(root, lock.patch.path), patch);
    checkDigest(patch, lock.patch.sha256);
    run("tar", ["-xf", upstream, "--strip-components", "1", "-C", source], work);
    checkDigest(join(source, "LICENSE"), lock.licenseSha256);
    cpSync(join(source, "LICENSE"), join(stage, "LICENSE"));
    run("git", ["init", "--quiet"], source);
    run("git", ["apply", "--check", patch], source);
    run("git", ["apply", patch], source);

    const cargo = stageCargo(source, stage, work);
    const npm = stageNpm(source, stage, work);
    json(join(stage, "manifest.json"), {
      schemaVersion: 1,
      source: {
        repository: lock.repository,
        commit: lock.commit,
        archive: lock.sourceArchive,
        archiveSha256: lock.sourceSha256,
        patchSha256: lock.patch.sha256,
        license: lock.license,
        licenseSha256: lock.licenseSha256,
      },
      tools: {
        cargo: run("cargo", ["--version"], work),
        node: run("node", ["--version"], work),
        npm: run("npm", ["--version"], work),
      },
      cargo,
      npm,
      webAssets: { recipe: "npm run build", output: "dist", generated: false },
    });
    const sums = [];
    for (const name of files(stage)) {
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(join(stage, name))) hash.update(chunk);
      sums.push(`${hash.digest("hex")}  ${name}`);
    }
    writeFileSync(join(stage, "SHA256SUMS.txt"), `${sums.join("\n")}\n`);
    // Reserve the destination only after all checks pass. Never replace an existing output.
    mkdirSync(output);
    renameSync(stage, output);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const [input, output, ...extra] = process.argv.slice(2);
try {
  if (!input || !output || extra.length)
    throw new Error("Pass a pinned Moonlight source archive and a new output directory");
  await stageSources(resolve(input), resolve(output));
} catch (error) {
  process.stderr.write(`Moonlight staging failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
