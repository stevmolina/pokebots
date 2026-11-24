import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/status/host";

export const messages = {
  "status.host.registered": "Zarejestrowano ten Pokebots do dostępu przez WebRTC.",
  "status.host.keyRotated": "Zmieniono klucz serwera. Sparowane urządzenia pozostają sparowane.",
  "status.host.identityUpdated": "Zaktualizowano tożsamość serwera.",
  "status.host.starting": "Uruchamianie hosta WebRTC…",
  "status.host.ready": "Ten Pokebots jest gotowy na połączenia WebRTC.",
  "status.host.signalLost": "Inne urządzenia nie mogą teraz połączyć się z tym Pokebotsem. Łączy się ponownie.",
  "status.host.stopping": "Ustawianie tego serwera Pokebots jako prywatnego…",
  "status.host.private": "Ten Pokebots jest prywatny.",
  "status.host.removed": "Ten Pokebots został usunięty z Twojego konta. Opublikuj go ponownie, aby go udostępnić.",
} as const satisfies PartialTranslation<typeof source>;
