import { mkdtemp, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { ServerMode, type ServerModeOptions } from "./server-mode";
import type { RestartReadiness } from "./update-readiness";

function createTestServerMode(controlSocketPath: string, restartReadiness?: () => RestartReadiness): ServerMode {
  const centralAuth: ServerModeOptions["centralAuth"] = {
    getState: () => ({ status: "signed_out" }),
    requestEmailCode: () => Effect.die("unused"),
    cancelCompanySignIn: () => Effect.die("unused"),
    verifyEmailCode: () => Effect.die("unused"),
    hasSession: () => false,
    retry: () => Effect.die("unused"),
    canPersistSession: () => true,
    redeemServerClaim: () => Effect.die("unused"),
    logout: () => Effect.die("unused"),
    removeOwnedRemoteHost: () => Effect.die("unused"),
    createMobileConnect: () => Effect.die("unused"),
  };
  const host: ServerModeOptions["host"] = {
    getStatus: () => ({
      phase: "online",
      configured: true,
      enabledOnLaunch: true,
      serverId: "srv-1",
      serverName: "Personal VPS",
      apiUrl: "https://api.pokebots.xyz",
      logoUrl: null,
      appearance: null,
      apiOnline: true,
      remoteDesktopReady: false,
      remoteDesktopScreenRecordingDenied: false,
      remoteDesktopUnattended: false,
      remoteDesktopActiveSessions: 0,
      remoteDesktopMaxSessions: 0,
      message: "Ready",
    }),
    configure: () => Effect.die("unused"),
    start: () => Effect.die("unused"),
    updateIdentity: () => Effect.die("unused"),
    getMobileConnectHost: () => null,
    refreshRegistration: () => Effect.die("unused"),
  };
  return new ServerMode({
    environment: { controlSocketPath, setupPagePort: null },
    version: "0.73.0",
    centralAuth,
    host,
    memory: null,
    restartReadiness,
    onError: () => {},
  });
}

function getStatus(socketPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ socketPath, path: "/v1/status", method: "GET" }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("ServerMode status restart readiness", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("reports restart_ready=true with no blockers when idle", async () => {
    const dir = await mkdtemp(join(tmpdir(), "openbot-server-mode-"));
    const socketPath = join(dir, "control.sock");
    const serverMode = createTestServerMode(socketPath, () => ({ safeToRestart: true, reasons: [] }));
    await Effect.runPromise(serverMode.listen());
    cleanups.push(async () => {
      await Effect.runPromise(serverMode.close());
      await rm(dir, { recursive: true, force: true });
    });

    const body = await getStatus(socketPath);
    expect(body).toContain("server=online\n");
    expect(body).toContain("restart_ready=true\n");
    expect(body).not.toContain("restart_blockers=");
  });

  it("reports restart_ready=false and blockers when busy", async () => {
    const dir = await mkdtemp(join(tmpdir(), "openbot-server-mode-"));
    const socketPath = join(dir, "control.sock");
    const serverMode = createTestServerMode(socketPath, () => ({
      safeToRestart: false,
      reasons: ["agent-turn", "routine-run"],
    }));
    await Effect.runPromise(serverMode.listen());
    cleanups.push(async () => {
      await Effect.runPromise(serverMode.close());
      await rm(dir, { recursive: true, force: true });
    });

    const body = await getStatus(socketPath);
    expect(body).toContain("restart_ready=false\n");
    expect(body).toContain("restart_blockers=agent-turn,routine-run\n");
  });
});
