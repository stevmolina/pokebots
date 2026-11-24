import { httpsLiveViewUrl } from "@pokebots/contracts/ipc";
import { Effect, Result } from "effect";
import type { AgentComputerApi } from "../backend/agent-computer/agent-computer-api";
import type { IntegrationCredential } from "../backend/integration-credential";
import { AgentComputerServiceFailed } from "./agent-computer-service";

/** The person who pressed Open live view on a chat card, as this host knows them. */
export interface ComputerLiveViewRequester {
  /** An owner or admin may open the machines of this host's Agent Computer key. */
  canAdminister: boolean;
  /** The person's own Pokebots account credential, when this host can use it. */
  credential: IntegrationCredential<"computer"> | undefined;
}

/**
 * The https live view link of one machine that `requester` may open, or null. The host's Agent Computer
 * key lists the machines that the server's agents start, and only an owner or admin reads it. A person's
 * own account lists the machines that their turns start (`#computerAccount` in the tool router), and
 * only that person reads it. A list that cannot be read is skipped; the lookup fails only when no list
 * had the machine and one of them failed. `AgentComputerApi.list` registers each link for redaction.
 */
export const computerLiveViewUrl = Effect.fn("computerLiveViewUrl")(function* (
  api: AgentComputerApi,
  requester: ComputerLiveViewRequester,
  machineId: string,
) {
  const sources = [
    ...(requester.canAdminister && api.connected() ? [api] : []),
    ...(requester.credential ? [api.forAccount(requester.credential)] : []),
  ];
  let failure: AgentComputerServiceFailed | undefined;
  for (const source of sources) {
    const listed = yield* Effect.result(source.list());
    if (Result.isFailure(listed)) {
      failure ??= new AgentComputerServiceFailed({ cause: new Error(listed.failure.message) });
      continue;
    }
    const url = httpsLiveViewUrl(listed.success.find((machine) => machine.id === machineId)?.live_view_url);
    if (url) return url;
  }
  if (failure) return yield* Effect.fail(failure);
  return null;
});
