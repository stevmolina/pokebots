// Measures how fast the phone connects again to its servers over a far path, before and after the
// peer page keeps connection hints (`apps/mobile/src/features/workspace/model/peer-hints.ts`) and all
// servers start at once on a return to the app.
//
// The real peer code runs in Chrome (`scripts/mobile-reconnect-page.ts`): the `createRemoteTeamPeer`
// call of the phone's bridge page, without the hint store (`before`, as released) and with it
// (`after`). Signal and the host are fakes in the same page; the WebRTC connection is real, and the
// page header says how the far path is modelled. The scenarios:
// - cold-start: the app starts after 8 hours. A new page; the kept ICE servers are too old to use.
// - return-60s: a return after 60 s. The page and its connection stay; Signal is renewed and ICE restarts.
// - return-15m: a return after 15 min. The page stays; the host dropped the connection, so the peer
//   makes a new one on the same session.
// - return-15m-reload: as return-15m, but iOS ended the web view's process, so the page is new.
// - three-servers-return: return-15m-reload with 3 servers. `before` also holds the other servers
//   until the selected one is online or 3 s pass, as the phone did before this change.
//
// Run: `bun scripts/mobile-reconnect-e2e.ts [--latency=260] [--runs=3] [--browser-executable=<path>]`.
// Writes .openbot-build/mobile-reconnect-e2e/report.json and report.md, and exits non-zero when a run
// fails or `after` is not faster where the hints apply.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createOpenBotLogger } from "@pokebots/logging";
import { chromium } from "playwright-core";
import { argument } from "./channel-e2e-support";
import type { Mode, RunResult, Scenario, StepTimes } from "./mobile-reconnect-page";

const NAME = "mobile-reconnect-e2e";
const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, ".openbot-build", NAME);
const ENTRY = resolve(import.meta.dirname, "mobile-reconnect-page.ts");
const PAGE_URL = "https://mobile-reconnect.test/";
const logger = createOpenBotLogger(NAME);

const latencyMs = Number(argument("latency") ?? "260");
assert.ok(Number.isInteger(latencyMs) && latencyMs > 0, "--latency takes a whole number of milliseconds.");
const runs = Number(argument("runs") ?? "3");
assert.ok(Number.isInteger(runs) && runs >= 1, "--runs takes a whole number, 1 or more.");
const browserExecutable = argument("browser-executable");

const SCENARIOS: Scenario[] = ["cold-start", "return-60s", "return-15m", "return-15m-reload", "three-servers-return"];
const MODES: Mode[] = ["before", "after"];
/** The scenarios where the page is new, so the hints must save round trips. */
const HINT_SCENARIOS = new Set<Scenario>(["cold-start", "return-15m-reload", "three-servers-return"]);
const STEPS: (keyof StepTimes)[] = [
  "ticket",
  "signalOpen",
  "ready",
  "channels",
  "auth",
  "connect",
  "compatibility",
  "firstRead",
];
const STEP_NAMES: Record<keyof StepTimes, string> = {
  ticket: "ticket",
  signalOpen: "signal open",
  ready: "ready",
  channels: "channels",
  auth: "auth",
  connect: "connect",
  compatibility: "compatibility",
  firstRead: "first read",
};

function median(values: readonly number[]): number | null {
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[middle] ?? null)
    : Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

/** The median of each step of the selected server, and the time until all servers had their first read. */
function summarize(results: readonly RunResult[]) {
  const step = (name: keyof StepTimes) => median(results.map((result) => result.servers[0]?.[name] ?? Number.NaN));
  const steps: Record<keyof StepTimes, number | null> = {
    ticket: step("ticket"),
    signalOpen: step("signalOpen"),
    ready: step("ready"),
    channels: step("channels"),
    auth: step("auth"),
    connect: step("connect"),
    compatibility: step("compatibility"),
    firstRead: step("firstRead"),
  };
  return { steps, allServersMs: median(results.map((result) => result.allServersMs)) };
}

type Summary = Record<Scenario, Record<Mode, ReturnType<typeof summarize>>>;

async function bundle(): Promise<string> {
  const result = await Bun.build({
    entrypoints: [ENTRY],
    target: "browser",
    format: "iife",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  });
  if (!result.success) {
    for (const message of result.logs) logger.error(String(message));
    throw new Error("The page did not build.");
  }
  const [output] = result.outputs;
  if (!output) throw new Error("The page build has no output.");
  return output.text();
}

const cell = (value: number | null) => (value === null ? "-" : `${value}`);
const roundTrips = (value: number | null) => (value === null ? "-" : (value / latencyMs).toFixed(1));

function table(summary: Summary): string {
  const lines: string[] = [];
  for (const scenario of SCENARIOS) {
    const { before, after } = summary[scenario];
    lines.push(
      `### ${scenario}`,
      "",
      "| Step (ms after start) | Before | After | Saved |",
      "| --- | --- | --- | --- |",
    );
    for (const step of STEPS) {
      const a = before.steps[step];
      const b = after.steps[step];
      lines.push(`| ${STEP_NAMES[step]} | ${cell(a)} | ${cell(b)} | ${a !== null && b !== null ? a - b : "-"} |`);
    }
    if (scenario === "three-servers-return") {
      const a = before.allServersMs;
      const b = after.allServersMs;
      lines.push(`| all 3 servers read | ${cell(a)} | ${cell(b)} | ${a !== null && b !== null ? a - b : "-"} |`);
    }
    const a = scenario === "three-servers-return" ? before.allServersMs : before.steps.firstRead;
    const b = scenario === "three-servers-return" ? after.allServersMs : after.steps.firstRead;
    lines.push("", `Total: ${roundTrips(a)} RT before, ${roundTrips(b)} RT after.`, "");
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const script = await bundle();
  const browser = await chromium.launch({
    ...(browserExecutable ? { executablePath: browserExecutable } : { channel: "chrome" }),
    // Real addresses in the candidates, so the host in the same page reaches the phone's connection.
    args: ["--disable-features=WebRtcHideLocalIpsWithMdns"],
  });
  const results: RunResult[] = [];
  try {
    for (const scenario of SCENARIOS)
      for (let index = 0; index < runs; index += 1)
        for (const mode of MODES) {
          const context = await browser.newContext();
          const page = await context.newPage();
          await page.route(PAGE_URL, (route) =>
            route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Mobile reconnect</title>" }),
          );
          await page.goto(PAGE_URL);
          await page.addScriptTag({ content: script });
          const result = await page.evaluate(
            (options) => {
              const harness = window.mobileReconnect;
              if (!harness) throw new Error("The page has no harness.");
              return harness.run(options);
            },
            { scenario, mode, rt: latencyMs },
          );
          await context.close();
          logger.info(
            `${scenario} ${mode} run ${index + 1}: first read ${result.servers[0]?.firstRead ?? "-"} ms, all ${result.allServersMs} ms${result.errors.length ? `, errors: ${result.errors.join("; ")}` : ""}`,
          );
          results.push(result);
        }
  } finally {
    await browser.close();
  }

  const of = (scenario: Scenario) => {
    const pick = (mode: Mode) =>
      summarize(results.filter((result) => result.scenario === scenario && result.mode === mode));
    return { before: pick("before"), after: pick("after") };
  };
  const summary: Summary = {
    "cold-start": of("cold-start"),
    "return-60s": of("return-60s"),
    "return-15m": of("return-15m"),
    "return-15m-reload": of("return-15m-reload"),
    "three-servers-return": of("three-servers-return"),
  };
  const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  const report = { createdAt: new Date().toISOString(), commit, latencyMs, runs, summary, results };
  writeFileSync(resolve(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const markdown = `# Mobile reconnect, ${latencyMs} ms round trip, median of ${runs} runs\n\n${table(summary)}`;
  writeFileSync(resolve(OUT, "report.md"), markdown);
  logger.info(`Wrote ${resolve(OUT, "report.json")} and report.md.\n${markdown}`);

  const failed = results.filter(
    (result) => result.errors.length > 0 || result.servers.some((steps) => steps.firstRead === null),
  );
  assert.equal(
    failed.length,
    0,
    `${failed.length} runs failed: ${failed.map((result) => result.errors.join("; ")).join(" | ")}`,
  );
  for (const scenario of HINT_SCENARIOS) {
    const { before, after } = summary[scenario];
    const a = scenario === "three-servers-return" ? before.allServersMs : before.steps.firstRead;
    const b = scenario === "three-servers-return" ? after.allServersMs : after.steps.firstRead;
    assert.ok(
      a !== null && b !== null && b < a - latencyMs,
      `${scenario}: after (${b} ms) is not faster than before (${a} ms).`,
    );
  }
}

await main();
