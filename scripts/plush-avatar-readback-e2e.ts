// Run against this worktree's Storybook: bun scripts/plush-avatar-readback-e2e.ts --storybook=http://localhost:6007
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { webkit } from "playwright-core";

declare global {
  interface Window {
    avatarReadAreas: number[];
  }
}

const plushSource = await readFile("node_modules/@norbert_bodziony/bloub/dist/package/plush.js", "utf8");
assert.match(
  plushSource,
  /function Gt\(e, t\) \{[\s\S]*?document\.createElement\("canvas"\)[\s\S]*?getContext\("2d", \{ willReadFrequently: !0 \}\)/u,
  "Patched plush.js must keep the canvas and 2D context setup inside Gt.",
);

const base = process.argv.find((arg) => arg.startsWith("--storybook="))?.slice("--storybook=".length);
assert.ok(base, "Pass --storybook=<url> for this worktree's Storybook.");
const browser = await webkit.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true });
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.getImageData;
    const reads: number[] = [];
    Object.assign(window, { avatarReadAreas: reads });
    CanvasRenderingContext2D.prototype.getImageData = function (...args) {
      reads.push(args[2] * args[3]);
      return original.apply(this, args);
    };
  });
  await page.goto(`${base}/iframe.html?id=identity-agentavatar--independent-motion&viewMode=story`);
  await page.getByRole("button", { name: "idle agent-alpha" }).waitFor();
  await page.waitForFunction(() => {
    const avatars = document.querySelectorAll('[data-avatar="generated"]');
    return avatars.length === 12 && [...avatars].every((avatar) => avatar.querySelector('image[href^="data:"]'));
  });
  const before = await page
    .locator('[aria-label="idle avatars"] [data-avatar="generated"] image[href^="data:"]')
    .evaluateAll((images) => images.map((image) => image.getAttribute("href")));
  await page.getByRole("button", { name: "Reverse agents" }).click();
  const after = await page
    .locator('[aria-label="idle avatars"] [data-avatar="generated"] image[href^="data:"]')
    .evaluateAll((images) => images.map((image) => image.getAttribute("href")));
  assert.deepEqual(after, [...before].reverse(), "Reordering must keep each saved avatar body.");
  const areas = await page.evaluate(() => window.avatarReadAreas);
  assert.ok(areas.length > 0, "The story must exercise plush tinting.");
  const report = {
    avatars: before.length,
    reads: areas.length,
    largestReadPixels: Math.max(...areas),
    maxAllowedPixels: 256 * 256,
  };
  await mkdir(".openbot-build", { recursive: true });
  assert.ok(
    report.largestReadPixels <= report.maxAllowedPixels,
    `Canvas readback too large: ${report.largestReadPixels}`,
  );

  // A tint that fails once (a failed image load or pixel read) must not leave a plush without its body.
  // Before the retry in the bloub patch, the body and eyes stayed hidden and only the accessory showed.
  const failing = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await failing.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.getImageData;
    let failures = 0;
    CanvasRenderingContext2D.prototype.getImageData = function (...args) {
      failures += 1;
      if (failures <= 12) throw new DOMException("Simulated failed tint", "SecurityError");
      return original.apply(this, args);
    };
  });
  await failing.goto(`${base}/iframe.html?id=identity-agentavatar--independent-motion&viewMode=story`);
  await failing.waitForFunction(
    () => {
      const avatars = document.querySelectorAll('[data-avatar="generated"]');
      return avatars.length === 12 && [...avatars].every((avatar) => avatar.querySelector('image[href^="data:"]'));
    },
    undefined,
    { timeout: 15_000 },
  );
  const hiddenBodies = await failing
    .locator('[data-avatar="generated"] .bloub-avatar-svg [visibility="hidden"]')
    .count();
  assert.equal(hiddenBodies, 0, "Every plush body must show after a failed tint.");
  await failing.screenshot({ path: ".openbot-build/plush-avatar-failed-tint.png" });
  const failedTint = { avatars: 12, simulatedFailures: 12, hiddenBodies };
  await writeFile(
    ".openbot-build/plush-avatar-readback.json",
    `${JSON.stringify({ ...report, failedTint }, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify({ ...report, failedTint })}\n`);
} finally {
  await browser.close();
}
