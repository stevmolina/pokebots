const { withEntitlementsPlist } = require("expo/config-plugins");
const { existsSync } = require("node:fs");
const { join } = require("node:path");

// Android notifications come through Firebase Cloud Messaging, which needs the Firebase file of the
// app. The file is optional, so the app builds before the Firebase project exists, and such a build
// gets no notifications on Android. The file has public identifiers only; the account service has the
// key that sends.
const GOOGLE_SERVICES_FILE = "./google-services.json";

// A personal iOS build is signed by a free Apple Account ("Personal Team") for one's own iPhone.
// `scripts/mobile-ios-personal.ts` turns it on. A free account cannot sign push notifications, App
// Groups or associated domains, so this build drops the parts that need them: the widgets, the
// share extension, the notification service extension, the shortcuts and the push entitlement.
// It also turns off over-the-air updates, because the update server sends the official app's code.
const PERSONAL_ENV = "OPENBOT_IOS_PERSONAL";
const PERSONAL_BUNDLE_ID_ENV = "OPENBOT_IOS_PERSONAL_BUNDLE_ID";
const PERSONAL_NAME_ENV = "OPENBOT_IOS_PERSONAL_NAME";
const PERSONAL_DROPPED_PLUGINS = new Set([
  "expo-notifications",
  "expo-widgets",
  "./plugins/with-notification-service",
  "./plugins/with-shortcuts",
]);

// Expo applies `expo-notifications` even when the plugin list leaves it out, so its push entitlement
// is removed after the other plugins have run.
/** @type {import('expo/config-plugins').ConfigPlugin} */
const withoutPushEntitlement = (config) =>
  withEntitlementsPlist(config, (mod) => {
    delete mod.modResults["aps-environment"];
    return mod;
  });

/** @param {import('expo/config').ExpoConfig} config */
function personalIosConfig(config) {
  const plugins = (config.plugins ?? [])
    .filter((plugin) => !PERSONAL_DROPPED_PLUGINS.has(Array.isArray(plugin) ? plugin[0] : plugin))
    .map((plugin) =>
      Array.isArray(plugin) && plugin[0] === "./plugins/with-share-target"
        ? [plugin[0], { ...plugin[1], ios: { ...plugin[1].ios, enabled: false } }]
        : plugin,
    );
  const { appleTeamId: _team, associatedDomains: _domains, ...ios } = config.ios ?? {};
  return withoutPushEntitlement({
    ...config,
    name: process.env[PERSONAL_NAME_ENV] || config.name,
    ios: { ...ios, bundleIdentifier: process.env[PERSONAL_BUNDLE_ID_ENV] || "xyz.pokebots.personal" },
    plugins,
    updates: { ...config.updates, enabled: false },
  });
}

/** @param {{ config: import('expo/config').ExpoConfig }} context */
module.exports = ({ config }) => {
  const withFirebase = existsSync(join(__dirname, GOOGLE_SERVICES_FILE))
    ? { ...config, android: { ...config.android, googleServicesFile: GOOGLE_SERVICES_FILE } }
    : config;
  return process.env[PERSONAL_ENV] === "1" ? personalIosConfig(withFirebase) : withFirebase;
};
