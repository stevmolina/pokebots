import { defineMessages } from "../../../message";

export const messages = defineMessages("error.update", {
  // Updater state the user reads.
  "error.update.unsupported": "Updates are available in installed desktop builds.",
  "error.update.notReady": "An update is not ready to install.",
  "error.update.restartFailed": "Pokebots could not restart to install the update.",
  "error.update.downloadStalled": "The update download stopped responding. Try again.",
  "error.update.installFailed": "Could not install the update. Quit and reopen Pokebots, then try again.",
  "error.update.jobOff": "Updates are off.",
  "error.update.jobStartFailed":
    "Could not turn updates back on. Run scripts/custom-auto-update-setup.sh in the Pokebots checkout.",
  "error.update.notInstalled": "The last restart did not install the update. Restart to try again.",
  "error.update.downloadFailed": "Could not download the update. Try again.",
  "error.update.checkFailed": "Could not check for updates. Try again.",
  "error.update.checkStalled": "The update check stopped responding. Try again.",
  "error.update.checkOffline": "Could not reach the update service. Check your internet connection, then try again.",
  "error.update.checkUnavailable":
    "The update service did not answer. Pokebots tries again on its own in a few minutes.",
  "error.update.checkNoRelease":
    "No published update was found for this platform. Pokebots tries again on its own in a few minutes.",
  "error.update.managedByNix": "Nix installs updates for this copy of Pokebots. Update it with Nix.",
  "error.update.managedByHost":
    "Updates on this Mac are installed by the host. The update stays ready until the host's maintenance runs.",
  "error.update.siblingSession":
    "Another Pokebots session is still running from this application. Stop Pokebots in every other macOS user account first, then install the update again.",
  "error.update.siblingSessionSameAccount":
    "Another Pokebots process is still running in this user account. Quit it, then install the update again.",
  "error.update.siblingCheckFailed": "Could not verify other Pokebots sessions. Try again before installing.",
  "error.update.readOnlyLocation":
    "Pokebots cannot install updates from this location. Quit Pokebots. In Finder, drag Pokebots into the Applications folder (if it is already there, drag it out and back in). Then open Pokebots and install the update again.",
  "error.update.appImageMissing":
    "Pokebots cannot install the update because its AppImage file was moved, renamed or replaced. Quit Pokebots, then open the AppImage file again.",
  "error.update.appImageReadOnly":
    "Pokebots cannot install updates in the folder of its AppImage file. Quit Pokebots, move the AppImage file to a folder in your home folder, then open it and install the update again.",
  // A joined server's admin reads these from the host.
  "error.update.remoteDisabled": "Updates from server admins are turned off on this computer.",
  "error.update.restartStarted": "Pokebots is already restarting to install the update.",
  "error.update.alreadyRestarting": "Pokebots is already restarting.",
});
