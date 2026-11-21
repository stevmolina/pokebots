// Check that a base-layer pseudo-element keeps its margin after the reset is scoped.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createOpenBotLogger } from "@pokebots/logging";
import { webkit } from "playwright-core";
import { scopePseudoElementReset } from "./web-stylesheet";

const css =
  '@layer theme, base, components, utilities; @layer base { .sample::before { content: "x"; margin: 11px; } }';
const transformed = scopePseudoElementReset(css);
assert.ok(transformed, "The pseudo-element reset must be added.");
const browser = await webkit.launch();
try {
  const page = await browser.newPage();
  await page.setContent(`<style>${transformed}</style><div class="sample"></div>`);
  const margin = await page.locator(".sample").evaluate((element) => getComputedStyle(element, "::before").marginTop);
  assert.equal(margin, "11px");
  const output = resolve(import.meta.dirname, "../.openbot-build/web-css-reset/report.json");
  mkdirSync(resolve(output, ".."), { recursive: true });
  writeFileSync(output, `${JSON.stringify({ margin }, null, 2)}\n`);
  createOpenBotLogger("web-css-reset-e2e").info(`Report: ${output}`);
} finally {
  await browser.close();
}
