// Exercises the shipped worker in Chromium against a local server with controlled responses.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const source = process.argv.includes("--released")
  ? execFileSync("git", ["show", "origin/main:apps/auth-api/service-worker/app-sw.js"], { encoding: "utf8" })
  : readFileSync("apps/auth-api/service-worker/app-sw.js", "utf8");
let build = "one";
let status = 200;
let empty503 = true;
let incompatible = false;
let cacheError = false;
const checks: string[] = [];
const server = createServer((request, response) => {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  if (path === "/app-sw.js") {
    const injection = cacheError
      ? 'caches.open = caches.keys = async () => { throw new Error("cache unavailable"); };\n'
      : "";
    response.writeHead(200, { "Content-Type": "application/javascript", "Cache-Control": "no-store" });
    response.end(
      injection +
        source
          .replace("__OPENBOT_BUILD_ID__", build)
          .replace("__OPENBOT_APP_NAME__", "Test")
          .replace('"__OPENBOT_ASSET_PATHS__"', `"/assets/${build}.js"`),
    );
  } else if (path === "/app") {
    if (status === 302) response.writeHead(302, { Location: "/login" }).end();
    else if (status !== 200) response.writeHead(status).end(status === 503 && empty503 ? "" : "denied");
    else
      response
        .writeHead(200, { "Content-Type": "text/html" })
        .end(`<title>${build}</title><script src="/assets/${incompatible ? "other" : build}.js"></script>`);
  } else if (path === "/api/private") response.writeHead(200).end("private");
  else if (path.startsWith("/assets/"))
    response
      .writeHead(200, { "Content-Type": "application/javascript" })
      .end('document.documentElement.dataset.assetLoaded = "yes";');
  else if (path === "/login") response.writeHead(200, { "Content-Type": "text/html" }).end("<title>login</title>");
  else response.writeHead(404).end();
});
await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
const address = server.address();
assert.ok(address && typeof address === "object");
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.goto(`${base}/app`);
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/app-sw.js", { scope: "/app" });
    await navigator.serviceWorker.ready;
  });
  await page.goto(`${base}/app`);
  await page.waitForFunction(async () => Boolean(await (await caches.open("openbot-web-shell-one")).match("/app")));
  status = 503;
  assert.equal((await page.goto(`${base}/app`))?.status(), 200);
  assert.equal(await page.title(), "one");
  checks.push("503 uses the current cached shell");
  empty503 = false;
  await page.context().setOffline(true);
  await page.goto(`${base}/app`);
  assert.equal(await page.title(), "one");
  await page.context().setOffline(false);
  checks.push("offline navigation uses the current cached shell");
  await page.evaluate(async () => {
    await fetch("/api/private");
  });
  const cachedPaths = await page.evaluate(async () => {
    const paths: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) paths.push(new URL(request.url).pathname);
    }
    return paths;
  });
  assert.ok(cachedPaths.every((path) => path === "/app" || path.startsWith("/assets/")));
  checks.push("API responses stay out of the caches");
  await page.evaluate(async () => {
    const cache = await caches.open("openbot-web-shell-one");
    await cache.put(
      "/app",
      new Response('<script src="/assets/other.js"></script>', { headers: { "Content-Type": "text/html" } }),
    );
  });
  assert.equal((await page.goto(`${base}/app`))?.status(), 503);
  status = 200;
  await page.goto(`${base}/app`);
  await page.waitForFunction(async () =>
    (await (await (await caches.open("openbot-web-shell-one")).match("/app"))?.text())?.includes("/assets/one.js"),
  );
  checks.push("an incompatible shell saved by an older worker is rejected");
  status = 401;
  assert.equal((await page.goto(`${base}/app`))?.status(), 401);
  status = 403;
  assert.equal((await page.goto(`${base}/app`))?.status(), 403);
  status = 302;
  await page.goto(`${base}/app`);
  assert.equal(await page.title(), "login");
  checks.push("authorization errors and redirects pass through");
  status = 200;
  await page.goto(`${base}/app`);
  incompatible = true;
  await page.goto(`${base}/app`);
  incompatible = false;
  status = 503;
  await page.goto(`${base}/app`);
  assert.equal(await page.title(), "one");
  checks.push("a shell from another build does not replace the cached shell");
  build = "two";
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration("/app");
    assertRegistration(registration);
    await registration.update();
    if (!registration.waiting)
      await new Promise<void>((resolve) =>
        registration.addEventListener("updatefound", () =>
          registration.installing?.addEventListener("statechange", () => {
            if (registration.waiting) resolve();
          }),
        ),
      );
    const changed = new Promise<void>((resolve) =>
      navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }),
    );
    registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    await changed;
    function assertRegistration(
      value: ServiceWorkerRegistration | undefined,
    ): asserts value is ServiceWorkerRegistration {
      if (!value) throw new Error("missing registration");
    }
  });
  assert.equal((await page.goto(`${base}/app`))?.status(), 503);
  checks.push("a new build does not use an old shell");
  status = 200;
  await page.goto(`${base}/app`);
  await page.waitForFunction(async () => Boolean(await (await caches.open("openbot-web-shell-two")).match("/app")));
  status = 503;
  assert.equal((await page.goto(`${base}/app`))?.status(), 200);
  assert.equal(await page.title(), "two");
  checks.push("the new build recovers after saving its shell");
  cacheError = true;
  build = "three";
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration("/app");
    if (!registration) throw new Error("missing registration");
    await registration.update();
    if (!registration.waiting)
      await new Promise<void>((resolve) =>
        registration.addEventListener("updatefound", () =>
          registration.installing?.addEventListener("statechange", () => {
            if (registration.waiting) resolve();
          }),
        ),
      );
    const changed = new Promise<void>((resolve) =>
      navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }),
    );
    registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    await changed;
  });
  assert.equal((await page.goto(`${base}/app`))?.status(), 503);
  checks.push("cache errors leave the server response intact");
  status = 200;
  assert.equal((await page.goto(`${base}/app`))?.status(), 200);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.assetLoaded), "yes");
  checks.push("cache errors do not stop a successful navigation or its assets");
  mkdirSync(".openbot-build/web-navigation-recovery", { recursive: true });
  writeFileSync(resolve(".openbot-build/web-navigation-recovery/report.json"), JSON.stringify({ checks }, null, 2));
  process.stdout.write(`Passed ${checks.length} navigation checks.\n`);
} finally {
  await browser.close();
  server.close();
}
