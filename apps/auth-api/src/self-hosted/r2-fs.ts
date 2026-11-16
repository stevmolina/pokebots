import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createOpenBotLogger } from "@openbot/logging";
import { Schema } from "effect";

const logger = createOpenBotLogger("self-hosted-objects");

const StoredObject = Schema.Struct({
  key: Schema.String,
  blob_name: Schema.String,
  size: Schema.Number,
  etag: Schema.String,
  http_metadata: Schema.NullOr(Schema.String),
  custom_metadata: Schema.NullOr(Schema.String),
  uploaded_ms: Schema.Number,
});
type StoredObjectRow = typeof StoredObject.Type;
const decodeRow = Schema.decodeUnknownSync(StoredObject);

function toBytes(value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob | null): Promise<Uint8Array> {
  if (value === null) return Promise.resolve(new Uint8Array(0));
  if (typeof value === "string") return Promise.resolve(new TextEncoder().encode(value));
  if (value instanceof Uint8Array) return Promise.resolve(value);
  if (ArrayBuffer.isView(value)) {
    return Promise.resolve(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  }
  if (value instanceof ArrayBuffer) return Promise.resolve(new Uint8Array(value));
  if (value instanceof Blob) return value.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  return new Response(value).arrayBuffer().then((buffer) => new Uint8Array(buffer));
}

function makeR2Object(row: StoredObjectRow): R2Object {
  const httpMetadata: R2HTTPMetadata = row.http_metadata ? JSON.parse(row.http_metadata) : {};
  const customMetadata: Record<string, string> = row.custom_metadata ? JSON.parse(row.custom_metadata) : {};
  return {
    key: row.key,
    version: row.etag,
    size: row.size,
    etag: row.etag,
    httpEtag: `"${row.etag}"`,
    checksums: { toJSON: () => ({}) },
    uploaded: new Date(row.uploaded_ms),
    httpMetadata,
    customMetadata,
    storageClass: "Standard",
    writeHttpMetadata(headers: Headers) {
      if (httpMetadata.contentType) headers.set("Content-Type", httpMetadata.contentType);
      if (httpMetadata.contentLanguage) headers.set("Content-Language", httpMetadata.contentLanguage);
      if (httpMetadata.contentDisposition) headers.set("Content-Disposition", httpMetadata.contentDisposition);
      if (httpMetadata.contentEncoding) headers.set("Content-Encoding", httpMetadata.contentEncoding);
      if (httpMetadata.cacheControl) headers.set("Cache-Control", httpMetadata.cacheControl);
      if (httpMetadata.cacheExpiry) headers.set("Expires", new Date(httpMetadata.cacheExpiry).toUTCString());
    },
  };
}

function makeR2ObjectBody(row: StoredObjectRow, bytes: Uint8Array): R2ObjectBody {
  const base = makeR2Object(row);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return {
    ...base,
    writeHttpMetadata: base.writeHttpMetadata,
    body: stream,
    bodyUsed: false,
    async arrayBuffer() {
      return new Uint8Array(bytes).buffer;
    },
    async bytes() {
      return new Uint8Array(bytes);
    },
    async text() {
      return new TextDecoder().decode(bytes);
    },
    async json<T>(): Promise<T> {
      return JSON.parse(new TextDecoder().decode(bytes));
    },
    async blob() {
      return new Blob([new Uint8Array(bytes)], { type: base.httpMetadata?.contentType ?? "application/octet-stream" });
    },
  };
}

function onlyIfMatches(row: StoredObjectRow, onlyIf?: R2Conditional | Headers): boolean {
  if (!onlyIf) return true;
  if (onlyIf instanceof Headers) {
    const match = onlyIf.get("if-match");
    const none = onlyIf.get("if-none-match");
    const etags = (value: string) => value.split(",").map((part) => part.trim());
    if (match && match !== "*" && !etags(match).includes(`"${row.etag}"`)) return false;
    if (none && (none === "*" || etags(none).includes(`"${row.etag}"`))) return false;
    const modified = onlyIf.get("if-modified-since");
    const unmodified = onlyIf.get("if-unmodified-since");
    const uploaded = Math.floor(row.uploaded_ms / 1000) * 1000;
    if (modified && uploaded <= Date.parse(modified)) return false;
    if (unmodified && uploaded > Date.parse(unmodified)) return false;
    return true;
  }
  if (onlyIf.etagMatches && onlyIf.etagMatches !== row.etag && onlyIf.etagMatches !== `"${row.etag}"`) return false;
  if (
    onlyIf.etagDoesNotMatch &&
    (onlyIf.etagDoesNotMatch === row.etag || onlyIf.etagDoesNotMatch === `"${row.etag}"`)
  ) {
    return false;
  }
  return true;
}

export function openSelfHostedR2(rootDir: string, bucketName: string): { bucket: R2Bucket; database: DatabaseSync } {
  const bucketDir = join(rootDir, bucketName);
  const objectsDir = join(bucketDir, "objects");
  mkdirSync(objectsDir, { recursive: true });
  const database = new DatabaseSync(join(bucketDir, "index.sqlite"));
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA synchronous = FULL;");
  database.exec("PRAGMA busy_timeout = 5000;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS r2_objects (
      key TEXT PRIMARY KEY NOT NULL,
      blob_name TEXT NOT NULL,
      size INTEGER NOT NULL,
      etag TEXT NOT NULL,
      http_metadata TEXT,
      custom_metadata TEXT,
      uploaded_ms INTEGER NOT NULL
    );
  `);

  const referenced = new Set(
    database
      .prepare("SELECT blob_name FROM r2_objects")
      .all()
      .map((row) => row.blob_name),
  );
  for (const file of readdirSync(objectsDir)) {
    if (/^[a-f0-9-]{36}(?:\.pending)?$/.test(file) && !referenced.has(file)) rmSync(join(objectsDir, file));
  }

  const selectRow = database.prepare("SELECT * FROM r2_objects WHERE key = ?");
  const deleteRow = database.prepare("DELETE FROM r2_objects WHERE key = ?");
  const upsertRow = database.prepare(`
    INSERT INTO r2_objects (key, blob_name, size, etag, http_metadata, custom_metadata, uploaded_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      blob_name = excluded.blob_name,
      size = excluded.size,
      etag = excluded.etag,
      http_metadata = excluded.http_metadata,
      custom_metadata = excluded.custom_metadata,
      uploaded_ms = excluded.uploaded_ms
  `);

  async function get(
    key: string,
    options: R2GetOptions & { onlyIf: R2Conditional | Headers },
  ): Promise<R2ObjectBody | R2Object | null>;
  async function get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;
  async function get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | R2Object | null> {
    const found = selectRow.get(key);
    if (!found) return null;
    const row = decodeRow(found);
    if (!onlyIfMatches(row, options?.onlyIf)) return makeR2Object(row);
    const blobPath = join(objectsDir, row.blob_name);
    if (!existsSync(blobPath)) throw new Error("Stored object file is missing.");
    if (options?.range) throw new Error("Object ranges are not used by the account service.");
    return makeR2ObjectBody(row, new Uint8Array(readFileSync(blobPath)));
  }
  const bucket: R2Bucket = {
    async head(key: string): Promise<R2Object | null> {
      const found = selectRow.get(key);
      const row = found ? decodeRow(found) : undefined;
      return row ? makeR2Object(row) : null;
    },
    get,
    async put(
      key: string,
      value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob | null,
      options?: R2PutOptions,
    ): Promise<R2Object> {
      const bytes = await toBytes(value);
      const etag = createHash("md5").update(bytes).digest("hex");
      // A new immutable file keeps the old object valid if the write or index update fails.
      const blobName = randomUUID();
      const pending = join(objectsDir, `${blobName}.pending`);
      writeFileSync(pending, bytes, { flag: "wx", flush: true });
      renameSync(pending, join(objectsDir, blobName));
      const directory = openSync(objectsDir, "r");
      try {
        fsyncSync(directory);
      } finally {
        closeSync(directory);
      }
      const httpMetadata =
        options?.httpMetadata && !(options.httpMetadata instanceof Headers)
          ? JSON.stringify(options.httpMetadata)
          : null;
      const customMetadata = options?.customMetadata ? JSON.stringify(options.customMetadata) : null;
      const uploadedMs = Date.now();
      const previous = selectRow.get(key);
      upsertRow.run(key, blobName, bytes.byteLength, etag, httpMetadata, customMetadata, uploadedMs);
      if (previous) {
        try {
          rmSync(join(objectsDir, decodeRow(previous).blob_name), { force: true });
        } catch {
          logger.warn("Old object body remains for startup cleanup.");
        }
      }
      return makeR2Object({
        key,
        blob_name: blobName,
        size: bytes.byteLength,
        etag,
        http_metadata: httpMetadata,
        custom_metadata: customMetadata,
        uploaded_ms: uploadedMs,
      });
    },
    async delete(keys: string | string[]): Promise<void> {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) {
        const found = selectRow.get(key);
        const row = found ? decodeRow(found) : undefined;
        if (row) {
          deleteRow.run(key);
          rmSync(join(objectsDir, row.blob_name), { force: true });
        }
      }
    },
    async list(options?: R2ListOptions): Promise<R2Objects> {
      const prefix = options?.prefix ?? "";
      const limit = Math.min(Math.max(options?.limit ?? 1000, 1), 1000);
      const cursorKey = options?.cursor ? Buffer.from(options.cursor, "base64url").toString("utf8") : "";
      const rows = database
        .prepare("SELECT * FROM r2_objects WHERE key >= ? AND key > ? ORDER BY key ASC LIMIT ?")
        .all(prefix, cursorKey, limit + 1)
        .map((row) => decodeRow(row));
      const filtered = rows.filter((row) => row.key.startsWith(prefix));
      const truncated = filtered.length > limit;
      const page = truncated ? filtered.slice(0, limit) : filtered;
      const last = page.at(-1);
      const result = { objects: page.map(makeR2Object), delimitedPrefixes: [] };
      return truncated && last
        ? { ...result, truncated: true, cursor: Buffer.from(last.key, "utf8").toString("base64url") }
        : { ...result, truncated: false };
    },
    createMultipartUpload(): Promise<R2MultipartUpload> {
      throw new Error("R2Bucket.createMultipartUpload is not implemented in self-hosted mode.");
    },
    resumeMultipartUpload(): R2MultipartUpload {
      throw new Error("R2Bucket.resumeMultipartUpload is not implemented in self-hosted mode.");
    },
  };

  return { bucket, database };
}
