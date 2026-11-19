import { constants, type Stats } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { HOME_AGENT_RULE_FILES, type HomeAgentRuleFile, type HomeAgentRulesPreference } from "@openbot/contracts/ipc";
import { redactSecrets } from "@openbot/logging";
import { Effect } from "effect";

const MAX_RULE_BYTES = 32 * 1024;

async function rulesDirectory(home: string): Promise<string | null> {
  const agents = join(home, ".agents");
  const rules = join(agents, "rules");
  return (await lstat(agents)).isDirectory() && (await lstat(rules)).isDirectory() ? rules : null;
}

async function ruleFileInfo(path: string): Promise<Stats | null> {
  const info = await lstat(path);
  return info.isFile() && info.size > 0 && info.size <= MAX_RULE_BYTES ? info : null;
}

/** Unavailable files have no effect. The error or file content must not reach a log or a settings client. */
function probe<A>(read: () => Promise<A>): Effect.Effect<A | null> {
  return Effect.tryPromise({ try: read, catch: () => null }).pipe(Effect.orElseSucceed(() => null));
}

export const availableHomeAgentRules = Effect.fn("HomeAgentRules.available")(function* (home = homedir()) {
  const directory = yield* probe(() => rulesDirectory(home));
  if (!directory) return [];
  const available: HomeAgentRuleFile[] = [];
  for (const file of HOME_AGENT_RULE_FILES) {
    if (yield* probe(() => ruleFileInfo(join(directory, file)))) available.push(file);
  }
  return available;
});

/** Uses only the fixed paths and a bounded no-follow read. Only provider prompts receive the text. */
export const readHomeAgentRules = Effect.fn("HomeAgentRules.read")(function* (
  preference: HomeAgentRulesPreference,
  nativeDirectories: readonly string[] = [],
  home = homedir(),
) {
  if (!preference.enabled || preference.files.length === 0) return "";
  const directory = yield* probe(() => rulesDirectory(home));
  if (!directory) return "";
  const rules: string[] = [];
  for (const file of HOME_AGENT_RULE_FILES) {
    if (!preference.files.includes(file)) continue;
    const path = join(directory, file);
    const info = yield* probe(() => ruleFileInfo(path));
    if (!info) continue;
    if (nativeDirectories.length > 0) {
      const resolved = yield* probe(() => realpath(path));
      const native = yield* Effect.forEach(nativeDirectories, (dir) => probe(() => realpath(join(dir, file))));
      if (resolved && native.includes(resolved)) continue;
    }
    const text = yield* probe(() => readRule(path, info));
    if (text) rules.push(`## ${file}\n\n${redactSecrets(text)}`);
  }
  return rules.length > 0 ? ["# Host agent rules", ...rules].join("\n\n") : "";
});

async function readRule(path: string, beforeOpen: Stats): Promise<string> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (
      !info.isFile() ||
      info.dev !== beforeOpen.dev ||
      info.ino !== beforeOpen.ino ||
      info.size === 0 ||
      info.size > MAX_RULE_BYTES
    )
      return "";
    const buffer = Buffer.alloc(MAX_RULE_BYTES + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, offset)).trim();
      offset += bytesRead;
    }
    return "";
  } finally {
    await file.close();
  }
}
