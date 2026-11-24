import assert from "node:assert/strict";
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { brandModule } from "./brand-layer";

const index = await Bun.file("src/main/index.ts").text();
const startupImport = 'import "./service-endpoint-environment";';
assert.ok(index.split("\n").find((line) => line.startsWith("import ")) === startupImport);

const auth = "https://auth.example.test";
const signal = "wss://signal.example.test/v1/signal";
const authDefault = "https://build-auth.example.test";
const signalDefault = "wss://build-signal.example.test/v1/signal";
const old = { OPENBOT_AUTH_API_URL: auth, OPENBOT_REMOTE_SIGNAL_URL: signal };
const renamed = { POKEBOTS_AUTH_API_URL: auth, POKEBOTS_REMOTE_SIGNAL_URL: signal };
const cases = [
  { name: "no override", env: {}, urls: [authDefault, signalDefault] },
  { name: "old only", env: old, urls: [auth, signal] },
  { name: "new only", env: renamed, urls: [auth, signal] },
  { name: "both equal", env: { ...old, ...renamed }, urls: [auth, signal] },
  {
    name: "mixed override and fallback",
    env: { POKEBOTS_AUTH_API_URL: auth },
    urls: [auth, signalDefault],
  },
  {
    name: "contradictory auth",
    env: { ...old, ...renamed, POKEBOTS_AUTH_API_URL: "https://other.example.test" },
    conflict: "OPENBOT_AUTH_API_URL and POKEBOTS_AUTH_API_URL",
  },
  {
    name: "contradictory signal",
    env: { ...old, ...renamed, POKEBOTS_REMOTE_SIGNAL_URL: "wss://other.example.test" },
    conflict: "OPENBOT_REMOTE_SIGNAL_URL and POKEBOTS_REMOTE_SIGNAL_URL",
  },
];
const entry = `
import "./src/main/service-endpoint-environment";
process.stdout.write(JSON.stringify([process.env.OPENBOT_AUTH_API_URL, process.env.OPENBOT_REMOTE_SIGNAL_URL]));
`;
const branded = brandModule("src/main/index.ts", entry, {
  name: "Pokebots",
  authApiUrl: authDefault,
  signalUrl: signalDefault,
});
assert.ok(branded);

const results: string[] = [];
for (const test of cases) {
  const run: SpawnSyncReturns<string> = spawnSync(process.execPath, ["--no-env-file", "-e", branded.code], {
    env: test.env,
    encoding: "utf8",
  });
  if (test.conflict) {
    assert.notEqual(run.status, 0, test.name);
    assert.equal(run.stdout, "", test.name);
    assert.ok(run.status !== null, test.name);
    const stderr = run.stderr;
    assert.ok(stderr.includes(test.conflict), test.name);
    assert.ok(!stderr.includes("example.test"), test.name);
  } else {
    assert.equal(run.status, 0, test.name);
    assert.deepEqual(JSON.parse(run.stdout), test.urls, test.name);
  }
  results.push(test.name);
}
const unbranded = spawnSync(process.execPath, ["--no-env-file", "-e", entry], { env: {}, encoding: "utf8" });
assert.equal(unbranded.status, 0);
assert.equal(unbranded.stdout, "[null,null]");
results.push("unbranded without overrides");

const report = JSON.stringify({ passed: results }, null, 2);
await mkdir(".openbot-build", { recursive: true });
await Bun.write(".openbot-build/service-endpoint-aliases-e2e.json", `${report}\n`);
// Machine-readable: endpoint compatibility proof.
process.stdout.write(`${report}\n`);
