import type { CentralAuthManager } from "./central-auth-manager";
import { type IntegrationAudience, localIntegrationCredential } from "./integration-credentials";

export function currentIntegrationCredential<Audience extends IntegrationAudience>(
  auth: Pick<CentralAuthManager, "getState" | "requestIntegrationBearer" | "resolveApiUrl">,
  audience: Audience,
) {
  if (new URL(auth.resolveApiUrl("/")).origin !== "https://api.pokebots.xyz") return undefined;
  const state = auth.getState();
  return state.status === "signed_in" ? localIntegrationCredential(auth, state.user.id, { audience }) : undefined;
}
