// Optional human-only machine controls. The existing account contract stays unchanged.
import { adminRoute, fields, list, nullable, oneOf, string } from "./admin-wire";
export const COMPUTER_MANAGEMENT_CAPABILITY = "computer-management-v1";
export const COMPUTER_MANAGEMENT_ROUTE = "/v1/admin/agent-computer/manage";
export const COMPUTER_MANAGEMENT_CODECS = new Map([
  [
    COMPUTER_MANAGEMENT_ROUTE,
    adminRoute(
      fields({
        operation: oneOf("list", "start", "stop", "destroy", "screenshot"),
        target: string(256),
        size: oneOf("standard", "large"),
        confirm: oneOf("yes", "no"),
      }),
      fields({
        screenshot: nullable(string(1_500_000)),
        sizes: list(fields({ id: string(256), size: nullable(string(64)) }), 200),
      }),
    ),
  ],
]);
