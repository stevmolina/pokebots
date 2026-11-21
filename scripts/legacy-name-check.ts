/**
 * Scans active first-party source files (or a built-output directory passed via
 * `--built-dir=<path>`) for legacy OpenBot brand tokens and verifies every hit
 * matches an explicit entry in `tools/pokebots/legacy-name-allowlist.json`.
 *
 * Usage:
 *   bun scripts/legacy-name-check.ts
 *   bun scripts/legacy-name-check.ts --built-dir=out
 *   bun scripts/legacy-name-check.ts --self-test
 *   bun scripts/legacy-name-check.ts --allowlist=path/to/allowlist.json --report=path/to/report.json
 */
import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const DEFAULT_ALLOWLIST_PATH = join(REPO_ROOT, "tools/pokebots/legacy-name-allowlist.json");
const DEFAULT_REPORT_PATH = join(REPO_ROOT, ".openbot-build/legacy-name-check/report.json");
const MAX_REPORTED_UNALLOWLISTED_HITS = 500;
const MAX_CONSOLE_HITS = 40;
const BINARY_CHECK_BYTES = 8192;

const BINARY_EXTENSIONS = new Set([
  ".a",
  ".avif",
  ".car",
  ".db",
  ".dll",
  ".dmg",
  ".dylib",
  ".eot",
  ".exe",
  ".gif",
  ".gz",
  ".icns",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mp3",
  ".mp4",
  ".nib",
  ".node",
  ".o",
  ".otf",
  ".pdf",
  ".png",
  ".so",
  ".sqlite",
  ".tar",
  ".ttf",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]);

interface AllowlistEntry {
  id: string;
  category: string;
  paths: string[];
  tokens: string[];
  reason: string;
  removalCondition: string;
}

interface BuiltOutputConfig {
  allowedPhrases: string[];
  entries: AllowlistEntry[];
}

interface AllowlistDocument {
  version: number;
  tokens: string[];
  excludedDirectories: string[];
  entries: AllowlistEntry[];
  builtOutput: BuiltOutputConfig;
}

interface CompiledAllowlistEntry {
  entry: AllowlistEntry;
  matchers: RegExp[];
  tokenSet: Set<string>;
}

interface LegacyHit {
  file: string;
  line: number;
  column: number;
  token: string;
  snippet: string;
}

interface EntrySummary {
  category: string;
  fileCount: number;
  hitCount: number;
  tokens: string[];
}

interface ScanReport {
  mode: "source" | "built-dir" | "self-test";
  passed: boolean;
  allowlistPath: string;
  scannedRoot: string;
  scannedFileCount: number;
  skippedBinaryFileCount: number;
  totalHitCount: number;
  allowlistedHitCount: number;
  unallowlistedHitCount: number;
  hitsByToken: Record<string, number>;
  hitsByEntry: Record<string, EntrySummary>;
  unallowlistedHits: LegacyHit[];
  truncatedUnallowlistedHits: boolean;
}

interface SelfTestCaseResult {
  name: string;
  passed: boolean;
  detail: string;
}

interface SelfTestReport {
  mode: "self-test";
  passed: boolean;
  allowlistPath: string;
  cases: SelfTestCaseResult[];
}

interface ParsedArgs {
  allowlistPath: string;
  reportPath: string;
  builtDir: string | null;
  selfTest: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  let allowlistPath = DEFAULT_ALLOWLIST_PATH;
  let reportPath = DEFAULT_REPORT_PATH;
  let builtDir: string | null = null;
  let selfTest = false;

  for (const arg of argv) {
    if (arg === "--self-test") {
      selfTest = true;
    } else if (arg.startsWith("--built-dir=")) {
      const value = arg.slice("--built-dir=".length).trim();
      if (!value) throw new Error("--built-dir requires a non-empty directory path.");
      builtDir = resolve(REPO_ROOT, value);
    } else if (arg.startsWith("--allowlist=")) {
      const value = arg.slice("--allowlist=".length).trim();
      if (!value) throw new Error("--allowlist requires a non-empty file path.");
      allowlistPath = resolve(REPO_ROOT, value);
    } else if (arg.startsWith("--report=")) {
      const value = arg.slice("--report=".length).trim();
      if (!value) throw new Error("--report requires a non-empty file path.");
      reportPath = resolve(REPO_ROOT, value);
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        `${[
          "Usage: bun scripts/legacy-name-check.ts [options]",
          "  --built-dir=<path>   Scan a built-output directory instead of source files",
          "  --self-test          Run synthetic unallowlisted fixture checks",
          "  --allowlist=<path>   Override allowlist JSON path",
          "  --report=<path>      Override JSON report output path",
        ].join("\n")}\n`,
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { allowlistPath, reportPath, builtDir, selfTest };
}

function readRequiredString(entries: Map<string, unknown>, key: string, context: string): string {
  const value = entries.get(key);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Allowlist field ${context}.${key} must be a non-empty string.`);
  }
  return value;
}

function readStringArray(entries: Map<string, unknown>, key: string, context: string, allowEmpty = false): string[] {
  const value = entries.get(key);
  if (!Array.isArray(value)) {
    throw new Error(`Allowlist field ${context}.${key} must be an array of strings.`);
  }
  const items: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error(`Allowlist field ${context}.${key}[${index}] must be a non-empty string.`);
    }
    items.push(item);
  }
  if (!allowEmpty && items.length === 0) {
    throw new Error(`Allowlist field ${context}.${key} must not be empty.`);
  }
  return items;
}

function toEntriesMap(value: unknown, context: string): Map<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Allowlist ${context} must be a JSON object.`);
  }
  return new Map(Object.entries(value));
}

function parseAllowlistEntries(rawEntries: unknown, knownTokens: Set<string>, context: string): AllowlistEntry[] {
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
    throw new Error(`Allowlist field ${context} must be a non-empty array.`);
  }

  const seenIds = new Set<string>();
  const parsed: AllowlistEntry[] = [];
  for (let index = 0; index < rawEntries.length; index += 1) {
    const itemContext = `${context}[${index}]`;
    const map = toEntriesMap(rawEntries[index], itemContext);
    const id = readRequiredString(map, "id", itemContext);
    if (seenIds.has(id)) {
      throw new Error(`Duplicate allowlist entry id: ${id}`);
    }
    seenIds.add(id);

    const category = readRequiredString(map, "category", itemContext);
    const paths = readStringArray(map, "paths", itemContext);
    const tokens = readStringArray(map, "tokens", itemContext);
    for (const token of tokens) {
      if (!knownTokens.has(token)) {
        throw new Error(`Allowlist entry ${id} references unknown token: ${token}`);
      }
    }
    const reason = readRequiredString(map, "reason", itemContext);
    const removalCondition = readRequiredString(map, "removalCondition", itemContext);

    parsed.push({ id, category, paths, tokens, reason, removalCondition });
  }
  return parsed;
}

async function loadAllowlist(allowlistPath: string): Promise<AllowlistDocument> {
  const rawText = await readFile(allowlistPath, "utf8");
  const rootMap = toEntriesMap(JSON.parse(rawText), "root");
  const versionValue = rootMap.get("version");
  if (typeof versionValue !== "number" || versionValue !== 1) {
    throw new Error("Allowlist root.version must be 1.");
  }

  const tokens = readStringArray(rootMap, "tokens", "root");
  const knownTokens = new Set(tokens);
  const excludedDirectories = readStringArray(rootMap, "excludedDirectories", "root");
  const entries = parseAllowlistEntries(rootMap.get("entries"), knownTokens, "root.entries");

  const builtOutputMap = toEntriesMap(rootMap.get("builtOutput"), "root.builtOutput");
  const allowedPhrases = readStringArray(builtOutputMap, "allowedPhrases", "root.builtOutput", true);
  const builtEntries = parseAllowlistEntries(builtOutputMap.get("entries"), knownTokens, "root.builtOutput.entries");

  return {
    version: versionValue,
    tokens,
    excludedDirectories,
    entries,
    builtOutput: {
      allowedPhrases,
      entries: builtEntries,
    },
  };
}

function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileGlob(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, "/");
  let regex = "^";
  let index = 0;

  while (index < normalized.length) {
    if (normalized.slice(index, index + 3) === "**/") {
      regex += "(?:.*/)?";
      index += 3;
      continue;
    }
    if (normalized.slice(index) === "/**") {
      regex += "(?:/.*)?";
      index += 3;
      continue;
    }
    if (normalized.slice(index, index + 2) === "**") {
      regex += ".*";
      index += 2;
      continue;
    }
    const ch = normalized[index];
    if (ch === "*") {
      regex += "[^/]*";
    } else if (ch === "?") {
      regex += "[^/]";
    } else if (ch !== undefined) {
      regex += escapeRegex(ch);
    }
    index += 1;
  }

  regex += "$";
  return new RegExp(regex);
}

function compileEntries(entries: AllowlistEntry[]): CompiledAllowlistEntry[] {
  return entries.map((entry) => ({
    entry,
    matchers: entry.paths.map(compileGlob),
    tokenSet: new Set(entry.tokens),
  }));
}

function compileTokenRegex(tokens: string[]): RegExp {
  const sorted = [...tokens].sort((left, right) => right.length - left.length);
  return new RegExp(sorted.map(escapeRegex).join("|"), "g");
}

function compilePhraseRegex(phrases: string[]): RegExp | null {
  if (phrases.length === 0) return null;
  const sorted = [...phrases].sort((left, right) => right.length - left.length);
  return new RegExp(sorted.map(escapeRegex).join("|"), "g");
}

function normalizePosixPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function isExcludedPath(relativePath: string, excludedSet: Set<string>): boolean {
  const segments = relativePath.split("/");
  for (const segment of segments) {
    if (excludedSet.has(segment)) return true;
  }
  return false;
}

function isBinaryBuffer(buffer: Buffer): boolean {
  const limit = Math.min(buffer.length, BINARY_CHECK_BYTES);
  for (let index = 0; index < limit; index += 1) {
    if (buffer[index] === 0) return true;
  }
  return false;
}

async function walkDirectory(directory: string, rootDir: string, excludedSet: Set<string>): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    const relPath = normalizePosixPath(relative(rootDir, fullPath));
    if (entry.isDirectory()) {
      if (excludedSet.has(entry.name)) continue;
      const nested = await walkDirectory(fullPath, rootDir, excludedSet);
      for (const item of nested) results.push(item);
    } else if (entry.isFile()) {
      results.push(relPath);
    }
  }
  return results;
}

async function listSourceFiles(rootDir: string, excludedSet: Set<string>): Promise<string[]> {
  try {
    const raw = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
      cwd: rootDir,
      maxBuffer: 64 * 1024 * 1024,
    });
    const files = raw
      .toString("utf8")
      .split("\0")
      .filter((item) => item.length > 0)
      .map(normalizePosixPath)
      .filter((item) => !isExcludedPath(item, excludedSet));
    return [...new Set(files)].sort();
  } catch {
    const walked = await walkDirectory(rootDir, rootDir, excludedSet);
    return walked.sort();
  }
}

function findMatchingEntry(
  relativePath: string,
  token: string,
  compiledEntries: CompiledAllowlistEntry[],
): CompiledAllowlistEntry | null {
  for (const compiled of compiledEntries) {
    if (!compiled.tokenSet.has(token)) continue;
    for (const matcher of compiled.matchers) {
      if (matcher.test(relativePath)) return compiled;
    }
  }
  return null;
}

function maskAllowedPhrases(text: string, phraseRegex: RegExp | null): string {
  if (!phraseRegex) return text;
  return text.replace(phraseRegex, (match) => " ".repeat(match.length));
}

function scanTextEntries(
  files: Array<{ relativePath: string; text: string }>,
  tokens: string[],
  compiledEntries: CompiledAllowlistEntry[],
  phraseRegex: RegExp | null,
  options: {
    mode: "source" | "built-dir" | "self-test";
    allowlistPath: string;
    scannedRoot: string;
    skippedBinaryFileCount: number;
  },
): ScanReport {
  const tokenRegex = compileTokenRegex(tokens);
  const hitsByToken: Record<string, number> = {};
  for (const token of tokens) {
    hitsByToken[token] = 0;
  }

  const entryStats = new Map<string, { category: string; files: Set<string>; hitCount: number; tokens: Set<string> }>();
  const unallowlistedHits: LegacyHit[] = [];
  let totalHitCount = 0;
  let allowlistedHitCount = 0;
  let unallowlistedHitCount = 0;

  for (const file of files) {
    const effectiveText = maskAllowedPhrases(file.text, phraseRegex);
    tokenRegex.lastIndex = 0;
    if (!tokenRegex.test(effectiveText)) continue;

    const lines = effectiveText.split("\n");
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const lineText = lines[lineIndex] ?? "";
      tokenRegex.lastIndex = 0;
      let match = tokenRegex.exec(lineText);
      while (match !== null) {
        const token = match[0];
        totalHitCount += 1;
        hitsByToken[token] = (hitsByToken[token] ?? 0) + 1;

        const matched = findMatchingEntry(file.relativePath, token, compiledEntries);
        if (matched) {
          allowlistedHitCount += 1;
          let stat = entryStats.get(matched.entry.id);
          if (!stat) {
            stat = {
              category: matched.entry.category,
              files: new Set<string>(),
              hitCount: 0,
              tokens: new Set<string>(),
            };
            entryStats.set(matched.entry.id, stat);
          }
          stat.files.add(file.relativePath);
          stat.hitCount += 1;
          stat.tokens.add(token);
        } else {
          unallowlistedHitCount += 1;
          if (unallowlistedHits.length < MAX_REPORTED_UNALLOWLISTED_HITS) {
            unallowlistedHits.push({
              file: file.relativePath,
              line: lineIndex + 1,
              column: match.index + 1,
              token,
              snippet: lineText.trim().slice(0, 160),
            });
          }
        }
        match = tokenRegex.exec(lineText);
      }
    }
  }

  const hitsByEntry: Record<string, EntrySummary> = {};
  for (const [id, stat] of [...entryStats.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    hitsByEntry[id] = {
      category: stat.category,
      fileCount: stat.files.size,
      hitCount: stat.hitCount,
      tokens: [...stat.tokens].sort(),
    };
  }

  return {
    mode: options.mode,
    passed: unallowlistedHitCount === 0,
    allowlistPath: normalizePosixPath(relative(REPO_ROOT, options.allowlistPath)),
    scannedRoot: normalizePosixPath(relative(REPO_ROOT, options.scannedRoot)) || ".",
    scannedFileCount: files.length,
    skippedBinaryFileCount: options.skippedBinaryFileCount,
    totalHitCount,
    allowlistedHitCount,
    unallowlistedHitCount,
    hitsByToken,
    hitsByEntry,
    unallowlistedHits,
    truncatedUnallowlistedHits: unallowlistedHitCount > unallowlistedHits.length,
  };
}

async function readScannableFiles(
  rootDir: string,
  relativePaths: string[],
): Promise<{ files: Array<{ relativePath: string; text: string }>; skippedBinaryFileCount: number }> {
  const files: Array<{ relativePath: string; text: string }> = [];
  let skippedBinaryFileCount = 0;

  for (const relativePath of relativePaths) {
    const ext = extname(relativePath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      skippedBinaryFileCount += 1;
      continue;
    }

    let buffer: Buffer;
    try {
      buffer = await readFile(join(rootDir, relativePath));
    } catch {
      continue;
    }

    if (isBinaryBuffer(buffer)) {
      skippedBinaryFileCount += 1;
      continue;
    }

    files.push({
      relativePath,
      text: buffer.toString("utf8"),
    });
  }

  return { files, skippedBinaryFileCount };
}

function runSelfTest(allowlist: AllowlistDocument, allowlistPath: string): SelfTestReport {
  const compiledSource = compileEntries(allowlist.entries);
  const compiledBuilt = compileEntries(allowlist.builtOutput.entries);
  const builtPhraseRegex = compilePhraseRegex(allowlist.builtOutput.allowedPhrases);
  const cases: SelfTestCaseResult[] = [];

  const sourceLeakReport = scanTextEntries(
    [
      {
        relativePath: "tools/pokebots/__self_test_unallowlisted__.ts",
        text: 'export const APP_TITLE = "OpenBot";\nexport const REPO = "nightly-labs/openbot";\n',
      },
    ],
    allowlist.tokens,
    compiledSource,
    null,
    {
      mode: "self-test",
      allowlistPath,
      scannedRoot: REPO_ROOT,
      skippedBinaryFileCount: 0,
    },
  );
  cases.push({
    name: "source-unallowlisted-file-fails",
    passed: !sourceLeakReport.passed && sourceLeakReport.unallowlistedHitCount === 2,
    detail: `detected ${sourceLeakReport.unallowlistedHitCount} unallowlisted hits in synthetic source file`,
  });

  const rendererRepoLeakReport = scanTextEntries(
    [
      {
        relativePath: "src/renderer/src/__self_test_repo_leak__.ts",
        text: 'export const FEEDBACK = "nightly-labs/openbot";\n',
      },
    ],
    allowlist.tokens,
    compiledSource,
    null,
    {
      mode: "self-test",
      allowlistPath,
      scannedRoot: REPO_ROOT,
      skippedBinaryFileCount: 0,
    },
  );
  cases.push({
    name: "renderer-disallowed-token-fails",
    passed: !rendererRepoLeakReport.passed && rendererRepoLeakReport.unallowlistedHitCount === 1,
    detail: `detected ${rendererRepoLeakReport.unallowlistedHitCount} disallowed nightly-labs/openbot hit in src/renderer/src`,
  });

  const builtLeakReport = scanTextEntries(
    [
      {
        relativePath: "renderer/assets/index.js",
        text: [
          'const okStorage = "openbot:theme";',
          'const okPhrase = "Shared with OpenBot";',
          'const leakedBrand = "Welcome to OpenBot";',
          'const leakedRepo = "nightly-labs/openbot";',
        ].join("\n"),
      },
    ],
    allowlist.tokens,
    compiledBuilt,
    builtPhraseRegex,
    {
      mode: "self-test",
      allowlistPath,
      scannedRoot: REPO_ROOT,
      skippedBinaryFileCount: 0,
    },
  );
  cases.push({
    name: "built-dir-catches-visible-leaks-and-allows-kept-phrases",
    passed:
      !builtLeakReport.passed &&
      builtLeakReport.allowlistedHitCount === 1 &&
      builtLeakReport.unallowlistedHitCount === 2,
    detail: `allowlisted=${builtLeakReport.allowlistedHitCount}, unallowlisted=${builtLeakReport.unallowlistedHitCount}`,
  });

  return {
    mode: "self-test",
    passed: cases.every((item) => item.passed),
    allowlistPath: normalizePosixPath(relative(REPO_ROOT, allowlistPath)),
    cases,
  };
}

async function writeJsonReport(reportPath: string, payload: ScanReport | SelfTestReport): Promise<void> {
  await mkdir(resolve(reportPath, ".."), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

const args = parseArgs(process.argv.slice(2));
const allowlist = await loadAllowlist(args.allowlistPath);

if (args.selfTest) {
  const selfTestReport = runSelfTest(allowlist, args.allowlistPath);
  await writeJsonReport(args.reportPath, selfTestReport);
  for (const item of selfTestReport.cases) {
    process.stdout.write(`[${item.passed ? "PASS" : "FAIL"}] ${item.name}: ${item.detail}\n`);
  }
  process.stdout.write(`Report written to ${normalizePosixPath(relative(REPO_ROOT, args.reportPath))}\n`);
  process.exit(selfTestReport.passed ? 0 : 1);
}

const excludedSet = new Set(allowlist.excludedDirectories);
const isBuiltDir = args.builtDir !== null;
const scannedRoot = args.builtDir ?? REPO_ROOT;
const candidatePaths = isBuiltDir
  ? (await walkDirectory(scannedRoot, scannedRoot, new Set<string>())).sort()
  : await listSourceFiles(scannedRoot, excludedSet);

const { files, skippedBinaryFileCount } = await readScannableFiles(scannedRoot, candidatePaths);
const compiledEntries = compileEntries(isBuiltDir ? allowlist.builtOutput.entries : allowlist.entries);
const phraseRegex = isBuiltDir ? compilePhraseRegex(allowlist.builtOutput.allowedPhrases) : null;

const report = scanTextEntries(files, allowlist.tokens, compiledEntries, phraseRegex, {
  mode: isBuiltDir ? "built-dir" : "source",
  allowlistPath: args.allowlistPath,
  scannedRoot,
  skippedBinaryFileCount,
});

await writeJsonReport(args.reportPath, report);

const reportRelPath = normalizePosixPath(relative(REPO_ROOT, args.reportPath));
process.stdout.write(
  `legacy-name-check (${report.mode}): scanned ${report.scannedFileCount} text files (${report.skippedBinaryFileCount} binary skipped), ` +
    `hits=${report.totalHitCount}, allowlisted=${report.allowlistedHitCount}, unallowlisted=${report.unallowlistedHitCount}\n`,
);

if (!report.passed) {
  const shown = report.unallowlistedHits.slice(0, MAX_CONSOLE_HITS);
  for (const hit of shown) {
    process.stderr.write(`  UNALLOWLISTED ${hit.file}:${hit.line}:${hit.column} [${hit.token}] ${hit.snippet}\n`);
  }
  if (report.unallowlistedHitCount > shown.length) {
    process.stderr.write(`  ... and ${report.unallowlistedHitCount - shown.length} more unallowlisted hit(s).\n`);
  }
  process.stderr.write(`Report written to ${reportRelPath}\n`);
  process.exit(1);
}

process.stdout.write(`PASS: All legacy references match ${report.allowlistPath}. Report written to ${reportRelPath}\n`);
