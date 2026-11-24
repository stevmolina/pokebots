// Downloads the provider CLIs that a server downloads at its start (Claude, Codex, Cursor, Grok) for a
// Linux target, through the real runtime manager and the real release files, and checks that each one
// is ready. The CLIs are off for the manager, so it checks the pinned checksums and does not run the
// Linux binary: this script runs on any computer. A Linux server also runs `--version` on each one.
// The run uses a new temporary store and removes it at the end.
// `bun scripts/server-default-provider-clis-e2e.ts [linux-x64|linux-arm64]`.
// Writes .openbot-build/server-default-provider-clis-e2e/report.json.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ManagedProviderId } from "@pokebots/contracts/agent-providers";
import { Effect } from "effect";
import { runCauseEffect } from "../src/backend/effect-boundary";
import { ProviderRuntimeManager } from "../src/main/provider-runtime-manager";

const OUT = resolve(import.meta.dirname, "../.openbot-build/server-default-provider-clis-e2e");
/** The same list as `SERVER_DEFAULT_PROVIDER_CLIS` in `src/main/application-services.ts`. */
const SERVER_DEFAULT_PROVIDER_CLIS: readonly ManagedProviderId[] = ["claude", "codex", "cursor", "grok"];

const target = process.argv[2] ?? "linux-x64";
assert.ok(target === "linux-x64" || target === "linux-arm64", `unsupported target: ${target}`);
const architecture = target === "linux-x64" ? "x64" : "arm64";

const root = await mkdtemp(join(tmpdir(), "openbot-server-default-clis-e2e-"));
const manager = new ProviderRuntimeManager({
  root: join(root, "provider-runtimes"),
  downloadRoot: join(root, "downloads"),
  platform: "linux",
  architecture,
  isProviderOn: () => false,
});
const report: {
  target: string;
  passed: boolean;
  providers: Record<string, { phase: string; version: string | null; seconds: number; message: string | null }>;
} = { target, passed: false, providers: {} };

try {
  await runCauseEffect(manager.initialize());
  for (const provider of SERVER_DEFAULT_PROVIDER_CLIS) {
    assert.equal(manager.getStatus().providers[provider]?.phase, "not-downloaded", `${provider} starts not downloaded`);
    const started = Date.now();
    await runCauseEffect(manager.downloadAndWait(provider).pipe(Effect.ignore));
    const status = manager.getStatus().providers[provider];
    report.providers[provider] = {
      phase: status?.phase ?? "missing",
      version: status?.version ?? null,
      seconds: Math.round((Date.now() - started) / 1000),
      message: status?.message ?? null,
    };
    process.stdout.write(
      `${provider}: ${report.providers[provider].phase} ${report.providers[provider].version ?? ""}\n`,
    );
  }
  for (const provider of SERVER_DEFAULT_PROVIDER_CLIS) {
    assert.equal(report.providers[provider]?.phase, "ready", `${provider} is ready`);
  }
  report.passed = true;
} finally {
  await runCauseEffect(manager.stop()).catch(() => undefined);
  await rm(root, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`report: ${join(OUT, "report.json")}\n`);
}
