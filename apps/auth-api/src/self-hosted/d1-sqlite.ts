import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync, type SQLInputValue, type SQLOutputValue } from "node:sqlite";

function toSqlValue(value: unknown): SQLInputValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new Error(`Unsupported D1 bind value type: ${typeof value}`);
}

// D1's generic result type belongs to its caller. Keep that released interface at this adapter.
function cloneJson<T>(value: object | SQLOutputValue): T {
  return JSON.parse(JSON.stringify(value));
}

function makeMeta(changes: number, lastRowId: number, duration: number, rowsRead: number) {
  return {
    changes,
    duration,
    last_row_id: lastRowId,
    changed_db: changes > 0,
    size_after: 0,
    rows_read: rowsRead,
    rows_written: changes,
  };
}

class SqlitePreparedStatement implements D1PreparedStatement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly query: string,
    private readonly values: readonly SQLInputValue[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new SqlitePreparedStatement(
      this.database,
      this.query,
      values.map((value) => toSqlValue(value)),
    );
  }

  async first<T = Record<string, SQLOutputValue>>(colName?: string): Promise<T | null> {
    const row = this.database.prepare(this.query).get(...this.values);
    if (!row) return null;
    if (colName !== undefined) {
      return row[colName] === undefined ? null : cloneJson<T>(row[colName]);
    }
    return cloneJson<T>(row);
  }

  async run<T = Record<string, SQLOutputValue>>(): Promise<D1Result<T>> {
    return this.executeInBatch<T>();
  }

  async all<T = Record<string, SQLOutputValue>>(): Promise<D1Result<T>> {
    return this.executeInBatch<T>();
  }

  raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  async raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<[string[], ...T[]] | T[]> {
    const statement = this.database.prepare(this.query);
    statement.setReturnArrays(true);
    const rows = statement.all(...this.values);
    if (options?.columnNames) {
      const columns = statement.columns().map((column) => column.name);
      return [columns, ...cloneJson<T[]>(rows)];
    }
    return cloneJson<T[]>(rows);
  }

  executeInBatch<T = Record<string, SQLOutputValue>>(): D1Result<T> {
    const start = performance.now();
    const before = this.database.prepare("SELECT total_changes() AS total").get()?.total;
    const statement = this.database.prepare(this.query);
    const rows = statement.columns().length ? statement.all(...this.values) : [];
    if (!statement.columns().length) statement.run(...this.values);
    const after = this.database
      .prepare("SELECT total_changes() AS total, changes() AS changes, last_insert_rowid() AS id")
      .get();
    const changed = after?.total !== before;
    return {
      success: true,
      results: cloneJson<T[]>(rows),
      meta: makeMeta(
        changed ? Number(after?.changes || 0) : 0,
        changed ? Number(after?.id || 0) : 0,
        performance.now() - start,
        rows.length,
      ),
    };
  }
}

function applySelfHostedMigrations(database: DatabaseSync, migrationsDir: string): string[] {
  database.exec(`
    CREATE TABLE IF NOT EXISTS d1_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `);
  const appliedRows = database.prepare("SELECT name FROM d1_migrations").all();
  const applied = new Set(appliedRows.map((row) => String(row.name)));
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(sql);
      database.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(file);
      database.exec("COMMIT");
      newlyApplied.push(file);
    } catch (error) {
      try {
        database.exec("ROLLBACK");
      } catch {
        // ignore rollback error
      }
      throw new Error(`Migration ${file} failed. The transaction was rolled back.`, { cause: error });
    }
  }
  return newlyApplied;
}

export function openSelfHostedD1(
  dbPath: string,
  migrationsDir?: string,
): { database: DatabaseSync; d1: D1Database; appliedMigrations: string[] } {
  mkdirSync(dirname(dbPath), { recursive: true });
  const database = new DatabaseSync(dbPath);
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA synchronous = FULL;");
  database.exec("PRAGMA busy_timeout = 5000;");
  database.exec("PRAGMA foreign_keys = ON;");
  const appliedMigrations = migrationsDir ? applySelfHostedMigrations(database, migrationsDir) : [];

  const d1: D1Database = {
    prepare(query: string): D1PreparedStatement {
      return new SqlitePreparedStatement(database, query);
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      database.exec("BEGIN IMMEDIATE");
      try {
        const results: D1Result<T>[] = [];
        for (const statement of statements) {
          if (!(statement instanceof SqlitePreparedStatement)) {
            throw new Error("Unsupported D1PreparedStatement instance in batch.");
          }
          results.push(statement.executeInBatch<T>());
        }
        database.exec("COMMIT");
        return results;
      } catch (error) {
        try {
          database.exec("ROLLBACK");
        } catch {
          // ignore rollback error
        }
        throw error;
      }
    },
    async exec(query: string): Promise<D1ExecResult> {
      const start = performance.now();
      database.exec(query);
      return { count: 1, duration: performance.now() - start };
    },
    withSession(): D1DatabaseSession {
      throw new Error("D1Database.withSession is not implemented in self-hosted mode.");
    },
    async dump(): Promise<ArrayBuffer> {
      database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      const bytes = readFileSync(dbPath);
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };

  return { database, d1, appliedMigrations };
}
