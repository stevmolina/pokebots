/**
 * Shared compatibility resolver for paired `POKEBOTS_*` and legacy `OPENBOT_*` (or unprefixed
 * service) environment variables during the Pokebots Release A transition.
 *
 * - Safe runtime settings: `POKEBOTS_*` takes precedence over the legacy name when both are set,
 *   while the legacy name continues to work unchanged when `POKEBOTS_*` is unset or blank.
 * - Security-sensitive settings (auth API URL, Signal URL, origins, secrets, keys, TLS, tokens,
 *   identity bindings): if both names are set with different normalized values, resolution fails
 *   closed with a redacted error that names only the conflicting variables, never their values.
 */

export type EnvironmentRecord = Readonly<Record<string, string | undefined>>;

export type EnvCompatibilityMode = "safe" | "security-sensitive";

export type EnvValueNormalizer = (value: string) => string;

export interface EnvCompatibilityPair {
  readonly pokebots: string;
  readonly legacy: string;
  readonly mode: EnvCompatibilityMode;
  readonly normalize?: EnvValueNormalizer;
}

export interface EnvCompatibilityGroup {
  readonly pokebots: readonly string[];
  readonly legacy: readonly string[];
  readonly mode: EnvCompatibilityMode;
  readonly normalize?: EnvValueNormalizer;
}

/**
 * Thrown when a security-sensitive `POKEBOTS_*` variable and its legacy counterpart are both set
 * to different normalized values. Never includes either variable's value in the error message.
 */
export class EnvCompatibilityConflictError extends Error {
  readonly pokebotsName: string;
  readonly legacyName: string;

  constructor(pokebotsName: string, legacyName: string) {
    super(
      `Conflicting configuration: ${pokebotsName} and ${legacyName} are both set with different values. Set only one or use the same value for both.`,
    );
    this.name = "EnvCompatibilityConflictError";
    this.pokebotsName = pokebotsName;
    this.legacyName = legacyName;
  }
}

export function normalizeEnvTrimmed(value: string): string {
  return value.trim();
}

export function normalizeEnvLowercase(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Normalizes a URL or origin for security-sensitive equality checks: lowercases scheme and host
 * through `URL`, removes the default port, and strips a root-only trailing slash while keeping
 * credentials, paths, queries, and fragments distinct. Falls back to trimmed text for non-URLs.
 */
export function normalizeEnvUrl(value: string): string {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    if (url.pathname === "/" && url.search === "" && url.hash === "" && url.href.endsWith("/")) {
      return url.href.slice(0, -1);
    }
    return url.href;
  } catch {
    return trimmed;
  }
}

export function pairedOpenBotEnv(
  suffix: string,
  mode: EnvCompatibilityMode,
  normalize?: EnvValueNormalizer,
): EnvCompatibilityPair {
  return {
    pokebots: `POKEBOTS_${suffix}`,
    legacy: `OPENBOT_${suffix}`,
    mode,
    ...(normalize === undefined ? {} : { normalize }),
  };
}

function readNonEmpty(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveCompatEnv(environment: EnvironmentRecord, pair: EnvCompatibilityPair): string | undefined {
  const pokebotsValue = readNonEmpty(environment[pair.pokebots]);
  const legacyValue = readNonEmpty(environment[pair.legacy]);
  if (pokebotsValue === undefined) return legacyValue;
  if (legacyValue === undefined) return pokebotsValue;
  if (pair.mode === "safe") return pokebotsValue;

  const normalize = pair.normalize ?? normalizeEnvTrimmed;
  if (normalize(pokebotsValue) !== normalize(legacyValue)) {
    throw new EnvCompatibilityConflictError(pair.pokebots, pair.legacy);
  }
  return pokebotsValue;
}

/**
 * Resolves a setting that has multiple `POKEBOTS_*` or legacy alias names (for example
 * `REMOTE_TICKET_PUBLIC_KEYS` and `REMOTE_TICKET_PUBLIC_JWKS`). Preserves legacy-only precedence
 * when no `POKEBOTS_*` alias is set, and rejects any disagreement involving a `POKEBOTS_*` alias
 * in `security-sensitive` mode without revealing values.
 */
export function resolveCompatEnvGroup(
  environment: EnvironmentRecord,
  group: EnvCompatibilityGroup,
): string | undefined {
  const pokebotsEntries: Array<{ name: string; value: string }> = [];
  for (const name of group.pokebots) {
    const value = readNonEmpty(environment[name]);
    if (value !== undefined) pokebotsEntries.push({ name, value });
  }
  const legacyEntries: Array<{ name: string; value: string }> = [];
  for (const name of group.legacy) {
    const value = readNonEmpty(environment[name]);
    if (value !== undefined) legacyEntries.push({ name, value });
  }

  const primaryPokebots = pokebotsEntries[0];
  if (primaryPokebots === undefined) return legacyEntries[0]?.value;
  if (group.mode === "safe") return primaryPokebots.value;

  const normalize = group.normalize ?? normalizeEnvTrimmed;
  const expected = normalize(primaryPokebots.value);
  for (const entry of pokebotsEntries.slice(1)) {
    if (normalize(entry.value) !== expected) {
      throw new EnvCompatibilityConflictError(primaryPokebots.name, entry.name);
    }
  }
  for (const entry of legacyEntries) {
    if (normalize(entry.value) !== expected) {
      throw new EnvCompatibilityConflictError(primaryPokebots.name, entry.name);
    }
  }
  return primaryPokebots.value;
}

export const AUTH_API_URL_ENV = pairedOpenBotEnv("AUTH_API_URL", "security-sensitive", normalizeEnvUrl);
export const MOBILE_AUTH_API_URL_ENV = pairedOpenBotEnv("MOBILE_AUTH_API_URL", "security-sensitive", normalizeEnvUrl);
export const REMOTE_SIGNAL_URL_ENV = pairedOpenBotEnv("REMOTE_SIGNAL_URL", "security-sensitive", normalizeEnvUrl);
export const DATA_DIR_ENV = pairedOpenBotEnv("DATA_DIR", "safe");
export const AGENT_COMPUTER_API_URL_ENV = pairedOpenBotEnv(
  "AGENT_COMPUTER_API_URL",
  "security-sensitive",
  normalizeEnvUrl,
);
export const GITHUB_CLIENT_ID_ENV = pairedOpenBotEnv("GITHUB_CLIENT_ID", "security-sensitive");
export const GITHUB_APP_SLUG_ENV = pairedOpenBotEnv("GITHUB_APP_SLUG", "security-sensitive");
export const DISABLE_GPU_ENV = pairedOpenBotEnv("DISABLE_GPU", "safe");
export const SERVER_ENV = pairedOpenBotEnv("SERVER", "safe");
export const HOSTED_SERVER_ENV = pairedOpenBotEnv("HOSTED_SERVER", "safe");
export const AGENT_DISPLAY_ENV = pairedOpenBotEnv("AGENT_DISPLAY", "safe");
export const AGENT_SCREEN_BIN_ENV = pairedOpenBotEnv("AGENT_SCREEN_BIN", "safe");
export const REMOTE_DESKTOP_RUNTIME_PATH_ENV = pairedOpenBotEnv("REMOTE_DESKTOP_RUNTIME_PATH", "safe");
export const CUA_DRIVER_PATH_ENV = pairedOpenBotEnv("CUA_DRIVER_PATH", "safe");
export const SOURCE_COMMIT_ENV = pairedOpenBotEnv("SOURCE_COMMIT", "safe");
