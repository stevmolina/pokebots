import { createOpenBotLogger } from "@pokebots/logging";
import type { WorkerBindings } from "../server/types";

const logger = createOpenBotLogger("self-hosted-background");

interface SharedState {
  env: WorkerBindings | undefined;
  pendingPromises: Set<Promise<unknown>>;
}

declare global {
  var openbotSelfHostedWorkerState: SharedState | undefined;
}
function getState(): SharedState {
  globalThis.openbotSelfHostedWorkerState ??= { env: undefined, pendingPromises: new Set() };
  return globalThis.openbotSelfHostedWorkerState;
}

// Vite bundles this module separately. Both copies read the same process-owned state.
export let env = getState().env;
export function setSelfHostedEnv(bindings: WorkerBindings): void {
  getState().env = bindings;
  env = bindings;
}

export function waitUntil(promise: Promise<unknown>): void {
  const { pendingPromises } = getState();
  const tracked = Promise.resolve(promise).catch(() => {
    logger.error("Self-hosted waitUntil task failed.");
  });
  pendingPromises.add(tracked);
  void tracked.finally(() => {
    pendingPromises.delete(tracked);
  });
}

export async function drainWaitUntil(timeoutMs = 5_000): Promise<void> {
  const { pendingPromises } = getState();
  if (pendingPromises.size === 0) return;
  await Promise.race([
    Promise.allSettled([...pendingPromises]),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
