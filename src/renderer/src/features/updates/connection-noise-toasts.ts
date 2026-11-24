import { sourceText } from "@pokebots/i18n";
import { useText } from "@pokebots/ui/text";
import { setToastErrorMute } from "@pokebots/ui/toast";
import { onSettled } from "solid-js";
import { statusAlertsShown } from "./status-alerts";

/**
 * Errors of a server connection. The sidebar and the composer already show that a server is offline
 * or connects again, so a toast for each failed request only piles up the same words.
 */
const CONNECTION_NOISE = [
  "error.remote.hostOffline",
  "error.remote.hostConnectionOffline",
  "error.remote.hostUnreachable",
  "webClient.error.requestIncomplete",
  "webClient.error.connectionUnavailable",
  "webClient.error.connectionChanging",
  "webClient.error.connectionClosed",
  "webClient.error.hostChanged",
] as const;

/**
 * When status alerts are off, connection errors show no toast, on the desktop and in the web client.
 */
export function ConnectionNoiseToasts() {
  const { t } = useText();
  onSettled(() => {
    if (statusAlertsShown()) return;
    // The main process sends English source text, which a toast can show as it came.
    const english = new Set<string>([
      sourceText("error.remote.hostOffline"),
      sourceText("error.remote.hostConnectionOffline"),
      sourceText("error.remote.hostUnreachable"),
    ]);
    return setToastErrorMute((words) => english.has(words) || CONNECTION_NOISE.some((key) => words === t(key)));
  });
  return null;
}
