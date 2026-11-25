import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { isFixedSourceText, localizeSourceText, matchingSourceKeys, sourceTranslateFor } from "@pokebots/i18n/source";
import { sourceText } from "@pokebots/i18n/source-english";

const legacyCopy = "OpenBot could not create a unique agent copy name.";
const displayCopy = "Pokebots could not create a unique agent copy name.";
assert.equal(sourceText("error.agent.copyNameFailed"), legacyCopy);
assert.equal(sourceTranslateFor("en")("error.agent.copyNameFailed"), displayCopy);
for (const message of [legacyCopy, displayCopy]) {
  assert.deepEqual(matchingSourceKeys(message), ["error.agent.copyNameFailed"]);
  assert.equal(isFixedSourceText(message), true);
  assert.equal(localizeSourceText(message, "en"), displayCopy);
  assert.equal(localizeSourceText(message, "es"), "Pokebots no pudo crear un nombre único para la copia del agente.");
}

const name = "OpenBot notes.md";
const legacyAttachment = "OpenBot could not copy OpenBot notes.md.";
const displayAttachment = "Pokebots could not copy OpenBot notes.md.";
assert.equal(sourceText("error.backend.attachmentCopyFailed", { name }), legacyAttachment);
for (const message of [legacyAttachment, displayAttachment]) {
  assert.deepEqual(matchingSourceKeys(message), ["error.backend.attachmentCopyFailed"]);
  assert.equal(isFixedSourceText(message), false);
  assert.equal(localizeSourceText(message, "en"), displayAttachment);
  assert.equal(localizeSourceText(message, "es"), "Pokebots no pudo copiar OpenBot notes.md.");
}

for (const count of [1, 3]) {
  const wire = sourceText("status.remote.connectionLostDetail", { count, detail: legacyCopy });
  assert.equal(wire, `Connection lost. Retrying in ${count}s.\n${legacyCopy}`);
  assert.equal(localizeSourceText(wire, "en"), `Connection lost. Retrying in ${count}s.\n${displayCopy}`);
}

for (const message of [`Provider: ${legacyCopy}`, `${legacyCopy}\n`, "OpenBot could not create another copy."]) {
  assert.deepEqual(matchingSourceKeys(message), []);
  assert.equal(isFixedSourceText(message), false);
  assert.equal(localizeSourceText(message, "en"), message);
  assert.equal(localizeSourceText(message, "es"), message);
}

mkdirSync(".openbot-build", { recursive: true });
const report = ".openbot-build/pokebots-wire-compat-e2e.json";
writeFileSync(
  report,
  JSON.stringify(
    { passed: true, cases: ["fixed", "parameterized", "plural with nested detail", "unmatched"] },
    null,
    2,
  ),
);
process.stdout.write(`PASS ${report}\n`);
