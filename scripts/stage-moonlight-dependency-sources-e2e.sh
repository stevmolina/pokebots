#!/usr/bin/env bash
# Uses one small registry crate, one local Git crate, and one small npm package.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/scripts" "$work/fixture/src" "$work/git-crate/src"
cp "$root/scripts/stage-moonlight-dependency-sources.ts" "$work/scripts/"
cd "$work"

cat > git-crate/Cargo.toml <<'TOML'
[package]
name = "fixture-git"
version = "0.1.0"
edition = "2024"
TOML
touch git-crate/src/lib.rs
printf 'Fixture notice\n' > git-crate/LICENSE
git -C git-crate init -q
git -C git-crate add .
git -C git-crate -c user.name=Fixture -c user.email=fixture@example.invalid commit -qm fixture

cat > fixture/Cargo.toml <<TOML
[package]
name = "fixture"
version = "0.1.0"
edition = "2024"
[dependencies]
fixture-git = { git = "file://$work/git-crate" }
itoa = "=1.0.15"
TOML
touch fixture/src/lib.rs
printf 'Fixture license\n' > fixture/LICENSE
cat > fixture/package.json <<'JSON'
{
  "name": "fixture",
  "version": "1.0.0",
  "scripts": { "postinstall": "exit 42" },
  "devDependencies": { "is-number": "7.0.0" }
}
JSON
(
  cd fixture
  CARGO_HOME="$work/cargo-lock-home" cargo generate-lockfile
  npm install --package-lock-only --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org --cache "$work/lock-cache"
)

cat > fixture.patch <<'PATCH'
diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -1,6 +1,7 @@
 {
   "name": "fixture",
   "version": "1.0.0",
+  "description": "Patched fixture",
   "scripts": { "postinstall": "exit 42" },
   "devDependencies": { "is-number": "7.0.0" }
 }
PATCH

make_input() {
  tar -czf fixture.tar.gz fixture
  bun -e '
    const sha = async (path) => new Bun.CryptoHasher("sha256").update(await Bun.file(path).bytes()).digest("hex");
    await Bun.write("native-runtime.lock.json", JSON.stringify({ remoteDesktop: { moonlightWeb: {
      sourceMode: "upstream-with-patch", overrides: [], submodules: {},
      repository: "fixture", commit: "fixture", sourceArchive: "fixture.tar.gz",
      sourceSha256: await sha("fixture.tar.gz"), license: "fixture",
      licenseSha256: await sha("fixture/LICENSE"),
      patch: { path: "fixture.patch", sha256: await sha("fixture.patch") }
    } } }));
  '
}

stage() {
  bun scripts/stage-moonlight-dependency-sources.ts fixture.tar.gz "$1"
}

make_input
stage staged
(cd staged && shasum -a 256 -c SHA256SUMS.txt)
bun -e '
  const manifest = await Bun.file("staged/manifest.json").json();
  const pkg = await Bun.file("staged/npm/package.json").json();
  if (pkg.description !== "Patched fixture") throw new Error("Patch did not apply");
  if (manifest.cargo.length !== 2 || manifest.npm.length !== 1 ||
      !manifest.cargo.every((entry) => entry.notices.length) ||
      !manifest.npm[0].notices.includes("package/LICENSE") ||
      manifest.webAssets.generated) throw new Error("Incomplete manifest");
'

mkdir replay
tar -xf staged/upstream.tar.gz --strip-components 1 -C replay
(
  cd replay
  git apply ../staged/runtime.patch
  mkdir -p .cargo cargo
  cp ../staged/cargo/config.toml .cargo/config.toml
  cp -R ../staged/cargo/vendor cargo/
  CARGO_HOME="$work/replay-cargo" cargo metadata --locked --offline --format-version 1 > /dev/null
  npm cache add ../staged/npm/*.tgz --ignore-scripts --cache "$work/replay-npm"
  npm ci --offline --ignore-scripts --include=dev --no-audit --no-fund --cache "$work/replay-npm"
)

bun -e '
  const path = "fixture/package-lock.json";
  const lock = await Bun.file(path).json();
  lock.packages["node_modules/is-number"].integrity = "sha512-" + "A".repeat(86) + "==";
  await Bun.write(path, JSON.stringify(lock));
'
make_input
if stage unchecked 2>refusal.log; then
  echo "Staging accepted a bad npm digest" >&2
  exit 1
fi
rg -q "npm integrity mismatch" refusal.log
test ! -e unchecked
mkdir -p "$root/.openbot-build"
printf '{"verifiedStage":true,"offlineReplay":true,"badNpmIntegrityRefused":true,"npmLifecycleSkipped":true}\n' > "$root/.openbot-build/moonlight-staging-fixture.json"
