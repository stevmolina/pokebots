import { useText } from "@pokebots/ui/text";
import { setToastErrorAction, toast } from "@pokebots/ui/toast";
import { onSettled } from "solid-js";
import { statusAlertsShown } from "../updates/status-alerts";
import { applyWebUpdate, onWebUpdateReady, registerWebServiceWorker } from "./web-service-worker";

const UPDATE_TOAST_ID = "web-update-ready";

/**
 * Starts the service worker of the web client, and offers a reload when a new version is waiting. It
 * shows nothing otherwise. "Reload" makes the new worker active, and the page reloads once.
 *
 * When status alerts are off, a new version installs without a notice: it reloads the page the next
 * time the user leaves it. `ConnectionNoiseToasts` hides the connection error toasts.
 */
export function WebServiceWorkerUpdates() {
  const { t } = useText();
  onSettled(() => {
    const quiet = !statusAlertsShown();
    // A request that failed with "refresh before trying again" offers the refresh itself, and a new
    // version that waits is activated by it, as for an update.
    const stopOffering = setToastErrorAction((words) =>
      words === t("webClient.error.requestIncomplete")
        ? { label: t("webClient.update.reload"), onClick: () => void applyWebUpdate() }
        : undefined,
    );
    registerWebServiceWorker();
    let updateWaits = false;
    const applyWhenHidden = () => {
      if (updateWaits && document.visibilityState === "hidden") void applyWebUpdate();
    };
    if (quiet) document.addEventListener("visibilitychange", applyWhenHidden);
    const stopWatching = onWebUpdateReady(() => {
      if (quiet) {
        updateWaits = true;
        applyWhenHidden();
        return;
      }
      toast(t("webClient.update.ready"), {
        id: UPDATE_TOAST_ID,
        duration: Number.POSITIVE_INFINITY,
        action: { label: t("webClient.update.reload"), onClick: () => void applyWebUpdate() },
      });
    });
    return () => {
      stopOffering();
      stopWatching();
      document.removeEventListener("visibilitychange", applyWhenHidden);
    };
  });
  return null;
}
