import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/window";

export const messages = {
  "window.localHostTitle": "Computador anfitrião local do Pokebots",
  "window.localClientTitle": "Cliente local do Pokebots",
  "window.computerUsePermissionTitle": "Ativar Uso do computador",
} as const satisfies PartialTranslation<typeof source>;
