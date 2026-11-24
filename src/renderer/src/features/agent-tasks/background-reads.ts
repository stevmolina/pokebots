/**
 * Reads that the person does not wait for, such as the thread lists of agents that are not open. All
 * requests to a joined server share one ordered data channel, so a small answer waits behind each
 * answer sent before it. These reads go out a few at a time, and none starts while a foreground read,
 * such as the chat that the person opened, waits for its answer.
 */
export interface BackgroundReads {
  /**
   * Adds a read. A key that waits already keeps its place, and `first` moves it to the front. The read
   * runs later, so it reads its state again when it starts.
   */
  queue(key: string, read: () => Promise<unknown>, first?: boolean): void;
  /** Holds the background reads that did not start until `read` ends. Returns `read`. */
  foreground<T>(read: Promise<T>): Promise<T>;
  /** Drops the reads that did not start. A read that started ends as it does. */
  clear(): void;
}

export function createBackgroundReads(limit: number): BackgroundReads {
  let waiting = new Map<string, () => Promise<unknown>>();
  let running = 0;
  let foreground = 0;
  let scheduled: ReturnType<typeof setTimeout> | undefined;

  // A timer, not a direct start: the foreground reads of the same update, such as the chat read of the
  // agent that opens, then go out first.
  function schedule(): void {
    if (scheduled === undefined) scheduled = setTimeout(pump);
  }

  function pump(): void {
    scheduled = undefined;
    while (foreground === 0 && running < limit) {
      const next = waiting.entries().next();
      if (next.done) return;
      const [key, read] = next.value;
      waiting.delete(key);
      running += 1;
      void read()
        .catch(() => undefined)
        .finally(() => {
          running -= 1;
          schedule();
        });
    }
  }

  return {
    queue(key, read, first = false) {
      if (waiting.has(key)) {
        if (first) waiting = new Map([[key, read], ...[...waiting].filter(([other]) => other !== key)]);
      } else if (first) {
        waiting = new Map([[key, read], ...waiting]);
      } else {
        waiting.set(key, read);
      }
      schedule();
    },
    foreground(read) {
      foreground += 1;
      const release = () => {
        foreground -= 1;
        schedule();
      };
      read.then(release, release);
      return read;
    },
    clear() {
      waiting.clear();
      if (scheduled !== undefined) clearTimeout(scheduled);
      scheduled = undefined;
    },
  };
}
