interface CounterEntry {
  count: number;
  resetAt: number;
}

export function createMemoryRateLimiter(options: { limit: number; periodSeconds: number }): RateLimit {
  const windowMs = options.periodSeconds * 1_000;
  const counters = new Map<string, CounterEntry>();
  let lastPrune = Date.now();

  return {
    async limit({ key }: { key: string }): Promise<{ success: boolean }> {
      const now = Date.now();
      if (now - lastPrune >= windowMs) {
        for (const [entryKey, entry] of counters) {
          if (entry.resetAt <= now) counters.delete(entryKey);
        }
        lastPrune = now;
      }
      const existing = counters.get(key);
      if (!existing || existing.resetAt <= now) {
        counters.set(key, { count: 1, resetAt: now + windowMs });
        return { success: true };
      }
      if (existing.count >= options.limit) {
        return { success: false };
      }
      existing.count += 1;
      return { success: true };
    },
  };
}
