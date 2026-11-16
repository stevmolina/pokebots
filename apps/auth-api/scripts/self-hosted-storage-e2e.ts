import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openSelfHostedD1 } from "../src/self-hosted/d1-sqlite";
import { openSelfHostedR2 } from "../src/self-hosted/r2-fs";

// The child is a real process with real SQLite and filesystem storage. The parent kills and restarts it.
if (process.argv[2] === "serve") {
  const root = process.argv[3];
  if (!root) throw new Error("Missing fixture directory.");
  const { d1, database } = openSelfHostedD1(join(root, "auth.sqlite"), join(root, "migrations"));
  const r2 = openSelfHostedR2(root, "objects");
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/write") {
        await d1.prepare("INSERT INTO fixture VALUES (?, ?)").bind("kept", "before restart").run();
        await r2.bucket.put("../object", "object before restart", { httpMetadata: { contentType: "text/plain" } });
        return Response.json({ ok: true });
      }
      if (path === "/replace") {
        await r2.bucket.put("../object", "replacement");
        await r2.bucket.put("../object", "object before restart", { httpMetadata: { contentType: "text/plain" } });
        const changed = await d1.prepare("UPDATE fixture SET value=value RETURNING id").run();
        const read = await d1.prepare("SELECT id FROM fixture").run();
        return Response.json({
          writeChanges: changed.meta.changes,
          readChanges: read.meta.changes,
          files: (await readdir(join(root, "objects", "objects"))).length,
        });
      }
      if (path === "/rollback") {
        try {
          await d1.batch([
            d1.prepare("INSERT INTO fixture VALUES ('rollback', 'must not survive')"),
            d1.prepare("INSERT INTO fixture VALUES ('kept', 'duplicate')"),
          ]);
          return new Response(null, { status: 500 });
        } catch {
          return Response.json({ rolledBack: true });
        }
      }
      if (path === "/read") {
        const object = await r2.bucket.get("../object");
        return Response.json({
          rows: (await d1.prepare("SELECT * FROM fixture ORDER BY id").all()).results,
          object: await object?.text(),
          contentType: object?.httpMetadata?.contentType,
          conditionalBody:
            "body" in
            ((await r2.bucket.get("../object", { onlyIf: new Headers({ "if-none-match": object?.httpEtag || "" }) })) ||
              {}),
        });
      }
      if (path === "/delete") {
        await r2.bucket.delete("../object");
        return Response.json({ missing: (await r2.bucket.head("../object")) === null });
      }
      return new Response(null, { status: 404 });
    },
  });
  // Machine-readable: the parent waits for the bound port, not a timer.
  process.stdout.write(`${server.url.origin}\n`);
  process.on("SIGTERM", () => {
    server.stop(true);
    database.close();
    r2.database.close();
    process.exit(0);
  });
} else {
  const root = await mkdtemp(join(tmpdir(), "auth-storage-e2e-"));
  const migrations = join(root, "migrations");
  await mkdir(migrations);
  await writeFile(
    join(migrations, "0001_fixture.sql"),
    "CREATE TABLE fixture(id TEXT PRIMARY KEY, value TEXT NOT NULL);",
  );
  const checks: string[] = [];
  async function start() {
    const child = Bun.spawn([process.execPath, import.meta.filename, "serve", root], {
      stdout: "pipe",
      stderr: "inherit",
    });
    const reader = child.stdout.getReader();
    const first = await reader.read();
    if (!first.value) throw new Error("Fixture process did not start.");
    const origin = new TextDecoder().decode(first.value).trim();
    return { child, origin };
  }
  let active = await start();
  const call = async (path: string) => {
    const response = await fetch(`${active.origin}${path}`);
    assert.equal(response.status, 200);
    return response.json();
  };
  try {
    assert.deepEqual(await call("/write"), { ok: true });
    assert.deepEqual(await call("/replace"), { writeChanges: 1, readChanges: 0, files: 1 });
    checks.push("RETURNING reports write metadata; repeated object replacement reclaims old files");
    assert.deepEqual(await call("/rollback"), { rolledBack: true });
    checks.push("real D1 batch rolls back all writes on error");
    active.child.kill("SIGKILL");
    await active.child.exited;
    active = await start();
    assert.deepEqual(await call("/read"), {
      rows: [{ id: "kept", value: "before restart" }],
      object: "object before restart",
      contentType: "text/plain",
      conditionalBody: false,
    });
    checks.push(
      "SQLite WAL and object data survive process crash and restart",
      "applied migration is not repeated",
      "conditional object read has no body",
      "object keys cannot escape storage root",
    );
    assert.deepEqual(await call("/delete"), { missing: true });
    checks.push("object deletion removes metadata and data");
    active.child.kill();
    await active.child.exited;
    await writeFile(
      join(migrations, "0002_failure.sql"),
      "INSERT INTO fixture VALUES ('failed-migration', 'no'); CREATE TABLE fixture(id TEXT);",
    );
    const failed = Bun.spawn([process.execPath, import.meta.filename, "serve", root], {
      stdout: "ignore",
      stderr: "ignore",
    });
    assert.notEqual(await failed.exited, 0);
    const db = openSelfHostedD1(join(root, "auth.sqlite"));
    assert.equal(await db.d1.prepare("SELECT id FROM fixture WHERE id = 'failed-migration'").first(), null);
    assert.equal(await db.d1.prepare("SELECT name FROM d1_migrations WHERE name = '0002_failure.sql'").first(), null);
    db.database.close();
    checks.push("failed startup migration rolls back data and migration record");
    const secret = randomUUID();
    const privateJwk = JSON.stringify({ kty: "EC", d: randomUUID() });
    const logging = resolve(import.meta.dirname, "../src/self-hosted/logging.ts");
    const logProcess = Bun.spawn(
      [
        process.execPath,
        "-e",
        `import { installSelfHostedLogging } from ${JSON.stringify(logging)}; installSelfHostedLogging(); console.log(process.env.SELF_HOSTED_TEST_SECRET, process.env.REMOTE_TICKET_PRIVATE_JWK);`,
      ],
      {
        env: { ...process.env, SELF_HOSTED_TEST_SECRET: secret, REMOTE_TICKET_PRIVATE_JWK: privateJwk },
        stdout: "pipe",
        stderr: "inherit",
      },
    );
    const output = await new Response(logProcess.stdout).text();
    assert.equal(await logProcess.exited, 0);
    assert.ok(!output.includes(secret) && !output.includes(privateJwk) && output.includes("[redacted]"));
    checks.push("framework console output redacts registered runtime secrets");
    const artifact = resolve(".openbot-build/auth-api-storage-e2e.json");
    await mkdir(resolve(".openbot-build"), { recursive: true });
    await writeFile(artifact, `${JSON.stringify({ checks, fixture: root }, null, 2)}\n`);
    assert.ok((await readFile(artifact, "utf8")).includes("checks"));
    // Machine-readable: verification artifact and count.
    process.stdout.write(`Passed ${checks.length} checks. Artifact: ${artifact}\n`);
  } finally {
    active.child.kill();
    await active.child.exited;
  }
}
