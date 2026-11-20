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
const POSTHOG_KEY_ENV = "EXPO_PUBLIC_POSTHOG_KEY";
const POSTHOG_HOST_ENV = "EXPO_PUBLIC_POSTHOG_HOST";
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

// The Pokebots look of the personal build, when `OPENBOT_BRAND_NAME` is "Pokebots": the Pokebots app
// icon, a light blue splash with the mascot, and `extra.brand`, which `src/shared/lib/app-brand.ts`
// reads for the colors and the mascot inside the app. The store build never reads these values.
const BRAND_NAME_ENV = "OPENBOT_BRAND_NAME";
const POKEBOTS_ICON = "./assets/pokebots/app-icon.png";
const POKEBOTS_SPLASH = {
  backgroundColor: "#D5E5FD",
  image: "./assets/pokebots/mark.png",
  imageWidth: 150,
  resizeMode: "contain",
  // The dark block is the light one mixed half with the dark canvas, as `bloub-look.ts` draws it.
  dark: { backgroundColor: "#757D89", image: "./assets/pokebots/mark.png" },
};

/** @param {import('expo/config').ExpoConfig} config */
function personalIosConfig(config) {
  const pokebots = process.env[BRAND_NAME_ENV] === "Pokebots";
  const plugins = (config.plugins ?? [])
    .filter((plugin) => !PERSONAL_DROPPED_PLUGINS.has(Array.isArray(plugin) ? plugin[0] : plugin))
    // The other app icons are the OpenBot logo colors, so the Pokebots build has its one icon.
    .filter((plugin) => !(pokebots && plugin === "./plugins/with-app-icons"))
    .map((plugin) => {
      if (Array.isArray(plugin) && plugin[0] === "./plugins/with-share-target")
        return [plugin[0], { ...plugin[1], ios: { ...plugin[1].ios, enabled: false } }];
      if (pokebots && Array.isArray(plugin) && plugin[0] === "expo-splash-screen")
        return [plugin[0], { ...plugin[1], ...POKEBOTS_SPLASH }];
      return plugin;
    });
  const { appleTeamId: _team, associatedDomains: _domains, ...ios } = config.ios ?? {};
  return withoutPushEntitlement({
    ...config,
    name: process.env[PERSONAL_NAME_ENV] || config.name,
    ios: {
      ...ios,
      bundleIdentifier: process.env[PERSONAL_BUNDLE_ID_ENV] || "xyz.pokebots.personal",
      ...(pokebots ? { icon: POKEBOTS_ICON } : {}),
    },
    plugins,
    updates: { ...config.updates, enabled: false },
    extra: { ...config.extra, ...(pokebots ? { brand: "pokebots" } : {}) },
  });
}

/** @param {{ config: import('expo/config').ExpoConfig }} context */
module.exports = ({ config }) => {
  const withFirebase = existsSync(join(__dirname, GOOGLE_SERVICES_FILE))
    ? { ...config, android: { ...config.android, googleServicesFile: GOOGLE_SERVICES_FILE } }
    : config;
  const withPostHog = {
    ...withFirebase,
    extra: {
      ...withFirebase.extra,
      posthogProjectToken: process.env[POSTHOG_KEY_ENV],
      posthogHost: process.env[POSTHOG_HOST_ENV],
    },
  };
  return process.env[PERSONAL_ENV] === "1" ? personalIosConfig(withPostHog) : withPostHog;
};
