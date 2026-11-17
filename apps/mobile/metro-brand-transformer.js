// The brand layer of the phone app (Steven's fork). `metro.config.js` uses this Babel transformer only
// when `OPENBOT_BRAND_NAME` is set, as `scripts/mobile-ios-personal.ts` does for the Pokebots build.
// It changes "OpenBot" to the brand name in the text catalogs (`packages/i18n/src/messages`) with the
// same rules as the desktop and web builds (`scripts/brand-layer.ts`): keys, lowercase addresses and
// the kept phrases stay. Every other file goes to Expo's transformer unchanged.

const path = require("node:path");

const { brandModule, readBrandSettings } = require("../../scripts/brand-layer.ts");

const upstream = require(process.env.OPENBOT_BRAND_UPSTREAM_TRANSFORMER);
const settings = readBrandSettings(process.env);
const repositoryRoot = path.resolve(__dirname, "../..");

module.exports = {
  ...upstream,
  transform(args) {
    if (!settings) return upstream.transform(args);
    const file = path.relative(repositoryRoot, path.resolve(args.options.projectRoot, args.filename));
    const branded = brandModule(file.split(path.sep).join("/"), args.src, settings);
    return upstream.transform(branded ? { ...args, src: branded.code } : args);
  },
  // The brand name is part of the cache key, so a build with another name, or none, transforms again.
  getCacheKey(...args) {
    const base = upstream.getCacheKey ? upstream.getCacheKey(...args) : "";
    return `${base}:brand=${settings?.name ?? ""}`;
  },
};
