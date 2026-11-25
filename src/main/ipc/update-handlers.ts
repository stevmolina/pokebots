// The application updater, its preferences, and the restart an admin of a joined server asked for.

import { runCauseEffect } from "../../backend/effect-boundary";
import type { IdleRestart } from "../idle-restart";
import { approvePokebotsUpdate, checkPokebotsUpdate, pokebotsUpdateStatus } from "../pokebots-update-job";
import type { RequestedUpdate } from "../requested-update";
import { readUpdatePreference } from "../update-preference-store";
import type { UpdateService } from "../update-service";
import { parseIdleRestartTarget, parseUpdatePreference } from "./app-inputs";
import { handler, type IpcGroupHandlers, payloadHandler } from "./define-ipc-group";

export interface UpdateIpcDependencies {
  updater: UpdateService;
  updatePreferenceFile: string;
  usePokebotsUpdateJob?: boolean;
  requestedUpdate: Pick<RequestedUpdate, "cancel" | "setPreference">;
  idleRestart: Pick<IdleRestart, "request" | "cancel">;
}

export function updateIpcHandlers({
  updater,
  updatePreferenceFile,
  usePokebotsUpdateJob,
  requestedUpdate,
  idleRestart,
}: UpdateIpcDependencies): Pick<IpcGroupHandlers, "update"> {
  const getStatus = () => {
    const status = updater.getStatus();
    return usePokebotsUpdateJob ? pokebotsUpdateStatus(status.currentVersion) : status;
  };

  return {
    update: {
      getStatus: handler(getStatus),
      check: handler(async () => {
        if (!usePokebotsUpdateJob) return runCauseEffect(updater.checkForUpdates());
        await checkPokebotsUpdate();
        return getStatus();
      }),
      download: handler(() => runCauseEffect(updater.downloadUpdate())),
      install: handler(() =>
        usePokebotsUpdateJob ? approvePokebotsUpdate() : runCauseEffect(updater.installUpdate()),
      ),
      getPreference: handler(() => runCauseEffect(readUpdatePreference(updatePreferenceFile))),
      setPreference: payloadHandler(parseUpdatePreference, (parsed) =>
        runCauseEffect(requestedUpdate.setPreference(parsed)),
      ),
      cancelScheduledRestart: handler(() => {
        requestedUpdate.cancel();
        return updater.getStatus();
      }),
      restartWhenIdle: payloadHandler(parseIdleRestartTarget, (target) => idleRestart.request(target)),
      cancelIdleRestart: handler(() => idleRestart.cancel()),
    },
  };
}
