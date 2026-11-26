// Checks that the web client stays usable while its server does not connect, and that it does not
// call a server "offline" while it only tries again.
//
// Start this worktree's stack with `bun run dev:test-client` (never `--shared`), then run
// `bun scripts/web-reconnect-search-e2e.ts [--api=<url>] [--host-id=<id>] [--label=<name>]
//  [--browser-executable=<path>] [--viewports=<width>x<height>,...] [--watch-ms=<ms>] [--video]`.
// `--viewports` gives the page sizes of the held runs, one run each, after one sign-in (default
// `1280x900,390x844`: a computer and a phone width). `--video` records each held run to `held.webm`.
//
// 1. Signs in to `${api}/app` as the dev host user and waits for `panels-ready`, so the client saves the
//    workspace frame of the host (`remote-workspace-frame`). It reads the name of one agent from it.
// 2. Opens `/app` again in a new browser context with that storage, and holds the Signal socket: the
//    socket opens, but no message goes to Signal or comes back. The host cannot connect, as when the
//    path to it is down, and the client tries again.
// 3. Checks that the loading cover goes and the saved frame shows while the host is not online, that
//    global search finds the agent of the frame, and that no "offline" text or state word shows for a
//    server that Signal did not report as offline: the client only waits or tries again.
// Writes .openbot-build/web-reconnect-search/<label>/report.json, and the screenshots of each step of
// each run in a folder named for its page size.
import assert from "node:assert/strict";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDynamicRecord, isString } from "@pokebots/contracts/runtime-values";
import { translateFor } from "@pokebots/i18n";
import { createOpenBotLogger } from "@pokebots/logging";
import { type Browser, type BrowserContext, chromium, type Page } from "playwright-core";
import { argument, WAIT_MS } from "./channel-e2e-support";

const NAME = "web-reconnect-search";
const ROOT = resolve(import.meta.dirname, "..");
const DEV_HOST_EMAIL = "openbot-dev-host@example.com";
const MARK_PREFIX = "openbot:remote-";
const FRAME_KEY_PREFIX = "openbot:remote-frame:";
const SELECTED_SERVER_PREFIX = "openbot.web.selected-server:";
const POLL_MS = 250;
/** The cover keeps a saved frame hidden for 2 seconds (`FRAME_COVER_MS`). The check gives it some more. */
const FRAME_SHOWN_WITHIN_MS = 6_000;
/** How long the check watches the state words while the client tries again. */
const WATCH_MS = Number(argument("watch-ms") ?? "45000");
const english = translateFor("en");
const logger = createOpenBotLogger(NAME);

const label = argument("label") ?? "current";
assert.match(label, /^\w[\w.-]*$/, "--label takes a folder name, not a path.");
const OUT = resolve(ROOT, ".openbot-build", NAME, label);
const api = (argument("api") ?? "http://localhost:3100").replace(/\/$/, "");
const browserExecutable = argument("browser-executable");
const hostId = argument("host-id");
const viewports = (argument("viewports") ?? "1280x900,390x844").split(",").map((size) => {
  const [width = 0, height = 0] = size.split("x").map(Number);
  assert.ok(width > 0 && height > 0, "--viewports takes <width>x<height>, separated by commas.");
  return { width, height };
});
const recordVideo = process.argv.includes("--video");

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Signs in to the web client with the code that the development account service shows. */
async function signIn(page: Page): Promise<void> {
  await page.goto(`${api}/app`);
  await page.getByRole("textbox", { name: english("account.login.email"), exact: true }).fill(DEV_HOST_EMAIL);
  const send = page.getByRole("button", { name: english("account.login.sendCode"), exact: true });
  const prefix = english("account.login.developmentCode", { code: "" });
  const notice = page.getByText(new RegExp(`^${literal(prefix)}`));
  const deadline = Date.now() + WAIT_MS;
  await send.click();
  while (!(await notice.isVisible()) && Date.now() < deadline) {
    await notice.waitFor({ timeout: 5_000 }).catch(() => undefined);
    // The account service can make a new code wait. The send button is gone while the code field shows.
    if (!(await notice.isVisible()) && (await send.isVisible()) && (await send.isEnabled())) await send.click();
  }
  await notice.waitFor({ timeout: 1_000 }).catch(async (error: unknown) => {
    await page.screenshot({ path: resolve(OUT, "sign-in-failure.png") }).catch(() => undefined);
    throw new Error("The account service showed no development code.", { cause: error });
  });
  const code = (await notice.innerText()).slice(prefix.length).replaceAll("-", "").trim();
  assert.ok(code.length > 0, "The account service showed no development code.");
  await page.keyboard.type(code);
}

/** Writes the host choice that the web client keeps for the account, then opens `/app` again. */
async function selectHost(page: Page, id: string): Promise<void> {
  await page.waitForFunction(
    (prefix) => Object.keys(localStorage).some((key) => key.startsWith(prefix)),
    SELECTED_SERVER_PREFIX,
    { timeout: WAIT_MS, polling: POLL_MS },
  );
  await page.evaluate(
    ({ prefix, id }) => {
      for (const key of Object.keys(localStorage)) if (key.startsWith(prefix)) localStorage.setItem(key, id);
    },
    { prefix: SELECTED_SERVER_PREFIX, id },
  );
  await page.reload();
}

/** The frame of the selected host in the saved storage, and the name of its first agent. */
function frameAgent(state: StorageState): { serverId: string; agentName: string } {
  for (const origin of state.origins) {
    const selected = origin.localStorage.find((item) => item.name.startsWith(SELECTED_SERVER_PREFIX))?.value;
    for (const item of origin.localStorage) {
      if (!item.name.startsWith(FRAME_KEY_PREFIX)) continue;
      const serverId = decodeURIComponent(item.name.split(":").at(-1) ?? "");
      if (selected && serverId !== selected) continue;
      const frame = JSON.parse(item.value);
      if (!isDynamicRecord(frame) || !Array.isArray(frame.agents)) continue;
      const agent = frame.agents.find((value: unknown) => isDynamicRecord(value) && isString(value.name) && value.name);
      if (isDynamicRecord(agent) && isString(agent.name)) return { serverId, agentName: agent.name };
    }
  }
  throw new Error("The web client saved no workspace frame with an agent.");
}

/** The Signal socket URLs that the page opened. */
function watchSockets(page: Page, urls: Set<string>): void {
  page.on("websocket", (socket) => urls.add(new URL(socket.url()).origin));
}

/** The words that say "offline" for a server: the notice of All machines and the state words. */
function offlineWords(): RegExp {
  const notice = english("server.allMachines.offline", { name: "\u0000" }).split("\u0000");
  const words = [
    english("server.machines.state.offline"),
    english("server.machines.unreachable"),
    english("server.state.offline"),
  ];
  return new RegExp(
    [`${literal(notice[0] ?? "")}.*${literal(notice[1] ?? "")}`, ...words.map((word) => `\\b${literal(word)}\\b`)].join(
      "|",
    ),
    "iu",
  );
}

/** The visible text of the page and the accessible names of its controls, where the state words are. */
function pageWords(page: Page): Promise<string> {
  return page.evaluate(() => {
    const names = [...document.querySelectorAll("[aria-label]")]
      .filter((element) => element instanceof HTMLElement && element.offsetParent !== null)
      .map((element) => element.getAttribute("aria-label") ?? "");
    return `${document.body.innerText}\n${names.join("\n")}`;
  });
}

interface Report {
  createdAt: string;
  api: string;
  serverId: string;
  agentName: string;
  blockedSignal: string[];
  runs: HeldRun[];
}

interface HeldRun {
  viewport: { width: number; height: number };
  /** When the saved frame showed without the cover, in ms after the page start. */
  frameShownMs: number;
  /** How long the cover stayed over the saved frame after the frame was in the page. */
  frameUncoveredMs: number;
  /** When search found the agent, in ms after the page start. */
  searchFoundMs: number;
  /** Each change of the state words seen while the client tried again. */
  states: { at: number; words: string[] }[];
  offlineSeen: string | null;
  reconnectingSeen: boolean;
  screenshots: string[];
}

async function run(browser: Browser): Promise<Report> {
  mkdirSync(OUT, { recursive: true });
  const first = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await first.newPage();
  const signal = new Set<string>();
  watchSockets(page, signal);
  await signIn(page);
  if (hostId) await selectHost(page, hostId);
  await page
    .waitForFunction(
      (names) => names.every((name) => performance.getEntriesByName(name).length > 0),
      [`${MARK_PREFIX}workspace-ready`, `${MARK_PREFIX}panels-ready`],
      { timeout: WAIT_MS, polling: POLL_MS },
    )
    .catch(async (error: unknown) => {
      await page.screenshot({ path: resolve(OUT, "sign-in-failure.png") }).catch(() => undefined);
      throw new Error("The web client did not reach panels-ready.", { cause: error });
    });
  const saved = await first.storageState();
  await first.close();
  const { serverId, agentName } = frameAgent(saved);
  const appOrigin = new URL(api).origin;
  // Each socket of the page that is not the page's own origin goes to Signal.
  const blocked = [...signal].filter((origin) => origin !== appOrigin.replace(/^http/u, "ws"));
  assert.ok(blocked.length > 0, "The web client opened no Signal socket.");
  logger.info(`Frame of ${serverId} with agent "${agentName}". Holding Signal at ${blocked.join(", ")}.`);
  const runs: HeldRun[] = [];
  for (const viewport of viewports) runs.push(await heldRun(browser, saved, blocked, agentName, viewport));
  return { createdAt: new Date().toISOString(), api, serverId, agentName, blockedSignal: blocked, runs };
}

/** Opens the client with the saved frame while Signal is held, at one page size. */
async function heldRun(
  browser: Browser,
  saved: StorageState,
  blocked: readonly string[],
  agentName: string,
  viewport: { width: number; height: number },
): Promise<HeldRun> {
  const out = resolve(OUT, `${viewport.width}x${viewport.height}`);
  mkdirSync(out, { recursive: true });
  const context = await browser.newContext({
    storageState: saved,
    viewport,
    ...(recordVideo ? { recordVideo: { dir: resolve(out, "video"), size: viewport } } : {}),
  });
  let recording: Page | null = null;
  try {
    // The socket opens and stays silent. No `ready` and no `host-waiting` comes, so Signal never says
    // that the host is offline, and the client only waits and tries again.
    await context.routeWebSocket(
      (url) => blocked.includes(url.origin),
      () => undefined,
    );
    const held = await context.newPage();
    recording = held;
    const started = Date.now();
    await held.goto(`${api}/app`);
    const screenshots: string[] = [];
    const shot = async (name: string) => {
      const path = resolve(out, `${name}.png`);
      await held.screenshot({ path });
      screenshots.push(path);
    };

    // The time starts when the saved frame is in the page: the development server loads the modules of
    // the page slowly, and that time is not what this check measures.
    const agentRow = held.getByText(agentName, { exact: true }).first();
    await agentRow.waitFor({ state: "attached", timeout: WAIT_MS });
    const frameAt = Date.now();
    // The cover goes over the saved frame: the agent row of the frame takes a click while the host is
    // not online. A trial click waits until no cover is over the row, and does not click.
    await agentRow.click({ trial: true, timeout: FRAME_SHOWN_WITHIN_MS }).catch(async (error: unknown) => {
      await shot("frame-covered");
      throw new Error(`The saved frame was not usable within ${FRAME_SHOWN_WITHIN_MS} ms.`, { cause: error });
    });
    const frameShownMs = Date.now() - started;
    const frameUncoveredMs = Date.now() - frameAt;
    await shot("frame-while-connecting");

    // Search finds the agent of the frame.
    await held.keyboard.press("ControlOrMeta+k");
    const input = held.getByRole("combobox", { name: english("conversation.globalSearch.title") });
    await input.waitFor({ state: "visible", timeout: 10_000 });
    await input.fill(agentName);
    await held
      .getByRole("option")
      .filter({ hasText: agentName })
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });
    const searchFoundMs = Date.now() - started;
    await shot("search-while-connecting");
    await held.keyboard.press("Escape");

    // The client tries again. No word says that a server is offline: Signal did not say so.
    const offline = offlineWords();
    const reconnecting = new RegExp(
      [
        english("server.allMachines.reconnecting", { name: "" }).replace(/\.$/u, ""),
        english("server.machines.state.reconnecting"),
        english("server.state.connecting"),
      ]
        .map(literal)
        .join("|"),
      "iu",
    );
    const states: HeldRun["states"] = [];
    let offlineSeen: string | null = null;
    let reconnectingSeen = false;
    const watchEnd = Date.now() + WATCH_MS;
    while (Date.now() < watchEnd) {
      const words = await pageWords(held);
      const found = words.match(offline)?.[0] ?? null;
      if (found && !offlineSeen) {
        offlineSeen = found;
        await shot("offline-word");
      }
      if (reconnecting.test(words)) reconnectingSeen = true;
      const seen = [...new Set(words.match(new RegExp(`${offline.source}|${reconnecting.source}`, "giu")) ?? [])];
      const last = states.at(-1)?.words.join("|");
      if (seen.join("|") !== last) states.push({ at: Date.now() - started, words: seen });
      await held.waitForTimeout(POLL_MS);
    }
    await shot("after-retries");
    return {
      viewport,
      frameShownMs,
      frameUncoveredMs,
      searchFoundMs,
      states,
      offlineSeen,
      reconnectingSeen,
      screenshots,
    };
  } finally {
    await context.close();
    const recorded = recordVideo ? await recording?.video()?.path() : undefined;
    if (recorded) renameSync(recorded, resolve(out, "held.webm"));
  }
}

const browser = await chromium.launch(
  browserExecutable ? { executablePath: browserExecutable } : { channel: "chrome" },
);
try {
  const report = await run(browser);
  writeFileSync(resolve(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  logger.info(`Wrote ${resolve(OUT, "report.json")}.`);
  for (const held of report.runs) {
    const size = `${held.viewport.width}x${held.viewport.height}`;
    assert.equal(held.offlineSeen, null, `${size}: the page said "${held.offlineSeen}" while the client tried again.`);
    assert.ok(held.searchFoundMs > 0, `${size}: search did not find the agent of the saved frame.`);
  }
} finally {
  await browser.close();
}
