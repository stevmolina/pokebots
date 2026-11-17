// A server that signs out, or signs in as another account, must leave the server list of the account
// that it left. This runs the real `ServerMode` on its real control socket, with a fake account service
// that keeps the server lists of two accounts, and a fake host that keeps one host per account as the
// team store does:
//
// 1. The server signs in with a claim as account A. A's list has the server.
// 2. `logout`, then a claim as account B. B's list has the server, and A's list no longer has it.
// 3. `logout`, then a claim as account A again. A's list has the server again.
// 4. An account service that fails the removal still lets `logout` finish.
//
// Run: `bun scripts/server-leave-account-e2e.ts`.
// Writes .openbot-build/server-leave-account-e2e/report.json.
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { CentralAuthState, HostStatus } from "@openbot/contracts/ipc";
import { createOpenBotLogger } from "@openbot/logging";
import { Effect } from "effect";
import { runCauseEffect } from "../src/backend/effect-boundary";
import { CentralAuthOperationError } from "../src/main/central-auth-effects";
import { ServerMode, type ServerModeOptions } from "../src/main/server-mode";

const logger = createOpenBotLogger("server-leave-account-e2e");
const OUT = resolve(import.meta.dirname, "../.openbot-build/server-leave-account-e2e");
const ACCOUNTS: Record<string, { id: string; email: string }> = {
  "claim-a": { id: "user-a", email: "a@example.com" },
  "claim-b": { id: "user-b", email: "b@example.com" },
};

// The fake account service: the host records, each with an owner. A removal is the owner's only.
const hostRecords = new Map<string, { ownerId: string; name: string }>();
let failRemoval = false;
const removals: string[] = [];
const listFor = (accountId: string): string[] =>
  [...hostRecords].filter(([, record]) => record.ownerId === accountId).map(([hostId]) => hostId);

let account: CentralAuthState = { status: "signed_out" };
const signedInId = (): string => {
  if (account.status !== "signed_in") throw new Error("Not signed in.");
  return account.user.id;
};

const centralAuth: ServerModeOptions["centralAuth"] = {
  getState: () => structuredClone(account),
  requestEmailCode: () => Effect.die(new Error("Not used.")),
  verifyEmailCode: () => Effect.die(new Error("Not used.")),
  cancelCompanySignIn: () => Effect.sync(() => structuredClone(account)),
  hasSession: () => account.status === "signed_in",
  retry: () => Effect.sync(() => structuredClone(account)),
  canPersistSession: () => true,
  redeemServerClaim: (claim: string) =>
    Effect.sync(() => {
      const owner = ACCOUNTS[claim];
      if (!owner) throw new Error("This e2e makes only the claims it knows.");
      account = { status: "signed_in", user: { id: owner.id, email: owner.email, name: null, avatarUrl: null } };
      // The entry point publishes the host when the account changes.
      setTimeout(() => void runCauseEffect(serverMode.publish()), 0);
      return null;
    }),
  removeOwnedRemoteHost: (hostId: string) =>
    Effect.suspend(() => {
      removals.push(hostId);
      if (failRemoval) return Effect.fail(new CentralAuthOperationError({ cause: new Error("Account service down.") }));
      const record = hostRecords.get(hostId);
      if (!record || record.ownerId !== signedInId()) {
        return Effect.fail(new CentralAuthOperationError({ cause: new Error("Not this account's host.") }));
      }
      hostRecords.delete(hostId);
      return Effect.void;
    }),
  logout: () =>
    Effect.sync(() => {
      account = { status: "signed_out" };
      hostId = null;
      hostPhase = "idle";
      return structuredClone(account);
    }),
  createMobileConnect: () => Effect.die(new Error("Not used.")),
};

// The fake host: one host per account, as the team store keeps. A sign-in binds the account's host.
const hostsByAccount = new Map<string, string>();
let hostId: string | null = null;
let hostPhase: HostStatus["phase"] = "idle";
const hostStatus = (): HostStatus => ({
  phase: hostPhase,
  configured: hostId !== null,
  enabledOnLaunch: false,
  serverId: hostId,
  serverName: hostId === null ? null : "renzo-server",
  apiUrl: null,
  logoUrl: null,
  appearance: null,
  apiOnline: hostPhase === "online",
  remoteDesktopReady: false,
  remoteDesktopScreenRecordingDenied: false,
  remoteDesktopUnattended: false,
  remoteDesktopActiveSessions: 0,
  remoteDesktopMaxSessions: 0,
  message: null,
});
const host: ServerModeOptions["host"] = {
  getStatus: hostStatus,
  configure: () =>
    Effect.sync(() => {
      const id = signedInId();
      const existing = hostsByAccount.get(id) ?? `host-${id}`;
      hostsByAccount.set(id, existing);
      hostId = existing;
      return hostStatus();
    }),
  updateIdentity: () => Effect.sync(hostStatus),
  start: () =>
    Effect.sync(() => {
      assert.ok(hostId, "A host starts only after it is configured.");
      // The registration: a new record for a host the account does not have yet.
      hostRecords.set(hostId, { ownerId: signedInId(), name: "renzo-server" });
      hostPhase = "online";
      return hostStatus();
    }),
  getMobileConnectHost: () => null,
  refreshRegistration: () => Effect.void,
};

const runtime = await mkdtemp(join(tmpdir(), "openbot-leave-account-"));
const socketPath = join(runtime, "control.sock");
const serverMode = new ServerMode({
  environment: { controlSocketPath: socketPath, setupPagePort: null },
  version: "0.0.0-e2e",
  centralAuth,
  host,
  memory: null,
  onError: (message, error) => logger.warn(message, error),
});
await runCauseEffect(serverMode.listen());

function control(method: "GET" | "POST", path: string, body = ""): Promise<{ status: number; text: string }> {
  return new Promise((resolveRequest, reject) => {
    const req = request(
      { socketPath, method, path, headers: { "content-type": "application/x-www-form-urlencoded" } },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () =>
          resolveRequest({ status: response.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

async function until(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}.`);
    await new Promise((done) => setTimeout(done, 20));
  }
}

async function claimAs(claim: string): Promise<void> {
  const answer = await control("POST", "/v1/login/claim", `claim=${claim}`);
  assert.equal(answer.status, 200, answer.text);
  await until(() => hostPhase === "online", `the host of ${claim} to publish`);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
interface Report {
  afterSwitch?: { a: string[]; b: string[]; removals: string[] };
  afterSignBackIn?: { a: string[]; b: string[] };
  removalFailureStillSignsOut?: { removalAttempts: number; account: CentralAuthState["status"] };
  result?: "ok";
}
const report: Report = {};

try {
  await claimAs("claim-a");
  const hostA = hostId;
  assert.equal(hostA, "host-user-a");
  assert.deepEqual(listFor("user-a"), [hostA], "A's list has the server after A signs it in.");

  assert.equal((await control("POST", "/v1/logout")).status, 200);
  await claimAs("claim-b");
  const hostB = hostId;
  assert.equal(hostB, "host-user-b");
  assert.notEqual(hostB, hostA, "Another account gets another host.");
  assert.deepEqual(listFor("user-b"), [hostB], "B's list has the server.");
  assert.deepEqual(listFor("user-a"), [], "A's list no longer has the server that left A.");
  report.afterSwitch = { a: listFor("user-a"), b: listFor("user-b"), removals: [...removals] };

  assert.equal((await control("POST", "/v1/logout")).status, 200);
  assert.deepEqual(listFor("user-b"), [], "Sign-out removes the server from B's list.");
  await claimAs("claim-a");
  assert.deepEqual(listFor("user-a"), [hostA], "A signs the server in again and has it again.");
  report.afterSignBackIn = { a: listFor("user-a"), b: listFor("user-b") };

  // The account service cannot be reached: the sign-out still ends, and the next sign-in is not blocked.
  failRemoval = true;
  const logout = await control("POST", "/v1/logout");
  assert.equal(logout.status, 200, logout.text);
  assert.equal(account.status, "signed_out", "The sign-out finished with the removal failing.");
  report.removalFailureStillSignsOut = { removalAttempts: removals.length, account: account.status };
  failRemoval = false;

  report.result = "ok";
} finally {
  await Effect.runPromise(serverMode.close());
  writeFileSync(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  logger.info(JSON.stringify(report, null, 2));
}
