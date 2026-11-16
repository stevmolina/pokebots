// Run with this worktree's dev app: bun scripts/plush-avatar-ready-e2e.ts --port=9333
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { dummyLogger } from "@openbot/logging";
import { connectToDevApp } from "./dev-automation/cdp-client";
import { readDevInstanceRecords } from "./dev-automation/instance-registry";

interface DecodeProbe {
  started: number;
  completed: number;
  reads: number[];
  release: () => void;
}

declare global {
  interface Window {
    plushDecodeProbe: DecodeProbe;
    plushReadyFixture: { show: () => void; update: () => void; ready: boolean };
  }
}

const root = process.cwd();
const port = Number(process.argv.find((arg) => arg.startsWith("--port="))?.slice(7));
const instance = readDevInstanceRecords().find(
  (record) => record.projectRoot === root && record.remoteDebuggingPort === port,
);
assert.ok(instance, "Pass --port=<port> of this worktree's running dev app.");
const output = resolve(".openbot-build/plush-avatar-ready-e2e");
await mkdir(output, { recursive: true });
const fixture = resolve(output, "fixture.tsx");
await writeFile(
  fixture,
  `import { render } from "@solidjs/web";
import { createStore } from "solid-js";
import { AgentAvatar } from ${JSON.stringify(`${root}/packages/ui/src/features/agents/AgentAvatar`)};
const host = document.createElement("main");
document.body.append(host);
const [state, setState] = createStore({ visible: false, changed: false });
const seeds = ["first-bot:avatar:0:7", "first-bot:avatar:0:6"];
render(() => <section aria-label="Paused plush faces" style={{ display: state.visible ? "flex" : "none", gap: "24px", padding: "24px", background: "white", color: "black" }}>
  {seeds.map((seed, index) => <div><p>{index === 0 ? "Saved face A" : "Saved face B"}</p><AgentAvatar seed={seed} color={state.changed ? "#ef77ad" : undefined} mood={state.changed ? "asleep" : "idle"} motion="idle" style={{ width: "96px", height: "96px" }} /></div>)}
</section>, host);
window.plushReadyFixture = {
  ready: true,
  show: () => setState(draft => { draft.visible = true; }),
  update: () => setState(draft => { draft.changed = true; }),
};
`,
);
const session = await connectToDevApp(port, dummyLogger, {
  ownerPid: instance.pid,
  expectedRendererPort: instance.rendererPort,
});
const page = session.page;
const previousUrl = page.url();
page.on("pageerror", (error) => process.stderr.write(`${error.message}\n`));
page.on("console", (message) => {
  if (message.type() === "error") process.stderr.write(`${message.text().slice(0, 500)}\n`);
});
try {
  await page.addInitScript(() => {
    if (location.pathname !== "/plush-avatar-ready-fixture") return;
    const nativeDecode = HTMLImageElement.prototype.decode;
    const nativeRead = CanvasRenderingContext2D.prototype.getImageData;
    let release = () => {};
    const barrier = new Promise<void>((resolveBarrier) => {
      release = resolveBarrier;
    });
    const probe: DecodeProbe = { started: 0, completed: 0, reads: [], release };
    window.plushDecodeProbe = probe;
    HTMLImageElement.prototype.decode = async function () {
      if (!this.src.startsWith("data:")) return nativeDecode.call(this);
      probe.started += 1;
      await nativeDecode.call(this);
      await barrier;
      probe.completed += 1;
    };
    CanvasRenderingContext2D.prototype.getImageData = function (...args) {
      probe.reads.push(args[2] * args[3]);
      return nativeRead.apply(this, args);
    };
  });
  await page.route("**/plush-avatar-ready-fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<link rel="stylesheet" href="/src/styles.css"><script type="module" src="/@fs${fixture}"></script>`,
    }),
  );
  await page.goto(`http://localhost:${instance.rendererPort}/plush-avatar-ready-fixture`);
  await page.waitForFunction(() => window.plushReadyFixture?.ready);
  process.stdout.write("Fixture ready\n");
  // Let real tint encoding finish while the section is closed. The decode barrier is an input,
  // not a timer: it controls when the browser may expose each prepared raster.
  await page.waitForFunction(() => window.plushDecodeProbe.started >= 2);
  process.stdout.write("Decode blocked\n");
  await page.evaluate(() => window.plushReadyFixture.show());
  const beforeReady = await page.locator('[aria-label="Paused plush faces"] image[href^="data:"]').count();
  assert.equal(beforeReady, 0, "An encoded body must not reach the SVG before its decode completes.");
  await page.screenshot({ path: resolve(output, "before-ready.png") });
  await page.evaluate(() => window.plushDecodeProbe.release());
  await page.waitForFunction(
    () => document.querySelectorAll('[aria-label="Paused plush faces"] image[href^="data:"]').length >= 2,
  );
  const bodyColors = () =>
    page.locator('[aria-label="Paused plush faces"] .bloub-avatar-svg').evaluateAll(async (avatars) => {
      const values = [];
      for (const avatar of avatars) {
        const href = avatar.querySelector("image")?.getAttribute("href");
        if (!href) throw new Error("A saved face has no body.");
        const image = new Image();
        image.src = href;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        assertContext(context);
        context.drawImage(image, 0, 0);
        const pixel = context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;
        values.push({ width: canvas.width, height: canvas.height, center: [...pixel] });
      }
      return values;
      function assertContext(value: CanvasRenderingContext2D | null): asserts value is CanvasRenderingContext2D {
        if (!value) throw new Error("A 2D canvas is required.");
      }
    });
  const initial = await bodyColors();
  assert.equal(initial.length, 2);
  for (const image of initial)
    assert.ok((image.center[3] ?? 0) > 240, "The decoded body must be opaque at its center.");
  assert.notDeepEqual(initial[0]?.center, initial[1]?.center, "The saved colors must remain different.");
  await page.locator('[aria-label="Paused plush faces"]').screenshot({ path: resolve(output, "after-ready.png") });
  const bodyRefs = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[aria-label="Paused plush faces"] .bloub-avatar-svg image')].map(
        (image) => image.getAttribute("href") ?? "",
      ),
    );
  const initialRefs = await bodyRefs();
  await page.evaluate(() => window.plushReadyFixture.update());
  await page.waitForFunction((previous) => {
    const refs = [...document.querySelectorAll('[aria-label="Paused plush faces"] .bloub-avatar-svg image')].map(
      (image) => image.getAttribute("href") ?? "",
    );
    return refs.length === 2 && refs.every((ref, index) => ref.startsWith("data:") && ref !== previous[index]);
  }, initialRefs);
  const updated = await bodyColors();
  assert.notDeepEqual(updated, initial, "A paused avatar must show its new color.");
  assert.ok(
    updated.every((image) => (image.center[0] ?? 0) > 200),
    "Both paused bodies must use the new pink color.",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(
    () => document.querySelectorAll('[aria-label="Paused plush faces"] image[href^="data:"]').length >= 2,
  );
  const reduced = await bodyColors();
  assert.deepEqual(reduced, updated, "Reduced motion must preserve the saved body and its new color.");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const probe = await page.evaluate(() => ({
    started: window.plushDecodeProbe.started,
    completed: window.plushDecodeProbe.completed,
    largestReadPixels: Math.max(...window.plushDecodeProbe.reads),
  }));
  assert.ok(probe.largestReadPixels <= 256 * 256, "Tint readback must stay bounded.");
  const report = { initial, updated, reduced, ...probe, beforeReady, hiddenLoad: true, pausedUpdate: true };
  await writeFile(resolve(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report)}\n`);
} finally {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.unroute("**/plush-avatar-ready-fixture");
  await page.goto(previousUrl);
  await session.close();
}
