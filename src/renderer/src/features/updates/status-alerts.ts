/**
 * Pokebots keeps background status alerts off: the "Reconnecting to" and "Connection restored"
 * notices, the notices of a server that restarts into an update, the version difference warning,
 * the update dialog that opens when the user enters a server, and the automatic What's New dialog.
 * Alerts that answer an action of the user stay on. Server Settings > Updates still shows updates.
 * Keep the switch in this one file, so that the daily upstream merge keeps the call sites.
 */
export function statusAlertsShown(): boolean {
  return false;
}
