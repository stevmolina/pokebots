/**
 * Custom URI schemes accepted for desktop and mobile deep links during the Pokebots transition.
 *
 * `openbot:` stays the canonical emitted scheme for existing installs during Release A. `pokebots:`
 * is accepted alongside it on every deep-link parser without changing wire protocols or OS
 * protocol registrations.
 */
export const OPENBOT_DEEP_LINK_PROTOCOL = "openbot:";
export const POKEBOTS_DEEP_LINK_PROTOCOL = "pokebots:";

const SUPPORTED_DEEP_LINK_SCHEME_PREFIX = /^(?:openbot|pokebots):/iu;

export function isSupportedDeepLinkProtocol(protocol: string): boolean {
  return protocol === OPENBOT_DEEP_LINK_PROTOCOL || protocol === POKEBOTS_DEEP_LINK_PROTOCOL;
}

export function hasSupportedDeepLinkScheme(value: string): boolean {
  return SUPPORTED_DEEP_LINK_SCHEME_PREFIX.test(value);
}
