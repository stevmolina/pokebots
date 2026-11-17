// Checks that the web app shows no toast when the link to the server drops and comes back.
// Writes .openbot-build/web-reconnect-notice/report.json, screenshots and a video.
//
// A phone pauses an installed web app each time the user leaves it, so the link to the server drops
// often. A short drop and a long drop both show no "Reconnecting to <server>" and no "restored" toast.
// The composer says "Connecting..." and the app mends the link itself.
//
// It drives the `Web/Workspace/ConnectionDrop` story of a running Storybook, in desktop WebKit: `bun scripts/web-reconnect-notice-e2e.ts --storybook=<url from bun run storybook>`
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createOpenBotLogger } from "@openbot/logging";
import { type Page, webkit } from "playwright-core";

const logger = createOpenBotLogger("web-reconnect-notice-e2e");
const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, ".openbot-build", "web-reconnect-notice");
const STORY = "web-workspace--connection-drop";
const SHORT_DROP_MS = 3_000;
/** Longer than the 8 seconds after which the removed reconnect toast used to show. */
const LONG_DROP_MS = 14_000;
const RECONNECTING = /Reconnecting to Preview computer/;
const RESTORED = /Connection to Preview computer restored/;

const storybook = process.argv
  .find((arg) => arg.startsWith("--storybook="))
  ?.slice("--storybook=".length)
  .replace(/\/$/, "");
assert.ok(storybook, "Pass --storybook=<url> from `bun run storybook`.");

/** Watches toast additions until the reconnect completes and the browser paints its result. */
function dropFor(page: Page, ms: number): Promise<boolean> {
  return page.evaluate(
    (duration) =>
      new Promise<boolean>((done) => {
        let announced = false;
        const inspect = (node: Node) => {
          if (!(node instanceof Element)) return;
          if (node.matches("[data-sonner-toast]") || node.querySelector("[data-sonner-toast]")) announced = true;
        };
        const observer = new MutationObserver((records) => {
          for (const record of records) for (const node of record.addedNodes) inspect(node);
        });
        inspect(document.body);
        observer.observe(document.body, { childList: true, subtree: true });
        window.dispatchEvent(
          new CustomEvent("preview-connection-drop", {
            detail: {
              ms: duration,
              done: () =>
                requestAnimationFrame(() => {
                  inspect(document.body);
                  observer.disconnect();
                  done(announced);
                }),
            },
          }),
        );
      }),
    ms,
  );
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const browser = await webkit.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1000, height: 700 },
    recordVideo: { dir: OUT, size: { width: 1000, height: 700 } },
  });
  const page = await context.newPage();
  // A cold Storybook compiles the story on the first visit.
  await page.goto(`${storybook}/iframe.html?id=${STORY}&viewMode=story`, { waitUntil: "commit", timeout: 120_000 });
  await page.getByText("Chief").first().waitFor({ timeout: 120_000 });

  async function watchDrop(ms: number, name: string): Promise<boolean> {
    const announced = await dropFor(page, ms);
    assert.equal(await page.getByText(RECONNECTING).count(), 0, "The reconnect toast is visible.");
    assert.equal(await page.getByText(RESTORED).count(), 0, "The restored toast is visible.");
    await page.screenshot({ path: resolve(OUT, `${name}.png`) });
    return announced;
  }

  const shortAnnounced = await watchDrop(SHORT_DROP_MS, "short-drop-after");
  assert.equal(shortAnnounced, false, "A short drop showed a connection toast.");
  const longAnnounced = await watchDrop(LONG_DROP_MS, "long-drop-after");
  assert.equal(longAnnounced, false, "A long drop showed a connection toast.");
  assert.equal(await page.getByText("Chief").first().isVisible(), true, "The app did not mend the link.");

  // An existing splash or conversation loader must expose the recovery controls it receives.
  const coveredLoads = [];
  for (const story of [
    "auth-apploadingscreen--slow-first-load-behind-splash",
    "auth-apploadingscreen--first-load-behind-conversation",
  ]) {
    await page.goto(`${storybook}/iframe.html?id=${story}&viewMode=story`, { waitUntil: "commit", timeout: 120_000 });
    const retry = page.getByRole("button", { name: "Retry", exact: true });
    await retry.waitFor({ timeout: 120_000 });
    await page.screenshot({ path: resolve(OUT, `${story}.png`) });
    await retry.click();
    await page.getByRole("status", { name: "Retry attempts" }).filter({ hasText: "1" }).waitFor();
    assert.equal(await page.locator("[data-sonner-toast]").count(), 0, "A covered load showed a toast.");
    await page.getByRole("button", { name: "Details", exact: true }).click();
    await page.getByRole("alertdialog").waitFor();
    await page.screenshot({ path: resolve(OUT, `${story}-details.png`) });
    coveredLoads.push({ story, retry: true, details: true });
  }

  const video = page.video();
  await context.close();
  const report = {
    story: STORY,
    shortDropMs: SHORT_DROP_MS,
    shortDropShowedToast: shortAnnounced,
    longDropMs: LONG_DROP_MS,
    longDropShowedToast: longAnnounced,
    coveredLoads,
    video: video ? await video.path() : null,
  };
  writeFileSync(resolve(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  logger.info("web reconnect notice e2e passed", report);
} finally {
  await browser.close();
}
