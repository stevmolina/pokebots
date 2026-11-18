// Checks that a click on a room row opens the room and shows its messages, in the real web client
// layout at a computer width (960 px) and at a phone width (390 px).
//
// It drives the `Web/Workspace/Rooms` story of a running Storybook, which is the real WebWorkspace
// over a host that answers the Rooms route:
// `bun scripts/rooms-open-e2e.ts --storybook=<url from bun run storybook>`
// Add `--browser-executable=<path>` for a browser other than the installed Chrome.
// It writes .openbot-build/rooms-open/report.json and one screenshot for each width.
//
// The bug it guards: the page frame of a titled window page ignores pointer events, and the Rooms panel
// did not turn them back on, so a click went through the rows to the frame and nothing opened.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, chromium, type Page } from "playwright-core";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, ".openbot-build", "rooms-open");
const STORY = "web-workspace--rooms";
const WAIT_MS = 90_000;

const storybook = process.argv
  .find((arg) => arg.startsWith("--storybook="))
  ?.slice("--storybook=".length)
  .replace(/\/$/, "");
assert.ok(storybook, "Pass --storybook=<url> from `bun run storybook`.");
const executable = process.argv
  .find((arg) => arg.startsWith("--browser-executable="))
  ?.slice("--browser-executable=".length);

interface Reading {
  width: number;
  /** The element that gets a click at the centre of the first row. It must be the row itself. */
  topElementIsRow: boolean;
  headingAfterClick: string;
  messages: string[];
}

/** Opens the Rooms page through Go to > Rooms, as the sidebar menu does. The host connects after the page loads. */
async function openRooms(page: Page): Promise<void> {
  const deadline = Date.now() + WAIT_MS;
  const rooms = page.getByRole("menuitem", { name: "Rooms", exact: true });
  while (!(await rooms.isVisible())) {
    assert.ok(Date.now() < deadline, "The Go to menu never listed Rooms.");
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: /profile, machines and settings/ })
      .first()
      .click({ timeout: WAIT_MS });
    await page.getByRole("menuitem", { name: "Go to" }).click({ timeout: WAIT_MS });
    await rooms.waitFor({ timeout: 2_000 }).catch(() => undefined);
  }
  await rooms.click();
  await page.locator(".rooms-list-row").first().waitFor({ timeout: WAIT_MS });
}

async function check(browser: Browser, width: number, height: number): Promise<Reading> {
  const phone = width < 721;
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone });
  const page = await context.newPage();
  try {
    await page.goto(`${storybook}/iframe.html?id=${STORY}&viewMode=story`, {
      waitUntil: "domcontentloaded",
      timeout: WAIT_MS,
    });
    await openRooms(page);
    const row = page.locator(".rooms-list-row").first();
    const topElementIsRow = await row.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return top !== null && element.contains(top);
    });
    await row.click({ timeout: 5_000 });
    const heading = page.locator(".rooms-panel h1");
    await heading.filter({ hasText: "Claude Gang" }).waitFor({ timeout: WAIT_MS });
    await page.locator(".rooms-messages article").nth(1).waitFor({ timeout: WAIT_MS });
    const messages = await page.locator(".rooms-messages article p").allInnerTexts();
    await page.screenshot({ path: resolve(OUT, `room-open-${width}.png`) });
    return { width, topElementIsRow, headingAfterClick: (await heading.innerText()).trim(), messages };
  } finally {
    await context.close();
  }
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(executable ? { executablePath: executable } : { channel: "chrome" });
try {
  const readings: Reading[] = [];
  for (const [width, height] of [
    [960, 800],
    [390, 844],
  ] as const) {
    const reading = await check(browser, width, height);
    assert.ok(reading.topElementIsRow, `At ${width} px a click on a room row lands on another element.`);
    assert.equal(reading.headingAfterClick, "Claude Gang");
    assert.deepEqual(reading.messages, ["Welcome to the room.", "I read the notice and I am ready."]);
    readings.push(reading);
  }
  writeFileSync(resolve(OUT, "report.json"), JSON.stringify({ passed: true, story: STORY, readings }, null, 2));
} finally {
  await browser.close();
}
