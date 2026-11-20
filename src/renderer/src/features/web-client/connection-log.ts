// A log of the stages that the web client passes while it opens, kept in this browser so a slow open
// can be read after the fact. Settings shows it with a button that copies it.
//
// The stages are the fixed-name `openbot:remote-*` marks that `markRemoteSync` already sets (see
// `@openbot/team-client/sync-profile`), so the log adds no call to the connection code. Each stage
// keeps its time since the page started to load, which counts the network time of the page and its
// code. A phone that is slow before the first stage is slow to download or run the code. A phone
// that is slow between two stages is slow in that stage.
//
// The log holds stage names, times, the paths of this site's own files and the network type. It
// holds no host name, message, token or account value, and it never leaves the browser unless the
// user copies it.

const STORAGE_KEY = "openbot:web-connection-log";
const MARK_PREFIX = "openbot:remote-";
const MAX_SESSIONS = 4;
const MAX_STAGES = 80;
const SLOWEST_FILES = 3;

interface ConnectionStage {
  name: string;
  /** Milliseconds since the page started to load. */
  at: number;
}

interface ConnectionPageSummary {
  timeToFirstByte: number | null;
  domContentLoaded: number | null;
  loaded: number | null;
  /** Files of this site that the page loaded, with the bytes that went over the network. */
  files: number;
  transferredBytes: number;
  slowestFiles: { path: string; duration: number }[];
  network: string;
  serviceWorker: boolean;
}

export interface ConnectionSession {
  /** Epoch milliseconds when the page started to load. */
  startedAt: number;
  stages: ConnectionStage[];
  page: ConnectionPageSummary | null;
}

export function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) return "n/a";
  return milliseconds < 1000 ? `${Math.round(milliseconds)}ms` : `${(milliseconds / 1000).toFixed(1)}s`;
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Keeps the newest sessions, and the first stages of a session that reconnects for a long time. */
export function trimSessions(sessions: readonly ConnectionSession[]): ConnectionSession[] {
  return sessions.slice(-MAX_SESSIONS).map((session) => ({ ...session, stages: session.stages.slice(0, MAX_STAGES) }));
}

export function formatConnectionLog(
  sessions: readonly ConnectionSession[],
  context: { now: number; userAgent: string; build: string },
): string {
  const lines = [
    "OpenBot web connection log",
    `taken: ${new Date(context.now).toISOString()}`,
    `build: ${context.build}`,
    `device: ${context.userAgent}`,
  ];
  if (sessions.length === 0) lines.push("", "No stage is recorded yet.");
  sessions.forEach((session, index) => {
    const current = index === sessions.length - 1;
    lines.push(
      "",
      `Open ${index + 1}${current ? " (this one)" : ""}, started ${new Date(session.startedAt).toISOString()}`,
    );
    const page = session.page;
    if (page) {
      lines.push(
        `  page: first byte ${formatDuration(page.timeToFirstByte)}, document ${formatDuration(page.domContentLoaded)}, loaded ${formatDuration(page.loaded)}`,
        `  files: ${page.files}, ${formatBytes(page.transferredBytes)} over the network, network ${page.network}, service worker ${page.serviceWorker ? "yes" : "no"}`,
      );
      if (page.slowestFiles.length > 0) {
        lines.push(
          `  slowest files: ${page.slowestFiles.map((file) => `${file.path} ${formatDuration(file.duration)}`).join(", ")}`,
        );
      }
    }
    let previous = 0;
    for (const stage of session.stages) {
      lines.push(
        `  ${formatDuration(stage.at).padStart(7)}  +${formatDuration(Math.max(0, stage.at - previous)).padEnd(7)} ${stage.name}`,
      );
      previous = stage.at;
    }
  });
  return lines.join("\n");
}

function readStored(): ConnectionSession[] {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? trimSessions(parsed.filter(isSession)) : [];
  } catch {
    return [];
  }
}

function isSession(value: unknown): value is ConnectionSession {
  return (
    typeof value === "object" &&
    value !== null &&
    "startedAt" in value &&
    typeof value.startedAt === "number" &&
    "stages" in value &&
    Array.isArray(value.stages)
  );
}

function writeStored(sessions: readonly ConnectionSession[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(trimSessions(sessions)));
  } catch {
    // A full or blocked storage loses the log, never the app.
  }
}

function networkSummary(): string {
  if (!("connection" in navigator)) return "unknown";
  const connection = navigator.connection;
  if (typeof connection !== "object" || connection === null) return "unknown";
  const effectiveType =
    "effectiveType" in connection && typeof connection.effectiveType === "string"
      ? connection.effectiveType
      : "unknown";
  const rtt = "rtt" in connection && typeof connection.rtt === "number" ? connection.rtt : "?";
  const downlink = "downlink" in connection && typeof connection.downlink === "number" ? connection.downlink : "?";
  return `${effectiveType}, ${rtt}ms round trip, ${downlink} Mbps`;
}

function pageSummary(): ConnectionPageSummary | null {
  const clock = globalThis.performance;
  if (!clock || typeof clock.getEntriesByType !== "function") return null;
  const navigation = clock.getEntriesByType("navigation").find((entry) => entry instanceof PerformanceNavigationTiming);
  const files = clock
    .getEntriesByType("resource")
    .filter((entry) => entry instanceof PerformanceResourceTiming && entry.name.startsWith(globalThis.location.origin))
    .filter((entry) => entry instanceof PerformanceResourceTiming);
  return {
    timeToFirstByte: navigation ? navigation.responseStart : null,
    domContentLoaded: navigation ? navigation.domContentLoadedEventEnd : null,
    loaded: navigation && navigation.loadEventEnd > 0 ? navigation.loadEventEnd : null,
    files: files.length,
    transferredBytes: files.reduce((total, entry) => total + entry.transferSize, 0),
    slowestFiles: [...files]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, SLOWEST_FILES)
      .map((entry) => ({ path: new URL(entry.name).pathname, duration: entry.duration })),
    network: networkSummary(),
    serviceWorker: Boolean(navigator.serviceWorker?.controller),
  };
}

/** The hashed name of the main script names the build, so two logs can be told apart. */
function buildName(): string {
  const entry = (globalThis.performance?.getEntriesByType?.("resource") ?? []).find((resource) =>
    /\/assets\/index-[\w-]+\.js$/.test(resource.name),
  );
  return entry ? new URL(entry.name).pathname : "unknown";
}

let sessions: ConnectionSession[] | null = null;

function currentSession(): ConnectionSession | null {
  return sessions?.[sessions.length - 1] ?? null;
}

function record(name: string, at: number): void {
  const session = currentSession();
  if (!sessions || !session) return;
  if (session.stages.length < MAX_STAGES) session.stages.push({ name, at });
  session.page = pageSummary();
  writeStored(sessions);
}

/**
 * Starts the log of this page load, once. It keeps the stages that were set before the call, and
 * follows the next ones.
 */
export function startConnectionLog(): void {
  const clock = globalThis.performance;
  if (sessions || !clock || typeof clock.now !== "function" || typeof globalThis.PerformanceObserver !== "function")
    return;
  sessions = [...readStored(), { startedAt: clock.timeOrigin, stages: [], page: null }];
  const stageName = (name: string) => (name.startsWith(MARK_PREFIX) ? name.slice(MARK_PREFIX.length) : null);
  record("log-started", clock.now());
  for (const mark of clock.getEntriesByType("mark")) {
    const name = stageName(mark.name);
    if (name) record(name, mark.startTime);
  }
  try {
    new PerformanceObserver((list) => {
      for (const mark of list.getEntries()) {
        const name = stageName(mark.name);
        if (name) record(name, mark.startTime);
      }
    }).observe({ entryTypes: ["mark"] });
  } catch {
    // A browser without mark observers keeps the stages that were set before the log started.
  }
}

/** The log as text: this open and the ones before it, newest last. */
export function connectionLogText(): string {
  const page = currentSession();
  if (page) {
    page.page = pageSummary();
    if (sessions) writeStored(sessions);
  }
  return formatConnectionLog(sessions ?? readStored(), {
    now: Date.now(),
    userAgent: globalThis.navigator?.userAgent ?? "unknown",
    build: buildName(),
  });
}
