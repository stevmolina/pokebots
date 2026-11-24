import { posthog } from "@/features/analytics/posthog";

/**
 * The only logger exported to PostHog Logs. Keep call sites limited to the lifecycle
 * outcomes below so existing console and support logs remain local to the device.
 */
export const posthogLog = {
  appInitialized(): void {
    posthog?.logger.info("mobile application initialized", { event: "mobile_application_initialized" });
  },
  sessionEstablished(): void {
    posthog?.logger.info("mobile session established", { event: "mobile_session_established" });
  },
  sessionCleared(): void {
    posthog?.logger.info("mobile session cleared", { event: "mobile_session_cleared" });
  },
};
