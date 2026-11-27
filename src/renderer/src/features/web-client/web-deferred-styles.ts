// Styles for screens that open after the first chat. The web build leaves the same files out of
// the first stylesheet (`DEFERRED_WEB_STYLES` in `scripts/web-stylesheet.ts`). Import this module
// only when one of those screens opens.
import "@pokebots/ui/features/billing/billing.css";
import "@pokebots/ui/features/servers/add-server-dialog.css";
import "@pokebots/ui/features/servers/create-local-server-dialog.css";
import "@pokebots/ui/features/servers/hosted-pricing-page.css";
import "@pokebots/ui/features/servers/install-server-dialog.css";
import "@pokebots/ui/features/servers/server-audit-log.css";
import "@pokebots/ui/features/servers/server-roles.css";
import "@pokebots/ui/features/settings/integration-layout.css";
import "@pokebots/ui/features/settings/mcp-connect-dialog.css";
import "@pokebots/ui/features/settings/notification-matrix.css";
import "@pokebots/ui/features/settings/plan-start.css";
import "@pokebots/ui/features/settings/profile.css";
import "@pokebots/ui/features/settings/provider-settings-page.css";
import "@pokebots/ui/features/tasks/tasks.css";
import "../servers/server-mcp.css";
import "../servers/server-settings-modal.css";
import "../settings/settings-modal.css";

/** The module is a stylesheet. The value gives the dynamic import a result. */
export const webDeferredStylesLoaded = true;
