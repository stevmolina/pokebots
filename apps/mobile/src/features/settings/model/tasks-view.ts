import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

const key = "openbot.mobile.tasksView.v1";

export type MobileTasksView = "list" | "board";

/**
 * The view of the Threads page: a list or the Board. Each device keeps its own choice: it is not synced
 * to the host or to the other devices.
 */
export const useTasksViewPreference = create<{ view: MobileTasksView; ready: boolean }>(() => ({
  view: "list",
  ready: false,
}));

export async function loadTasksViewPreference(): Promise<void> {
  if (useTasksViewPreference.getState().ready) return;
  try {
    const stored = await SecureStore.getItemAsync(key);
    // A second startup read must not overwrite a change made on the page.
    if ((stored === "list" || stored === "board") && !useTasksViewPreference.getState().ready) {
      useTasksViewPreference.setState({ view: stored });
    }
  } finally {
    useTasksViewPreference.setState({ ready: true });
  }
}

/** The writes run one after the other, so the last choice is the one that stays. */
let writes: Promise<void> = Promise.resolve();

export function saveTasksViewPreference(view: MobileTasksView): Promise<void> {
  // Apply immediately, also when storage fails: the page then keeps the choice until the app restarts.
  useTasksViewPreference.setState({ view, ready: true });
  const write = writes.then(() => SecureStore.setItemAsync(key, view));
  writes = write.catch(() => undefined);
  return write;
}
