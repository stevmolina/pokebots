import type { TranslatedLocale } from "./locale";
import { createTranslate, type MessageCatalog, type Translate } from "./message";
import { source as en } from "./messages/en/source";
import { sourceTranslation } from "./source-catalogs";
import { type SourceMessages, sourceText } from "./source-english";
import { createSourceLocalizer } from "./source-matcher";
import { releasedSourceMessages } from "./source-wire-compat";

export type { TranslatedLocale } from "./locale";
export { type SourceMessages, sourceText };

/**
 * Text the main process, a host or the team client sends as English, and a screen translates.
 *
 * An error crosses IPC as its message only, and the Team API sends `{ error: message }` to clients
 * of every released version. The sender writes the current English catalog. The reader also
 * recognizes the released English aliases and renders their keys in the selected language.
 *
 * `bun run i18n:check` fails when two templates can match the same text, so the first match is the
 * only match.
 */
const localizer = createSourceLocalizer({
  source: en,
  aliases: releasedSourceMessages,
  translation: sourceTranslation,
});

/**
 * `text` in `locale`, when it is the English of a source key. Anything else - text from an older
 * host, a provider, or a tool - is returned as it is.
 */
export function localizeSourceText(text: string, locale: TranslatedLocale): string {
  return localizer.localize(text, locale);
}

/** Every source key whose English can render `text`. `bun run i18n:check` expects one per template. */
export function matchingSourceKeys(text: string): readonly string[] {
  return localizer.matchingKeys(text);
}

/** A plural template is an object of forms, and it always has a placeholder. */
const templates: MessageCatalog = en;
const releasedTemplates: MessageCatalog = releasedSourceMessages;

/**
 * True when `text` is the whole English of a source key with no placeholder. Such text holds nothing
 * from a provider, a tool or a path, so a host can send it to every client.
 */
export function isFixedSourceText(text: string): boolean {
  return matchingSourceKeys(text).some((key) => templates[key] === text || releasedTemplates[key] === text);
}

const sourceTranslators = new Map<TranslatedLocale, Translate<SourceMessages>>();

/**
 * A typed translator over the source keys, for code that picks a key itself, such as an error kind.
 * A language that is not loaded reads English, as in `translateFor`.
 */
export function sourceTranslateFor(locale: TranslatedLocale): Translate<SourceMessages> {
  const cached = sourceTranslators.get(locale);
  if (cached) return cached;
  const translation = sourceTranslation(locale);
  if (!translation) return sourceTranslateFor("en");
  const translate = createTranslate({ source: en, translation, locale, sourceLocale: "en" });
  sourceTranslators.set(locale, translate);
  return translate;
}
