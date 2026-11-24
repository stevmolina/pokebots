import { execFile } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { delimiter, join } from "node:path";
import {
  DEFAULT_THREAD_AUTO_ARCHIVE,
  parseThreadAutoArchiveSetting,
  type ThreadAutoArchiveSetting,
} from "@openbot/contracts/ipc";
import { isDynamicRecord } from "@openbot/contracts/runtime-values";
import { createOpenBotLogger } from "@openbot/logging";
import { Effect, Fiber } from "effect";
import {
  type PullRequestRef,
  type PullRequestState,
  type PullRequestStates,
  pullRequestKey,
} from "../backend/agent-tasks/thread-pull-requests";
import { PreferenceStore } from "./preference-file";

const logger = createOpenBotLogger("thread-auto-archive");

/** How often the host looks for side threads to archive. */
export const THREAD_AUTO_ARCHIVE_INTERVAL_MS = 5 * 60_000;
/** The first sweep waits for the start of the agents. */
const FIRST_SWEEP_DELAY_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;
/** The GitHub calls of one sweep, and those of them without a sign-in (GitHub permits 60 an hour without). */
const SIGNED_IN_BUDGET = 30;
const ANONYMOUS_BUDGET = 4;
/** An open pull request is read again after this time; one that could not be read, after the longer one. */
const OPEN_RECHECK_MS = 10 * 60_000;
const UNKNOWN_RECHECK_MS = 60 * 60_000;
/** The `gh` command is not tried again for this time after it failed. */
const GH_RETRY_MS = 60 * 60_000;
const GITHUB_TIMEOUT_MS = 15_000;
const CACHE_LIMIT = 5_000;

/** A development override in milliseconds from the environment, or null when it is not set or not valid. */
export function developmentDurationMs(value: string | undefined): number | null {
  const parsed = Number(value);
  return value && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export type ThreadAutoArchiveControl = ReturnType<typeof createThreadAutoArchiveControl>;

/**
 * When the host archives the side threads of its agents by itself (`thread-auto-archive-v1`). A file
 * that is missing or invalid reads as the default: archive after 3 idle days, and when the linked pull
 * requests are merged or closed. The sweep reads it each time, so a change applies at the next sweep.
 */
export function createThreadAutoArchiveControl(path: string) {
  const store = new PreferenceStore({
    path,
    defaultValue: DEFAULT_THREAD_AUTO_ARCHIVE,
    decode: (parsed) => {
      if (!isDynamicRecord(parsed) || parsed.version !== 1) return null;
      try {
        return parseThreadAutoArchiveSetting(parsed);
      } catch {
        return null;
      }
    },
  });
  return {
    load: () => store.load(),
    get: () => store.get(),
    set: (setting: ThreadAutoArchiveSetting) => store.set(setting),
  };
}

interface CachedState {
  state: PullRequestState;
  checkedAt: number;
}

export interface GitHubPullRequestStatesOptions {
  /** The token of the host's GitHub connection, or null when it has none. Never logged. */
  connectionToken: () => Effect.Effect<string | null>;
  fetch?: typeof fetch;
  /** The `gh` command, or null to look for it on `PATH`. */
  ghPath?: string | null;
  now?: () => number;
}

/**
 * Reads the state of GitHub pull requests for the automatic archive. It uses the host's GitHub
 * connection when it has one, else the `gh` command when it is installed and signed in, else GitHub's
 * public API, which reads only public repositories. A merged or closed pull request stays known; an
 * open one is read again after 10 minutes. Each sweep has a small budget of GitHub calls; past it, or
 * when GitHub refuses, the state is `unknown` and the thread stays open.
 */
export class GitHubPullRequestStates {
  readonly #options: GitHubPullRequestStatesOptions;
  readonly #cache = new Map<string, CachedState>();
  #budget = 0;
  #anonymousBudget = 0;
  #ghPath: string | null | undefined;
  #ghFailedAt: number | null = null;

  constructor(options: GitHubPullRequestStatesOptions) {
    this.#options = options;
    this.#ghPath = options.ghPath === undefined ? undefined : options.ghPath;
  }

  /** Starts the budget of one sweep. */
  beginSweep(): void {
    this.#budget = SIGNED_IN_BUDGET;
    this.#anonymousBudget = ANONYMOUS_BUDGET;
  }

  readonly state: PullRequestStates = Effect.fn("GitHubPullRequestStates.state")(function* (
    this: GitHubPullRequestStates,
    ref: PullRequestRef,
  ) {
    const key = pullRequestKey(ref);
    const now = this.#now();
    const cached = this.#cache.get(key);
    if (cached && fresh(cached, now)) return cached.state;
    if (this.#budget <= 0) return cached?.state === "open" ? "open" : "unknown";
    this.#budget -= 1;
    const state = yield* this.#read(ref);
    this.#cache.delete(key);
    this.#cache.set(key, { state, checkedAt: now });
    if (this.#cache.size > CACHE_LIMIT) {
      const oldest = this.#cache.keys().next().value;
      if (oldest !== undefined) this.#cache.delete(oldest);
    }
    return state;
  }).bind(this);

  readonly #read = Effect.fn("GitHubPullRequestStates.read")(function* (
    this: GitHubPullRequestStates,
    ref: PullRequestRef,
  ) {
    const token = yield* this.#options.connectionToken();
    if (token) return yield* this.#rest(ref, token);
    const gh = yield* this.#gh(ref);
    if (gh !== null) return gh;
    if (this.#anonymousBudget <= 0) return "unknown" as const;
    this.#anonymousBudget -= 1;
    return yield* this.#rest(ref, null);
  });

  #rest(ref: PullRequestRef, token: string | null): Effect.Effect<PullRequestState> {
    const fetcher = this.#options.fetch ?? fetch;
    const url = `https://api.github.com/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/pulls/${ref.number}`;
    return Effect.tryPromise({
      try: async (signal) => {
        const response = await fetcher(url, {
          headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: AbortSignal.any([signal, AbortSignal.timeout(GITHUB_TIMEOUT_MS)]),
        });
        if (response.status === 403 || response.status === 429) {
          // Rate limited: no more calls in this sweep.
          if (token) this.#budget = 0;
          else this.#anonymousBudget = 0;
          return "unknown" as const;
        }
        if (!response.ok) return "unknown" as const;
        return pullRequestState(await response.json());
      },
      catch: (cause) => cause,
    }).pipe(
      Effect.catch((cause) =>
        Effect.sync(() => {
          logger.debug("Could not read a pull request from GitHub.", { error: errorName(cause) });
          return "unknown" as const;
        }),
      ),
    );
  }

  /** The state from the `gh` command, or null when `gh` is not installed or not signed in. */
  #gh(ref: PullRequestRef): Effect.Effect<PullRequestState | null> {
    return Effect.gen({ self: this }, function* () {
      if (this.#ghFailedAt !== null && this.#now() - this.#ghFailedAt < GH_RETRY_MS) return null;
      if (this.#ghPath === undefined) this.#ghPath = yield* findGh();
      const ghPath = this.#ghPath;
      if (!ghPath) return null;
      const output = yield* Effect.callback<string | null>((resume) => {
        const child = execFile(
          ghPath,
          ["api", `repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`, "--jq", "{state: .state, merged: .merged}"],
          { timeout: GITHUB_TIMEOUT_MS, windowsHide: true, maxBuffer: 64 * 1024 },
          (error, stdout) => resume(Effect.succeed(error ? null : String(stdout))),
        );
        return Effect.sync(() => {
          child.kill();
        });
      });
      if (output === null) {
        this.#ghFailedAt = this.#now();
        return null;
      }
      this.#ghFailedAt = null;
      try {
        return pullRequestState(JSON.parse(output));
      } catch {
        return "unknown" as const;
      }
    });
  }

  #now(): number {
    return this.#options.now?.() ?? Date.now();
  }
}

function fresh(cached: CachedState, now: number): boolean {
  if (cached.state === "merged" || cached.state === "closed") return true;
  return now - cached.checkedAt < (cached.state === "open" ? OPEN_RECHECK_MS : UNKNOWN_RECHECK_MS);
}

function pullRequestState(value: unknown): PullRequestState {
  if (!isDynamicRecord(value)) return "unknown";
  if (value.merged === true || (typeof value.merged_at === "string" && value.merged_at.length > 0)) return "merged";
  if (value.state === "closed") return "closed";
  if (value.state === "open") return "open";
  return "unknown";
}

function errorName(cause: unknown): string {
  return cause instanceof Error ? cause.name : "unknown";
}

function findGh(): Effect.Effect<string | null> {
  return Effect.promise(async () => {
    const name = process.platform === "win32" ? "gh.exe" : "gh";
    const directories = [
      ...(process.env.PATH ?? "").split(delimiter),
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
    ];
    for (const directory of directories) {
      if (!directory) continue;
      const candidate = join(directory, name);
      try {
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Not in this directory.
      }
    }
    return null;
  });
}

export interface ThreadAutoArchiveSchedulerOptions {
  preference: () => ThreadAutoArchiveSetting;
  sweep: (policy: {
    idleBefore: string | null;
    pullRequests: PullRequestStates | null;
  }) => Effect.Effect<{ idle: number; pullRequests: number }>;
  pullRequests: GitHubPullRequestStates;
  intervalMs?: number;
  /** A development override of the idle time, so a check does not wait for days. */
  idleMs?: number;
  now?: () => number;
}

/**
 * Runs the automatic archive of side threads every 5 minutes, on the host that owns the threads. It
 * reads the setting at each sweep, so a change applies at the next one. One sweep runs at a time;
 * `close` stops the timer and interrupts a running sweep.
 */
export class ThreadAutoArchiveScheduler {
  readonly #options: ThreadAutoArchiveSchedulerOptions;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #running: Fiber.Fiber<unknown> | null = null;
  #closed = false;

  constructor(options: ThreadAutoArchiveSchedulerOptions) {
    this.#options = options;
  }

  start(): void {
    if (this.#closed || this.#timer) return;
    const interval = this.#options.intervalMs ?? THREAD_AUTO_ARCHIVE_INTERVAL_MS;
    this.#schedule(Math.min(FIRST_SWEEP_DELAY_MS, interval), interval);
  }

  #schedule(delay: number, interval: number): void {
    this.#timer = setTimeout(() => {
      this.#timer = null;
      if (this.#closed) return;
      if (!this.#running) {
        const fiber = Effect.runFork(this.sweepNow());
        this.#running = fiber;
        fiber.addObserver(() => {
          if (this.#running === fiber) this.#running = null;
        });
      }
      this.#schedule(interval, interval);
    }, delay);
    this.#timer.unref?.();
  }

  /** One sweep with the current setting. */
  readonly sweepNow = Effect.fn("ThreadAutoArchive.sweep")(function* (this: ThreadAutoArchiveScheduler) {
    const setting = this.#options.preference();
    const now = this.#options.now?.() ?? Date.now();
    const idleMs = setting.idleDays === 0 ? null : (this.#options.idleMs ?? setting.idleDays * DAY_MS);
    this.#options.pullRequests.beginSweep();
    const result = yield* this.#options.sweep({
      idleBefore: idleMs === null ? null : new Date(now - idleMs).toISOString(),
      pullRequests: setting.mergedPullRequests ? this.#options.pullRequests.state : null,
    });
    if (result.idle + result.pullRequests > 0) logger.info("Archived side threads by themselves.", result);
    return result;
  }).bind(this);

  readonly close = Effect.fn("ThreadAutoArchive.close")(function* (this: ThreadAutoArchiveScheduler) {
    this.#closed = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    const running = this.#running;
    this.#running = null;
    if (running) yield* Fiber.interrupt(running);
  }).bind(this);
}
