import { createOpenBotLogger } from "@openbot/logging";
import { Effect, Fiber } from "effect";

const logger = createOpenBotLogger("thread-auto-archive");

/** A side thread with no activity for this time is archived. */
export const THREAD_IDLE_ARCHIVE_MS = 3 * 24 * 60 * 60_000;
/** How often the host looks for idle side threads. */
export const THREAD_AUTO_ARCHIVE_INTERVAL_MS = 5 * 60_000;
/** The first sweep waits for the start of the agents. */
const FIRST_SWEEP_DELAY_MS = 60_000;

/** A development override in milliseconds from the environment, or null when it is not set or not valid. */
export function developmentDurationMs(value: string | undefined): number | null {
  const parsed = Number(value);
  return value && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export interface ThreadAutoArchiveSchedulerOptions {
  /** Archives the idle threads whose last activity is before this time, and returns how many. */
  sweep: (idleBefore: string) => Effect.Effect<number>;
  idleMs?: number;
  intervalMs?: number;
  now?: () => number;
}

/**
 * Archives the idle side threads of the host's agents every 5 minutes, on the host that owns the
 * threads, so it also runs for the members of a joined server. One sweep runs at a time; `close` stops
 * the timer and interrupts a running sweep.
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

  /** One sweep now. */
  readonly sweepNow = Effect.fn("ThreadAutoArchive.sweep")(function* (this: ThreadAutoArchiveScheduler) {
    const now = this.#options.now?.() ?? Date.now();
    const idleMs = this.#options.idleMs ?? THREAD_IDLE_ARCHIVE_MS;
    const archived = yield* this.#options.sweep(new Date(now - idleMs).toISOString());
    if (archived > 0) logger.info("Archived idle side threads.", { archived });
    return archived;
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
