import { createHash, randomUUID } from "node:crypto";
import { existsSync, linkSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openSelfHostedD1 } from "../src/self-hosted/d1-sqlite";

const [dump, destination] = process.argv.slice(2);
if (!dump || !destination) throw new Error("Usage: bun self-hosted-import.ts <D1-export.sql> <new-database.sqlite>");
if (existsSync(destination)) throw new Error("Destination exists. Import must never overwrite a database.");
const pending = `${destination}.${randomUUID()}.pending`;
const db = new DatabaseSync(pending);
let closed = false;
try {
  // D1 exports can list child rows before parent rows. Validate every relationship after import.
  db.exec("PRAGMA foreign_keys=OFF");
  db.exec(readFileSync(dump, "utf8"));
  const integrity = db.prepare("PRAGMA integrity_check").get();
  if (integrity?.integrity_check !== "ok") throw new Error("Imported database integrity check failed.");
  if (db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Imported database has broken references.");
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
    )
    .all();
  const evidence = tables.map((table) => {
    if (typeof table.name !== "string") throw new Error("Invalid table name.");
    const name = `"${table.name.replaceAll('"', '""')}"`;
    const rows = db.prepare(`SELECT * FROM ${name}`).all();
    const hash = createHash("sha256")
      .update(JSON.stringify(rows.map((row) => JSON.stringify(row)).sort()))
      .digest("hex");
    return { table: table.name, rows: rows.length, sha256: hash };
  });
  db.close();
  closed = true;
  const migrated = openSelfHostedD1(pending, resolve(import.meta.dirname, "../migrations"));
  if (migrated.appliedMigrations.length)
    throw new Error("The export is behind the source schema. Review migrations before cutover.");
  migrated.database.close();
  // SQLite is closed before the atomic rename. There is no live writer during import.
  linkSync(pending, destination);
  unlinkSync(pending);
  // Machine-readable: row counts and hashes contain no account values or secrets.
  process.stdout.write(`${JSON.stringify({ destination, integrity: "ok", tables: evidence }, null, 2)}\n`);
} finally {
  if (!closed) db.close();
  if (existsSync(pending)) rmSync(pending);
  for (const suffix of ["-wal", "-shm"]) if (existsSync(pending + suffix)) rmSync(pending + suffix);
}
