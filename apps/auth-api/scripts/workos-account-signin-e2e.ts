/** Drives the account service with real local D1 and a local OIDC provider. No live credentials. */
import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Effect, Schema } from "effect";
import { exportJWK, exportPKCS8, generateKeyPair, jwtVerify, SignJWT } from "jose";
import { getPlatformProxy, unstable_splitSqlQuery } from "wrangler";
import { openSelfHostedD1 } from "../src/self-hosted/d1-sqlite";
import { openSelfHostedR2 } from "../src/self-hosted/r2-fs";
import { createMemoryRateLimiter } from "../src/self-hosted/rate-limit";
import { AuthService, AuthServiceError } from "../src/server/auth-service";
import { type BrowserApiServices, handleBrowserApi } from "../src/server/browser-api";
import { CompanySignInError, CompanySignInService } from "../src/server/company-sign-in";
import { randomToken, sha256 } from "../src/server/crypto";
import { D1AuthRepository } from "../src/server/d1-auth-repository";
import { runApiEffect } from "../src/server/effect-runtime";
import { issueIntegrationToken } from "../src/server/integration-token";
import { RemoteControlPlane } from "../src/server/remote-control-plane";
import type { WorkerBindings } from "../src/server/types";
import { WorkosOidc } from "../src/server/workos-oidc";
import { WorkosSignInError, WorkosSignInService, workosSignInEnabled } from "../src/server/workos-sign-in";

const root = resolve(import.meta.dirname, "../../..");
const artifactRoot = join(root, ".openbot-build", "workos-account-signin");
await mkdir(artifactRoot, { recursive: true });
const configPath = join(artifactRoot, "wrangler.jsonc");
await writeFile(
  configPath,
  JSON.stringify({
    name: "workos-account-e2e",
    compatibility_date: "2026-08-18",
    d1_databases: [{ binding: "DB", database_name: "workos-e2e", database_id: "00000000-0000-0000-0000-000000000001" }],
    r2_buckets: ["AVATARS", "SKILLS", "SITES"].map((binding) => ({
      binding,
      bucket_name: `workos-e2e-${binding.toLowerCase()}`,
    })),
    ratelimits: [
      "MARKETPLACE_INGRESS_RATE_LIMITER",
      "MARKETPLACE_MUTATION_RATE_LIMITER",
      "MARKETPLACE_UPLOAD_RATE_LIMITER",
      "SITE_REPORT_RATE_LIMITER",
      "GITHUB_TOKEN_RATE_LIMITER",
    ].map((name, index) => ({ name, namespace_id: String(9000 + index), simple: { limit: 100, period: 60 } })),
  }),
);
async function selfHostedPlatform() {
  const directory = await mkdtemp(join(artifactRoot, "sqlite-"));
  const sqlite = openSelfHostedD1(join(directory, "auth.sqlite"));
  const avatars = openSelfHostedR2(directory, "avatars");
  const skills = openSelfHostedR2(directory, "skills");
  const sites = openSelfHostedR2(directory, "sites");
  const limiter = () => createMemoryRateLimiter({ limit: 100, periodSeconds: 60 });
  const env: WorkerBindings = {
    DB: sqlite.d1,
    AVATARS: avatars.bucket,
    SKILLS: skills.bucket,
    SITES: sites.bucket,
    MARKETPLACE_INGRESS_RATE_LIMITER: limiter(),
    MARKETPLACE_MUTATION_RATE_LIMITER: limiter(),
    MARKETPLACE_UPLOAD_RATE_LIMITER: limiter(),
    SITE_REPORT_RATE_LIMITER: limiter(),
    GITHUB_TOKEN_RATE_LIMITER: limiter(),
  };
  return {
    env,
    async dispose() {
      for (const db of [sqlite.database, avatars.database, skills.database, sites.database]) db.close();
    },
  };
}
const selfHosted = process.env.WORKOS_E2E_SELF_HOSTED === "1";
const platform = selfHosted
  ? await selfHostedPlatform()
  : await getPlatformProxy<WorkerBindings>({
      configPath,
      persist: false,
      remoteBindings: false,
      envFiles: [],
    });
const database = platform.env.DB;
const keys = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(keys.publicKey)), kid: "local-provider", alg: "RS256", use: "sig" };
interface Grant {
  nonce: string;
  challenge: string;
  redirect: string;
  email: string;
}
const grants = new Map<string, Grant>();
let badNonce = false;
let verifiedEmail = true;
const provider = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    const issuer = url.origin;
    if (url.pathname === "/.well-known/openid-configuration")
      return Response.json({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        userinfo_endpoint: `${issuer}/userinfo`,
        jwks_uri: `${issuer}/jwks`,
        token_endpoint_auth_methods_supported: ["client_secret_post"],
      });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    if (url.pathname === "/avatar.png") return new Response(png, { headers: { "Content-Type": "image/png" } });
    if (url.pathname === "/not-an-image")
      return new Response("<html></html>", { headers: { "Content-Type": "text/html" } });
    if (url.pathname === "/userinfo") {
      const subject = request.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
      return Response.json(
        subject.startsWith("info-") ? { sub: subject, picture: `${issuer}/avatar.png` } : { sub: subject },
      );
    }
    if (url.pathname === "/jwks") return Response.json({ keys: [jwk] });
    if (url.pathname === "/authorize") {
      const redirect = new URL(url.searchParams.get("redirect_uri") ?? "");
      redirect.searchParams.set("state", url.searchParams.get("state") ?? "");
      const email = url.searchParams.get("login_hint") ?? "";
      if (email.startsWith("uninvited")) {
        redirect.searchParams.set("error", "access_denied");
        redirect.searchParams.set("error_description", "private-provider-detail");
      } else {
        const code = randomToken(32);
        grants.set(code, {
          nonce: url.searchParams.get("nonce") ?? "",
          challenge: url.searchParams.get("code_challenge") ?? "",
          redirect: new URL(url.searchParams.get("redirect_uri") ?? "").toString(),
          email,
        });
        redirect.searchParams.set("code", code);
      }
      return Response.redirect(redirect, 303);
    }
    if (url.pathname === "/token") {
      const form = new URLSearchParams(await request.text());
      const grant = grants.get(form.get("code") ?? "");
      grants.delete(form.get("code") ?? "");
      if (
        !grant ||
        form.get("client_id") !== "local-client" ||
        form.get("client_secret") !== "local-client-secret" ||
        form.get("redirect_uri") !== grant.redirect ||
        (await runApiEffect(sha256(form.get("code_verifier") ?? ""))) !== grant.challenge
      )
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      const picture = grant.email.startsWith("pic-")
        ? `${issuer}/avatar.png`
        : grant.email.startsWith("badpic-")
          ? `${issuer}/not-an-image`
          : undefined;
      const token = await new SignJWT({
        email: grant.email,
        ...(picture ? { picture } : {}),
        email_verified: verifiedEmail,
        nonce: badNonce ? "wrong-nonce" : grant.nonce,
      })
        .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
        .setIssuer(issuer)
        .setAudience("local-client")
        .setSubject(grant.email)
        .setExpirationTime("5m")
        .sign(keys.privateKey);
      return Response.json({ id_token: token, access_token: grant.email });
    }
    return new Response(null, { status: 404 });
  },
});
const bindings = {
  ...platform.env,
  DB: database,
  WORKOS_OIDC_ISSUER: provider.url.origin,
  WORKOS_OIDC_CLIENT_ID: "local-client",
  WORKOS_OIDC_CLIENT_SECRET: "local-client-secret",
};
let now = Date.now();
const workos = new WorkosSignInService(bindings, { provider: new WorkosOidc({ allowLoopback: true }), now: () => now });
const repository = new D1AuthRepository(database);
const emailAuth = new AuthService({ repository, delivery: null, exposeDevelopmentCode: true, now: () => now });
const workosAuth = new AuthService({
  repository,
  delivery: null,
  exposeDevelopmentCode: true,
  now: () => now,
  workosSignInRequired: workosSignInEnabled(bindings),
});
const remoteKey = await generateKeyPair("ES256", { extractable: true });
const remote = new RemoteControlPlane(
  {
    DB: database,
    REMOTE_TICKET_KEY_ID: "local-remote",
    REMOTE_TICKET_PRIVATE_JWK: JSON.stringify({
      ...(await exportJWK(remoteKey.privateKey)),
      kid: "local-remote",
      alg: "ES256",
    }),
    REMOTE_TICKET_PUBLIC_JWKS: JSON.stringify({
      keys: [{ ...(await exportJWK(remoteKey.publicKey)), kid: "local-remote", alg: "ES256" }],
    }),
  },
  { now: () => now },
);
const unused = () => {
  throw new Error("An unrelated service was used.");
};
function errorResponse(error: unknown): Response {
  if (error instanceof WorkosSignInError || error instanceof AuthServiceError)
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  return Response.json({ error: { code: "internal_error" } }, { status: 500 });
}
const integrationKeys = await generateKeyPair("RS256", { extractable: true });
const integrationWorkosIssuer = "https://workos-integrations.example.test";
const integrationBindings = {
  DB: database,
  POKEBOTS_INTEGRATION_WORKOS_ISSUER: integrationWorkosIssuer,
  POKEBOTS_INTEGRATION_PRIVATE_KEY: (await exportPKCS8(integrationKeys.privateKey)).replaceAll("\n", "\\n"),
};
const services: BrowserApiServices = {
  integrationToken: (request, userId) =>
    issueIntegrationToken(request, userId, integrationBindings, async (url) => {
      assert.equal(String(url), `${integrationWorkosIssuer}/oauth2/jwks`);
      return Response.json({ keys: [jwk] });
    }),
  auth: workosAuth,
  remote,
  workosSignIn: () => workos,
  workosEnabled: true,
  companySignIn: unused,
  hostLogo: unused,
  hosting: unused,
  inviteEmailDelivery: () => null,
  attribution: unused,
  billing: () => null,
  avatarBucket: unused,
  hostedSites: unused,
  sourceIp: () => randomToken(16),
  errorResponse,
};
const startSchema = Schema.Struct({
  email: Schema.optional(Schema.String),
  returnTo: Schema.String,
  clientState: Schema.String,
  clientChallenge: Schema.String,
});
const exchangeSchema = Schema.Struct({ code: Schema.String, codeVerifier: Schema.String });
const mobileSchema = Schema.Struct({
  code: Schema.String,
  codeVerifier: Schema.String,
  deviceId: Schema.String,
  deviceName: Schema.String,
  platform: Schema.Literals(["ios", "android", "unknown"]),
});
const app = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/browser/")) return handleBrowserApi(request, services);
    try {
      if (path === "/v1/auth/workos/start") {
        const input = Schema.decodeUnknownSync(startSchema)(await request.json());
        return Response.json(
          await runApiEffect(
            workos.startSignIn({ ...input, email: input.email ?? "", sourceIp: randomToken(16) }, request.url),
          ),
        );
      }
      if (path === "/v1/auth/workos/callback") {
        const target = await runApiEffect(workos.finish(new URL(request.url).searchParams, request.url));
        return target
          ? new Response(null, { status: 303, headers: { Location: target } })
          : new Response(null, { status: 410 });
      }
      if (path === "/v1/auth/workos/exchange")
        return Response.json(
          await runApiEffect(workos.exchange(Schema.decodeUnknownSync(exchangeSchema)(await request.json()))),
        );
      if (path === "/v1/mobile-auth/workos/exchange") {
        const body = Schema.decodeUnknownSync(mobileSchema)(await request.json());
        return Response.json(
          await runApiEffect(
            workos.exchange({
              code: body.code,
              codeVerifier: body.codeVerifier,
              device: { id: body.deviceId, name: body.deviceName, platform: body.platform },
            }),
          ),
        );
      }
      return new Response(null, { status: 404 });
    } catch (error) {
      return errorResponse(error);
    }
  },
});
const origin = app.url.origin;
const checks: string[] = [];
const authorizationSchema = Schema.Struct({ authorizationUrl: Schema.String });
const sessionSchema = Schema.Struct({
  sessionToken: Schema.String,
  user: Schema.Struct({ id: Schema.String, email: Schema.String }),
});
interface WorkosTestRequest {
  email?: string;
  returnTo?: string;
  clientState?: string;
  clientChallenge?: string;
  code?: string | null;
  codeVerifier?: string;
  deviceId?: string;
  deviceName?: string;
  platform?: string;
}
const post = (path: string, body: WorkosTestRequest) =>
  fetch(origin + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
let person = 0;
async function start(returnTo = "http://127.0.0.1:47999/company-sign-in", email?: string) {
  const verifier = randomToken(32);
  const clientState = randomToken(24);
  const response = await post("/v1/auth/workos/start", {
    email: email ?? `invited-${++person}@example.test`,
    returnTo,
    clientState,
    clientChallenge: await runApiEffect(sha256(verifier)),
  });
  assert.equal(response.status, 200);
  const { authorizationUrl } = Schema.decodeUnknownSync(authorizationSchema)(await response.json());
  return { verifier, clientState, authorizationUrl };
}
async function callback(authorizationUrl: string) {
  const providerResponse = await fetch(authorizationUrl, { redirect: "manual" });
  assert.equal(providerResponse.status, 303);
  const providerReturn = providerResponse.headers.get("Location");
  assert(providerReturn);
  const result = await fetch(providerReturn, { redirect: "manual" });
  const location = result.headers.get("Location");
  return { result, providerReturn, target: location ? new URL(location) : null };
}
async function scalar(sql: string) {
  const row = await database.prepare(sql).first<{ total: number }>();
  assert(row);
  return row.total;
}
try {
  for (const name of (await readdir(join(root, "apps/auth-api/migrations"))).filter((n) => n.endsWith(".sql")).sort()) {
    const sql = await readFile(join(root, "apps/auth-api/migrations", name), "utf8");
    await database.batch(unstable_splitSqlQuery(sql).map((statement) => database.prepare(statement)));
  }
  checks.push("all released D1 migrations plus additive WorkOS migration");

  const first = await start();
  const completed = await callback(first.authorizationUrl);
  assert.equal(completed.target?.searchParams.get("state"), first.clientState);
  const code = completed.target?.searchParams.get("code");
  assert(code);
  assert.equal((await post("/v1/auth/workos/exchange", { code, codeVerifier: randomToken(32) })).status, 400);
  const responses = await Promise.all([
    post("/v1/auth/workos/exchange", { code, codeVerifier: first.verifier }),
    post("/v1/auth/workos/exchange", { code, codeVerifier: first.verifier }),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 400]);
  const success = responses.find((r) => r.status === 200);
  assert(success);
  const session = Schema.decodeUnknownSync(sessionSchema)(await success.json());
  assert.equal((await runApiEffect(emailAuth.authenticate(session.sessionToken)))?.id, session.user.id);
  assert.equal(await scalar("SELECT count(*) total FROM remote_memberships"), 0);
  assert.equal((await fetch(completed.providerReturn, { redirect: "manual" })).status, 410);
  checks.push("desktop session, wrong verifier, concurrent exchange, callback replay, no automatic server membership");

  for (const scenario of ["uninvited", "nonce", "email"] as const) {
    const accountsBefore = await scalar("SELECT count(*) total FROM users");
    const sessionsBefore = await scalar("SELECT count(*) total FROM auth_sessions");
    badNonce = scenario === "nonce";
    verifiedEmail = scenario !== "email";
    const attempt = await start(undefined, scenario === "uninvited" ? "uninvited@example.test" : undefined);
    const result = await callback(attempt.authorizationUrl);
    assert(result.target?.searchParams.has("error"));
    assert(!result.target?.toString().includes("private-provider-detail"));
    assert.equal(await scalar("SELECT count(*) total FROM users"), accountsBefore);
    assert.equal(await scalar("SELECT count(*) total FROM auth_sessions"), sessionsBefore);
    checks.push(`refuse ${scenario} without account or session`);
  }
  badNonce = false;
  verifiedEmail = true;
  assert.equal(
    await runApiEffect(workos.finish(new URLSearchParams({ state: randomToken(32), code: "unknown" }), origin)),
    null,
  );
  await assert.rejects(
    runApiEffect(
      workos.startSignIn(
        {
          email: "invited@example.test",
          returnTo: "https://attacker.example/company-sign-in",
          clientState: randomToken(24),
          clientChallenge: await runApiEffect(sha256(randomToken(32))),
          sourceIp: "return-check",
        },
        origin,
      ),
    ),
  );
  const expiring = await start();
  now += 11 * 60_000;
  assert.equal((await callback(expiring.authorizationUrl)).result.status, 410);
  const hinted = await start();
  assert.ok(new URL(hinted.authorizationUrl).searchParams.get("login_hint")?.includes("@"));
  const openResponse = await post("/v1/auth/workos/start", {
    returnTo: "http://127.0.0.1:47999/company-sign-in",
    clientState: randomToken(24),
    clientChallenge: await runApiEffect(sha256(randomToken(32))),
  });
  assert.equal(openResponse.status, 200);
  const opened = Schema.decodeUnknownSync(authorizationSchema)(await openResponse.json());
  assert.equal(new URL(opened.authorizationUrl).searchParams.has("login_hint"), false);
  checks.push("login hint only when an email is sent");
  checks.push("unknown state, foreign return, expired flow");
  now += 15 * 60_000;

  const mobileStart = await start("openbot://company-sign-in", "phone@example.test");
  const mobileReturn = await callback(mobileStart.authorizationUrl);
  const mobileCode = mobileReturn.target?.searchParams.get("code");
  assert(mobileCode);
  assert.equal(
    (await post("/v1/auth/workos/exchange", { code: mobileCode, codeVerifier: mobileStart.verifier })).status,
    400,
  );
  const device = { deviceId: crypto.randomUUID(), deviceName: "E2E phone", platform: "ios" };
  const mobileResponse = await post("/v1/mobile-auth/workos/exchange", {
    code: mobileCode,
    codeVerifier: mobileStart.verifier,
    ...device,
  });
  assert.equal(mobileResponse.status, 200);
  const mobileSession = Schema.decodeUnknownSync(sessionSchema)(await mobileResponse.json());
  assert.equal(await runApiEffect(emailAuth.authenticateDesktopSession(mobileSession.sessionToken)), null);
  assert.equal(await scalar("SELECT count(*) total FROM mobile_auth_sessions"), 1);
  const secondPhone = await start("openbot://company-sign-in", "phone@example.test");
  const secondReturn = await callback(secondPhone.authorizationUrl);
  assert.equal(
    (
      await post("/v1/mobile-auth/workos/exchange", {
        code: secondReturn.target?.searchParams.get("code"),
        codeVerifier: secondPhone.verifier,
        ...device,
      })
    ).status,
    200,
  );
  assert.equal(await runApiEffect(emailAuth.authenticate(mobileSession.sessionToken)), null);
  assert.equal(await scalar("SELECT count(*) total FROM mobile_auth_sessions"), 1);
  checks.push("mobile surface binding, mobile session, replacement and earlier session revocation");

  const browserHeaders = { "Content-Type": "application/json", Origin: origin, "X-OpenBot-Browser": "1" };
  const browserStart = await fetch(`${origin}/api/browser/workos/start`, {
    method: "POST",
    headers: browserHeaders,
    body: JSON.stringify({ email: "browser@example.test" }),
  });
  assert.equal(browserStart.status, 200);
  const flowCookie = browserStart.headers.get("Set-Cookie");
  assert(flowCookie);
  assert(flowCookie.includes("Secure; HttpOnly; SameSite=Lax"));
  const flowPair = flowCookie.split(";", 1)[0];
  assert(flowPair);
  const browserAuthorization = Schema.decodeUnknownSync(authorizationSchema)(await browserStart.json());
  const browserCallback = await callback(browserAuthorization.authorizationUrl);
  assert(browserCallback.target);
  const wrongBrowser = await fetch(browserCallback.target, { redirect: "manual" });
  assert(wrongBrowser.headers.get("Location")?.includes("workosSignInError"));
  assert(!wrongBrowser.headers.get("Set-Cookie")?.includes("__Host-openbot-web="));
  const browserFinish = await fetch(browserCallback.target, {
    headers: { Cookie: flowPair, "Sec-Fetch-Site": "cross-site" },
    redirect: "manual",
  });
  assert.equal(browserFinish.status, 303);
  assert.equal(new URL(browserFinish.headers.get("Location") ?? "").pathname, "/app");
  const cookies = browserFinish.headers.getSetCookie();
  const webCookie = cookies.find((c) => c.startsWith("__Host-openbot-web="));
  assert(webCookie);
  const browserSessionToken = webCookie.split(";", 1)[0]?.slice("__Host-openbot-web=".length);
  assert(browserSessionToken);
  const browserUser = await runApiEffect(emailAuth.authenticate(browserSessionToken));
  assert.equal(browserUser?.email, "browser@example.test");
  const requestIntegration = (body: Record<string, string>, headers: Record<string, string> = {}) =>
    fetch(`${origin}/api/browser/v1/me/integrations/token`, {
      method: "POST",
      headers: { ...browserHeaders, Cookie: `__Host-openbot-web=${browserSessionToken}`, ...headers },
      body: JSON.stringify(body),
    });
  const integration = await requestIntegration({
    audience: "rooms",
    sub: "forged",
    workos_sub: "forged",
    workos_iss: "forged",
  });
  assert.equal(integration.status, 200);
  assert.equal(integration.headers.get("Cache-Control"), "no-store");
  const integrationResult = Schema.decodeUnknownSync(
    Schema.Struct({ accessToken: Schema.String, expiresAt: Schema.Number }),
  )(await integration.json());
  const { payload } = await jwtVerify(integrationResult.accessToken, integrationKeys.publicKey, {
    algorithms: ["RS256"],
    issuer: "urn:pokebots:integrations",
    audience: "rooms",
    subject: `pokebots:${browserUser?.id}`,
  });
  assert.equal(payload.linked_workos_sub, undefined);
  assert.equal(payload.linked_workos_iss, undefined);
  assert.equal(payload.workos_sub, undefined);
  assert.equal(payload.aud, "rooms");
  assert.equal(payload.scope, "integration:use");
  assert(typeof payload.exp === "number" && typeof payload.iat === "number");
  assert.equal(payload.exp - payload.iat, 300);
  assert.equal(integrationResult.expiresAt, payload.exp * 1000);
  assert.equal((await requestIntegration({ audience: "computer", scope: "integration:link" })).status, 400);
  assert.equal((await requestIntegration({ audience: "invalid" })).status, 400);
  assert.equal((await requestIntegration({ audience: "brain" }, { Cookie: "" })).status, 401);
  const deniedOrigin = await requestIntegration({ audience: "brain" }, { Origin: "https://other.example" });
  assert.equal(deniedOrigin.status, 403);
  checks.push(
    "integration JWT signature, account and WorkOS claims, lifetime, no-store, audience, scope and browser access",
  );
  const signLinkProof = (subject: string, audience: string, issuer = integrationWorkosIssuer) =>
    new SignJWT({ sub_profile: "user" })
      .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
      .setIssuer(issuer)
      .setSubject(subject)
      .setAudience(audience)
      .setExpirationTime("5m")
      .sign(keys.privateKey);
  const legacySubject = "user_RoomsTestAccount";
  const legacyToken = await signLinkProof(legacySubject, "https://rooms.mcpbox.dev/mcp");
  const legacyLink = { action: "link", audience: "rooms", workosAccessToken: legacyToken };
  assert.equal((await requestIntegration({ ...legacyLink, audience: "brain" })).status, 400);
  assert.equal(
    (
      await requestIntegration({
        ...legacyLink,
        workosAccessToken: await signLinkProof(legacySubject, "https://rooms.mcpbox.dev/mcp", provider.url.origin),
      })
    ).status,
    400,
  );
  assert.equal((await requestIntegration(legacyLink)).status, 200);
  assert.equal((await requestIntegration(legacyLink)).status, 200);
  assert.equal(
    (await requestIntegration(legacyLink, { Cookie: `__Host-openbot-web=${session.sessionToken}` })).status,
    409,
  );
  assert.equal(
    (
      await requestIntegration({
        ...legacyLink,
        workosAccessToken: await signLinkProof("user_DifferentAccount", "https://rooms.mcpbox.dev/mcp"),
      })
    ).status,
    409,
  );
  const readIntegration = async (requestBody: Record<string, string>, audience: string) => {
    const response = await requestIntegration(requestBody);
    assert.equal(response.status, 200);
    const result = Schema.decodeUnknownSync(Schema.Struct({ accessToken: Schema.String }))(await response.json());
    return (await jwtVerify(result.accessToken, integrationKeys.publicKey, { audience })).payload;
  };
  const linked = await readIntegration({ audience: "rooms" }, "rooms");
  assert.equal(linked.linked_workos_sub, legacySubject);
  assert.equal(linked.linked_workos_iss, integrationWorkosIssuer);
  assert.equal((await readIntegration({ audience: "rooms", profile: "native" }, "rooms")).linked_workos_sub, undefined);
  assert.equal((await readIntegration({ audience: "brain" }, "brain")).linked_workos_sub, undefined);
  checks.push(
    "links only with a valid legacy service sign-in, rejects cross-audience proof and rebinding, preserves the native principal",
  );
  const replay = await fetch(browserCallback.target, { headers: { Cookie: flowPair }, redirect: "manual" });
  assert(replay.headers.get("Location")?.includes("workosSignInError"));
  assert.equal(
    (
      await fetch(`${origin}/api/browser/workos/start`, {
        method: "POST",
        headers: { ...browserHeaders, Origin: "https://attacker.example" },
        body: JSON.stringify({ email: "browser@example.test" }),
      })
    ).status,
    403,
  );
  checks.push("browser HttpOnly cookie, cross-browser refusal, cookie session, replay and Origin CSRF refusal");

  const legacy = await runApiEffect(emailAuth.startEmailSignIn("email-mode@example.test", "email-mode"));
  assert(legacy.developmentCode);
  const legacySession = await runApiEffect(
    emailAuth.verifyEmailCode({
      challengeId: legacy.challengeId,
      code: legacy.developmentCode,
      sourceIp: "email-mode",
      surface: "desktop",
    }),
  );
  assert.equal(legacySession.user.email, "email-mode@example.test");
  const partial = { DB: database, WORKOS_OIDC_ISSUER: provider.url.origin };
  const partialAuth = new AuthService({
    repository,
    delivery: null,
    workosSignInRequired: workosSignInEnabled(partial),
  });
  for (const auth of [workosAuth, partialAuth]) {
    for (const operation of [
      auth.startEmailSignIn("bypass@example.test", "bypass").pipe(Effect.asVoid),
      auth
        .verifyEmailCode({
          challengeId: legacy.challengeId,
          code: legacy.developmentCode,
          sourceIp: "bypass",
          surface: "desktop",
        })
        .pipe(Effect.asVoid),
      auth
        .verifyEmailCode({
          challengeId: legacy.challengeId,
          code: legacy.developmentCode,
          sourceIp: "bypass",
          surface: "web",
        })
        .pipe(Effect.asVoid),
      auth
        .verifyMobileEmailCode({
          challengeId: legacy.challengeId,
          code: legacy.developmentCode,
          sourceIp: "bypass",
          device: { id: crypto.randomUUID(), name: "phone", platform: "ios" },
        })
        .pipe(Effect.asVoid),
    ]) {
      await assert.rejects(
        runApiEffect(operation),
        (error) => error instanceof AuthServiceError && error.code === "workos_sign_in_required",
      );
    }
  }
  await assert.rejects(
    runApiEffect(
      new WorkosSignInService(partial).startSignIn(
        {
          email: "partial@example.test",
          returnTo: "http://127.0.0.1:47999/company-sign-in",
          clientState: randomToken(24),
          clientChallenge: await runApiEffect(sha256(randomToken(32))),
          sourceIp: "partial",
        },
        origin,
      ),
    ),
    (error) => error instanceof WorkosSignInError && error.status === 503,
  );
  checks.push(
    "email mode unchanged; desktop, web and mobile email bypass closed for full and partial WorkOS configuration",
  );

  const expiringCode = await start();
  const codeReturn = await callback(expiringCode.authorizationUrl);
  now += 3 * 60_000;
  assert.equal(
    (
      await post("/v1/auth/workos/exchange", {
        code: codeReturn.target?.searchParams.get("code"),
        codeVerifier: expiringCode.verifier,
      })
    ).status,
    400,
  );
  checks.push("expired exchange code refused");
  const company = new CompanySignInService({ ...bindings, COMPANY_SIGN_IN_SECRET: randomToken(48) });
  for (const attempt of [
    company
      .startSignIn(
        {
          email: "legacy@example.test",
          returnTo: "http://127.0.0.1:47999/company-sign-in",
          clientState: randomToken(24),
          clientChallenge: await runApiEffect(sha256(randomToken(32))),
          sourceIp: "company",
        },
        origin,
      )
      .pipe(Effect.asVoid),
    company.exchange({ code: randomToken(32), codeVerifier: randomToken(32) }).pipe(Effect.asVoid),
  ])
    await assert.rejects(
      runApiEffect(attempt),
      (error) => error instanceof CompanySignInError && error.code === "workos_sign_in_required",
    );
  checks.push("prior company start and exchange also defer to the configured WorkOS provider");

  async function signInAs(email: string) {
    const flow = await start(undefined, email);
    const returned = await callback(flow.authorizationUrl);
    const exchangeCode = returned.target?.searchParams.get("code");
    assert(exchangeCode);
    const response = await post("/v1/auth/workos/exchange", { code: exchangeCode, codeVerifier: flow.verifier });
    assert.equal(response.status, 200);
    return Schema.decodeUnknownSync(sessionSchema)(await response.json()).user.id;
  }
  async function avatarOf(userId: string) {
    const row = await database
      .prepare("SELECT avatar_url FROM users WHERE id = ?")
      .bind(userId)
      .first<{ avatar_url: string | null }>();
    return row?.avatar_url ?? null;
  }
  async function storedPicture(userId: string, avatarUrl: string | null) {
    const match = avatarUrl?.match(new RegExp(`^/v1/avatars/${userId}\\?v=([0-9a-f-]{36})$`, "u"));
    assert(match?.[1], `unexpected avatar url ${avatarUrl}`);
    const object = await platform.env.AVATARS.get(`users/${userId}/${match[1]}`);
    assert(object);
    return new Uint8Array(await object.arrayBuffer());
  }
  now += 60_000;
  const claimUser = await signInAs("pic-claim@example.test");
  const claimAvatar = await avatarOf(claimUser);
  assert.equal((await storedPicture(claimUser, claimAvatar)).byteLength, 11);
  const userinfoUser = await signInAs("info-userinfo@example.test");
  assert.equal((await storedPicture(userinfoUser, await avatarOf(userinfoUser))).byteLength, 11);
  const badUser = await signInAs("badpic-html@example.test");
  assert.equal(await avatarOf(badUser), null);
  const plainUser = await signInAs("plain-nopicture@example.test");
  assert.equal(await avatarOf(plainUser), null);
  assert.equal(await signInAs("pic-claim@example.test"), claimUser);
  assert.equal(await avatarOf(claimUser), claimAvatar);
  checks.push(
    "provider picture is saved at sign-in from the token or userinfo; a non-image or a missing picture leaves none; a saved picture is kept",
  );

  await writeFile(
    join(
      root,
      selfHosted
        ? ".openbot-build/workos-account-signin-sqlite-e2e.json"
        : ".openbot-build/workos-account-signin-e2e.json",
    ),
    `${JSON.stringify({ checks, result: "pass" }, null, 2)}\n`,
  );
  // Machine-readable: the artifact records behavior without credentials, tokens or codes.
  process.stdout.write(
    `Passed ${checks.length} scenario groups. Artifact: .openbot-build/workos-account-signin${selfHosted ? "-sqlite" : ""}-e2e.json\n`,
  );
} finally {
  app.stop(true);
  provider.stop(true);
  await platform.dispose();
}
