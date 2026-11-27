import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export const staticNoticeMarker = "licenses/static-notices-v1.txt";
export const opusNotice = "Sunshine-Opus.txt";
export const boostNotice = "Sunshine-Boost.txt";
export const moonlightOpenSslNotice = "Moonlight-OpenSSL.txt";

export async function sunshineNoticeSources(mapPath: string, build: string, platform: "darwin" | "linux") {
  const map = await readFile(mapPath, "utf8");
  const opusArchives = new Set(
    [...map.matchAll(/^(?:\[\s*\d+\] )?(\/.+\/libopus\.a)\([^()]+\)\s*$/gm)].map((match) =>
      realpathSync(match[1] ?? match[0]),
    ),
  );
  const [opus] = opusArchives;
  if (opusArchives.size !== 1 || !opus) throw new Error("Expected one linked Sunshine Opus archive.");
  const boost = /^\s*(?:\[\s*\d+\] )?(_deps\/boost-build\/[^()\n]+\/libboost_[^/()]+\.a)\([^()]+\)\s*$/m.exec(map);
  const boostArchive = boost?.[1];
  if (!boostArchive) throw new Error("Expected a linked Sunshine Boost archive from the CMake build tree.");
  await access(resolve(build, boostArchive));
  return [
    { file: opusNotice, source: platform === "darwin" ? resolve(dirname(opus), "../COPYING") : linuxOpusNotice(opus) },
    { file: boostNotice, source: join(build, "_deps/boost-src/LICENSE_1_0.txt") },
  ];
}

function linuxOpusNotice(archive: string): string {
  const ownership = execFileSync("dpkg-query", ["-S", archive], { encoding: "utf8" }).trim();
  const owner = /^([\w.+-]+(?::[\w-]+)?): (.+)$/.exec(ownership);
  const packageName = owner?.[1]?.split(":")[0];
  if (!packageName || owner?.[2] !== archive)
    throw new Error("Cannot identify the package that owns the linked Opus archive.");
  return join("/usr/share/doc", packageName, "copyright");
}

type CargoMetadata = {
  packages: { id: string; name: string; manifest_path: string }[];
  resolve: { nodes: { id: string; dependencies: string[] }[] };
  target_directory: string;
};

export async function moonlightNoticeSource(source: string, env: NodeJS.ProcessEnv): Promise<string> {
  const metadata: CargoMetadata = JSON.parse(
    execFileSync("cargo", ["metadata", "--locked", "--format-version", "1"], {
      cwd: source,
      env,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    }),
  );
  const sysPackages = metadata.packages.filter((pkg) => pkg.name === "openssl-sys");
  const [sys] = sysPackages;
  if (sysPackages.length !== 1 || !sys) throw new Error("Expected one resolved Moonlight openssl-sys package.");
  const dependencies = metadata.resolve.nodes.find((node) => node.id === sys.id)?.dependencies;
  const vendor = metadata.packages.find((pkg) => pkg.name === "openssl-src" && dependencies?.includes(pkg.id));
  if (!vendor) throw new Error("Cannot identify the OpenSSL source resolved by Moonlight.");
  const build = join(metadata.target_directory, "release/build");
  const outputs = (await readdir(build))
    .filter((name) => name.startsWith("openssl-sys-"))
    .map((name) => join(build, name, "output"));
  for (const output of outputs) {
    const log = await readFile(output, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return "";
    });
    if (log.includes("cargo:vendored=1\n") && log.includes("cargo:rustc-link-lib=static=crypto\n")) {
      const lib = join(dirname(output), "out/openssl-build/install/lib");
      if (!log.split("\n").includes(`cargo:rustc-link-search=native=${lib}`)) continue;
      await access(join(lib, "libcrypto.a"));
      return join(dirname(vendor.manifest_path), "openssl/LICENSE.txt");
    }
  }
  throw new Error("Moonlight did not report linking its vendored OpenSSL archive.");
}

export function verifyStaticNotices(marker: string | undefined, checksums: readonly { name: string }[]): void {
  const names = [
    staticNoticeMarker,
    ...[opusNotice, boostNotice, moonlightOpenSslNotice].map((file) => `licenses/${file}`),
  ];
  if (marker === undefined && !checksums.some((entry) => names.includes(entry.name))) return;
  if (marker !== "1\n") throw new Error("Invalid static runtime notice version.");
  for (const name of names) {
    if (!checksums.some((entry) => entry.name === name)) throw new Error(`Missing distribution checksum for ${name}.`);
  }
}
