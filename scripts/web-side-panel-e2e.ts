// Checks that the right side panel of the web client has the layout and the behavior of the desktop
// panel (#2550). Drives the `Web/Workspace/Connected` and `App/Playground` stories of a running
// Storybook side by side at common desktop widths: default state, the pane list, the Agent settings
// pane, Maximize and Restore, a resize, and Close details. With only Agent settings open, the panel
// has no tab strip: a round Close details button and the Tools rows (Browser, Files, Maximize side
// panel) are in the pane. The strip comes back when the pane is maximized or a second pane is open;
// the `App/Playground` story has Browser and Files, so it opens Files and closes it with Delete.
// At a phone width the web client alone is checked: the Agent settings button of the chat header
// opens a pane that takes the full width, and Close details closes it.
//
// `bun scripts/web-side-panel-e2e.ts --storybook=<url> [--browser-executable=<path>]`
// Writes .openbot-build/web-side-panel-e2e/report.json and a screenshot of each client, width and
// state, and exits non-zero on a failure.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Browser, chromium, type Locator, type Page } from "playwright-core";

const OUT = resolve(import.meta.dirname, "../.openbot-build/web-side-panel-e2e");
const STORIES = { web: "web-workspace--connected", desktop: "app--playground" } as const;
type Client = keyof typeof STORIES;
const DESKTOP_WIDTHS = [1280, 1024];
const PHONE_WIDTH = 390;
const HEIGHT = 800;
const RESIZE_BY = 100;
/**
 * The parts of the panel, and the chat header beside it, that both clients draw with the same markup.
 * The chat and the composer are left out: the height of the composer follows its content.
 */
const PARTS = [
  ".conversation-header",
  ".side-panel-header",
  ".side-panel-tab",
  ".settings-panel",
  ".agent-settings-focus-close",
  ".right-panel-resizer",
] as const;
/** The width of the panel before the first resize (`SIDE_PANEL_DEFAULT`). */
const DEFAULT_PANEL_WIDTH = 459;

function option(name: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}
const storybook = option("storybook")?.replace(/\/$/, "");
const browserExecutable = option("browser-executable");
assert.ok(storybook, "Pass --storybook=<url> from `bun run storybook`.");

const checks: { name: string; passed: boolean; detail?: unknown }[] = [];
function check(name: string, passed: boolean, detail?: unknown) {
  checks.push({ name, passed, ...(detail === undefined ? {} : { detail }) });
}
const report: { passed: boolean; checks: typeof checks; error?: string } = { passed: false, checks };

interface Part {
  x: number;
  y: number;
  width: number;
  height: number;
  style: string;
}

/** The box and the visible style of each part that shows. */
async function measure(page: Page): Promise<Record<string, Part>> {
  return page.evaluate((selectors) => {
    const parts: Record<string, Part> = {};
    for (const selector of selectors) {
      const element = document.querySelector(`.conversation-panel ${selector}`);
      if (!element) continue;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || box.width === 0) continue;
      parts[selector] = {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
        style: [style.font, style.color, style.backgroundColor, style.borderRadius, style.padding].join(" | "),
      };
    }
    return parts;
  }, PARTS);
}

/** The parts that differ between the two clients. */
function differences(web: Record<string, Part>, desktop: Record<string, Part>) {
  const found: Record<string, { web?: Part; desktop?: Part }> = {};
  for (const selector of PARTS) {
    const a = web[selector];
    const b = desktop[selector];
    if (JSON.stringify(a) !== JSON.stringify(b))
      found[selector] = { ...(a ? { web: a } : {}), ...(b ? { desktop: b } : {}) };
  }
  return found;
}

/** Waits until the animations of the panel and of the chat beside it end. */
async function settled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const panel = document.querySelector(".conversation-panel");
    if (!panel) return;
    const running = [panel, ...panel.querySelectorAll(":scope > *")].flatMap((element) =>
      element
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY),
    );
    await Promise.all(running.map((animation) => animation.finished.catch(() => undefined)));
  });
}

async function open(browser: Browser, client: Client, width: number): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: HEIGHT } });
  await page.goto(`${storybook}/iframe.html?id=${STORIES[client]}&viewMode=story`);
  if (width === PHONE_WIDTH) {
    // A phone starts on the chat list, and its chat header has no panel button.
    await page.getByRole("button", { name: /^Chief\. / }).click({ timeout: 120_000 });
    await page.locator(".conversation-header").waitFor();
  } else await page.locator(".side-panel-toggle").first().waitFor({ timeout: 120_000 });
  return page;
}

async function shot(page: Page, name: string): Promise<void> {
  await settled(page);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}

async function openSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open Agent settings" }).click();
  // The settings pane loads on first use.
  await page.locator(".conversation-panel .settings-panel").waitFor({ timeout: 60_000 });
  await settled(page);
}

/** One client at one desktop width, through the states that both clients have. */
async function desktopStates(browser: Browser, client: Client, width: number) {
  const page = await open(browser, client, width);
  const toggle = page.locator(".side-panel-toggle").first();
  const panel = page.locator(".conversation-panel");
  const states: Record<string, Record<string, Part>> = {};
  try {
    const closed = {
      expanded: await toggle.getAttribute("aria-expanded"),
      header: await page.locator(".side-panel-header").count(),
    };
    states.closed = await measure(page);

    await toggle.click();
    await page.locator(".side-panel-launcher").waitFor();
    await shot(page, `${client}-${width}-launcher`);
    const launcher = await page.locator(".side-panel-launch").allInnerTexts();

    await openSettings(page);
    states.settings = await measure(page);
    await shot(page, `${client}-${width}-settings`);
    // One pane has no tab strip. Close details and the Tools rows are in the pane.
    const single = {
      header: await page.locator(".side-panel-header").count(),
      width: await panel.locator(".settings-panel").evaluate((element) => element.clientWidth),
      close: await panel.getByRole("button", { name: "Close details" }).count(),
      maximize: await panel.locator(".settings-panel").getByRole("button", { name: "Maximize side panel" }).count(),
      expanded: await toggle.getAttribute("aria-expanded"),
    };

    await panel.locator(".settings-panel").getByRole("button", { name: "Maximize side panel" }).click();
    // The strip comes back when the pane is maximized, with Restore and Close side panel.
    await page.locator(".side-panel-header").waitFor();
    await settled(page);
    states.maximized = await measure(page);
    const panelWidth = await panel.evaluate((element) => element.clientWidth);
    const maximizedStrip = {
      restore: await page.locator(".side-panel-actions").getByRole("button", { name: "Restore side panel" }).count(),
      close: await page.locator(".side-panel-actions").getByRole("button", { name: "Close side panel" }).count(),
      // The Tools row of the pane changes its name too.
      row: await panel.locator(".settings-panel").getByRole("button", { name: "Restore side panel" }).count(),
    };
    await shot(page, `${client}-${width}-maximized`);
    await page.locator(".side-panel-actions").getByRole("button", { name: "Restore side panel" }).click();
    await page.locator(".side-panel-header").waitFor({ state: "detached" });
    await settled(page);
    const restored = await panel
      .locator(".settings-panel")
      .getByRole("button", { name: "Maximize side panel" })
      .count();

    const before = await panel.locator(".settings-panel").evaluate((element) => element.clientWidth);
    const handle = await panel.locator(".right-panel-resizer").boundingBox();
    assert.ok(handle, `${client}: the settings pane has no resize handle.`);
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 - RESIZE_BY, handle.y + handle.height / 2, { steps: 5 });
    await page.mouse.up();
    await settled(page);
    states.resized = await measure(page);
    const after = await panel.locator(".settings-panel").evaluate((element) => element.clientWidth);

    // Only the App/Playground story has a second pane. Open Files: the strip shows both tabs, and Delete on
    // the focused Files tab closes it and takes the strip away again. The web story has Agent settings only.
    let secondPane: { tabs: number; afterDelete: number; settingsStays: number } | undefined;
    if (client === "desktop") {
      await panel.locator(".settings-panel").getByRole("button", { name: "Files", exact: true }).click();
      await page.locator(".side-panel-header").waitFor();
      await settled(page);
      const tabs = await page.locator(".side-panel-tab-select").count();
      await shot(page, `${client}-${width}-two-panes`);
      await page.locator(".side-panel-tab-select", { hasText: "Files" }).focus();
      await page.keyboard.press("Delete");
      await page.locator(".side-panel-header").waitFor({ state: "detached" });
      secondPane = {
        tabs,
        afterDelete: await page.locator(".side-panel-header").count(),
        settingsStays: await panel.locator(".settings-panel").count(),
      };
    }

    await panel.getByRole("button", { name: "Close details" }).click();
    await panel.locator(".settings-panel").waitFor({ state: "detached" });
    const closedAgain = await toggle.getAttribute("aria-expanded");

    return {
      closed,
      launcher,
      single,
      states,
      panelWidth,
      maximizedStrip,
      restored,
      resize: { before, after },
      secondPane,
      closedAgain,
    };
  } finally {
    await page.close();
  }
}

/** Does a click at the middle of the element reach it, and not a part drawn over it? */
function reachable(element: Locator): Promise<boolean> {
  return element.evaluate((target) => {
    const box = target.getBoundingClientRect();
    return target.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  });
}

async function phone(browser: Browser) {
  const page = await open(browser, "web", PHONE_WIDTH);
  const toggle = page.locator(".side-panel-toggle").first();
  try {
    // On a phone, the Agent settings button of the chat header opens the pane without the pane list.
    await page.getByRole("button", { name: "View agent settings" }).click();
    await page.locator(".conversation-panel .settings-panel").waitFor({ timeout: 60_000 });
    await settled(page);
    const settings = await measure(page);
    // The pane covers the phone screen, so its own header hides the chat header. The chat header keeps its box.
    const headerBox = await page.locator(".conversation-panel .conversation-header").boundingBox();
    const expanded = await toggle.getAttribute("aria-expanded");
    const closeReachable = await reachable(page.getByRole("button", { name: "Close details" }));
    await shot(page, `web-${PHONE_WIDTH}-settings`);

    await page.locator(".settings-panel").getByRole("button", { name: "Maximize side panel" }).click();
    // The pane keeps its own header on a phone, so the strip is in the page but hidden. Its row replaces Maximize.
    await page.locator(".side-panel-header").waitFor({ state: "attached" });
    await settled(page);
    const maximized = {
      pane: (await measure(page))[".settings-panel"],
      stripVisibility: await page
        .locator(".side-panel-header")
        .evaluate((element) => getComputedStyle(element).visibility),
    };
    const restore = page.locator(".settings-panel").getByRole("button", { name: "Restore side panel" });
    const restoreReachable = await reachable(restore);
    await shot(page, `web-${PHONE_WIDTH}-maximized`);
    await restore.click();
    await page.locator(".side-panel-header").waitFor({ state: "detached" });

    await page.locator(".settings-panel").getByRole("button", { name: "Close details" }).click();
    await page.locator(".conversation-panel .settings-panel").waitFor({ state: "detached" });
    const closedAgain = await toggle.getAttribute("aria-expanded");
    return { settings, headerBox, expanded, closeReachable, maximized, restoreReachable, closedAgain };
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch(
  browserExecutable ? { executablePath: browserExecutable } : { channel: "chrome" },
);
try {
  mkdirSync(OUT, { recursive: true });
  for (const width of DESKTOP_WIDTHS) {
    const web = await desktopStates(browser, "web", width);
    const desktop = await desktopStates(browser, "desktop", width);
    for (const [client, result] of [
      ["web", web],
      ["desktop", desktop],
    ] as const) {
      check(
        `${client} ${width}: the panel starts closed`,
        result.closed.expanded === "false" && result.closed.header === 0,
        result.closed,
      );
      check(
        `${client} ${width}: the panel button opens the pane list`,
        result.launcher.includes("Open Agent settings"),
        result.launcher,
      );
      check(
        `${client} ${width}: Agent settings alone has no tab strip, a default width, Close details and Maximize`,
        result.single.header === 0 &&
          result.single.width === DEFAULT_PANEL_WIDTH &&
          result.single.close === 1 &&
          result.single.maximize === 1 &&
          result.single.expanded === "true",
        result.single,
      );
      check(
        `${client} ${width}: a maximized pane covers the chat and brings the strip back with Restore and Close`,
        result.states.maximized?.[".settings-panel"]?.width === result.panelWidth &&
          result.states.maximized?.[".side-panel-header"]?.width === result.panelWidth &&
          result.states.maximized[".conversation-header"] === undefined &&
          result.maximizedStrip.restore === 1 &&
          result.maximizedStrip.row === 1 &&
          result.maximizedStrip.close === 1,
        { maximized: result.states.maximized, strip: result.maximizedStrip },
      );
      check(`${client} ${width}: Restore takes the strip away and shows Maximize again`, result.restored === 1);
      check(
        `${client} ${width}: the resize handle widens the pane`,
        result.resize.after - result.resize.before === RESIZE_BY,
        result.resize,
      );
      if (client === "desktop")
        check(
          `${client} ${width}: a second pane brings the strip back, and Delete on it takes the strip away`,
          result.secondPane?.tabs === 2 && result.secondPane.afterDelete === 0 && result.secondPane.settingsStays === 1,
          result.secondPane,
        );
      check(`${client} ${width}: Close details closes the panel`, result.closedAgain === "false", result.closedAgain);
    }
    for (const state of ["closed", "settings", "maximized", "resized"] as const) {
      const found = differences(web.states[state] ?? {}, desktop.states[state] ?? {});
      check(`${width} ${state}: web and desktop draw the same panel`, Object.keys(found).length === 0, found);
    }
  }

  const result = await phone(browser);
  const full = (part: Part | undefined) => part?.x === 0 && part.width === PHONE_WIDTH;
  const header = result.headerBox;
  const pane = result.settings[".settings-panel"];
  check(
    `web ${PHONE_WIDTH}: the chat header keeps the full width over an open pane`,
    header?.x === 0 && header.width === PHONE_WIDTH && result.expanded === "true",
    header,
  );
  check(
    `web ${PHONE_WIDTH}: the pane takes the full width and has no tab strip`,
    full(pane) && result.settings[".side-panel-header"] === undefined,
    pane,
  );
  check(`web ${PHONE_WIDTH}: Close details is reachable`, result.closeReachable);
  check(
    `web ${PHONE_WIDTH}: a maximized pane keeps the full width, hides the strip, and Restore is reachable`,
    full(result.maximized.pane) && result.maximized.stripVisibility === "hidden" && result.restoreReachable,
    result.maximized,
  );
  check(`web ${PHONE_WIDTH}: Close details closes the panel`, result.closedAgain === "false", result.closedAgain);
  report.passed = checks.every((entry) => entry.passed);
} catch (error) {
  report.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
} finally {
  await browser.close();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  for (const entry of checks) process.stdout.write(`${entry.passed ? "PASS" : "FAIL"} ${entry.name}\n`);
  if (report.error) process.stdout.write(`${report.error}\n`);
  process.stdout.write(`Report: ${join(OUT, "report.json")}\n`);
  if (!report.passed) process.exitCode = 1;
}
