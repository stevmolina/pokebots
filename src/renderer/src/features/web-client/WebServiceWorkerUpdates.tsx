import { useText } from "@openbot/ui/text";
import { setToastErrorAction, toast } from "@openbot/ui/toast";
import { onSettled } from "solid-js";
import { applyWebUpdate, onWebUpdateReady, registerWebServiceWorker } from "./web-service-worker";

const UPDATE_TOAST_ID = "web-update-ready";

/**
 * Starts the service worker of the web client, and offers a reload when a new version is waiting. It
 * shows nothing otherwise. "Reload" makes the new worker active, and the page reloads once.
 */
export function WebServiceWorkerUpdates() {
  const { t } = useText();
  onSettled(() => {
    // A request that failed with "refresh before trying again" offers the refresh itself, and a new
    // version that waits is activated by it, as for an update.
    const stopOffering = setToastErrorAction((words) =>
      words === t("webClient.error.requestIncomplete")
        ? { label: t("webClient.update.reload"), onClick: () => void applyWebUpdate() }
        : undefined,
    );
    registerWebServiceWorker();
    const stopWatching = onWebUpdateReady(() => {
      toast(t("webClient.update.ready"), {
        id: UPDATE_TOAST_ID,
        duration: Number.POSITIVE_INFINITY,
        action: { label: t("webClient.update.reload"), onClick: () => void applyWebUpdate() },
      });
    });
    return () => {
      stopOffering();
      stopWatching();
    };
  });
  return null;
}
