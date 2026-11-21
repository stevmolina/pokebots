import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { createOpenBotLogger, redactText } from "@openbot/logging";
import { Effect, Result } from "effect";
import { migrateOpenBotDatabase } from "../src/backend/openbot-database-schema";
import {
  acquireMigrationLock,
  migrateProfile,
  PROFILE_MIGRATION_MARKER_FILE,
  type ProfileMigrationCompletionMarker,
  type ProfileMigrationResult,
  profileLockPath,
  profileStagingDirPath,
  rollbackStagedProfileMigration,
} from "../src/main/profile-migration";

const logger = createOpenBotLogger("profile-migration-e2e");
const REPORT_DIR = resolve(import.meta.dirname, "../.openbot-build/profile-migration-e2e");
const REPORT_PATH = join(REPORT_DIR, "report.json");

interface ScenarioReport {
  readonly name: string;
  readonly passed: boolean;
  readonly durationMs: number;
  readonly details: Record<string, string | number | boolean | null>;
  readonly error: string | null;
}

function assertCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function snapshotDirectoryTree(rootDir: string): Promise<string> {
  if (!existsSync(rootDir)) return "MISSING";
  const lines: string[] = [];

  async function visit(dir: string, prefix: string): Promise<void> {
    const names = (await readdir(dir)).sort();
    for (const name of names) {
      const fullPath = join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const info = await lstat(fullPath);
      if (info.isSymbolicLink()) {
        const target = await readlink(fullPath);
        lines.push(`L:${rel}->${target}`);
      } else if (info.isDirectory()) {
        lines.push(`D:${rel}`);
        await visit(fullPath, rel);
      } else if (info.isFile()) {
        const buf = await readFile(fullPath);
        const hash = createHash("sha256").update(buf).digest("hex");
        lines.push(`F:${rel}:${info.size}:${hash}`);
      }
    }
  }

  await visit(rootDir, "");
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

interface FixtureInfo {
  readonly root: string;
  readonly sourceProfileDir: string;
  readonly targetProfileDir: string;
  readonly sourceWorkspaceDir: string;
  readonly targetWorkspaceDir: string;
  readonly customWorkspaceDir: string;
  readonly customAdditionalDir: string;
  readonly managedAgentId: string;
  readonly customAgentId: string;
  readonly uncheckpointedMemoryId: string;
  readonly uncheckpointedMemoryText: string;
}

async function createReleasedProfileFixture(baseDir: string, options: { tag: string }): Promise<FixtureInfo> {
  const root = join(baseDir, options.tag);
  const sourceProfileDir = join(root, "appData", "OpenBot");
  const targetProfileDir = join(root, "appData", "Pokebots");
  const sourceWorkspaceDir = join(root, "home", "OpenBot");
  const targetWorkspaceDir = join(root, "home", "Pokebots");
  const customWorkspaceDir = join(root, "home", "Projects", "custom-app");
  const customAdditionalDir = join(root, "home", "Projects", "shared-docs");

  const managedAgentId = "agent-11111111-1111-4111-8111-111111111111";
  const customAgentId = "agent-22222222-2222-4222-8222-222222222222";
  const managedAgentWorkspace = join(sourceWorkspaceDir, "Agents", managedAgentId);

  await mkdir(sourceProfileDir, { recursive: true, mode: 0o700 });
  await mkdir(managedAgentWorkspace, { recursive: true, mode: 0o700 });
  await mkdir(join(sourceWorkspaceDir, "Shared", "Transfers", "tx-001"), { recursive: true, mode: 0o700 });
  await mkdir(join(sourceWorkspaceDir, "Downloads"), { recursive: true, mode: 0o700 });
  await mkdir(join(sourceWorkspaceDir, "UserPersonalFolder"), { recursive: true, mode: 0o700 });
  await mkdir(customWorkspaceDir, { recursive: true, mode: 0o700 });
  await mkdir(customAdditionalDir, { recursive: true, mode: 0o700 });

  await writeFile(join(managedAgentWorkspace, "notes.md"), "# Managed Agent Notes\n", "utf8");
  await symlink("./notes.md", join(managedAgentWorkspace, "current"));
  await writeFile(
    join(sourceWorkspaceDir, "Shared", "Transfers", "tx-001", ".openbot-transfer.json"),
    `${JSON.stringify({ version: 2, kind: "message-transfer", transferId: "tx-001" })}\n`,
    "utf8",
  );
  await writeFile(join(sourceWorkspaceDir, "Shared", "Transfers", "tx-001", "spec.pdf"), "%PDF-1.4\nfixture\n", "utf8");
  await writeFile(join(sourceWorkspaceDir, "Downloads", "exported.csv"), "id,name\n1,pokebots\n", "utf8");
  await writeFile(
    join(sourceWorkspaceDir, "UserPersonalFolder", "personal-diary.txt"),
    "Keep this user folder untouched.\n",
    "utf8",
  );
  await writeFile(join(customWorkspaceDir, "README.md"), "# Custom Absolute Repo\n", "utf8");
  await writeFile(join(customAdditionalDir, "handbook.md"), "# Additional Custom Docs\n", "utf8");

  // Profile files: attachments, avatars, preferences, sessions, browser partitions, host state, symlinks
  await mkdir(join(sourceProfileDir, "attachment-drafts", "draft-1"), { recursive: true, mode: 0o700 });
  await writeFile(
    join(sourceProfileDir, "attachment-drafts", "draft-1", "brief.txt"),
    "draft attachment body\n",
    "utf8",
  );
  await mkdir(join(sourceProfileDir, "avatars", "agents"), { recursive: true, mode: 0o700 });
  await writeFile(
    join(sourceProfileDir, "avatars", "agents", `${managedAgentId}.png`),
    Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  );

  await writeFile(
    join(sourceProfileDir, "openbot-setup-v2.json"),
    `${JSON.stringify({ version: 2, completed: true })}\n`,
    "utf8",
  );
  await writeFile(
    join(sourceProfileDir, "openbot-language-preference-v1.json"),
    `${JSON.stringify({ version: 1, language: "en" })}\n`,
    "utf8",
  );
  await writeFile(
    join(sourceProfileDir, "openbot-appearance-preference-v1.json"),
    `${JSON.stringify({ version: 1, theme: "dark" })}\n`,
    "utf8",
  );
  await writeFile(
    join(sourceProfileDir, "openbot-agent-defaults-v1.json"),
    `${JSON.stringify({ version: 1, reasoningEffort: "low" })}\n`,
    "utf8",
  );
  await writeFile(
    join(sourceProfileDir, "openbot-browser-state-v1.json"),
    `${JSON.stringify({ version: 1, activeTabId: "tab-1" })}\n`,
    "utf8",
  );

  // Encrypted session blob + remote servers + provider accounts
  await writeFile(
    join(sourceProfileDir, "openbot-remote-sessions-v1.bin"),
    Buffer.from("v10\x00\x01\x02\x03encrypted-session-fixture"),
  );
  await writeFile(
    join(sourceProfileDir, "openbot-remote-servers-v1.json"),
    `${JSON.stringify({ version: 1, activeServerId: "local", servers: [] })}\n`,
    "utf8",
  );
  await mkdir(join(sourceProfileDir, "provider-accounts"), { recursive: true, mode: 0o700 });
  await writeFile(
    join(sourceProfileDir, "provider-accounts", "codex-default.json"),
    `${JSON.stringify({ version: 1, accountId: "acct-fixture-1" })}\n`,
    "utf8",
  );

  // Browser partitions
  await mkdir(join(sourceProfileDir, "Partitions", "openbot-browser", "Local Storage", "leveldb"), {
    recursive: true,
    mode: 0o700,
  });
  await writeFile(
    join(sourceProfileDir, "Partitions", "openbot-browser", "Cookies"),
    "SQLite format 3\0cookie-data",
    "utf8",
  );
  await writeFile(
    join(sourceProfileDir, "Partitions", "openbot-browser", "Local Storage", "leveldb", "000003.log"),
    "leveldb-entries",
    "utf8",
  );
  await mkdir(join(sourceProfileDir, "Partitions", managedAgentId), { recursive: true, mode: 0o700 });
  await writeFile(
    join(sourceProfileDir, "Partitions", managedAgentId, "Preferences"),
    `${JSON.stringify({ profile: { name: "agent-partition" } })}\n`,
    "utf8",
  );

  // Host state & run marker
  await writeFile(
    join(sourceProfileDir, "openbot-team-server-v2.json"),
    `${JSON.stringify({ version: 2, hostId: "host-fixture-1", serverName: "Fixture Host" })}\n`,
    "utf8",
  );
  await writeFile(
    join(sourceProfileDir, "openbot-server-audit-v1.json"),
    `${JSON.stringify({ version: 1, entries: [] })}\n`,
    "utf8",
  );
  await writeFile(
    join(sourceProfileDir, "openbot-run-marker-v1.json"),
    `${JSON.stringify({
      version: 1,
      appVersion: "0.73.0",
      startedAt: 1000,
      heartbeatAt: 2000,
      state: "clean",
      quitReason: null,
      sleeping: false,
      slept: false,
      osShutdown: false,
    })}\n`,
    "utf8",
  );

  // Profile symlink
  await mkdir(join(sourceProfileDir, "theme-palettes"), { recursive: true, mode: 0o700 });
  await writeFile(join(sourceProfileDir, "theme-palettes", "custom.json"), '{"accent":"#3b82f6"}\n', "utf8");
  await symlink("./custom.json", join(sourceProfileDir, "theme-palettes", "active.json"));

  // Build real released-format SQLite DB in WAL mode with uncheckpointed WAL transactions
  const stagingBuildDir = join(root, "db-build");
  await mkdir(stagingBuildDir, { recursive: true, mode: 0o700 });
  const buildDbPath = join(stagingBuildDir, "openbot.db");
  const now = "2026-11-21T18:00:00.000Z";
  const thread1 = "thread-managed-1";
  const thread2 = "thread-custom-2";
  const uncheckpointedMemoryId = "mem-wal-uncheckpointed";
  const uncheckpointedMemoryText = "WAL transaction that must survive migration";

  const db = new DatabaseSync(buildDbPath);
  try {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA wal_autocheckpoint = 0");
    migrateOpenBotDatabase(db, { appliedAt: now, closedCleanly: true });

    db.prepare(
      `INSERT INTO orchestration_events(event_id, command_id, aggregate_type, aggregate_id, event_type, occurred_at, payload_json)
       VALUES (?, ?, 'roster', 'roster', 'roster.updated', ?, ?)`,
    ).run(randomUUID(), "cmd-seed-1", now, JSON.stringify({ tag: options.tag }));

    db.prepare(
      `INSERT INTO projection_threads(thread_id, agent_id, title, active_turn_id, created_at, updated_at, last_event_sequence)
       VALUES (?, ?, ?, NULL, ?, ?, 1)`,
    ).run(thread1, managedAgentId, "Managed Chat", now, now);
    db.prepare(
      `INSERT INTO projection_threads(thread_id, agent_id, title, active_turn_id, created_at, updated_at, last_event_sequence)
       VALUES (?, ?, ?, NULL, ?, ?, 1)`,
    ).run(thread2, customAgentId, "Custom Repo Chat", now, now);

    const managedAgentJson = JSON.stringify({
      id: managedAgentId,
      name: "Managed Agent",
      workspacePath: managedAgentWorkspace,
      threadId: thread1,
      provider: "codex",
      model: "gpt-6-luna",
    });
    const customAgentJson = JSON.stringify({
      id: customAgentId,
      name: "Custom Workspace Agent",
      workspacePath: customWorkspaceDir,
      additionalFolders: [customAdditionalDir],
      threadId: thread2,
      provider: "claude",
      model: "claude-sonnet-4-6",
    });

    db.prepare(
      `INSERT INTO projection_agents(agent_id, thread_id, model, updated_at, sort_order, agent_json, last_event_sequence)
       VALUES (?, ?, 'gpt-6-luna', ?, 0, ?, 1)`,
    ).run(managedAgentId, thread1, now, managedAgentJson);
    db.prepare(
      `INSERT INTO projection_agents(agent_id, thread_id, model, updated_at, sort_order, agent_json, last_event_sequence)
       VALUES (?, ?, 'claude-sonnet-4-6', ?, 1, ?, 1)`,
    ).run(customAgentId, thread2, now, customAgentJson);

    db.prepare(
      `INSERT INTO projection_provider_sessions(id, thread_id, provider, external_session_id, model, effort, state, created_at, updated_at, last_event_sequence, resume_cursor)
       VALUES (?, ?, 'codex', 'ext-sess-1', 'gpt-6-luna', 'low', 'active', ?, ?, 1, NULL)`,
    ).run("psess-1", thread1, now, now);

    db.prepare(
      `INSERT INTO projection_agent_memories(memory_id, agent_id, text, normalized_text, origin, source_turn_id, created_at, updated_at, last_event_sequence)
       VALUES (?, ?, ?, ?, 'manual', NULL, ?, ?, 1)`,
    ).run("mem-checkpointed-1", managedAgentId, "Checkpointed memory", "checkpointed memory", now, now);

    // Flush baseline rows into main DB file, then insert an uncheckpointed row into WAL
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");

    db.prepare(
      `INSERT INTO projection_agent_memories(memory_id, agent_id, text, normalized_text, origin, source_turn_id, created_at, updated_at, last_event_sequence)
       VALUES (?, ?, ?, ?, 'manual', NULL, ?, ?, 2)`,
    ).run(
      uncheckpointedMemoryId,
      managedAgentId,
      uncheckpointedMemoryText,
      uncheckpointedMemoryText.toLowerCase(),
      now,
      now,
    );

    // Copy raw DB + WAL + SHM while uncheckpointed frames sit in WAL
    await copyFile(buildDbPath, join(sourceProfileDir, "openbot.db"));
    await copyFile(`${buildDbPath}-wal`, join(sourceProfileDir, "openbot.db-wal"));
    if (existsSync(`${buildDbPath}-shm`)) {
      await copyFile(`${buildDbPath}-shm`, join(sourceProfileDir, "openbot.db-shm"));
    }
  } finally {
    db.close();
    await rm(stagingBuildDir, { recursive: true, force: true });
  }

  // Confirm with immutable read that uncheckpointedMemoryId is NOT in base openbot.db yet (only in WAL)
  const immutableUri = `${pathToFileURL(join(sourceProfileDir, "openbot.db")).href}?immutable=1`;
  const immDb = new DatabaseSync(immutableUri, { readOnly: true });
  try {
    const walOnlyRow = immDb
      .prepare("SELECT memory_id FROM projection_agent_memories WHERE memory_id = ?")
      .get(uncheckpointedMemoryId);
    assertCondition(walOnlyRow === undefined, "Expected uncheckpointed WAL row to reside only in -wal sidecar.");
  } finally {
    immDb.close();
  }

  return {
    root,
    sourceProfileDir,
    targetProfileDir,
    sourceWorkspaceDir,
    targetWorkspaceDir,
    customWorkspaceDir,
    customAdditionalDir,
    managedAgentId,
    customAgentId,
    uncheckpointedMemoryId,
    uncheckpointedMemoryText,
  };
}

function verifyMigratedFixtureData(fixture: FixtureInfo, result: ProfileMigrationResult): Promise<void> {
  return (async () => {
    assertCondition(result.status === "migrated", `Expected migrated status, got ${result.status}`);
    assertCondition(result.sourceRetained, "Expected original source profile to be retained.");
    assertCondition(existsSync(fixture.sourceProfileDir), "Source profile directory must stay retained.");
    assertCondition(existsSync(result.markerPath), "Completion marker must exist.");

    const markerRaw = await readFile(result.markerPath, "utf8");
    const marker: ProfileMigrationCompletionMarker = JSON.parse(markerRaw);
    assertCondition(marker.schemaVersion === 1, "Marker schemaVersion must be 1.");
    assertCondition(marker.retentionPolicy.retainSource === true, "Retention policy must retain source.");
    assertCondition(
      marker.profileVerification.sqliteIntegrityCheck === "ok",
      "Marker must record sqliteIntegrityCheck === ok.",
    );

    // Verify target SQLite rows including uncheckpointed WAL row and preserved custom workspace paths
    const targetDb = new DatabaseSync(join(fixture.targetProfileDir, "openbot.db"), { readOnly: true });
    try {
      const integrity = targetDb.prepare("PRAGMA integrity_check").all();
      assertCondition(
        integrity.length === 1 && isDynamicRecord(integrity[0]) && integrity[0].integrity_check === "ok",
        "Target SQLite PRAGMA integrity_check must return ok.",
      );
      const walRow = targetDb
        .prepare("SELECT text FROM projection_agent_memories WHERE memory_id = ?")
        .get(fixture.uncheckpointedMemoryId);
      assertCondition(
        isDynamicRecord(walRow) && walRow.text === fixture.uncheckpointedMemoryText,
        "Uncheckpointed WAL memory row must exist in migrated target openbot.db.",
      );
      const customAgentRow = targetDb
        .prepare("SELECT agent_json FROM projection_agents WHERE agent_id = ?")
        .get(fixture.customAgentId);
      assertCondition(
        isDynamicRecord(customAgentRow) && isString(customAgentRow.agent_json),
        "Custom agent row must exist.",
      );
      const customAgentParsed = JSON.parse(customAgentRow.agent_json);
      assertCondition(
        isDynamicRecord(customAgentParsed) && customAgentParsed.workspacePath === fixture.customWorkspaceDir,
        "Custom absolute workspacePath must be preserved verbatim in SQLite.",
      );
      const sessionRow = targetDb
        .prepare("SELECT external_session_id FROM projection_provider_sessions WHERE id = ?")
        .get("psess-1");
      assertCondition(
        isDynamicRecord(sessionRow) && sessionRow.external_session_id === "ext-sess-1",
        "Provider session row must survive migration.",
      );
    } finally {
      targetDb.close();
    }

    // Verify attachments, preferences, sessions, browser partitions, host state, symlinks
    const draft = await readFile(join(fixture.targetProfileDir, "attachment-drafts", "draft-1", "brief.txt"), "utf8");
    assertCondition(draft === "draft attachment body\n", "Attachment draft must match.");
    const pref = await readFile(join(fixture.targetProfileDir, "openbot-language-preference-v1.json"), "utf8");
    assertCondition(
      pref.includes('"language":"en"') || pref.includes('"language": "en"'),
      "Preference JSON must match.",
    );
    const sessionBin = await readFile(join(fixture.targetProfileDir, "openbot-remote-sessions-v1.bin"));
    assertCondition(sessionBin.toString("utf8").includes("encrypted-session-fixture"), "Session binary must match.");
    const partitionCookie = await readFile(
      join(fixture.targetProfileDir, "Partitions", "openbot-browser", "Cookies"),
      "utf8",
    );
    assertCondition(partitionCookie.includes("cookie-data"), "Browser partition Cookies must match.");
    const hostState = await readFile(join(fixture.targetProfileDir, "openbot-team-server-v2.json"), "utf8");
    assertCondition(hostState.includes("host-fixture-1"), "Host state must match.");

    const profileLink = join(fixture.targetProfileDir, "theme-palettes", "active.json");
    assertCondition((await lstat(profileLink)).isSymbolicLink(), "Profile symlink must remain a symlink.");
    assertCondition((await readlink(profileLink)) === "./custom.json", "Profile symlink target must match.");

    const wsLink = join(fixture.targetWorkspaceDir, "Agents", fixture.managedAgentId, "current");
    assertCondition((await lstat(wsLink)).isSymbolicLink(), "Workspace symlink must remain a symlink.");
    assertCondition((await readlink(wsLink)) === "./notes.md", "Workspace symlink target must match.");

    // Verify transfer attachment migrated & user-created folder untouched & custom workspace untouched
    const transferPdf = await readFile(
      join(fixture.targetWorkspaceDir, "Shared", "Transfers", "tx-001", "spec.pdf"),
      "utf8",
    );
    assertCondition(transferPdf.includes("fixture"), "Shared transfer attachment must migrate.");
    assertCondition(
      !existsSync(join(fixture.targetWorkspaceDir, "UserPersonalFolder")),
      "Unrelated user-created subfolder must NOT be migrated into targetWorkspaceDir.",
    );
    assertCondition(
      existsSync(join(fixture.sourceWorkspaceDir, "UserPersonalFolder", "personal-diary.txt")),
      "Unrelated user-created subfolder must remain intact in source.",
    );
    assertCondition(
      existsSync(join(fixture.customWorkspaceDir, "README.md")),
      "Custom absolute workspace path must remain intact on disk.",
    );
    assertCondition(
      result.workspaceMigration.preservedCustomWorkspacePaths.includes(fixture.customWorkspaceDir),
      "Custom absolute workspacePath must be listed in preservedCustomWorkspacePaths.",
    );
  })();
}

async function runScenario(
  name: string,
  work: () => Promise<Record<string, string | number | boolean | null>>,
): Promise<ScenarioReport> {
  const started = Date.now();
  try {
    const details = await work();
    return {
      name,
      passed: true,
      durationMs: Date.now() - started,
      details,
      error: null,
    };
  } catch (cause) {
    return {
      name,
      passed: false,
      durationMs: Date.now() - started,
      details: {},
      error: redactText(cause instanceof Error ? cause.message : String(cause)),
    };
  }
}

async function main(): Promise<void> {
  const workDir = await mkdtemp(join(tmpdir(), "pokebots-profile-migration-e2e-"));
  const scenarios: ScenarioReport[] = [];

  try {
    // 1. Clean install
    scenarios.push(
      await runScenario("clean-install", async () => {
        const cleanRoot = join(workDir, "clean-install");
        const sourceProfileDir = join(cleanRoot, "appData", "OpenBot");
        const targetProfileDir = join(cleanRoot, "appData", "Pokebots");
        const sourceWorkspaceDir = join(cleanRoot, "home", "OpenBot");
        const targetWorkspaceDir = join(cleanRoot, "home", "Pokebots");

        const first = await Effect.runPromise(
          migrateProfile({ sourceProfileDir, targetProfileDir, sourceWorkspaceDir, targetWorkspaceDir }),
        );
        assertCondition(first.status === "clean-install", `Expected clean-install, got ${first.status}`);
        assertCondition(existsSync(targetProfileDir), "Target profile directory should be created.");
        assertCondition(existsSync(join(targetWorkspaceDir, "Agents")), "Target Agents dir should be created.");
        assertCondition(
          !existsSync(join(targetProfileDir, PROFILE_MIGRATION_MARKER_FILE)),
          "Clean install should not write a migration completion marker.",
        );

        const second = await Effect.runPromise(
          migrateProfile({ sourceProfileDir, targetProfileDir, sourceWorkspaceDir, targetWorkspaceDir }),
        );
        assertCondition(second.status === "already-initialized", `Expected already-initialized, got ${second.status}`);
        return { firstStatus: first.status, secondStatus: second.status };
      }),
    );

    // 2. Direct upgrade from released-format profile fixture (plus cross-volume mode & post-migration idempotency)
    const directFixture = await createReleasedProfileFixture(workDir, { tag: "direct-upgrade" });
    const sourceHashBeforeDirect = await snapshotDirectoryTree(directFixture.sourceProfileDir);
    const customHashBeforeDirect = await snapshotDirectoryTree(directFixture.customWorkspaceDir);

    scenarios.push(
      await runScenario("direct-upgrade-released-fixture", async () => {
        const result = await Effect.runPromise(
          migrateProfile({
            sourceProfileDir: directFixture.sourceProfileDir,
            targetProfileDir: directFixture.targetProfileDir,
            sourceWorkspaceDir: directFixture.sourceWorkspaceDir,
            targetWorkspaceDir: directFixture.targetWorkspaceDir,
          }),
        );
        await verifyMigratedFixtureData(directFixture, result);
        const sourceHashAfter = await snapshotDirectoryTree(directFixture.sourceProfileDir);
        const customHashAfter = await snapshotDirectoryTree(directFixture.customWorkspaceDir);
        assertCondition(sourceHashAfter === sourceHashBeforeDirect, "Source profile must remain byte-identical.");
        assertCondition(customHashAfter === customHashBeforeDirect, "Custom workspace must remain byte-identical.");
        return {
          status: result.status,
          resumed: result.status === "migrated" ? result.resumed : false,
          fileCount: result.status === "migrated" ? result.marker.profileVerification.fileCount : 0,
          customPathsPreserved:
            result.status === "migrated" ? result.workspaceMigration.preservedCustomWorkspacePaths.length : 0,
        };
      }),
    );

    // 2b. Cross-volume copy+fsync+verify path
    scenarios.push(
      await runScenario("cross-volume-copy-fsync-verify", async () => {
        const crossFixture = await createReleasedProfileFixture(workDir, { tag: "cross-volume" });
        const result = await Effect.runPromise(
          migrateProfile({
            sourceProfileDir: crossFixture.sourceProfileDir,
            targetProfileDir: crossFixture.targetProfileDir,
            sourceWorkspaceDir: crossFixture.sourceWorkspaceDir,
            targetWorkspaceDir: crossFixture.targetWorkspaceDir,
            faultInjection: { forceCrossVolumeCopy: true },
          }),
        );
        await verifyMigratedFixtureData(crossFixture, result);
        assertCondition(
          result.status === "migrated" && result.usedCrossVolumeCopy === true,
          "Expected usedCrossVolumeCopy === true.",
        );
        return {
          status: result.status,
          usedCrossVolumeCopy: result.status === "migrated" ? result.usedCrossVolumeCopy : false,
        };
      }),
    );

    // 3. Post-migration idempotency (second run on directFixture)
    scenarios.push(
      await runScenario("post-migration-idempotency", async () => {
        const targetBefore = await snapshotDirectoryTree(directFixture.targetProfileDir);
        const second = await Effect.runPromise(
          migrateProfile({
            sourceProfileDir: directFixture.sourceProfileDir,
            targetProfileDir: directFixture.targetProfileDir,
            sourceWorkspaceDir: directFixture.sourceWorkspaceDir,
            targetWorkspaceDir: directFixture.targetWorkspaceDir,
          }),
        );
        assertCondition(second.status === "already-migrated", `Expected already-migrated, got ${second.status}`);
        const targetAfter = await snapshotDirectoryTree(directFixture.targetProfileDir);
        assertCondition(targetAfter === targetBefore, "Second run must not modify target profile.");
        return {
          status: second.status,
          sourceRetained: second.status === "already-migrated" ? second.sourceRetained : false,
        };
      }),
    );

    // 4. User-created non-managed folder protection
    scenarios.push(
      await runScenario("user-created-folder-protection", async () => {
        const userFixture = await createReleasedProfileFixture(workDir, { tag: "user-folder-protection" });
        // Replace sourceWorkspaceDir with an unrelated user-created folder named "OpenBot"
        await rm(userFixture.sourceWorkspaceDir, { recursive: true, force: true });
        await mkdir(join(userFixture.sourceWorkspaceDir, "Downloads"), { recursive: true, mode: 0o700 });
        await writeFile(join(userFixture.sourceWorkspaceDir, "README.md"), "My robotics CAD repo\n", "utf8");
        await writeFile(join(userFixture.sourceWorkspaceDir, "Downloads", "invoice.pdf"), "personal-pdf\n", "utf8");
        // Rewrite DB so only custom absolute path is stored (no managed ~/OpenBot path)
        const db = new DatabaseSync(join(userFixture.sourceProfileDir, "openbot.db"));
        try {
          db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
          db.prepare("DELETE FROM projection_agents WHERE agent_id = ?").run(userFixture.managedAgentId);
        } finally {
          db.close();
        }
        const userFolderBefore = await snapshotDirectoryTree(userFixture.sourceWorkspaceDir);

        const result = await Effect.runPromise(
          migrateProfile({
            sourceProfileDir: userFixture.sourceProfileDir,
            targetProfileDir: userFixture.targetProfileDir,
            sourceWorkspaceDir: userFixture.sourceWorkspaceDir,
            targetWorkspaceDir: userFixture.targetWorkspaceDir,
          }),
        );
        assertCondition(result.status === "migrated", `Expected migrated, got ${result.status}`);
        assertCondition(
          result.workspaceMigration.status === "skipped-unmanaged",
          `Expected skipped-unmanaged workspace, got ${result.workspaceMigration.status}`,
        );
        assertCondition(
          !existsSync(userFixture.targetWorkspaceDir),
          "Target workspace must not be created for unmanaged folder.",
        );
        const userFolderAfter = await snapshotDirectoryTree(userFixture.sourceWorkspaceDir);
        assertCondition(
          userFolderAfter === userFolderBefore,
          "User-created OpenBot folder must remain byte-identical.",
        );
        return { workspaceStatus: result.workspaceMigration.status };
      }),
    );

    // 5. Concurrent lock contention
    scenarios.push(
      await runScenario("concurrent-lock-contention", async () => {
        const lockFixture = await createReleasedProfileFixture(workDir, { tag: "lock-contention" });
        const sourceBefore = await snapshotDirectoryTree(lockFixture.sourceProfileDir);

        const contendedOutcome = await Effect.runPromise(
          Effect.acquireUseRelease(
            acquireMigrationLock(lockFixture.sourceProfileDir, "source"),
            () =>
              Effect.result(
                migrateProfile({
                  sourceProfileDir: lockFixture.sourceProfileDir,
                  targetProfileDir: lockFixture.targetProfileDir,
                  sourceWorkspaceDir: lockFixture.sourceWorkspaceDir,
                  targetWorkspaceDir: lockFixture.targetWorkspaceDir,
                }),
              ),
            (held) => held.release(),
          ),
        );

        assertCondition(Result.isFailure(contendedOutcome), "Expected lock contention to fail cleanly.");
        assertCondition(
          contendedOutcome.failure._tag === "ProfileMigrationLockError",
          `Expected ProfileMigrationLockError, got ${contendedOutcome.failure._tag}`,
        );
        assertCondition(!existsSync(lockFixture.targetProfileDir), "Target profile must not be created while locked.");
        const sourceAfter = await snapshotDirectoryTree(lockFixture.sourceProfileDir);
        assertCondition(sourceAfter === sourceBefore, "Source must remain byte-identical under lock contention.");

        // After lock release, migration succeeds
        const retry = await Effect.runPromise(
          migrateProfile({
            sourceProfileDir: lockFixture.sourceProfileDir,
            targetProfileDir: lockFixture.targetProfileDir,
            sourceWorkspaceDir: lockFixture.sourceWorkspaceDir,
            targetWorkspaceDir: lockFixture.targetWorkspaceDir,
          }),
        );
        assertCondition(retry.status === "migrated", `Expected retry after unlock to migrate, got ${retry.status}`);
        return { errorTag: contendedOutcome.failure._tag, retryStatus: retry.status };
      }),
    );

    // 6. Collision & ambiguous ownership
    scenarios.push(
      await runScenario("collision-and-ambiguous-ownership", async () => {
        // 6a. Both source and target have live OpenBot/Pokebots profiles
        const bothFixture = await createReleasedProfileFixture(workDir, { tag: "collision-both" });
        await mkdir(bothFixture.targetProfileDir, { recursive: true, mode: 0o700 });
        await copyFile(
          join(bothFixture.sourceProfileDir, "openbot.db"),
          join(bothFixture.targetProfileDir, "openbot.db"),
        );
        await writeFile(
          join(bothFixture.targetProfileDir, "openbot-setup-v2.json"),
          '{"version":2,"completed":true,"profile":"existing-target"}\n',
          "utf8",
        );
        const srcBefore = await snapshotDirectoryTree(bothFixture.sourceProfileDir);
        const dstBefore = await snapshotDirectoryTree(bothFixture.targetProfileDir);

        const collisionResult = await Effect.runPromise(
          migrateProfile({
            sourceProfileDir: bothFixture.sourceProfileDir,
            targetProfileDir: bothFixture.targetProfileDir,
          }),
        );
        assertCondition(
          collisionResult.status === "needs-owner-selection",
          `Expected needs-owner-selection, got ${collisionResult.status}`,
        );
        assertCondition(
          collisionResult.reason === "both-profiles-exist",
          `Expected both-profiles-exist, got ${collisionResult.reason}`,
        );
        assertCondition((await snapshotDirectoryTree(bothFixture.sourceProfileDir)) === srcBefore, "Source preserved.");
        assertCondition((await snapshotDirectoryTree(bothFixture.targetProfileDir)) === dstBefore, "Target preserved.");

        // 6b. Ambiguous source ownership (not a Pokebots/OpenBot profile)
        const ambigRoot = join(workDir, "ambiguous-source");
        const ambigSource = join(ambigRoot, "OpenBot");
        const ambigTarget = join(ambigRoot, "Pokebots");
        await mkdir(ambigSource, { recursive: true, mode: 0o700 });
        await writeFile(join(ambigSource, "openbot.db"), "NOT-A-SQLITE-FILE", "utf8");
        await writeFile(join(ambigSource, "notes.txt"), "random user files", "utf8");
        const ambigBefore = await snapshotDirectoryTree(ambigSource);

        const ambigResult = await Effect.runPromise(
          migrateProfile({ sourceProfileDir: ambigSource, targetProfileDir: ambigTarget }),
        );
        assertCondition(
          ambigResult.status === "needs-owner-selection" && ambigResult.reason === "ambiguous-source-ownership",
          `Expected ambiguous-source-ownership, got ${ambigResult.status}`,
        );
        assertCondition(!existsSync(ambigTarget), "Ambiguous source must not create target.");
        assertCondition((await snapshotDirectoryTree(ambigSource)) === ambigBefore, "Ambiguous source untouched.");

        return {
          bothReason: collisionResult.reason,
          ambiguousReason: ambigResult.reason,
        };
      }),
    );

    // 7. Interrupted upgrade mid-move + deterministic resume on restart
    scenarios.push(
      await runScenario("interrupted-upgrade-and-deterministic-resume", async () => {
        // 7a. Mid-staging crash + stale dead-PID lock reclamation
        const resumeFixture = await createReleasedProfileFixture(workDir, { tag: "interrupted-staging" });
        const crashResult = await Effect.runPromise(
          Effect.result(
            migrateProfile({
              sourceProfileDir: resumeFixture.sourceProfileDir,
              targetProfileDir: resumeFixture.targetProfileDir,
              sourceWorkspaceDir: resumeFixture.sourceWorkspaceDir,
              targetWorkspaceDir: resumeFixture.targetWorkspaceDir,
              faultInjection: { crashAfterStagingFiles: 3 },
            }),
          ),
        );
        assertCondition(Result.isFailure(crashResult), "Expected simulated mid-staging crash.");
        assertCondition(
          crashResult.failure._tag === "ProfileMigrationCrashError",
          `Expected ProfileMigrationCrashError, got ${crashResult.failure._tag}`,
        );
        assertCondition(
          existsSync(profileStagingDirPath(resumeFixture.targetProfileDir)),
          "Staging directory must remain for deterministic resume.",
        );
        assertCondition(
          !existsSync(resumeFixture.targetProfileDir),
          "Target profile must not exist after mid-staging crash.",
        );

        // Plant a stale lock with dead PID to verify stale lock recovery on restart
        await writeFile(
          profileLockPath(resumeFixture.sourceProfileDir),
          JSON.stringify({
            version: 1,
            pid: 999999,
            createdAt: "2026-01-01T00:00:00.000Z",
            role: "source",
            profileDir: resumeFixture.sourceProfileDir,
          }),
          "utf8",
        );

        const resumed = await Effect.runPromise(
          migrateProfile({
            sourceProfileDir: resumeFixture.sourceProfileDir,
            targetProfileDir: resumeFixture.targetProfileDir,
            sourceWorkspaceDir: resumeFixture.sourceWorkspaceDir,
            targetWorkspaceDir: resumeFixture.targetWorkspaceDir,
          }),
        );
        await verifyMigratedFixtureData(resumeFixture, resumed);
        assertCondition(
          resumed.status === "migrated" && resumed.resumed && resumed.resumedFromPhase === "staging-profile",
          "Expected deterministic resume from staging-profile.",
        );

        // 7b. Mid-activation crash (cross-volume) + deterministic resume
        const actFixture = await createReleasedProfileFixture(workDir, { tag: "interrupted-activation" });
        const actCrash = await Effect.runPromise(
          Effect.result(
            migrateProfile({
              sourceProfileDir: actFixture.sourceProfileDir,
              targetProfileDir: actFixture.targetProfileDir,
              sourceWorkspaceDir: actFixture.sourceWorkspaceDir,
              targetWorkspaceDir: actFixture.targetWorkspaceDir,
              faultInjection: { forceCrossVolumeCopy: true, crashDuringActivation: true },
            }),
          ),
        );
        assertCondition(
          Result.isFailure(actCrash) && actCrash.failure._tag === "ProfileMigrationCrashError",
          "Expected simulated crash during activation.",
        );
        assertCondition(
          existsSync(actFixture.targetProfileDir) &&
            !existsSync(join(actFixture.targetProfileDir, PROFILE_MIGRATION_MARKER_FILE)),
          "Partial target exists without completion marker after activation crash.",
        );

        const actResumed = await Effect.runPromise(
          migrateProfile({
            sourceProfileDir: actFixture.sourceProfileDir,
            targetProfileDir: actFixture.targetProfileDir,
            sourceWorkspaceDir: actFixture.sourceWorkspaceDir,
            targetWorkspaceDir: actFixture.targetWorkspaceDir,
            faultInjection: { forceCrossVolumeCopy: true },
          }),
        );
        await verifyMigratedFixtureData(actFixture, actResumed);
        assertCondition(
          actResumed.status === "migrated" &&
            actResumed.resumed &&
            actResumed.resumedFromPhase === "activating-destination",
          "Expected deterministic resume from activating-destination.",
        );

        return {
          stagingResumedFrom: resumed.status === "migrated" ? resumed.resumedFromPhase : null,
          activationResumedFrom: actResumed.status === "migrated" ? actResumed.resumedFromPhase : null,
        };
      }),
    );

    // 8. Rollback before first write + read-only parent + simulated ENOSPC failure + retry
    scenarios.push(
      await runScenario("rollback-readonly-and-disk-full-retry", async () => {
        const failFixture = await createReleasedProfileFixture(workDir, { tag: "rollback-and-failures" });
        const sourceBefore = await snapshotDirectoryTree(failFixture.sourceProfileDir);
        const wsBefore = await snapshotDirectoryTree(failFixture.sourceWorkspaceDir);

        // 8a. Explicit rollback before first destination write
        const crashBeforeWrite = await Effect.runPromise(
          Effect.result(
            migrateProfile({
              sourceProfileDir: failFixture.sourceProfileDir,
              targetProfileDir: failFixture.targetProfileDir,
              sourceWorkspaceDir: failFixture.sourceWorkspaceDir,
              targetWorkspaceDir: failFixture.targetWorkspaceDir,
              faultInjection: { crashAfterStagingFiles: 2 },
            }),
          ),
        );
        assertCondition(Result.isFailure(crashBeforeWrite), "Expected simulated crash before rollback test.");
        const rolledBack = await Effect.runPromise(
          rollbackStagedProfileMigration({
            targetProfileDir: failFixture.targetProfileDir,
            targetWorkspaceDir: failFixture.targetWorkspaceDir,
          }),
        );
        assertCondition(rolledBack.rolledBackProfileStaging, "Expected staging rollback to clean staging dir.");
        assertCondition(!existsSync(failFixture.targetProfileDir), "No target profile after rollback.");
        assertCondition((await snapshotDirectoryTree(failFixture.sourceProfileDir)) === sourceBefore, "Source intact.");

        // 8b. Read-only destination parent
        const targetParent = join(failFixture.root, "appData");
        await chmod(targetParent, 0o555);
        let readOnlyTag: string | null = null;
        try {
          const roResult = await Effect.runPromise(
            Effect.result(
              migrateProfile({
                sourceProfileDir: failFixture.sourceProfileDir,
                targetProfileDir: failFixture.targetProfileDir,
                sourceWorkspaceDir: failFixture.sourceWorkspaceDir,
                targetWorkspaceDir: failFixture.targetWorkspaceDir,
              }),
            ),
          );
          assertCondition(Result.isFailure(roResult), "Expected read-only parent failure.");
          readOnlyTag = roResult.failure._tag;
          assertCondition(
            (await snapshotDirectoryTree(failFixture.sourceProfileDir)) === sourceBefore,
            "Source intact.",
          );
        } finally {
          await chmod(targetParent, 0o755);
        }

        // 8c. Simulated ENOSPC during destination write -> clean rollback -> retry succeeds
        const enospcResult = await Effect.runPromise(
          Effect.result(
            migrateProfile({
              sourceProfileDir: failFixture.sourceProfileDir,
              targetProfileDir: failFixture.targetProfileDir,
              sourceWorkspaceDir: failFixture.sourceWorkspaceDir,
              targetWorkspaceDir: failFixture.targetWorkspaceDir,
              faultInjection: { forceCrossVolumeCopy: true, failDestinationWriteWith: "ENOSPC" },
            }),
          ),
        );
        assertCondition(Result.isFailure(enospcResult), "Expected ENOSPC failure.");
        assertCondition(
          enospcResult.failure._tag === "ProfileMigrationIoError" && enospcResult.failure.code === "ENOSPC",
          `Expected ProfileMigrationIoError with ENOSPC, got ${enospcResult.failure._tag}`,
        );
        assertCondition(
          !existsSync(failFixture.targetProfileDir) && !existsSync(profileStagingDirPath(failFixture.targetProfileDir)),
          "Partial destination and staging must roll back cleanly after ENOSPC.",
        );
        assertCondition(
          (await snapshotDirectoryTree(failFixture.sourceProfileDir)) === sourceBefore,
          "Source byte-identical.",
        );
        assertCondition(
          (await snapshotDirectoryTree(failFixture.sourceWorkspaceDir)) === wsBefore,
          "Workspace byte-identical.",
        );

        // 8d. Subsequent retry succeeds cleanly
        const retryResult = await Effect.runPromise(
          migrateProfile({
            sourceProfileDir: failFixture.sourceProfileDir,
            targetProfileDir: failFixture.targetProfileDir,
            sourceWorkspaceDir: failFixture.sourceWorkspaceDir,
            targetWorkspaceDir: failFixture.targetWorkspaceDir,
          }),
        );
        await verifyMigratedFixtureData(failFixture, retryResult);

        return {
          readOnlyErrorTag: readOnlyTag,
          enospcCode: enospcResult.failure.code,
          retryStatus: retryResult.status,
        };
      }),
    );

    const passedCount = scenarios.filter((scenario) => scenario.passed).length;
    const failedCount = scenarios.length - passedCount;
    const report = {
      generatedAt: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      passed: failedCount === 0,
      summary: {
        total: scenarios.length,
        passed: passedCount,
        failed: failedCount,
      },
      scenarios,
    };

    await mkdir(REPORT_DIR, { recursive: true, mode: 0o755 });
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    logger.info("Profile migration E2E finished.", {
      passed: passedCount,
      failed: failedCount,
      reportPath: REPORT_PATH,
    });

    for (const scenario of scenarios) {
      const marker = scenario.passed ? "PASS" : "FAIL";
      process.stdout.write(
        `[${marker}] ${scenario.name} (${scenario.durationMs}ms)${scenario.error ? `: ${scenario.error}` : ""}\n`,
      );
    }
    process.stdout.write(`Report written to ${REPORT_PATH}\n`);

    if (failedCount > 0) process.exitCode = 1;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

await main();
