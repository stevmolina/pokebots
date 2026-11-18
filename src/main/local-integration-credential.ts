import type { CentralAuthManager } from "./central-auth-manager";
import { type IntegrationAudience, localIntegrationCredential } from "./integration-credentials";

export function currentIntegrationCredential<Audience extends IntegrationAudience>(
  auth: Pick<CentralAuthManager, "getState" | "requestIntegrationBearer" | "integrationAccountsAvailable">,
  audience: Audience,
) {
  if (!auth.integrationAccountsAvailable()) return undefined;
  const state = auth.getState();
  return state.status === "signed_in" ? localIntegrationCredential(auth, state.user.id, { audience }) : undefined;
}
