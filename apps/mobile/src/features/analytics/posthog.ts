import Constants from "expo-constants";
import PostHog from "posthog-react-native";

type PostHogConfig = {
  posthogHost?: string;
  posthogProjectToken?: string;
};

const config = Constants.expoConfig?.extra as PostHogConfig | undefined;
const projectToken = config?.posthogProjectToken;
const host = config?.posthogHost;

function reportMissingConfiguration(variable: string): void {
  if (!__DEV__) return;
  console.error(
    new Error(
      `${variable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${variable} is configured`,
    ),
  );
}

if (!projectToken) reportMissingConfiguration("EXPO_PUBLIC_POSTHOG_KEY");
if (!host) reportMissingConfiguration("EXPO_PUBLIC_POSTHOG_HOST");

export const posthog =
  projectToken && host
    ? new PostHog(projectToken, {
        host,
        logs: {
          serviceName: "openbot-mobile",
        },
        errorTracking: {
          autocapture: {
            uncaughtExceptions: true,
            unhandledRejections: true,
          },
        },
      })
    : null;
