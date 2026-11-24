/** Read an explicit setting before the brand layer fills in missing values. */
function readEndpoint(legacyName: string, aliasName: string): string | undefined {
  const legacy = process.env[legacyName];
  const alias = process.env[aliasName];
  if (legacy !== undefined && alias !== undefined && legacy !== alias) {
    throw new Error(`Conflicting settings: ${legacyName} and ${aliasName}.`);
  }
  return alias ?? legacy;
}

// Check both pairs before publishing either value to the existing endpoint readers.
const authApiUrl = readEndpoint("OPENBOT_AUTH_API_URL", "POKEBOTS_AUTH_API_URL");
const signalUrl = readEndpoint("OPENBOT_REMOTE_SIGNAL_URL", "POKEBOTS_REMOTE_SIGNAL_URL");
if (authApiUrl !== undefined) process.env.OPENBOT_AUTH_API_URL = authApiUrl;
if (signalUrl !== undefined) process.env.OPENBOT_REMOTE_SIGNAL_URL = signalUrl;
