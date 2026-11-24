// The rules that write the product name "Pokebots" into text. `scripts/pokebots-rename-catalogs.ts` runs
// them over the message catalogs and the What's New notes, and `scripts/check-openbot-references.ts`
// reads the kept phrases. They moved here from the build-time brand layer, which is gone.

/**
 * Phrases that keep "OpenBot": names of things outside this app that the text points the reader to.
 * The code makes the vault and the folder "Shared with OpenBot", the GitHub App and the phone app keep
 * their names, and "OpenBot Shared" is the `~/OpenBot/Shared` folder.
 */
export const KEPT_PHRASES = /(?<!Shared with )OpenBot(?! GitHub App| Mobile\b| Shared\b)/g;

/** The product word in a piece of text, outside the kept phrases. The match is case-sensitive. */
export function brandText(text: string, name: string): string {
  return text.replace(KEPT_PHRASES, name);
}

/**
 * Comments and string literals, left to right. A comment comes first, so an apostrophe in a comment
 * does not start a string; a string comes first, so `//` in a URL does not start a comment.
 */
const TOKENS = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;

/**
 * Brands the string values of one TypeScript or JSON module. A string followed by `:` is an object key,
 * such as a catalog key, and stays. Comments stay too.
 */
export function brandStringValues(code: string, brand: (text: string) => string): { code: string; changed: number } {
  let changed = 0;
  const output = code.replace(TOKENS, (token: string, offset: number) => {
    if (token.startsWith("//") || token.startsWith("/*")) return token;
    if (/^\s*:/.test(code.slice(offset + token.length, offset + token.length + 40))) return token;
    const branded = brand(token);
    if (branded !== token) changed += 1;
    return branded;
  });
  return { code: output, changed };
}
