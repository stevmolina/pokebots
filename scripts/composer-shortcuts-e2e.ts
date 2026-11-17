// Checks the T3 Code style message box keys and shortcuts without a window.
// Steps: 1. Enter and Cmd+Enter choose the right busy action for each busy-message mode, provider
// and chat kind; 2. the Cmd+Enter chord is read only while plain Enter sends; 3. each new shortcut
// matches its keys on macOS and on Windows and Linux; 4. no two entries of the shortcut list match
// one key press, and the keys that Pokebots already had keep their entry; 5. the send input
// carries `queueOnly` through the IPC decoder.
// `bun scripts/composer-shortcuts-e2e.ts`. Writes .openbot-build/composer-shortcuts-e2e/report.json.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { APP_SHORTCUT_COMMANDS } from "@openbot/contracts/app-shortcut";
import { isAlternateSubmitKey } from "@openbot/ui/features/conversation/send-shortcut";
import {
  type KeyCombo,
  matchShortcut,
  SHORTCUTS,
  type ShortcutId,
  type ShortcutKeyEvent,
  type ShortcutPlatform,
  shortcutText,
} from "@openbot/ui/features/shortcuts/shortcut-registry";
import { parseSendMessage } from "../src/main/ipc/agent-inputs";
import { type BusyOppositeAction, busyOppositeAction } from "../src/renderer/src/features/conversation/busy-submit";

const OUT = resolve(import.meta.dirname, "../.openbot-build/composer-shortcuts-e2e");
interface Report {
  busyActions?: Array<{ name: string; expected: BusyOppositeAction }>;
  newKeys?: Array<{ id: ShortcutId; mac: string; pc: string }>;
  keptKeys?: ShortcutId[];
  passed: boolean;
}
const report: Report = { passed: false };

// 1. The busy action.
const busy = { busy: true, channel: false, editingQueued: false, agentSteers: true };
const actions: Array<[string, Parameters<typeof busyOppositeAction>[0], BusyOppositeAction]> = [
  ["steer mode, busy: Cmd+Enter queues", { ...busy, hostSteers: true }, "queue"],
  ["queue mode, busy: Cmd+Enter steers", { ...busy, hostSteers: false }, "steer"],
  ["steer mode, idle: Cmd+Enter sends", { ...busy, busy: false, hostSteers: true }, "send"],
  ["queue mode, idle: Cmd+Enter sends", { ...busy, busy: false, hostSteers: false }, "send"],
  ["provider cannot steer: Cmd+Enter keeps queueing", { ...busy, agentSteers: false, hostSteers: false }, "send"],
  ["channel: Cmd+Enter sends", { ...busy, channel: true, hostSteers: true }, "send"],
  ["queued edit open: Cmd+Enter saves it", { ...busy, editingQueued: true, hostSteers: true }, "send"],
];
for (const [name, state, expected] of actions) assert.equal(busyOppositeAction(state), expected, name);
report.busyActions = actions.map(([name, , expected]) => ({ name, expected }));

// 2. The chord.
const press = (init: Partial<ShortcutKeyEvent> & { key: string }): ShortcutKeyEvent & { key: string } => ({
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...init,
});
assert.equal(isAlternateSubmitKey(press({ key: "Enter", metaKey: true }), "enter"), true, "Cmd+Enter");
assert.equal(isAlternateSubmitKey(press({ key: "Enter", ctrlKey: true }), "enter"), true, "Ctrl+Enter");
assert.equal(isAlternateSubmitKey(press({ key: "Enter" }), "enter"), false, "plain Enter");
assert.equal(
  isAlternateSubmitKey(press({ key: "Enter", metaKey: true, shiftKey: true }), "enter"),
  false,
  "Cmd+Shift+Enter",
);
assert.equal(
  isAlternateSubmitKey(press({ key: "Enter", metaKey: true, ctrlKey: true }), "enter"),
  false,
  "Cmd+Ctrl+Enter",
);
assert.equal(
  isAlternateSubmitKey(press({ key: "Enter", metaKey: true }), "meta-enter"),
  false,
  "Cmd+Enter already sends",
);
assert.equal(
  isAlternateSubmitKey(press({ key: "Enter", ctrlKey: true }), "ctrl-enter"),
  false,
  "Ctrl+Enter already sends",
);

// 3. The new keys.
/** The key press that a chord asks for, as a browser reports it. */
function eventFor(combo: KeyCombo, platform: ShortcutPlatform): ShortcutKeyEvent {
  const primary = combo.mod !== undefined;
  const digit = combo.key === "digit" ? "1" : combo.key;
  return {
    key: combo.shift === true && /^[a-z]$/u.test(digit) ? digit.toUpperCase() : digit,
    ...(combo.code === undefined ? {} : { code: combo.code }),
    metaKey: primary && platform === "mac",
    ctrlKey: (primary && platform === "pc") || combo.ctrl === true,
    altKey: combo.alt === true,
    shiftKey: combo.shift === true,
  };
}
const ids = SHORTCUTS.map((entry) => entry.id);
const newKeys: Array<[ShortcutId, ShortcutKeyEvent]> = [
  ["newChat", press({ key: "O", shiftKey: true })],
  ["steerQueued", press({ key: "Enter", shiftKey: true })],
  ["openModelPicker", press({ key: "M", shiftKey: true })],
  ["pinChat", press({ key: "P", shiftKey: true })],
  ["previousChat", press({ key: "{", code: "BracketLeft", shiftKey: true })],
  ["nextChat", press({ key: "}", code: "BracketRight", shiftKey: true })],
];
const matched: Array<{ id: ShortcutId; mac: string; pc: string }> = [];
for (const [id, base] of newKeys) {
  for (const platform of ["mac", "pc"] as const) {
    const event = { ...base, metaKey: platform === "mac", ctrlKey: platform === "pc" };
    assert.equal(
      matchShortcut(
        SHORTCUTS.map((entry) => entry.id),
        event,
        platform,
        true,
      ),
      id,
      `${id} on ${platform}`,
    );
    // The other system's modifier must not match.
    const wrong = { ...base, metaKey: platform === "pc", ctrlKey: platform === "mac" };
    assert.notEqual(
      matchShortcut(
        SHORTCUTS.map((entry) => entry.id),
        wrong,
        platform,
        true,
      ),
      id,
      `${id} wrong mod ${platform}`,
    );
  }
  for (const platform of ["mac", "pc"] as const) {
    const event = { ...base, metaKey: platform === "mac", ctrlKey: platform === "pc" };
    const browserIds = ids.filter((other) => other.startsWith("browser"));
    assert.equal(
      matchShortcut(browserIds, event, platform),
      undefined,
      `${id} clashes with a browser key on ${platform}`,
    );
  }
  matched.push({ id, mac: shortcutText(id, "mac"), pc: shortcutText(id, "pc") });
}
for (const id of ["steerQueued", "openModelPicker", "pinChat"] as const) {
  assert.ok(APP_SHORTCUT_COMMANDS.includes(id), `${id} is a menu command`);
}
report.newKeys = matched;

// 4. No clash, and the old keys stay.
const clashes: string[] = [];
for (const platform of ["mac", "pc"] as const) {
  for (const entry of SHORTCUTS) {
    for (const combo of entry[platform]) {
      const event = eventFor(combo, platform);
      // The browser keys share chords with the app keys by design: they work only in the browser view.
      const owners = ids.filter((id) => !id.startsWith("browser") && matchShortcut([id], event, platform));
      if (entry.id.startsWith("browser")) continue;
      if (owners.length !== 1 || owners[0] !== entry.id)
        clashes.push(`${platform} ${entry.id} ${JSON.stringify(combo)} -> ${owners.join(",")}`);
    }
  }
}
assert.deepEqual(clashes, [], `shortcut clashes:\n${clashes.join("\n")}`);
const kept: Array<[ShortcutId, ShortcutKeyEvent]> = [
  ["switchServer", press({ key: "3", metaKey: true })],
  ["previousChat", press({ key: "ArrowUp", altKey: true })],
  ["nextChat", press({ key: "ArrowDown", altKey: true })],
  ["newChat", press({ key: "n", metaKey: true })],
  ["historyBack", press({ key: "[", metaKey: true })],
  ["browserReopenTab", press({ key: "T", metaKey: true, shiftKey: true })],
];
for (const [id, event] of kept)
  assert.equal(matchShortcut(ids, event, "mac", true) ?? matchShortcut(ids, event, "mac"), id, `kept ${id}`);
report.keptKeys = kept.map(([id]) => id);

// 5. The send input.
assert.equal(parseSendMessage({ agentId: "agent-1", text: "hi", queueOnly: true }).queueOnly, true);
assert.equal("queueOnly" in parseSendMessage({ agentId: "agent-1", text: "hi" }), false);
assert.throws(() => parseSendMessage({ agentId: "agent-1", text: "hi", queueOnly: "yes" }), /Invalid queue request/u);

report.passed = true;
mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write("composer-shortcuts-e2e passed\n");
