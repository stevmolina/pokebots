/**
 * Pokebots keeps background status alerts off: the "Reconnecting to" and "Connection restored"
 * notices, the notices of a server that restarts into an update, the version difference warning,
 * the update dialog that opens when the user enters a server, the automatic What's New dialog, the
 * web client's connection error toasts ("The server could not complete this request") and its "new
 * version" toast (the new version installs when the user leaves the page).
 * Alerts that answer an action of the user stay on. Server Settings > Updates still shows updates.
 * Keep the switch in this one file, so that the daily upstream merge keeps the call sites.
 */
export function statusAlertsShown(): boolean {
  return false;
}
