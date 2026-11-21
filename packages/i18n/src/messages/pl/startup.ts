import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/startup";

export const messages = {
  "startup.failedTitle": "Nie udało się uruchomić Pokebots",
  "startup.failedBody":
    "{message}\n\nTwoje lokalne dane nie zostały zresetowane ani nadpisane. Kroki przywracania znajdziesz w przewodniku rozwiązywania problemów.",
  "startup.archiveChangedTitle": "Pliki Pokebots zostały zmienione",
  "startup.archiveChangedBody":
    "Inny program zmienił plik app.asar Pokebots. Pokebots działa teraz, ale nie uruchomi się po zamknięciu.\n\nAby naprawić Pokebots, zainstaluj go ponownie. Twoje lokalne dane zostaną zachowane.",
  "startup.archiveChangedDownload": "Pobierz Pokebots",
  "startup.filesDamagedBody":
    "Niektóre pliki Pokebots są uszkodzone lub ich brakuje.\n\nAby naprawić Pokebots, zainstaluj go ponownie. Twoje lokalne dane zostaną zachowane.",
  "startup.newerDataUpdatingTitle": "Aktualizowanie Pokebots",
  "startup.newerDataUpdatingBody":
    "Nowsza wersja Pokebots zapisała Twoje dane. Pokebots instaluje najnowszą wersję, a potem uruchomi się ponownie.\n\nTwoje lokalne dane nie zostały zresetowane ani nadpisane.",
  "startup.newerDataTitle": "Zainstaluj najnowszy Pokebots",
  "startup.newerDataBody":
    "Nowsza wersja Pokebots zapisała Twoje dane, a ta wersja ({version}) nie może ich otworzyć. Zainstaluj najnowszą wersję, aby otworzyć swoje dane.\n\nTwoje lokalne dane nie zostały zresetowane ani nadpisane.",
  "startup.newerDataDownload": "Pobierz Pokebots",
  "startup.newerDataGuide": "Otwórz przewodnik",
  "startup.newerDataQuit": "Zakończ",
  "startup.newerDataLoopTitle": "Najnowszy Pokebots się nie otworzył",
  "startup.newerDataLoopBody":
    "Nowsza wersja Pokebots zapisała Twoje dane, a ta wersja ({version}) nie może ich otworzyć. Pokebots {loopVersion} kilka razy z rzędu zatrzymał się przed otwarciem, więc nie zostanie zainstalowany ponownie.\n\nZainstaluj wersję nowszą niż {loopVersion}, gdy będzie dostępna. Aby uzyskać pomoc, otwórz przewodnik.\n\nTwoje lokalne dane nie zostały zresetowane ani nadpisane.",
  "startup.newerDataReleases": "Pokaż wydania",
  "startup.recoveryWindowTitle": "Odzyskiwanie Pokebots",
  "startup.recoveryTitle": "Pokebots się nie otworzył",
  "startup.recoveryBody": {
    one: "Pokebots {version} zatrzymał się przed otwarciem {count} raz z rzędu. Twoje lokalne dane nie zostały zresetowane ani nadpisane.",
    few: "Pokebots {version} zatrzymał się przed otwarciem {count} razy z rzędu. Twoje lokalne dane nie zostały zresetowane ani nadpisane.",
    many: "Pokebots {version} zatrzymał się przed otwarciem {count} razy z rzędu. Twoje lokalne dane nie zostały zresetowane ani nadpisane.",
    other:
      "Pokebots {version} zatrzymał się przed otwarciem {count} razy z rzędu. Twoje lokalne dane nie zostały zresetowane ani nadpisane.",
  },
  "startup.recoveryHint":
    "Spróbuj ponownie albo zainstaluj ostatnią wersję, która się otwierała. Aby uzyskać pomoc, wyeksportuj diagnostykę i wyślij plik ze zgłoszeniem.",
  "startup.recoveryHintLatest":
    "Pokebots nie znalazł wcześniejszej wersji, która może otworzyć Twoje dane. Spróbuj ponownie albo zainstaluj najnowszą wersję. Aby uzyskać pomoc, wyeksportuj diagnostykę i wyślij plik ze zgłoszeniem.",
  "startup.recoveryRetry": "Spróbuj ponownie",
  "startup.recoveryPreviousVersion": "Pobierz poprzednią wersję",
  "startup.recoveryLatestVersion": "Pobierz najnowszą wersję",
  "startup.recoveryExportDiagnostics": "Eksportuj diagnostykę",
  "startup.recoveryOpenDataFolder": "Otwórz folder danych",
  "startup.recoveryQuit": "Zakończ",
  "startup.recoveryDiagnosticsSaved": "Plik diagnostyki został zapisany.",
  "startup.recoveryActionFailed": "Pokebots nie mógł wykonać tej czynności.",
} as const satisfies PartialTranslation<typeof source>;
