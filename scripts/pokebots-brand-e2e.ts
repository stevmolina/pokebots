// Checks that the source says "Pokebots" where a person reads it, and that the custom build still takes its
// account service defaults:
// - no catalog value or What's New note keeps the product word "OpenBot", except the kept phrases of
//   `scripts/pokebots-brand-text.ts`; every `openbot.run` and `openbot://` address stays;
// - the visible literals that the build-time rewrite once changed now say Pokebots in the source;
// - the HTML pages, the web app manifest and the web icons say Pokebots;
// - `scripts/service-defaults.ts` gives no plugin without a setting, applies the account service and
//   Signal defaults to the main process, and never replaces a setting made at start.
// `bun scripts/pokebots-brand-e2e.ts`. Writes .openbot-build/pokebots-brand-e2e/report.json.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { parse } from "yaml";
import type { MessageCatalog } from "../packages/i18n/src/message";
import { KEPT_PHRASES } from "./pokebots-brand-text";
import { readServiceDefaults, serviceDefaultsPlugins, withServiceDefaults } from "./service-defaults";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, ".openbot-build/pokebots-brand-e2e");
const I18N_SOURCE = join(ROOT, "packages/i18n/src");
const RELEASE_NOTES_FILES = /^src\/renderer\/src\/features\/updates\/(whats-new-releases|whats-new\/[a-z]{2})\.json$/;
const WEB_ICON_FILES = [
  "favicon.ico",
  "favicon-32x32.png",
  "apple-touch-icon.png",
  "icon-192x192.png",
  "icon-512x512.png",
  "icon-maskable-192x192.png",
  "icon-maskable-512x512.png",
] as const;
const BRAND_ENV = {
  OPENBOT_BRAND_AUTH_API_URL: "https://api.pokebots.xyz",
  OPENBOT_BRAND_SIGNAL_URL: "wss://signal.pokebots.xyz/v1/signal",
};
/** Modules that only join the area modules and hold no keys. */
const JOIN_MODULES = new Set(["index.ts", "mobile.ts", "source.ts", "shared.ts"]);
const KEPT = ["Shared with OpenBot", "OpenBot GitHub App", "OpenBot Mobile", "OpenBot Shared", "/invite @OpenBot"];

const failures: string[] = [];
const check = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return walk(path);
      return Promise.resolve(entry.name.endsWith(".ts") ? [path] : []);
    }),
  );
  return files.flat();
}

function messageValues(messages: MessageCatalog): Map<string, string> {
  const values = new Map<string, string>();
  for (const [key, message] of Object.entries(messages)) {
    if (typeof message === "string") values.set(key, message);
    else if (message && typeof message === "object") {
      for (const [form, text] of Object.entries(message))
        if (typeof text === "string") values.set(`${key}#${form}`, text);
    }
  }
  return values;
}

function count(text: string, word: string): number {
  return text.split(word).length - 1;
}

// 1. Off: no plugin without a setting. The old name setting does nothing.
const off = {
  pluginsWithoutSetting: serviceDefaultsPlugins(ROOT, {}).length,
  pluginsWithOldNameSetting: serviceDefaultsPlugins(ROOT, { OPENBOT_BRAND_NAME: "Pokebots" }).length,
};
check(off.pluginsWithoutSetting === 0, "The service defaults give a plugin without a setting.");
check(off.pluginsWithOldNameSetting === 0, "OPENBOT_BRAND_NAME alone gives a plugin.");

// 2. The catalogs: every module loads, and no value keeps the product word outside the kept phrases.
const catalogFiles = await walk(join(I18N_SOURCE, "messages"));
let comparedModules = 0;
let keys = 0;
let valuesWithAddress = 0;
const leftovers: string[] = [];
const keptPhrases: Record<string, number> = {};
for (const file of catalogFiles) {
  const name = file.split("/").pop() ?? "";
  if (JOIN_MODULES.has(name)) continue;
  const path = relative(I18N_SOURCE, file);
  const module: { messages?: MessageCatalog } = await import(pathToFileURL(file).href);
  if (!module.messages) {
    failures.push(`${path} has no messages export.`);
    continue;
  }
  comparedModules += 1;
  keys += Object.keys(module.messages).length;
  for (const [key, text] of messageValues(module.messages)) {
    if (text.includes("openbot.run") || text.includes("openbot://")) valuesWithAddress += 1;
    let rest = text;
    for (const phrase of KEPT) {
      const found = count(rest, phrase);
      if (found > 0) keptPhrases[phrase] = (keptPhrases[phrase] ?? 0) + found;
      rest = rest.replaceAll(phrase, "");
    }
    if (rest.replace(KEPT_PHRASES, "") !== rest) leftovers.push(`${path} ${key}: ${text}`);
  }
}
check(leftovers.length === 0, `${leftovers.length} catalog values still show "OpenBot" outside the kept phrases.`);
check(comparedModules > 800, `Only ${comparedModules} catalog modules were compared.`);
check(valuesWithAddress > 0, "No catalog value keeps an openbot.run or openbot:// address.");

// 3. Literals outside the catalogs: the source says Pokebots.
const literals: { file: string; expected: string; found: boolean }[] = [];
for (const [file, expected] of [
  ["packages/contracts/src/feedback.ts", 'FEEDBACK_REPOSITORY = "stevmolina/pokebots"'],
  ["apps/auth-api/src/lib/site-metadata.ts", 'OPENBOT_SITE_URL = "https://pokebots.xyz/"'],
  ["packages/brand/src/pokebots-avatar.ts", "POKEBOTS_LANDING_ARTWORK = true"],
  ["packages/ui/src/features/account/AccountLogin.tsx", 'PRODUCT_NAME = "Pokebots"'],
  ["packages/ui/src/features/account/LanguageWheel.tsx", 'PRODUCT_NAME = "Pokebots"'],
  ["packages/contracts/src/agent-providers.ts", '"Included with Pokebots"'],
  ["packages/ui/src/features/settings/stores/updates-store.ts", "`Pokebots v${"],
  ["src/renderer/src/features/servers/server-settings.tsx", 'FALLBACK_SERVER_NAME = "Pokebots"'],
  ["packages/ui/src/user-avatar.tsx", '|| "Pokebots"'],
  ["packages/contracts/src/ipc-mcp-servers.ts", "`Pokebots already uses the name "],
  ["src/main/ipc/provider-handlers.ts", "Pokebots does not manage this provider's CLI."],
  [
    "src/renderer/src/features/provider-updates/provider-runtime-store.ts",
    "Pokebots does not manage this provider's CLI.",
  ],
  ["packages/contracts/src/invite-links.ts", "The Pokebots invitation link is invalid."],
  ["packages/contracts/src/marketplace-links.ts", "The Pokebots Marketplace link is invalid."],
  ["packages/contracts/src/plugin-links.ts", "The Pokebots plugin link is invalid."],
  ["packages/contracts/src/agent-template-links.ts", "The Pokebots agent link is invalid."],
] as const) {
  const found = (await readFile(join(ROOT, file), "utf8")).includes(expected);
  literals.push({ file, expected, found });
  check(found, `${file}: ${expected} is not in the file.`);
}

// 4. What's New notes: no product word outside the kept phrases, and valid JSON.
const UPDATES = "src/renderer/src/features/updates";
const noteFiles = [
  ...(await readdir(join(ROOT, UPDATES))).map((name) => `${UPDATES}/${name}`),
  ...(await readdir(join(ROOT, UPDATES, "whats-new"))).map((name) => `${UPDATES}/whats-new/${name}`),
].filter((path) => RELEASE_NOTES_FILES.test(path));
check(noteFiles.length > 1, "No What's New files were found.");
const releaseNotes: Record<string, number> = {};
for (const file of noteFiles) {
  const text = await readFile(join(ROOT, file), "utf8");
  check(Array.isArray(JSON.parse(text)), `${file}: the file is not JSON.`);
  let rest = text;
  for (const phrase of KEPT) rest = rest.replaceAll(phrase, "");
  releaseNotes[file] = count(rest, "OpenBot");
  check(releaseNotes[file] === 0, `${file}: "OpenBot" is left outside the kept phrases.`);
}

// 5. The account service defaults of the main process.
const mainIndex = await readFile(join(ROOT, "src/main/index.ts"), "utf8");
const defaults = readServiceDefaults(BRAND_ENV);
if (!defaults) throw new Error("The service defaults did not read.");
const mainWithDefaults = withServiceDefaults("src/main/index.ts", mainIndex, defaults) ?? "";
const accountDefaults = {
  authApiUrl: mainWithDefaults.startsWith('process.env.OPENBOT_AUTH_API_URL ??= "https://api.pokebots.xyz";\n'),
  signalUrl: mainWithDefaults.includes(
    'process.env.OPENBOT_REMOTE_SIGNAL_URL ??= "wss://signal.pokebots.xyz/v1/signal";\n',
  ),
  setNameKept: mainWithDefaults.includes('app.setName("OpenBot");'),
};
check(accountDefaults.authApiUrl, "The main process does not default to the custom account service.");
check(accountDefaults.signalUrl, "The main process does not default to the custom Signal.");
check(accountDefaults.setNameKept, 'app.setName("OpenBot") changed. The data folder and the keychain item need it.');
check(withServiceDefaults("src/main/other.ts", "x", defaults) === null, "Another module got account defaults.");
check(readServiceDefaults({}) === null, "The service defaults read with no setting.");

const serviceOverrideEnv = {
  OPENBOT_AUTH_API_URL: "https://account.example.test",
  OPENBOT_REMOTE_SIGNAL_URL: "wss://signal.example.test/v1/signal",
};
const serviceDefaultsCode = mainWithDefaults.slice(0, mainWithDefaults.indexOf(mainIndex));
const runtimeProcess = { env: { ...serviceOverrideEnv } };
runInNewContext(serviceDefaultsCode, { process: runtimeProcess });
const customBuildProcess = { env: { OPENBOT_AUTH_API_URL: undefined, OPENBOT_REMOTE_SIGNAL_URL: undefined } };
runInNewContext(serviceDefaultsCode, { process: customBuildProcess });
check(
  customBuildProcess.env.OPENBOT_AUTH_API_URL === BRAND_ENV.OPENBOT_BRAND_AUTH_API_URL &&
    customBuildProcess.env.OPENBOT_REMOTE_SIGNAL_URL === BRAND_ENV.OPENBOT_BRAND_SIGNAL_URL,
  "The custom build defaults do not take effect with no runtime settings.",
);
check(
  runtimeProcess.env.OPENBOT_AUTH_API_URL === serviceOverrideEnv.OPENBOT_AUTH_API_URL &&
    runtimeProcess.env.OPENBOT_REMOTE_SIGNAL_URL === serviceOverrideEnv.OPENBOT_REMOTE_SIGNAL_URL,
  "A build default replaced an explicit runtime service setting.",
);
const desktop = parse(await readFile(join(ROOT, "electron-builder.yml"), "utf8"));
const custom = parse(await readFile(join(ROOT, "electron-builder.custom.yml"), "utf8"));
const runtime = await Bun.file(join(ROOT, "package.json")).json();
const desktopIdentity = {
  runtime: runtime.productName,
  desktopId: desktop.appId,
  desktopProduct: desktop.productName,
  desktopDisplay: desktop.mac.extendInfo.CFBundleDisplayName,
  customId: custom.appId,
  customProduct: custom.productName,
  customDisplay: custom.mac.extendInfo.CFBundleDisplayName,
  customPublish: custom.publish,
};
check(
  desktopIdentity.runtime === "OpenBot" &&
    desktopIdentity.desktopId === "app.openbot.desktop" &&
    desktopIdentity.desktopProduct === "OpenBot" &&
    desktopIdentity.desktopDisplay === "Pokebots" &&
    desktopIdentity.customId === "app.openbot.custom" &&
    desktopIdentity.customProduct === "Pokebots" &&
    desktopIdentity.customDisplay === "Pokebots" &&
    desktopIdentity.customPublish === null,
  "The desktop packaging display or identity metadata changed.",
);

// 6. The desktop HTML pages.
const html: Record<string, number> = {};
for (const name of (await readdir(join(ROOT, "src/renderer"))).filter((file) => file.endsWith(".html"))) {
  const page = await readFile(join(ROOT, "src/renderer", name), "utf8");
  html[name] = count(page, ">OpenBot");
  check(html[name] === 0, `src/renderer/${name} still shows OpenBot.`);
}

// 7. The installable web app: the manifest and the icons are the Pokebots ones in the source.
const manifest = await readFile(join(ROOT, "apps/auth-api/public/site.webmanifest"), "utf8");
const manifestHas = (field: string, value: string) =>
  manifest.includes(`${JSON.stringify(field)}: ${JSON.stringify(value)}`);
check(
  manifestHas("name", "Pokebots") && manifestHas("short_name", "Pokebots"),
  "The web app manifest keeps the OpenBot name.",
);
check(manifestHas("start_url", "/app"), "The web app manifest lost its start URL.");
const webIcons: Record<string, boolean> = {};
for (const file of WEB_ICON_FILES) {
  const [built, brand] = await Promise.all([
    readFile(join(ROOT, "apps/auth-api/public", file)),
    readFile(join(ROOT, "build/custom/web", file)),
  ]);
  webIcons[file] = built.equals(brand);
  check(webIcons[file], `The web app ${file} is not the Pokebots icon.`);
}
const web = { manifest: JSON.parse(manifest), icons: webIcons };

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const feedback: typeof import("../packages/contracts/src/feedback") = await import(
  pathToFileURL(join(ROOT, "packages/contracts/src/feedback.ts")).href
);
const formPath = new URL(feedback.featureRequestFormUrl({ title: "Synthetic brand check" })).pathname;
check(formPath === "/stevmolina/pokebots/issues/new", "The feedback form does not open the Pokebots repository.");
const card = (itemType: string) =>
  feedback.feedbackSentIssue({
    id: "synthetic",
    text: "",
    createdAt: "",
    author: "system",
    source: "system",
    status: "completed",
    itemType,
  });
const legacyIssue = card("feedback-sent:42");
const sentIssue = card(feedback.feedbackSentItemType(42));
const withdrawnIssue = card(feedback.feedbackWithdrawnItemType(42));
check(legacyIssue?.repository === "nightly-labs/openbot", "An existing feedback card changed repositories.");
check(sentIssue?.url === "https://github.com/stevmolina/pokebots/issues/42", "A new card links to the wrong issue.");
check(
  withdrawnIssue?.repository === sentIssue?.repository && withdrawnIssue?.withdrawn === true,
  "A withdrawn card lost its state.",
);

const report = {
  passed: failures.length === 0,
  failures,
  off,
  defaults,
  catalogs: {
    files: catalogFiles.length,
    comparedModules,
    keys,
    valuesWithAddress,
    keptPhrases,
    leftovers: leftovers.slice(0, 50),
  },
  literals,
  releaseNotes,
  feedback: { formPath, legacyIssue, sentIssue, withdrawnIssue },
  accountDefaults,
  desktopIdentity,
  html,
  web,
};
await writeFile(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
const summary = { passed: report.passed, failures, catalogs: { ...report.catalogs, leftovers: undefined } };
process.stdout.write(`${JSON.stringify(summary, null, 2)}\nReport: ${relative(ROOT, join(OUT, "report.json"))}\n`);
if (!report.passed) process.exit(1);
