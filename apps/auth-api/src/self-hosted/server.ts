import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createOpenBotLogger } from "@openbot/logging";
import type { WorkerBindings } from "../server/types";
import { drainWaitUntil, setSelfHostedEnv, waitUntil } from "./cloudflare-workers";
import { openSelfHostedD1 } from "./d1-sqlite";
import { installSelfHostedLogging } from "./logging";
import { openSelfHostedR2 } from "./r2-fs";
import { createMemoryRateLimiter } from "./rate-limit";

interface BunFileLike {
  readonly size: number;
  readonly type: string;
}

interface BunServerLike {
  readonly port: number;
  stop(closeActiveConnections?: boolean): Promise<void>;
  requestIP(request: Request): { address: string } | null;
}

declare const Bun: {
  file(path: string): BunFileLike & BodyInit;
  serve(options: {
    hostname: string;
    port: number;
    fetch(request: Request, server: BunServerLike): Response | Promise<Response>;
  }): BunServerLike;
};

interface WorkerModule {
  default: {
    fetch(
      request: Request,
      env: WorkerBindings,
      ctx: { waitUntil(promise: Promise<unknown>): void },
    ): Response | Promise<Response>;
    scheduled(controller: { scheduledTime: number; cron: string }, env: WorkerBindings): Promise<void>;
  };
}

const KILL_OLD_SW = `self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.registration.unregister();
    const windows = await self.clients.matchAll({ type: "window" });
    for (const client of windows) client.navigate("/app");
  })());
});
`;

const DEFAULT_RUNTIME_VARS: Readonly<Record<string, string>> = {
  AUTH_EXPOSE_DEVELOPMENT_CODE: "false",
  EMAIL_SMTP_HOST: "",
  EMAIL_SMTP_PORT: "",
  EMAIL_SMTP_USERNAME: "",
  EMAIL_FROM: "",
  EMAIL_LICENSE_FROM: "",
  REMOTE_TICKET_KEY_ID: "self-hosted-1",
  REMOTE_SIGNAL_URL: "wss://signal.pokebots.xyz/v1/signal",
  REMOTE_SIGNAL_HOMES: "",
  REMOTE_SIGNAL_HOME_LOCATIONS: "",
  REMOTE_AUTH_WEBHOOK_URL: "https://signal.pokebots.xyz/internal/auth-events",
  REMOTE_AUTH_WEBHOOK_URLS: "",
  SIGNAL_ENTRY_ZONE_ID: "",
  HOSTED_SERVERS_ENABLED: "false",
  HOSTED_SERVERS_ALLOWED_USER_IDS: "*",
  LICENSE_TRIAL_END: "2026-12-01T00:00:00Z",
  GITHUB_APP_CLIENT_ID: "Iv23lik5pzHz70cb0RUL",
  APNS_TEAM_ID: "8A47NKRZSJ",
  APNS_TOPIC: "run.openbot.mobile",
};

function buildBindings(d1: D1Database, avatars: R2Bucket, skills: R2Bucket, sites: R2Bucket): WorkerBindings {
  const vars: Record<string, string | undefined> = { ...DEFAULT_RUNTIME_VARS };
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) vars[key] = value;
  }
  return {
    ...vars,
    DB: d1,
    AVATARS: avatars,
    SKILLS: skills,
    SITES: sites,
    MARKETPLACE_INGRESS_RATE_LIMITER: createMemoryRateLimiter({ limit: 120, periodSeconds: 60 }),
    MARKETPLACE_MUTATION_RATE_LIMITER: createMemoryRateLimiter({ limit: 30, periodSeconds: 60 }),
    MARKETPLACE_UPLOAD_RATE_LIMITER: createMemoryRateLimiter({ limit: 15, periodSeconds: 60 }),
    SITE_REPORT_RATE_LIMITER: createMemoryRateLimiter({ limit: 10, periodSeconds: 60 }),
    GITHUB_TOKEN_RATE_LIMITER: createMemoryRateLimiter({ limit: 60, periodSeconds: 60 }),
    LIVE_ACTIVITY_RATE_LIMITER: createMemoryRateLimiter({ limit: 60, periodSeconds: 60 }),
    FEEDBACK_RATE_LIMITER: createMemoryRateLimiter({ limit: 10, periodSeconds: 60 }),
  };
}

function publicRequest(request: Request, address: string | undefined): Request | null {
  const url = new URL(request.url);
  // Only Traefik can reach the container. It overwrites X-Real-IP and X-Forwarded-Proto.
  // Never use X-Forwarded-Host: a client can supply it.
  const proxy = process.env.SELF_HOSTED_TRUST_PROXY === "true";
  if (proxy) url.protocol = request.headers.get("x-forwarded-proto") === "https" ? "https:" : "http:";
  const origins = (
    process.env.SELF_HOSTED_ORIGINS || "https://api.pokebots.xyz,https://app.pokebots.xyz,https://pokebots.xyz"
  )
    .split(",")
    .map((origin) => new URL(origin.trim()).origin);
  if (!origins.includes(url.origin)) return null;
  const headers = new Headers(request.headers);
  const ip = proxy ? headers.get("x-real-ip") : address;
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ipcountry");
  headers.delete("x-forwarded-host");
  headers.delete("x-forwarded-for");
  if (ip) headers.set("cf-connecting-ip", ip);
  return new Request(url, {
    method: request.method,
    headers,
    body: request.body,
    redirect: request.redirect,
    signal: request.signal,
  });
}

function staticResponse(clientDir: string, pathname: string): Response | null {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!decodedPath.startsWith("/") || decodedPath === "/") return null;
  const relativePath = decodedPath.slice(1);
  if (!relativePath || relativePath.endsWith("/")) return null;
  const fullPath = resolve(clientDir, relativePath);
  const clientRoot = clientDir.endsWith(sep) ? clientDir : `${clientDir}${sep}`;
  if (!fullPath.startsWith(clientRoot)) return null;
  if (!existsSync(fullPath)) return null;
  const stats = statSync(fullPath);
  if (!stats.isFile()) return null;

  const file = Bun.file(fullPath);
  const headers = new Headers();
  if (decodedPath === "/app-sw.js") {
    headers.set("Content-Type", "text/javascript; charset=utf-8");
    headers.set("Cache-Control", "no-cache");
  } else if (decodedPath.startsWith("/assets/")) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    headers.set("Cache-Control", "public, max-age=3600");
  }
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(file, { headers });
}

const logger = createOpenBotLogger("self-hosted-auth-api");

async function main(): Promise<void> {
  installSelfHostedLogging();
  if (process.env.NODE_ENV === "production") {
    for (const name of [
      "WORKOS_OIDC_ISSUER",
      "WORKOS_OIDC_CLIENT_ID",
      "WORKOS_OIDC_CLIENT_SECRET",
      "REMOTE_TICKET_PRIVATE_JWK",
      "REMOTE_TICKET_PUBLIC_JWKS",
      "REMOTE_TICKET_KEY_ID",
    ]) {
      if (!process.env[name]?.trim()) throw new Error(`Required runtime setting is missing: ${name}`);
    }
  }
  const selfDir = dirname(fileURLToPath(import.meta.url));
  const apiRoot = resolve(selfDir, "../..");
  const dataDir = resolve(process.env.SELF_HOSTED_DATA_DIR?.trim() || "/data");
  const dbPath = resolve(process.env.SELF_HOSTED_DB_PATH?.trim() || join(dataDir, "pokebots.sqlite"));
  const r2Dir = resolve(process.env.SELF_HOSTED_R2_DIR?.trim() || join(dataDir, "r2"));
  const migrationsDir = resolve(apiRoot, "migrations");
  const clientDir = resolve(apiRoot, "dist/client");
  const serverEntryPath = resolve(apiRoot, "dist/server/server.js");
  const appRedirectHost = process.env.SELF_HOSTED_APP_HOST?.trim() || "app.pokebots.xyz";
  const port = Number(process.env.PORT?.trim() || "3000");
  const host = process.env.HOST?.trim() || "0.0.0.0";

  if (!existsSync(serverEntryPath)) {
    throw new Error(`Built server entry not found at ${serverEntryPath}. Run SELF_HOSTED=1 bun run build first.`);
  }

  const { database: d1Db, d1, appliedMigrations } = openSelfHostedD1(dbPath, migrationsDir);
  if (appliedMigrations.length > 0) {
    logger.info("Applied self-hosted D1 migrations.", { count: appliedMigrations.length });
  }
  const avatars = openSelfHostedR2(r2Dir, "avatars");
  const skills = openSelfHostedR2(r2Dir, "skills");
  const sites = openSelfHostedR2(r2Dir, "sites");
  const bindings = buildBindings(d1, avatars.bucket, skills.bucket, sites.bucket);
  setSelfHostedEnv(bindings);

  const workerModule: WorkerModule = await import(serverEntryPath);
  const worker = workerModule.default;
  if (typeof worker.fetch !== "function" || typeof worker.scheduled !== "function") {
    throw new Error("Built entry must contain the account fetch and scheduled handlers.");
  }

  const server = Bun.serve({
    hostname: host,
    port,
    async fetch(rawRequest, activeServer) {
      // Health is read-only and available to the container healthcheck on loopback.
      if (new URL(rawRequest.url).pathname === "/health/ready") {
        try {
          d1Db.prepare("SELECT 1").get();
          return Response.json({
            ready: true,
            revision: existsSync("/app/.source-commit")
              ? readFileSync("/app/.source-commit", "utf8").trim()
              : process.env.SOURCE_COMMIT || "development",
          });
        } catch {
          return Response.json({ ready: false }, { status: 503 });
        }
      }
      const request = publicRequest(rawRequest, activeServer.requestIP(rawRequest)?.address);
      if (!request) return new Response(null, { status: 421 });
      const url = new URL(request.url);
      if ((request.method === "GET" || request.method === "HEAD") && url.hostname === appRedirectHost) {
        if (url.pathname === "/sw.js") {
          return new Response(KILL_OLD_SW, {
            headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" },
          });
        }
        if (url.pathname === "/") {
          return Response.redirect(new URL("/app", url).toString(), 302);
        }
      }
      if (request.method === "GET" || request.method === "HEAD") {
        const asset = staticResponse(clientDir, url.pathname);
        if (asset) return request.method === "HEAD" ? new Response(null, asset) : asset;
      }
      try {
        return await worker.fetch(request, bindings, { waitUntil });
      } catch {
        logger.error("Self-hosted request failed.");
        return new Response(null, { status: 500 });
      }
    },
  });

  logger.info("Self-hosted auth-api listening.", { port: server.port });

  let scheduledMinute = Math.floor(Date.now() / 60_000);
  let scheduledRunning = false;
  const timer = setInterval(() => {
    const minute = Math.floor(Date.now() / 60_000);
    if (minute === scheduledMinute || scheduledRunning) return;
    scheduledMinute = minute;
    const cron = minute % 5 === 0 ? "*/5 * * * *" : "*/1 * * * *";
    if (minute % 5 !== 0 && !bindings.SIGNAL_ENTRY_ZONE_ID?.trim()) return;
    scheduledRunning = true;
    // Use the minute boundary so the existing midnight retention job still runs.
    const run = Promise.resolve()
      .then(() => worker.scheduled({ scheduledTime: minute * 60_000, cron }, bindings))
      .then(async () => {
        if (minute % 5 === 0 && bindings.SIGNAL_ENTRY_ZONE_ID?.trim()) {
          await worker.scheduled({ scheduledTime: minute * 60_000, cron: "*/1 * * * *" }, bindings);
        }
      })
      .catch(() => logger.error("Self-hosted scheduled run failed."))
      .finally(() => {
        scheduledRunning = false;
      });
    waitUntil(run);
  }, 1_000);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Shutting down self-hosted auth-api.", { signal });
    clearInterval(timer);
    await server.stop(false);
    await drainWaitUntil(5_000);
    for (const db of [d1Db, avatars.database, skills.database, sites.database]) {
      try {
        db.close();
      } catch {
        // ignore close error on shutdown
      }
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

await main().catch(() => {
  logger.error("Self-hosted startup failed.");
  process.exit(1);
});
