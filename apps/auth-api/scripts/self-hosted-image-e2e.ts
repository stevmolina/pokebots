import { strict as assert } from "node:assert";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openSelfHostedD1 } from "../src/self-hosted/d1-sqlite";
import { openSelfHostedR2 } from "../src/self-hosted/r2-fs";

const entry = process.argv[2];
if (!entry) throw new Error("Set the built account worker entry path.");
interface ScheduledWorker {
  default: {
    scheduled(
      input: { scheduledTime: number; cron: string },
      bindings: { DB: D1Database; SITES: R2Bucket },
    ): Promise<void>;
  };
}
const worker: ScheduledWorker = await import(resolve(entry));
const root = await mkdtemp(join(tmpdir(), "account-image-e2e-"));
const sqlite = openSelfHostedD1(join(root, "accounts.sqlite"), resolve(import.meta.dirname, "../migrations"));
const objects = openSelfHostedR2(root, "sites");
try {
  await sqlite.d1
    .prepare("INSERT INTO auth_rate_limits (key_hash, window_start, attempts) VALUES (?, ?, ?)")
    .bind("expired", 0, 1)
    .run();
  await sqlite.d1
    .prepare("INSERT INTO auth_rate_limits (key_hash, window_start, attempts) VALUES (?, ?, ?)")
    .bind("current", Date.UTC(2026, 10, 16), 1)
    .run();
  await worker.default.scheduled(
    { scheduledTime: Date.UTC(2026, 10, 16), cron: "*/5 * * * *" },
    { DB: sqlite.d1, SITES: objects.bucket },
  );
  assert.equal(
    await sqlite.d1.prepare("SELECT key_hash FROM auth_rate_limits WHERE key_hash = 'expired'").first(),
    null,
  );
  assert.deepEqual(
    await sqlite.d1.prepare("SELECT key_hash FROM auth_rate_limits WHERE key_hash = 'current'").first(),
    {
      key: "current",
    },
  );
  const artifact = "/runtime/scheduled-e2e.json";
  await writeFile(
    artifact,
    `${JSON.stringify({ checks: ["built worker runs midnight retention with real SQLite and object storage", "expired row removed and current row kept"] })}\n`,
  );
  // Machine-readable: image-build proof has no account values.
  process.stdout.write(`Passed built-worker scheduled E2E. Artifact: ${artifact}\n`);
} finally {
  sqlite.database.close();
  objects.database.close();
}
