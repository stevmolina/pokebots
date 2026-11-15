import { strict as assert } from "node:assert";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const origin = process.env.AUTH_API_SMOKE_ORIGIN;
if (!origin) throw new Error("Set AUTH_API_SMOKE_ORIGIN to the running container or service.");
const checks: string[] = [];
const viaProxy = new URL(origin).protocol === "http:";
async function request(path: string, host = "api.pokebots.xyz", options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (viaProxy) {
    headers.set("Host", host);
    headers.set("X-Forwarded-Proto", "https");
    headers.set("X-Real-IP", "127.0.0.1");
  }
  return fetch(new URL(path, origin), { ...options, headers, redirect: "manual" });
}
for (const path of ["/health/ready", "/app", "/site.webmanifest", "/app-sw.js", "/"]) {
  const response = await request(path);
  assert.equal(response.status, 200, path);
  if (path === "/app-sw.js") assert.ok(response.headers.get("content-type")?.includes("javascript"));
  checks.push(`serves ${path}`);
}
assert.equal((await request("/v1/me")).status, 401);
checks.push("unauthenticated native API is denied");
const rejected = await request("/api/browser/v1/me", "api.pokebots.xyz", {
  method: "POST",
  headers: { Origin: "https://evil.example", "X-OpenBot-Browser": "1" },
});
assert.ok([400, 403, 404, 405].includes(rejected.status));
assert.equal(rejected.headers.get("access-control-allow-origin"), null);
checks.push("cross-origin browser mutation is denied without CORS grant");
const preflight = await request("/api/browser/v1/me", "api.pokebots.xyz", {
  method: "OPTIONS",
  headers: { Origin: "https://evil.example", "Access-Control-Request-Headers": "X-OpenBot-Browser" },
});
assert.equal(preflight.headers.get("access-control-allow-origin"), null);
checks.push("cross-origin preflight has no CORS grant");
if (viaProxy) {
  const redirect = await request("/", "app.pokebots.xyz", { headers: { "X-Forwarded-Host": "evil.example" } });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get("location"), "https://app.pokebots.xyz/app");
  assert.equal((await request("/", "evil.example")).status, 421);
  assert.equal((await request("/sw.js", "app.pokebots.xyz")).status, 200);
  checks.push(
    "app redirect preserves the known host and ignores forged forwarded host",
    "unknown host is denied",
    "legacy service worker removal script is served",
  );
}
const signIn = await request("/api/browser/workos/start");
assert.equal(signIn.status, 200);
assert.deepEqual(await signIn.json(), { enabled: true });
const begin = await request("/api/browser/workos/start", "api.pokebots.xyz", {
  method: "POST",
  headers: { Origin: "https://api.pokebots.xyz", "X-OpenBot-Browser": "1", "Content-Type": "application/json" },
  body: "{}",
});
assert.equal(begin.status, 200);
const grant = await begin.json();
assert.equal(new URL(grant.authorizationUrl).hostname, "powerful-comfort-82-staging.authkit.app");
const cookie = begin.headers.get("set-cookie") || "";
assert.ok(cookie.includes("Secure") && cookie.includes("HttpOnly") && cookie.includes("SameSite=Lax"));
checks.push("live WorkOS discovery starts sign-in with a secure flow cookie");
const jwks = await request("/.well-known/jwks.json");
assert.equal(jwks.status, 200);
const publicKeys = await jwks.json();
assert.ok(publicKeys.keys.some((key: { kid: string }) => key.kid === "pokebots-contabo-20261115"));
assert.ok(publicKeys.keys.every((key: { d?: string }) => key.d === undefined));
checks.push("JWKS publishes the new key without private material");
const head = await request("/app-sw.js", "api.pokebots.xyz", { method: "HEAD" });
assert.equal((await head.arrayBuffer()).byteLength, 0);
checks.push("HEAD asset response has no body");
await mkdir(resolve(".openbot-build"), { recursive: true });
const artifact = resolve(".openbot-build/auth-api-self-hosted-smoke.json");
await writeFile(artifact, `${JSON.stringify({ origin, checks }, null, 2)}\n`);
// Machine-readable: test result and evidence path.
process.stdout.write(`Passed ${checks.length} checks. Artifact: ${artifact}\n`);
