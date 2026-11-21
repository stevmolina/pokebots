import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream, createWriteStream } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import { createOpenBotLogger, redactText } from "@openbot/logging";
import { Effect, Option, Result, Schema } from "effect";

const logger = createOpenBotLogger("profile-migration");

export const PROFILE_MIGRATION_MARKER_FILE = ".pokebots-profile-migration.json";
export const PROFILE_MIGRATION_JOURNAL_FILE = ".pokebots-migration-journal.json";
export const PROFILE_MIGRATION_SCHEMA_VERSION = 1;

export const MANAGED_WORKSPACE_SUBDIRS = ["Agents", "Bots", "Shared", "Downloads", "Servers", "backups"] as const;

const MANAGED_WORKSPACE_MARKER_FILES = new Set([".pokebots-workspace.json", ".openbot-managed"]);

const SQLITE_HEADER_MAGIC = Buffer.from("SQLite format 3\0", "ascii");

const OPENBOT_PROFILE_MARKER_FILES = new Set([
  "openbot.db",
  "openbot-setup-v2.json",
  "openbot-run-marker-v1.json",
  "openbot-team-server-v2.json",
  "openbot-team-server-v1.json",
  "openbot-remote-servers-v1.json",
  "openbot-remote-sessions-v1.bin",
  "openbot-appearance-preference-v1.json",
  "openbot-language-preference-v1.json",
  "openbot-agent-defaults-v1.json",
  "openbot-browser-state-v1.json",
  "openbot-provider-credentials-v1.json",
  "openbot-provider-accounts-v1.json",
  "openbot-update-preference-v1.json",
  "openbot-analytics-install-id-v1.json",
  "custom-agents.json",
  "bots.json",
  "Partitions",
  "attachment-drafts",
  "avatars",
  "provider-accounts",
  "provider-state",
]);

const OPENBOT_SCHEMA_TABLES = new Set([
  "schema_migrations",
  "orchestration_events",
  "projection_agents",
  "projection_threads",
]);

const TRANSIENT_ENTRY_NAMES = new Set([
  "SingletonLock",
  "SingletonSocket",
  "SingletonCookie",
  ".pokebots-migration.lock",
  PROFILE_MIGRATION_JOURNAL_FILE,
]);

export class ProfileMigrationLockError extends Schema.TaggedError<ProfileMigrationLockError>()(
  "ProfileMigrationLockError",
  {
    message: Schema.String,
    lockPath: Schema.String,
    holderPid: Schema.NullOr(Schema.Number),
  },
) {}

export class ProfileMigrationIoError extends Schema.TaggedError<ProfileMigrationIoError>()("ProfileMigrationIoError", {
  operation: Schema.String,
  path: Schema.String,
  code: Schema.NullOr(Schema.String),
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

export class ProfileMigrationVerificationError extends Schema.TaggedError<ProfileMigrationVerificationError>()(
  "ProfileMigrationVerificationError",
  {
    message: Schema.String,
    path: Schema.String,
  },
) {}

export class ProfileMigrationIntegrityError extends Schema.TaggedError<ProfileMigrationIntegrityError>()(
  "ProfileMigrationIntegrityError",
  {
    message: Schema.String,
    databasePath: Schema.String,
    details: Schema.Array(Schema.String),
  },
) {}

export class ProfileMigrationCrashError extends Schema.TaggedError<ProfileMigrationCrashError>()(
  "ProfileMigrationCrashError",
  {
    message: Schema.String,
    phase: Schema.String,
  },
) {}

export type ProfileMigrationError =
  | ProfileMigrationLockError
  | ProfileMigrationIoError
  | ProfileMigrationVerificationError
  | ProfileMigrationIntegrityError
  | ProfileMigrationCrashError;

const LockRecordSchema = Schema.Struct({
  version: Schema.Literal(1),
  pid: Schema.Finite,
  createdAt: Schema.String,
  role: Schema.Literals(["source", "target"]),
  profileDir: Schema.String,
});
type LockRecord = typeof LockRecordSchema.Type;
const decodeLockRecord = Schema.decodeUnknownOption(LockRecordSchema);

const ManifestEntrySchema = Schema.Struct({
  relativePath: Schema.String,
  kind: Schema.Literals(["file", "symlink"]),
  size: Schema.Finite,
  sha256: Schema.String,
  linkTarget: Schema.NullOr(Schema.String),
  mode: Schema.Finite,
});
export type ManifestEntry = typeof ManifestEntrySchema.Type;

const DirectoryManifestSchema = Schema.Struct({
  fileCount: Schema.Finite,
  symlinkCount: Schema.Finite,
  totalBytes: Schema.Finite,
  entries: Schema.Array(ManifestEntrySchema),
  manifestSha256: Schema.String,
});
export type DirectoryManifest = typeof DirectoryManifestSchema.Type;

const RetentionPolicySchema = Schema.Struct({
  retainSource: Schema.Boolean,
  policy: Schema.Literals(["retain-until-approved-cleanup"]),
  reason: Schema.String,
});

const ProfileVerificationSchema = Schema.Struct({
  fileCount: Schema.Finite,
  symlinkCount: Schema.Finite,
  totalBytes: Schema.Finite,
  manifestSha256: Schema.String,
  sqliteIntegrityCheck: Schema.NullOr(Schema.Literal("ok")),
  sqliteSchemaVersion: Schema.NullOr(Schema.Number),
});

const WorkspaceVerificationSchema = Schema.Struct({
  fileCount: Schema.Finite,
  symlinkCount: Schema.Finite,
  totalBytes: Schema.Finite,
  manifestSha256: Schema.String,
});

export const ProfileMigrationCompletionMarkerSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  migrationId: Schema.String,
  status: Schema.Literal("completed"),
  completedAt: Schema.String,
  sourceProfileDir: Schema.String,
  targetProfileDir: Schema.String,
  sourceWorkspaceDir: Schema.NullOr(Schema.String),
  targetWorkspaceDir: Schema.NullOr(Schema.String),
  workspaceStatus: Schema.Literals([
    "migrated",
    "skipped-unmanaged",
    "not-configured",
    "not-present",
    "collision-preserved",
  ]),
  preservedCustomWorkspacePaths: Schema.Array(Schema.String),
  managedWorkspacePaths: Schema.Array(Schema.String),
  sourceDbSha256: Schema.NullOr(Schema.String),
  targetDbSha256: Schema.NullOr(Schema.String),
  profileVerification: ProfileVerificationSchema,
  workspaceVerification: Schema.NullOr(WorkspaceVerificationSchema),
  retentionPolicy: RetentionPolicySchema,
});
export type ProfileMigrationCompletionMarker = typeof ProfileMigrationCompletionMarkerSchema.Type;
const decodeCompletionMarker = Schema.decodeUnknownOption(ProfileMigrationCompletionMarkerSchema);

const JournalPhaseSchema = Schema.Literals([
  "staging-profile",
  "staging-workspace",
  "staged-verified",
  "activating-destination",
  "completed",
]);
export type MigrationJournalPhase = typeof JournalPhaseSchema.Type;

const ProfileMigrationJournalSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  migrationId: Schema.String,
  phase: JournalPhaseSchema,
  startedAt: Schema.String,
  updatedAt: Schema.String,
  sourceProfileDir: Schema.String,
  targetProfileDir: Schema.String,
  sourceWorkspaceDir: Schema.NullOr(Schema.String),
  targetWorkspaceDir: Schema.NullOr(Schema.String),
  sourceDbSha256: Schema.NullOr(Schema.String),
  sqliteCheckpointed: Schema.Boolean,
  sqliteIntegrityCheck: Schema.NullOr(Schema.Literal("ok")),
  sqliteSchemaVersion: Schema.NullOr(Schema.Number),
  preservedCustomWorkspacePaths: Schema.Array(Schema.String),
  managedWorkspacePaths: Schema.Array(Schema.String),
  stagedProfileFiles: Schema.Array(Schema.String),
  profileManifest: Schema.NullOr(DirectoryManifestSchema),
  workspaceStatus: Schema.NullOr(
    Schema.Literals(["migrated", "skipped-unmanaged", "not-configured", "not-present", "collision-preserved"]),
  ),
  managedWorkspaceEntries: Schema.Array(Schema.String),
  untouchedWorkspaceEntries: Schema.Array(Schema.String),
  workspaceManifest: Schema.NullOr(DirectoryManifestSchema),
});
type ProfileMigrationJournal = typeof ProfileMigrationJournalSchema.Type;
const decodeJournal = Schema.decodeUnknownOption(ProfileMigrationJournalSchema);

export interface ProfileDirectoryInspection {
  readonly path: string;
  readonly exists: boolean;
  readonly entryCount: number;
  readonly ownership: "empty" | "verified" | "ambiguous";
  readonly hasDatabase: boolean;
  readonly hasValidSqliteHeader: boolean;
  readonly hasOpenBotSchemaTables: boolean;
  readonly matchedMarkerFiles: readonly string[];
  readonly hasCompletionMarker: boolean;
  readonly completionMarker: ProfileMigrationCompletionMarker | null;
}

export interface WorkspaceInspection {
  readonly path: string;
  readonly exists: boolean;
  readonly managed: boolean;
  readonly managedEntries: readonly string[];
  readonly untouchedEntries: readonly string[];
  readonly reasons: readonly string[];
}

export interface ProfileMigrationFaultInjection {
  readonly crashAfterStagingFiles?: number;
  readonly crashDuringActivation?: boolean;
  readonly failDestinationWriteWith?: "ENOSPC" | "EROFS" | "EACCES";
  readonly forceCrossVolumeCopy?: boolean;
}

export interface ProfileMigrationOptions {
  readonly sourceProfileDir: string;
  readonly targetProfileDir: string;
  readonly sourceWorkspaceDir?: string;
  readonly targetWorkspaceDir?: string;
  readonly retentionPolicy?: "retain-until-approved-cleanup";
  readonly faultInjection?: ProfileMigrationFaultInjection;
}

export interface WorkspaceMigrationOutcome {
  readonly status: "migrated" | "skipped-unmanaged" | "not-configured" | "not-present" | "collision-preserved";
  readonly sourceWorkspaceDir: string | null;
  readonly targetWorkspaceDir: string | null;
  readonly migratedEntries: readonly string[];
  readonly untouchedEntries: readonly string[];
  readonly preservedCustomWorkspacePaths: readonly string[];
}

export type ProfileMigrationResult =
  | {
      readonly status: "clean-install";
      readonly targetProfileDir: string;
      readonly targetWorkspaceDir: string | null;
      readonly initializedDirectories: readonly string[];
    }
  | {
      readonly status: "already-migrated";
      readonly targetProfileDir: string;
      readonly sourceProfileDir: string;
      readonly sourceRetained: boolean;
      readonly markerPath: string;
      readonly marker: ProfileMigrationCompletionMarker;
    }
  | {
      readonly status: "already-initialized";
      readonly targetProfileDir: string;
      readonly targetInspection: ProfileDirectoryInspection;
    }
  | {
      readonly status: "needs-owner-selection";
      readonly reason: "both-profiles-exist" | "ambiguous-source-ownership" | "ambiguous-target-ownership";
      readonly sourceProfileDir: string;
      readonly targetProfileDir: string;
      readonly sourceInspection: ProfileDirectoryInspection;
      readonly targetInspection: ProfileDirectoryInspection;
    }
  | {
      readonly status: "migrated";
      readonly migrationId: string;
      readonly resumed: boolean;
      readonly resumedFromPhase: MigrationJournalPhase | null;
      readonly usedCrossVolumeCopy: boolean;
      readonly sourceRetained: boolean;
      readonly sourceProfileDir: string;
      readonly targetProfileDir: string;
      readonly markerPath: string;
      readonly marker: ProfileMigrationCompletionMarker;
      readonly workspaceMigration: WorkspaceMigrationOutcome;
    };

export function profileLockPath(profileDir: string): string {
  const resolved = resolve(profileDir);
  return join(dirname(resolved), `.${basename(resolved)}.pokebots-migration.lock`);
}

export function profileStagingDirPath(targetProfileDir: string): string {
  const resolved = resolve(targetProfileDir);
  return join(dirname(resolved), `.${basename(resolved)}.migration-staging`);
}

export function workspaceStagingDirPath(targetWorkspaceDir: string): string {
  const resolved = resolve(targetWorkspaceDir);
  return join(dirname(resolved), `.${basename(resolved)}.migration-staging`);
}

export function migrationMarkerPath(targetProfileDir: string): string {
  return join(resolve(targetProfileDir), PROFILE_MIGRATION_MARKER_FILE);
}

function errorCode(cause: unknown): string | null {
  if (isDynamicRecord(cause) && isString(cause.code)) return cause.code;
  return null;
}

function redactErrorMessage(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : String(cause);
  return redactText(raw);
}

function ioError(operation: string, path: string, cause: unknown): ProfileMigrationIoError {
  return new ProfileMigrationIoError({
    operation,
    path: redactText(path),
    code: errorCode(cause),
    message: redactErrorMessage(cause),
    cause,
  });
}

function ioCall<A>(operation: string, path: string, work: () => Promise<A>): Effect.Effect<A, ProfileMigrationIoError> {
  return Effect.tryPromise({
    try: work,
    catch: (cause) => ioError(operation, path, cause),
  });
}

function isMissingError(cause: unknown): boolean {
  const code = errorCode(cause);
  return code === "ENOENT" || code === "ENOTDIR";
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return errorCode(cause) === "EPERM";
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (cause) {
    if (isMissingError(cause)) return false;
    throw cause;
  }
}

async function syncDirectoryEntry(dirPath: string): Promise<void> {
  try {
    const handle = await open(dirPath, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close().catch(() => undefined);
    }
  } catch {
    // Some filesystems and platforms do not allow fsync on directory descriptors.
  }
}

async function writeTextAtomicallyWithFsync(path: string, content: string, mode = 0o600): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tempPath = `${path}.tmp-${randomUUID()}`;
  const handle = await open(tempPath, "w", mode);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } catch (cause) {
    await handle.close().catch(() => undefined);
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw cause;
  }
  await handle.close();
  await rename(tempPath, path);
  await syncDirectoryEntry(dirname(path));
}

async function copyFileWithFsync(srcPath: string, destPath: string, mode: number): Promise<void> {
  await mkdir(dirname(destPath), { recursive: true, mode: 0o700 });
  const partPath = `${destPath}.part-${randomUUID()}`;
  try {
    await new Promise<void>((resolveCopy, rejectCopy) => {
      const read = createReadStream(srcPath);
      const write = createWriteStream(partPath, { mode: mode & 0o777 || 0o600 });
      read.on("error", rejectCopy);
      write.on("error", rejectCopy);
      write.on("finish", resolveCopy);
      read.pipe(write);
    });
    const handle = await open(partPath, "r+");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(partPath, mode & 0o777 || 0o600).catch(() => undefined);
    await rename(partPath, destPath);
    await syncDirectoryEntry(dirname(destPath));
  } catch (cause) {
    await rm(partPath, { force: true }).catch(() => undefined);
    throw cause;
  }
}

async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolveHash, rejectHash) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", rejectHash);
    stream.on("end", resolveHash);
  });
  return hash.digest("hex");
}

function sha256OfString(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function checkElectronSingletonLock(profileDir: string): Promise<number | null> {
  const singletonLock = join(profileDir, "SingletonLock");
  try {
    const info = await lstat(singletonLock);
    if (!info.isSymbolicLink()) return null;
    const target = await readlink(singletonLock);
    const dashIndex = target.lastIndexOf("-");
    if (dashIndex < 0) return null;
    const pid = Number(target.slice(dashIndex + 1));
    return isPidAlive(pid) ? pid : null;
  } catch {
    return null;
  }
}

export interface HeldMigrationLock {
  readonly lockPath: string;
  readonly release: () => Effect.Effect<void>;
}

export const acquireMigrationLock = Effect.fn("ProfileMigration.acquireLock")(function* (
  profileDir: string,
  role: "source" | "target",
): Effect.fn.Return<HeldMigrationLock, ProfileMigrationLockError | ProfileMigrationIoError> {
  const lockPath = profileLockPath(profileDir);
  const lockParentDir = dirname(lockPath);
  const lockParentExists = yield* ioCall("check-lock-parent", lockParentDir, () => pathExists(lockParentDir));
  if (!lockParentExists) {
    yield* ioCall("mkdir-lock-parent", lockParentDir, () => mkdir(lockParentDir, { recursive: true, mode: 0o700 }));
  }

  const singletonPid = yield* ioCall("check-singleton-lock", profileDir, () => checkElectronSingletonLock(profileDir));
  if (singletonPid !== null) {
    return yield* new ProfileMigrationLockError({
      message: `Live Electron SingletonLock held by process ${singletonPid}.`,
      lockPath: redactText(join(profileDir, "SingletonLock")),
      holderPid: singletonPid,
    });
  }

  const payload: LockRecord = {
    version: 1,
    pid: process.pid,
    createdAt: new Date().toISOString(),
    role,
    profileDir: resolve(profileDir),
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const acquired = yield* Effect.result(
      ioCall("acquire-lock", lockPath, async () => {
        const handle = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR, 0o600);
        try {
          await handle.writeFile(`${JSON.stringify(payload)}\n`, "utf8");
          await handle.sync();
        } finally {
          await handle.close();
        }
      }),
    );

    if (Result.isSuccess(acquired)) {
      return {
        lockPath,
        release: () =>
          Effect.promise(() =>
            rm(lockPath, { force: true }).catch((cause) => {
              logger.warn("Failed to remove migration lock.", {
                lockPath: redactText(lockPath),
                cause: redactErrorMessage(cause),
              });
            }),
          ),
      };
    }

    const failure = acquired.failure;
    if (failure.code !== "EEXIST") return yield* failure;

    const existingContent = yield* Effect.result(ioCall("read-lock", lockPath, () => readFile(lockPath, "utf8")));
    if (Result.isFailure(existingContent)) {
      return yield* new ProfileMigrationLockError({
        message: "Migration lockfile already exists and could not be read.",
        lockPath: redactText(lockPath),
        holderPid: null,
      });
    }

    let parsed: LockRecord | null = null;
    try {
      const decoded = decodeLockRecord(JSON.parse(existingContent.success));
      if (Option.isSome(decoded)) parsed = decoded.value;
    } catch {
      parsed = null;
    }

    if (parsed === null) {
      return yield* new ProfileMigrationLockError({
        message: "Migration lockfile already exists with unrecognized ownership.",
        lockPath: redactText(lockPath),
        holderPid: null,
      });
    }

    if (isPidAlive(parsed.pid)) {
      return yield* new ProfileMigrationLockError({
        message: `Profile migration lock is held by live process ${parsed.pid}.`,
        lockPath: redactText(lockPath),
        holderPid: parsed.pid,
      });
    }

    // Reclaim stale lock from a dead process and retry once.
    yield* ioCall("reclaim-stale-lock", lockPath, () => rm(lockPath, { force: true }));
  }

  return yield* new ProfileMigrationLockError({
    message: "Failed to acquire migration lock after reclaiming stale lock.",
    lockPath: redactText(lockPath),
    holderPid: null,
  });
});

function withProfileMigrationLocks<A, E>(
  sourceProfileDir: string,
  targetProfileDir: string,
  allowMissingSourceParent: boolean,
  use: () => Effect.Effect<A, E>,
): Effect.Effect<A, E | ProfileMigrationLockError | ProfileMigrationIoError> {
  return Effect.acquireUseRelease(
    Effect.gen(function* () {
      const locks: HeldMigrationLock[] = [];
      const targetLock = yield* acquireMigrationLock(targetProfileDir, "target");
      locks.push(targetLock);

      const sourceParentExists = yield* ioCall("check-source-parent", dirname(resolve(sourceProfileDir)), () =>
        pathExists(dirname(resolve(sourceProfileDir))),
      );
      if (sourceParentExists || !allowMissingSourceParent) {
        const sourceLockResult = yield* Effect.result(acquireMigrationLock(sourceProfileDir, "source"));
        if (Result.isFailure(sourceLockResult)) {
          yield* targetLock.release();
          return yield* sourceLockResult.failure;
        }
        locks.push(sourceLockResult.success);
      }
      return locks;
    }),
    () => use(),
    (locks) => Effect.forEach([...locks].reverse(), (lock) => lock.release(), { concurrency: 1 }).pipe(Effect.asVoid),
  );
}

async function hasSqliteMagicHeader(dbPath: string): Promise<boolean> {
  try {
    const info = await lstat(dbPath);
    if (!info.isFile() || info.size < SQLITE_HEADER_MAGIC.length) return false;
    const handle = await open(dbPath, "r");
    try {
      const buffer = Buffer.alloc(SQLITE_HEADER_MAGIC.length);
      const { bytesRead } = await handle.read(buffer, 0, SQLITE_HEADER_MAGIC.length, 0);
      return bytesRead === SQLITE_HEADER_MAGIC.length && buffer.equals(SQLITE_HEADER_MAGIC);
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
}

function readSqliteTablesImmutable(dbPath: string): string[] {
  const uri = `${pathToFileURL(resolve(dbPath)).href}?immutable=1`;
  const db = new DatabaseSync(uri, { readOnly: true });
  try {
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    const names: string[] = [];
    for (const row of rows) {
      if (isDynamicRecord(row) && isString(row.name)) names.push(row.name);
    }
    return names;
  } finally {
    db.close();
  }
}

async function checkOpenBotTablesReadOnly(dbPath: string): Promise<boolean> {
  try {
    const immutableTables = readSqliteTablesImmutable(dbPath);
    if (immutableTables.some((name) => OPENBOT_SCHEMA_TABLES.has(name))) return true;
    const walPath = `${dbPath}-wal`;
    if (!(await pathExists(walPath))) return false;
    // Uncheckpointed WAL on a fresh DB may hold the initial CREATE TABLE frames; inspect in tmpdir so source stays untouched.
    const inspectDir = join(tmpdir(), `pokebots-inspect-${randomUUID()}`);
    await mkdir(inspectDir, { recursive: true, mode: 0o700 });
    try {
      const tempDb = join(inspectDir, "openbot.db");
      await copyFileWithFsync(dbPath, tempDb, 0o600);
      await copyFileWithFsync(walPath, `${tempDb}-wal`, 0o600);
      const db = new DatabaseSync(tempDb, { readOnly: true });
      try {
        const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
        return rows.some((row) => isDynamicRecord(row) && isString(row.name) && OPENBOT_SCHEMA_TABLES.has(row.name));
      } finally {
        db.close();
      }
    } finally {
      await rm(inspectDir, { recursive: true, force: true }).catch(() => undefined);
    }
  } catch {
    return false;
  }
}

export const inspectProfileDirectory = Effect.fn("ProfileMigration.inspectProfileDirectory")(function* (
  profileDir: string,
): Effect.fn.Return<ProfileDirectoryInspection, ProfileMigrationIoError> {
  const resolved = resolve(profileDir);
  const exists = yield* ioCall("lstat-profile", resolved, () => pathExists(resolved));
  if (!exists) {
    return {
      path: resolved,
      exists: false,
      entryCount: 0,
      ownership: "empty",
      hasDatabase: false,
      hasValidSqliteHeader: false,
      hasOpenBotSchemaTables: false,
      matchedMarkerFiles: [],
      hasCompletionMarker: false,
      completionMarker: null,
    };
  }

  const info = yield* ioCall("lstat-profile", resolved, () => lstat(resolved));
  if (!info.isDirectory()) {
    return {
      path: resolved,
      exists: true,
      entryCount: 1,
      ownership: "ambiguous",
      hasDatabase: false,
      hasValidSqliteHeader: false,
      hasOpenBotSchemaTables: false,
      matchedMarkerFiles: [],
      hasCompletionMarker: false,
      completionMarker: null,
    };
  }

  const entries = yield* ioCall("readdir-profile", resolved, () => readdir(resolved));
  const meaningfulEntries = entries.filter((name) => !TRANSIENT_ENTRY_NAMES.has(name));
  if (meaningfulEntries.length === 0) {
    return {
      path: resolved,
      exists: true,
      entryCount: 0,
      ownership: "empty",
      hasDatabase: false,
      hasValidSqliteHeader: false,
      hasOpenBotSchemaTables: false,
      matchedMarkerFiles: [],
      hasCompletionMarker: false,
      completionMarker: null,
    };
  }

  const matchedMarkerFiles = meaningfulEntries.filter((name) => OPENBOT_PROFILE_MARKER_FILES.has(name)).sort();
  let completionMarker: ProfileMigrationCompletionMarker | null = null;
  if (meaningfulEntries.includes(PROFILE_MIGRATION_MARKER_FILE)) {
    const markerFile = join(resolved, PROFILE_MIGRATION_MARKER_FILE);
    const raw = yield* Effect.result(ioCall("read-marker", markerFile, () => readFile(markerFile, "utf8")));
    if (Result.isSuccess(raw)) {
      try {
        const decoded = decodeCompletionMarker(JSON.parse(raw.success));
        if (Option.isSome(decoded)) completionMarker = decoded.value;
      } catch {
        completionMarker = null;
      }
    }
  }

  const dbPath = join(resolved, "openbot.db");
  const hasDatabase = meaningfulEntries.includes("openbot.db");
  const hasValidSqliteHeader = hasDatabase
    ? yield* ioCall("check-sqlite-header", dbPath, () => hasSqliteMagicHeader(dbPath))
    : false;
  const hasOpenBotSchemaTables = hasValidSqliteHeader
    ? yield* ioCall("check-sqlite-tables", dbPath, () => checkOpenBotTablesReadOnly(dbPath))
    : false;

  const isVerified =
    completionMarker !== null ||
    (hasValidSqliteHeader && (hasOpenBotSchemaTables || matchedMarkerFiles.length > 1)) ||
    (!hasDatabase && matchedMarkerFiles.length >= 2);

  return {
    path: resolved,
    exists: true,
    entryCount: meaningfulEntries.length,
    ownership: isVerified ? "verified" : "ambiguous",
    hasDatabase,
    hasValidSqliteHeader,
    hasOpenBotSchemaTables,
    matchedMarkerFiles,
    hasCompletionMarker: completionMarker !== null,
    completionMarker,
  };
});

export const verifyProfileOwnership = Effect.fn("ProfileMigration.verifyOwnership")(function* (profileDir: string) {
  const inspection = yield* inspectProfileDirectory(profileDir);
  return {
    verified: inspection.ownership === "verified",
    inspection,
  };
});

function isPathInsideOrEqual(rootDir: string, candidatePath: string): boolean {
  const rel = relative(resolve(rootDir), resolve(candidatePath));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

interface ExtractedDbWorkspaceMetadata {
  readonly schemaVersion: number | null;
  readonly managedWorkspacePaths: readonly string[];
  readonly preservedCustomWorkspacePaths: readonly string[];
}

function inspectStagedSqliteMetadata(dbPath: string, sourceWorkspaceDir: string | null): ExtractedDbWorkspaceMetadata {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    const integrityRows = db.prepare("PRAGMA integrity_check").all();
    const integrityLines = integrityRows.map((row) =>
      isDynamicRecord(row) && isString(row.integrity_check) ? row.integrity_check : String(row),
    );
    if (integrityLines.length !== 1 || integrityLines[0] !== "ok") {
      throw new ProfileMigrationIntegrityError({
        message: "Staged SQLite database failed PRAGMA integrity_check.",
        databasePath: redactText(dbPath),
        details: integrityLines.map((line) => redactText(line)),
      });
    }

    let schemaVersion: number | null = null;
    const hasMigrationsTable = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
      .get();
    if (hasMigrationsTable) {
      const versionRow = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get();
      if (isDynamicRecord(versionRow) && isNumber(versionRow.version)) {
        schemaVersion = versionRow.version;
      }
    }

    const managedSet = new Set<string>();
    const customSet = new Set<string>();
    const hasAgentsTable = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'projection_agents'")
      .get();
    if (hasAgentsTable) {
      const agentRows = db.prepare("SELECT agent_json FROM projection_agents").all();
      for (const row of agentRows) {
        if (!isDynamicRecord(row) || !isString(row.agent_json)) continue;
        try {
          const parsed = JSON.parse(row.agent_json);
          if (!isDynamicRecord(parsed)) continue;
          const candidates: string[] = [];
          if (isString(parsed.workspacePath)) candidates.push(parsed.workspacePath);
          if (Array.isArray(parsed.additionalFolders)) {
            for (const folder of parsed.additionalFolders) {
              if (isString(folder)) candidates.push(folder);
            }
          }
          for (const candidate of candidates) {
            if (!isAbsolute(candidate)) continue;
            if (sourceWorkspaceDir !== null && isPathInsideOrEqual(sourceWorkspaceDir, candidate)) {
              managedSet.add(candidate);
            } else {
              customSet.add(candidate);
            }
          }
        } catch {
          // Skip unparseable agent JSON without breaking migration.
        }
      }
    }

    // Fold WAL state into openbot.db and remove -wal/-shm sidecars synchronously so staged manifest is deterministic.
    db.exec("PRAGMA journal_mode = DELETE");

    return {
      schemaVersion,
      managedWorkspacePaths: [...managedSet].sort(),
      preservedCustomWorkspacePaths: [...customSet].sort(),
    };
  } finally {
    db.close();
  }
}

async function verifySqliteIntegrityReadOnly(dbPath: string): Promise<void> {
  const uri = `${pathToFileURL(resolve(dbPath)).href}?immutable=1`;
  const db = new DatabaseSync(uri, { readOnly: true });
  try {
    const rows = db.prepare("PRAGMA integrity_check").all();
    const lines = rows.map((row) =>
      isDynamicRecord(row) && isString(row.integrity_check) ? row.integrity_check : String(row),
    );
    if (lines.length !== 1 || lines[0] !== "ok") {
      throw new ProfileMigrationIntegrityError({
        message: "Destination SQLite database failed PRAGMA integrity_check.",
        databasePath: redactText(dbPath),
        details: lines.map((line) => redactText(line)),
      });
    }
  } finally {
    db.close();
  }
}

export const inspectWorkspaceRoot = Effect.fn("ProfileMigration.inspectWorkspaceRoot")(function* (
  workspaceDir: string,
  managedPathsFromDb: readonly string[],
): Effect.fn.Return<WorkspaceInspection, ProfileMigrationIoError> {
  const resolved = resolve(workspaceDir);
  const exists = yield* ioCall("lstat-workspace", resolved, () => pathExists(resolved));
  if (!exists) {
    return {
      path: resolved,
      exists: false,
      managed: false,
      managedEntries: [],
      untouchedEntries: [],
      reasons: [],
    };
  }

  const info = yield* ioCall("lstat-workspace", resolved, () => lstat(resolved));
  if (!info.isDirectory()) {
    return {
      path: resolved,
      exists: true,
      managed: false,
      managedEntries: [],
      untouchedEntries: [basename(resolved)],
      reasons: [],
    };
  }

  const topEntries = (yield* ioCall("readdir-workspace", resolved, () => readdir(resolved))).sort();
  const reasons: string[] = [];

  const dbReferencedTopDirs = new Set<string>();
  for (const candidate of managedPathsFromDb) {
    if (!isPathInsideOrEqual(resolved, candidate)) continue;
    const rel = relative(resolved, resolve(candidate));
    const firstSegment = rel.split(sep).filter(Boolean)[0];
    if (firstSegment) dbReferencedTopDirs.add(firstSegment);
  }
  if (dbReferencedTopDirs.size > 0) reasons.push("referenced-by-database");

  for (const marker of MANAGED_WORKSPACE_MARKER_FILES) {
    if (topEntries.includes(marker)) reasons.push(`marker:${marker}`);
  }

  if (topEntries.includes("Agents")) {
    const agentsChildren = yield* ioCall("readdir-agents", join(resolved, "Agents"), () =>
      readdir(join(resolved, "Agents")).catch(() => []),
    );
    if (agentsChildren.some((name) => name.startsWith("agent-"))) reasons.push("Agents/agent-*");
  }
  if (topEntries.includes("Bots")) {
    const botsChildren = yield* ioCall("readdir-bots", join(resolved, "Bots"), () =>
      readdir(join(resolved, "Bots")).catch(() => []),
    );
    if (botsChildren.some((name) => name.startsWith("bot-"))) reasons.push("Bots/bot-*");
  }
  if (topEntries.includes("Shared")) {
    const transfersDir = join(resolved, "Shared", "Transfers");
    if (yield* ioCall("check-transfers", transfersDir, () => pathExists(transfersDir))) {
      reasons.push("Shared/Transfers");
    }
  }
  if (topEntries.includes("backups")) {
    const backupsChildren = yield* ioCall("readdir-backups", join(resolved, "backups"), () =>
      readdir(join(resolved, "backups")).catch(() => []),
    );
    if (backupsChildren.some((name) => /openbot|pokebots/iu.test(name))) reasons.push("backups/app");
  }

  const managed = reasons.length > 0;
  if (!managed) {
    return {
      path: resolved,
      exists: true,
      managed: false,
      managedEntries: [],
      untouchedEntries: topEntries,
      reasons: [],
    };
  }

  const managedSubdirSet = new Set<string>([
    ...MANAGED_WORKSPACE_SUBDIRS,
    ...MANAGED_WORKSPACE_MARKER_FILES,
    ...dbReferencedTopDirs,
  ]);
  const managedEntries = topEntries.filter((name) => managedSubdirSet.has(name));
  const untouchedEntries = topEntries.filter((name) => !managedSubdirSet.has(name));

  return {
    path: resolved,
    exists: true,
    managed: true,
    managedEntries,
    untouchedEntries,
    reasons,
  };
});

async function walkEntries(
  rootDir: string,
  onlyTopEntries: readonly string[] | null,
  excludeTopEntries: ReadonlySet<string>,
): Promise<{
  directories: { relativePath: string; mode: number }[];
  entries: { relativePath: string; kind: "file" | "symlink"; size: number; mode: number; linkTarget: string | null }[];
}> {
  const directories: { relativePath: string; mode: number }[] = [];
  const entries: {
    relativePath: string;
    kind: "file" | "symlink";
    size: number;
    mode: number;
    linkTarget: string | null;
  }[] = [];

  async function visit(currentDir: string, relPrefix: string, isRoot: boolean): Promise<void> {
    const names = (await readdir(currentDir)).sort();
    for (const name of names) {
      if (isRoot) {
        if (excludeTopEntries.has(name)) continue;
        if (onlyTopEntries !== null && !onlyTopEntries.includes(name)) continue;
      }
      if (TRANSIENT_ENTRY_NAMES.has(name)) continue;
      const fullPath = join(currentDir, name);
      const relPath = relPrefix ? `${relPrefix}/${name}` : name;
      const info = await lstat(fullPath);
      if (info.isSymbolicLink()) {
        const linkTarget = await readlink(fullPath);
        entries.push({
          relativePath: relPath,
          kind: "symlink",
          size: 0,
          mode: info.mode & 0o777,
          linkTarget,
        });
      } else if (info.isDirectory()) {
        directories.push({ relativePath: relPath, mode: info.mode & 0o777 || 0o700 });
        await visit(fullPath, relPath, false);
      } else if (info.isFile()) {
        entries.push({
          relativePath: relPath,
          kind: "file",
          size: info.size,
          mode: info.mode & 0o777 || 0o600,
          linkTarget: null,
        });
      }
    }
  }

  await visit(rootDir, "", true);
  return { directories, entries };
}

async function buildDirectoryManifest(
  rootDir: string,
  excludeTopEntries: ReadonlySet<string> = new Set(),
): Promise<DirectoryManifest> {
  const walked = await walkEntries(rootDir, null, excludeTopEntries);
  const manifestEntries: ManifestEntry[] = [];
  let fileCount = 0;
  let symlinkCount = 0;
  let totalBytes = 0;

  for (const item of walked.entries) {
    if (item.kind === "symlink") {
      symlinkCount += 1;
      manifestEntries.push({
        relativePath: item.relativePath,
        kind: "symlink",
        size: 0,
        sha256: sha256OfString(item.linkTarget ?? ""),
        linkTarget: item.linkTarget,
        mode: item.mode,
      });
    } else {
      fileCount += 1;
      totalBytes += item.size;
      const fullPath = join(rootDir, ...item.relativePath.split("/"));
      const sha256 = await sha256OfFile(fullPath);
      manifestEntries.push({
        relativePath: item.relativePath,
        kind: "file",
        size: item.size,
        sha256,
        linkTarget: null,
        mode: item.mode,
      });
    }
  }

  manifestEntries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const summaryLines = manifestEntries
    .map((entry) => `${entry.kind}:${entry.relativePath}:${entry.size}:${entry.sha256}`)
    .join("\n");

  return {
    fileCount,
    symlinkCount,
    totalBytes,
    entries: manifestEntries,
    manifestSha256: sha256OfString(summaryLines),
  };
}

async function verifyDirectoryMatchesManifest(
  rootDir: string,
  expected: DirectoryManifest,
  excludeTopEntries: ReadonlySet<string> = new Set(),
): Promise<void> {
  const actual = await buildDirectoryManifest(rootDir, excludeTopEntries);
  if (
    actual.fileCount !== expected.fileCount ||
    actual.symlinkCount !== expected.symlinkCount ||
    actual.totalBytes !== expected.totalBytes ||
    actual.manifestSha256 !== expected.manifestSha256
  ) {
    throw new ProfileMigrationVerificationError({
      message: `Destination manifest mismatch (expected ${expected.fileCount} files / ${expected.totalBytes} bytes, got ${actual.fileCount} files / ${actual.totalBytes} bytes).`,
      path: redactText(rootDir),
    });
  }
}

async function copyTreeToTarget(options: {
  sourceDir: string;
  targetDir: string;
  onlyTopEntries: readonly string[] | null;
  skipRelPaths: ReadonlySet<string>;
  alreadyCopiedRelPaths?: ReadonlySet<string>;
  onEntryCopied?: (relativePath: string) => Promise<void>;
  faultInjection?: ProfileMigrationFaultInjection;
  phase: "staging" | "activation";
}): Promise<{ copiedCount: number }> {
  await mkdir(options.targetDir, { recursive: true, mode: 0o700 });
  const walked = await walkEntries(options.sourceDir, options.onlyTopEntries, new Set());
  for (const dir of walked.directories) {
    await mkdir(join(options.targetDir, ...dir.relativePath.split("/")), {
      recursive: true,
      mode: dir.mode || 0o700,
    });
  }

  let processed = 0;
  let copiedCount = 0;
  const halfMark = Math.max(1, Math.floor(walked.entries.length / 2));

  for (const item of walked.entries) {
    if (options.skipRelPaths.has(item.relativePath)) continue;

    if (
      options.phase === "activation" &&
      options.faultInjection?.failDestinationWriteWith !== undefined &&
      processed >= 1
    ) {
      const simulatedCode = options.faultInjection.failDestinationWriteWith;
      const simulatedError = Object.assign(new Error(`${simulatedCode}: simulated destination write failure`), {
        code: simulatedCode,
      });
      throw simulatedError;
    }

    const srcPath = join(options.sourceDir, ...item.relativePath.split("/"));
    const destPath = join(options.targetDir, ...item.relativePath.split("/"));

    let alreadyValid = false;
    if (options.alreadyCopiedRelPaths?.has(item.relativePath) && (await pathExists(destPath))) {
      const destStat = await lstat(destPath);
      if (item.kind === "symlink" && destStat.isSymbolicLink()) {
        const currentTarget = await readlink(destPath);
        alreadyValid = currentTarget === item.linkTarget;
      } else if (item.kind === "file" && destStat.isFile() && destStat.size === item.size) {
        const [srcHash, destHash] = await Promise.all([sha256OfFile(srcPath), sha256OfFile(destPath)]);
        alreadyValid = srcHash === destHash;
      }
    }

    if (!alreadyValid) {
      if (item.kind === "symlink") {
        await rm(destPath, { force: true }).catch(() => undefined);
        await symlink(item.linkTarget ?? "", destPath);
      } else {
        await copyFileWithFsync(srcPath, destPath, item.mode);
      }
      copiedCount += 1;
      if (options.onEntryCopied) await options.onEntryCopied(item.relativePath);
    }

    processed += 1;

    if (
      options.phase === "staging" &&
      options.faultInjection?.crashAfterStagingFiles !== undefined &&
      processed >= options.faultInjection.crashAfterStagingFiles
    ) {
      throw new ProfileMigrationCrashError({
        message: `Simulated crash during staging after ${processed} entries.`,
        phase: "staging-profile",
      });
    }

    if (
      options.phase === "activation" &&
      options.faultInjection?.crashDuringActivation === true &&
      processed >= halfMark
    ) {
      throw new ProfileMigrationCrashError({
        message: `Simulated crash during destination activation after ${processed} entries.`,
        phase: "activating-destination",
      });
    }
  }

  return { copiedCount };
}

async function readJournalIfPresent(stagingDir: string): Promise<ProfileMigrationJournal | null> {
  const journalPath = join(stagingDir, PROFILE_MIGRATION_JOURNAL_FILE);
  if (!(await pathExists(journalPath))) return null;
  try {
    const raw = await readFile(journalPath, "utf8");
    const decoded = decodeJournal(JSON.parse(raw));
    return Option.isSome(decoded) ? decoded.value : null;
  } catch {
    return null;
  }
}

async function writeJournal(stagingDir: string, journal: ProfileMigrationJournal): Promise<void> {
  const updated: ProfileMigrationJournal = {
    ...journal,
    updatedAt: new Date().toISOString(),
  };
  await writeTextAtomicallyWithFsync(
    join(stagingDir, PROFILE_MIGRATION_JOURNAL_FILE),
    `${JSON.stringify(updated, null, 2)}\n`,
    0o600,
  );
}

export const rollbackStagedProfileMigration = Effect.fn("ProfileMigration.rollbackStaged")(function* (options: {
  readonly targetProfileDir: string;
  readonly targetWorkspaceDir?: string;
}): Effect.fn.Return<
  { rolledBackProfileStaging: boolean; rolledBackWorkspaceStaging: boolean },
  ProfileMigrationIoError
> {
  const profileStaging = profileStagingDirPath(options.targetProfileDir);
  const rolledBackProfileStaging = yield* ioCall("check-staging", profileStaging, () => pathExists(profileStaging));
  if (rolledBackProfileStaging) {
    yield* ioCall("remove-staging", profileStaging, () => rm(profileStaging, { recursive: true, force: true }));
  }

  let rolledBackWorkspaceStaging = false;
  if (options.targetWorkspaceDir) {
    const workspaceStaging = workspaceStagingDirPath(options.targetWorkspaceDir);
    rolledBackWorkspaceStaging = yield* ioCall("check-workspace-staging", workspaceStaging, () =>
      pathExists(workspaceStaging),
    );
    if (rolledBackWorkspaceStaging) {
      yield* ioCall("remove-workspace-staging", workspaceStaging, () =>
        rm(workspaceStaging, { recursive: true, force: true }),
      );
    }
  }

  return { rolledBackProfileStaging, rolledBackWorkspaceStaging };
});

async function activateDirectoryFromStaging(options: {
  stagingPayloadDir: string;
  targetDir: string;
  manifest: DirectoryManifest;
  faultInjection?: ProfileMigrationFaultInjection;
}): Promise<{ usedCrossVolumeCopy: boolean }> {
  const canTryAtomicRename =
    !(await pathExists(options.targetDir)) &&
    options.faultInjection?.forceCrossVolumeCopy !== true &&
    options.faultInjection?.failDestinationWriteWith === undefined &&
    options.faultInjection?.crashDuringActivation !== true;

  if (canTryAtomicRename) {
    try {
      await rename(options.stagingPayloadDir, options.targetDir);
      await syncDirectoryEntry(dirname(options.targetDir));
      return { usedCrossVolumeCopy: false };
    } catch (cause) {
      if (errorCode(cause) !== "EXDEV") throw cause;
    }
  }

  if (options.faultInjection?.failDestinationWriteWith !== undefined) {
    // Allow copying at least one entry (if non-empty) before triggering simulated ENOSPC/EROFS so rollback is exercised.
    if (options.manifest.entries.length === 0) {
      const code = options.faultInjection.failDestinationWriteWith;
      throw Object.assign(new Error(`${code}: simulated destination write failure`), { code });
    }
  }

  const existingEntries = new Set<string>();
  if (await pathExists(options.targetDir)) {
    const existing = await walkEntries(options.targetDir, null, new Set([PROFILE_MIGRATION_MARKER_FILE]));
    for (const item of existing.entries) existingEntries.add(item.relativePath);
  }

  await copyTreeToTarget({
    sourceDir: options.stagingPayloadDir,
    targetDir: options.targetDir,
    onlyTopEntries: null,
    skipRelPaths: new Set(),
    alreadyCopiedRelPaths: existingEntries,
    faultInjection: options.faultInjection,
    phase: "activation",
  });

  return { usedCrossVolumeCopy: true };
}

export const migrateProfile = Effect.fn("ProfileMigration.migrateProfile")(function* (
  options: ProfileMigrationOptions,
): Effect.fn.Return<ProfileMigrationResult, ProfileMigrationError> {
  const sourceProfileDir = resolve(options.sourceProfileDir);
  const targetProfileDir = resolve(options.targetProfileDir);
  const sourceWorkspaceDir = options.sourceWorkspaceDir ? resolve(options.sourceWorkspaceDir) : null;
  const targetWorkspaceDir = options.targetWorkspaceDir ? resolve(options.targetWorkspaceDir) : null;

  if (sourceProfileDir === targetProfileDir) {
    return yield* new ProfileMigrationVerificationError({
      message: "Source and target profile directories cannot be identical.",
      path: redactText(targetProfileDir),
    });
  }

  const profileStagingDir = profileStagingDirPath(targetProfileDir);
  const profileStagingPayloadDir = join(profileStagingDir, "payload");
  const workspaceStagingDir = targetWorkspaceDir ? workspaceStagingDirPath(targetWorkspaceDir) : null;
  const workspaceStagingPayloadDir = workspaceStagingDir ? join(workspaceStagingDir, "payload") : null;

  const sourceParentCheck = yield* ioCall("check-source-parent", dirname(sourceProfileDir), () =>
    pathExists(dirname(sourceProfileDir)),
  );

  return yield* withProfileMigrationLocks(sourceProfileDir, targetProfileDir, !sourceParentCheck, () =>
    Effect.gen(function* () {
      const sourceInspection = yield* inspectProfileDirectory(sourceProfileDir);
      const targetInspection = yield* inspectProfileDirectory(targetProfileDir);

      // 1. Post-migration idempotency check
      if (targetInspection.hasCompletionMarker && targetInspection.completionMarker !== null) {
        const existingMarker = targetInspection.completionMarker;
        if (existingMarker.sourceProfileDir === sourceProfileDir) {
          if (existingMarker.profileVerification.sqliteIntegrityCheck === "ok") {
            yield* ioCall("verify-target-db", join(targetProfileDir, "openbot.db"), () =>
              verifySqliteIntegrityReadOnly(join(targetProfileDir, "openbot.db")),
            );
          }
          yield* ioCall("cleanup-stale-staging", profileStagingDir, () =>
            rm(profileStagingDir, { recursive: true, force: true }),
          );
          if (workspaceStagingDir) {
            yield* ioCall("cleanup-stale-workspace-staging", workspaceStagingDir, () =>
              rm(workspaceStagingDir, { recursive: true, force: true }),
            );
          }
          return {
            status: "already-migrated",
            targetProfileDir,
            sourceProfileDir,
            sourceRetained: sourceInspection.exists,
            markerPath: migrationMarkerPath(targetProfileDir),
            marker: existingMarker,
          } satisfies ProfileMigrationResult;
        }
      }

      const existingJournal = yield* ioCall("read-journal", profileStagingDir, () =>
        readJournalIfPresent(profileStagingDir),
      );
      const isResumingMatchingActivation =
        existingJournal !== null &&
        existingJournal.sourceProfileDir === sourceProfileDir &&
        existingJournal.targetProfileDir === targetProfileDir &&
        existingJournal.phase === "activating-destination";

      // 2. Clean install / already initialized when source does not exist
      if (!sourceInspection.exists || sourceInspection.ownership === "empty") {
        if (targetInspection.exists && targetInspection.entryCount > 0) {
          return {
            status: "already-initialized",
            targetProfileDir,
            targetInspection,
          } satisfies ProfileMigrationResult;
        }

        const initializedDirectories: string[] = [];
        if (!targetInspection.exists) {
          yield* ioCall("mkdir-target-profile", targetProfileDir, () =>
            mkdir(targetProfileDir, { recursive: true, mode: 0o700 }),
          );
          initializedDirectories.push(targetProfileDir);
        }

        if (targetWorkspaceDir !== null) {
          const workspaceExists = yield* ioCall("check-target-workspace", targetWorkspaceDir, () =>
            pathExists(targetWorkspaceDir),
          );
          if (!workspaceExists) {
            for (const sub of ["Agents", "Shared", "Downloads"]) {
              const dir = join(targetWorkspaceDir, sub);
              yield* ioCall("mkdir-target-workspace", dir, () => mkdir(dir, { recursive: true, mode: 0o700 }));
              initializedDirectories.push(dir);
            }
          }
        }

        if (initializedDirectories.length === 0) {
          return {
            status: "already-initialized",
            targetProfileDir,
            targetInspection,
          } satisfies ProfileMigrationResult;
        }

        return {
          status: "clean-install",
          targetProfileDir,
          targetWorkspaceDir,
          initializedDirectories,
        } satisfies ProfileMigrationResult;
      }

      // 3. Ownership verification
      if (sourceInspection.ownership === "ambiguous") {
        return {
          status: "needs-owner-selection",
          reason: "ambiguous-source-ownership",
          sourceProfileDir,
          targetProfileDir,
          sourceInspection,
          targetInspection,
        } satisfies ProfileMigrationResult;
      }

      // 4. Collision / ambiguous destination check (when not resuming our own interrupted activation)
      if (targetInspection.exists && targetInspection.entryCount > 0 && !isResumingMatchingActivation) {
        return {
          status: "needs-owner-selection",
          reason: targetInspection.ownership === "verified" ? "both-profiles-exist" : "ambiguous-target-ownership",
          sourceProfileDir,
          targetProfileDir,
          sourceInspection,
          targetInspection,
        } satisfies ProfileMigrationResult;
      }

      // 5. Initialize or resume journaled staging
      const resuming =
        existingJournal !== null &&
        existingJournal.sourceProfileDir === sourceProfileDir &&
        existingJournal.targetProfileDir === targetProfileDir;
      const resumedFromPhase = resuming ? existingJournal.phase : null;
      const targetExistedBeforeActivation = targetInspection.exists && targetInspection.entryCount > 0;
      const targetWorkspaceExistedBefore =
        targetWorkspaceDir !== null
          ? yield* ioCall("check-target-workspace-before", targetWorkspaceDir, () => pathExists(targetWorkspaceDir))
          : false;

      let journal: ProfileMigrationJournal = resuming
        ? existingJournal
        : {
            schemaVersion: 1,
            migrationId: randomUUID(),
            phase: "staging-profile",
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sourceProfileDir,
            targetProfileDir,
            sourceWorkspaceDir,
            targetWorkspaceDir,
            sourceDbSha256: null,
            sqliteCheckpointed: false,
            sqliteIntegrityCheck: null,
            sqliteSchemaVersion: null,
            preservedCustomWorkspacePaths: [],
            managedWorkspacePaths: [],
            stagedProfileFiles: [],
            profileManifest: null,
            workspaceStatus: null,
            managedWorkspaceEntries: [],
            untouchedWorkspaceEntries: [],
            workspaceManifest: null,
          };

      const rollbackUncommitted = async (): Promise<void> => {
        if (!targetExistedBeforeActivation || isResumingMatchingActivation) {
          const markerStillAbsent = !(await pathExists(migrationMarkerPath(targetProfileDir)));
          if (markerStillAbsent) {
            await rm(targetProfileDir, { recursive: true, force: true }).catch(() => undefined);
          }
        }
        if (targetWorkspaceDir !== null && !targetWorkspaceExistedBefore) {
          await rm(targetWorkspaceDir, { recursive: true, force: true }).catch(() => undefined);
        }
        await rm(profileStagingDir, { recursive: true, force: true }).catch(() => undefined);
        if (workspaceStagingDir) {
          await rm(workspaceStagingDir, { recursive: true, force: true }).catch(() => undefined);
        }
      };

      const runStages = Effect.gen(function* () {
        yield* ioCall("create-staging-dir", profileStagingPayloadDir, () =>
          mkdir(profileStagingPayloadDir, { recursive: true, mode: 0o700 }),
        );
        if (!resuming) {
          yield* ioCall("write-initial-journal", profileStagingDir, () => writeJournal(profileStagingDir, journal));
        }

        // Stage profile files
        if (journal.phase === "staging-profile") {
          const sourceDbPath = join(sourceProfileDir, "openbot.db");
          if (
            journal.sourceDbSha256 === null &&
            (yield* ioCall("check-source-db", sourceDbPath, () => pathExists(sourceDbPath)))
          ) {
            const sourceDbHash = yield* ioCall("hash-source-db", sourceDbPath, () => sha256OfFile(sourceDbPath));
            journal = { ...journal, sourceDbSha256: sourceDbHash };
            yield* ioCall("update-journal-db-hash", profileStagingDir, () => writeJournal(profileStagingDir, journal));
          }

          const skipRelPaths = new Set<string>();
          if (journal.sqliteCheckpointed) {
            skipRelPaths.add("openbot.db");
            skipRelPaths.add("openbot.db-wal");
            skipRelPaths.add("openbot.db-shm");
          }

          const alreadyStaged = new Set(journal.stagedProfileFiles);
          yield* Effect.tryPromise({
            try: () =>
              copyTreeToTarget({
                sourceDir: sourceProfileDir,
                targetDir: profileStagingPayloadDir,
                onlyTopEntries: null,
                skipRelPaths,
                alreadyCopiedRelPaths: alreadyStaged,
                faultInjection: options.faultInjection,
                phase: "staging",
                onEntryCopied: async (relativePath) => {
                  if (!alreadyStaged.has(relativePath)) {
                    alreadyStaged.add(relativePath);
                    journal = { ...journal, stagedProfileFiles: [...alreadyStaged] };
                    await writeJournal(profileStagingDir, journal);
                  }
                },
              }),
            catch: (cause) =>
              cause instanceof ProfileMigrationCrashError
                ? cause
                : ioError("stage-profile-files", profileStagingPayloadDir, cause),
          });

          const stagedDbPath = join(profileStagingPayloadDir, "openbot.db");
          if (yield* ioCall("check-staged-db", stagedDbPath, () => pathExists(stagedDbPath))) {
            if (!journal.sqliteCheckpointed) {
              const metadata = yield* Effect.try({
                try: () => inspectStagedSqliteMetadata(stagedDbPath, sourceWorkspaceDir),
                catch: (cause) =>
                  cause instanceof ProfileMigrationIntegrityError
                    ? cause
                    : ioError("checkpoint-staged-sqlite", stagedDbPath, cause),
              });
              journal = {
                ...journal,
                sqliteCheckpointed: true,
                sqliteIntegrityCheck: "ok",
                sqliteSchemaVersion: metadata.schemaVersion,
                managedWorkspacePaths: [...metadata.managedWorkspacePaths],
                preservedCustomWorkspacePaths: [...metadata.preservedCustomWorkspacePaths],
              };
            }
          }

          const profileManifest = yield* ioCall("build-profile-manifest", profileStagingPayloadDir, () =>
            buildDirectoryManifest(profileStagingPayloadDir),
          );
          journal = {
            ...journal,
            phase: "staging-workspace",
            profileManifest,
          };
          yield* ioCall("write-journal-staging-workspace", profileStagingDir, () =>
            writeJournal(profileStagingDir, journal),
          );
        }

        // Stage managed workspace
        if (journal.phase === "staging-workspace") {
          let workspaceStatus: ProfileMigrationJournal["workspaceStatus"] = "not-configured";
          let managedEntries: string[] = [];
          let untouchedEntries: string[] = [];
          let workspaceManifest: DirectoryManifest | null = null;

          if (sourceWorkspaceDir !== null && targetWorkspaceDir !== null) {
            const wsInspection = yield* inspectWorkspaceRoot(sourceWorkspaceDir, journal.managedWorkspacePaths);
            if (!wsInspection.exists) {
              workspaceStatus = "not-present";
            } else if (!wsInspection.managed) {
              workspaceStatus = "skipped-unmanaged";
              untouchedEntries = [...wsInspection.untouchedEntries];
            } else {
              const targetWsExists = yield* ioCall("check-target-workspace", targetWorkspaceDir, () =>
                pathExists(targetWorkspaceDir),
              );
              const targetWsEntries = targetWsExists
                ? yield* ioCall("readdir-target-workspace", targetWorkspaceDir, () =>
                    readdir(targetWorkspaceDir).catch(() => []),
                  )
                : [];
              if (targetWsEntries.length > 0) {
                workspaceStatus = "collision-preserved";
                untouchedEntries = [...wsInspection.managedEntries, ...wsInspection.untouchedEntries];
              } else if (workspaceStagingPayloadDir !== null) {
                workspaceStatus = "migrated";
                managedEntries = [...wsInspection.managedEntries];
                untouchedEntries = [...wsInspection.untouchedEntries];
                yield* ioCall("stage-workspace-files", workspaceStagingPayloadDir, () =>
                  copyTreeToTarget({
                    sourceDir: sourceWorkspaceDir,
                    targetDir: workspaceStagingPayloadDir,
                    onlyTopEntries: managedEntries,
                    skipRelPaths: new Set(),
                    phase: "staging",
                  }),
                );
                workspaceManifest = yield* ioCall("build-workspace-manifest", workspaceStagingPayloadDir, () =>
                  buildDirectoryManifest(workspaceStagingPayloadDir),
                );
              }
            }
          }

          journal = {
            ...journal,
            phase: "staged-verified",
            workspaceStatus,
            managedWorkspaceEntries: managedEntries,
            untouchedWorkspaceEntries: untouchedEntries,
            workspaceManifest,
          };
          yield* ioCall("write-journal-staged-verified", profileStagingDir, () =>
            writeJournal(profileStagingDir, journal),
          );
        }

        // Activate destination
        if (journal.phase === "staged-verified") {
          journal = { ...journal, phase: "activating-destination" };
          yield* ioCall("write-journal-activating", profileStagingDir, () => writeJournal(profileStagingDir, journal));
        }

        const profileManifest = journal.profileManifest;
        if (profileManifest === null) {
          return yield* new ProfileMigrationVerificationError({
            message: "Missing staged profile manifest before activation.",
            path: redactText(profileStagingDir),
          });
        }

        let usedCrossVolumeCopy = false;
        if (journal.phase === "activating-destination") {
          const activation = yield* Effect.tryPromise({
            try: () =>
              activateDirectoryFromStaging({
                stagingPayloadDir: profileStagingPayloadDir,
                targetDir: targetProfileDir,
                manifest: profileManifest,
                faultInjection: options.faultInjection,
              }),
            catch: (cause) =>
              cause instanceof ProfileMigrationCrashError
                ? cause
                : ioError("activate-profile-destination", targetProfileDir, cause),
          });
          usedCrossVolumeCopy = activation.usedCrossVolumeCopy;

          // Verify destination file count, byte sizes, SHA-256 checksums, and SQLite PRAGMA integrity_check
          yield* Effect.tryPromise({
            try: () => verifyDirectoryMatchesManifest(targetProfileDir, profileManifest),
            catch: (cause) =>
              cause instanceof ProfileMigrationVerificationError
                ? cause
                : ioError("verify-profile-destination", targetProfileDir, cause),
          });

          const targetDbPath = join(targetProfileDir, "openbot.db");
          let targetDbSha256: string | null = null;
          if (yield* ioCall("check-target-db", targetDbPath, () => pathExists(targetDbPath))) {
            yield* Effect.tryPromise({
              try: () => verifySqliteIntegrityReadOnly(targetDbPath),
              catch: (cause) =>
                cause instanceof ProfileMigrationIntegrityError
                  ? cause
                  : ioError("verify-target-sqlite", targetDbPath, cause),
            });
            targetDbSha256 = yield* ioCall("hash-target-db", targetDbPath, () => sha256OfFile(targetDbPath));
          }

          if (
            journal.workspaceStatus === "migrated" &&
            targetWorkspaceDir !== null &&
            workspaceStagingPayloadDir !== null &&
            journal.workspaceManifest !== null
          ) {
            const wsManifest = journal.workspaceManifest;
            const wsActivation = yield* Effect.tryPromise({
              try: () =>
                activateDirectoryFromStaging({
                  stagingPayloadDir: workspaceStagingPayloadDir,
                  targetDir: targetWorkspaceDir,
                  manifest: wsManifest,
                  faultInjection: options.faultInjection?.forceCrossVolumeCopy
                    ? { forceCrossVolumeCopy: true }
                    : undefined,
                }),
              catch: (cause) =>
                cause instanceof ProfileMigrationCrashError
                  ? cause
                  : ioError("activate-workspace-destination", targetWorkspaceDir, cause),
            });
            usedCrossVolumeCopy = usedCrossVolumeCopy || wsActivation.usedCrossVolumeCopy;
            yield* Effect.tryPromise({
              try: () => verifyDirectoryMatchesManifest(targetWorkspaceDir, wsManifest),
              catch: (cause) =>
                cause instanceof ProfileMigrationVerificationError
                  ? cause
                  : ioError("verify-workspace-destination", targetWorkspaceDir, cause),
            });
          }

          const marker: ProfileMigrationCompletionMarker = {
            schemaVersion: PROFILE_MIGRATION_SCHEMA_VERSION,
            migrationId: journal.migrationId,
            status: "completed",
            completedAt: new Date().toISOString(),
            sourceProfileDir,
            targetProfileDir,
            sourceWorkspaceDir,
            targetWorkspaceDir,
            workspaceStatus: journal.workspaceStatus ?? "not-configured",
            preservedCustomWorkspacePaths: [...journal.preservedCustomWorkspacePaths],
            managedWorkspacePaths: [...journal.managedWorkspacePaths],
            sourceDbSha256: journal.sourceDbSha256,
            targetDbSha256,
            profileVerification: {
              fileCount: profileManifest.fileCount,
              symlinkCount: profileManifest.symlinkCount,
              totalBytes: profileManifest.totalBytes,
              manifestSha256: profileManifest.manifestSha256,
              sqliteIntegrityCheck: journal.sqliteIntegrityCheck,
              sqliteSchemaVersion: journal.sqliteSchemaVersion,
            },
            workspaceVerification:
              journal.workspaceManifest === null
                ? null
                : {
                    fileCount: journal.workspaceManifest.fileCount,
                    symlinkCount: journal.workspaceManifest.symlinkCount,
                    totalBytes: journal.workspaceManifest.totalBytes,
                    manifestSha256: journal.workspaceManifest.manifestSha256,
                  },
            retentionPolicy: {
              retainSource: true,
              policy: options.retentionPolicy ?? "retain-until-approved-cleanup",
              reason: "Preserve original OpenBot profile until Release B retention condition is met.",
            },
          };

          const markerFile = migrationMarkerPath(targetProfileDir);
          yield* ioCall("write-completion-marker", markerFile, () =>
            writeTextAtomicallyWithFsync(markerFile, `${JSON.stringify(marker, null, 2)}\n`, 0o600),
          );

          journal = { ...journal, phase: "completed" };
          yield* ioCall("cleanup-profile-staging", profileStagingDir, () =>
            rm(profileStagingDir, { recursive: true, force: true }),
          );
          if (workspaceStagingDir) {
            yield* ioCall("cleanup-workspace-staging", workspaceStagingDir, () =>
              rm(workspaceStagingDir, { recursive: true, force: true }),
            );
          }

          // Confirm source remains retained and readable
          const sourceStillPresent = yield* ioCall("verify-source-retained", sourceProfileDir, () =>
            pathExists(sourceProfileDir),
          );

          // Resolve realpath of target just to ensure no dangling path issues in result metadata
          yield* ioCall("realpath-target", targetProfileDir, () => realpath(targetProfileDir));

          return {
            status: "migrated",
            migrationId: journal.migrationId,
            resumed: resuming,
            resumedFromPhase,
            usedCrossVolumeCopy,
            sourceRetained: sourceStillPresent,
            sourceProfileDir,
            targetProfileDir,
            markerPath: markerFile,
            marker,
            workspaceMigration: {
              status: marker.workspaceStatus,
              sourceWorkspaceDir,
              targetWorkspaceDir,
              migratedEntries: [...journal.managedWorkspaceEntries],
              untouchedEntries: [...journal.untouchedWorkspaceEntries],
              preservedCustomWorkspacePaths: [...journal.preservedCustomWorkspacePaths],
            },
          } satisfies ProfileMigrationResult;
        }

        return yield* new ProfileMigrationVerificationError({
          message: `Unexpected migration journal phase: ${journal.phase}`,
          path: redactText(profileStagingDir),
        });
      });

      const outcome = yield* Effect.result(runStages);
      if (Result.isSuccess(outcome)) return outcome.success;

      const failure = outcome.failure;
      // Preserve staging + journal on simulated crash so restart recovery resumes deterministically.
      if (failure._tag !== "ProfileMigrationCrashError") {
        yield* Effect.promise(() => rollbackUncommitted());
      }
      return yield* failure;
    }),
  );
});
