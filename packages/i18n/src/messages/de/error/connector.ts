import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/error/connector";

export const messages = {
  "error.connector.githubUnavailable": "Diese Version von OpenBot hat keine GitHub App.",
  "error.connector.githubDenied": "Die GitHub-Anmeldung wurde abgelehnt.",
  "error.connector.githubCodeExpired": "Der GitHub-Code ist abgelaufen. Verbinde GitHub erneut.",
  "error.connector.githubDeviceFlowDisabled": "Die GitHub App erlaubt keine Geräteanmeldung.",
  "error.connector.githubClientUnknown": "GitHub kennt die Client ID dieser GitHub App nicht.",
  "error.connector.githubUnexpected": "GitHub hat eine unerwartete Antwort gesendet: {detail}",
  "error.connector.githubUnreachable": "OpenBot kann GitHub nicht erreichen: {detail}",
  "error.connector.githubExpired": "Die GitHub-Verbindung ist abgelaufen. Verbinde GitHub erneut.",
  "error.connector.githubFileUnreadable": "Die GitHub-Verbindungsdatei ist nicht lesbar.",
  "error.connector.githubFileTooLarge": "Die GitHub-Verbindungsdatei ist zu groß.",
  "error.connector.onePasswordCliMissing":
    "OpenBot kann die 1Password CLI nicht finden. Installiere sie und aktiviere ihre Integration in der 1Password-App oder verwende ein Dienstkonto-Token.",
  "error.connector.onePasswordCliInstallFailed":
    "OpenBot konnte die 1Password CLI nicht installieren. Prüfe die Internetverbindung und versuche es erneut.",
  "error.connector.onePasswordCliSignedOut":
    "Die 1Password CLI ist nicht angemeldet. Aktiviere ihre Integration in der 1Password-App und verbinde sie erneut.",
  "error.connector.onePasswordAppUnreachable":
    "OpenBot erreicht die 1Password-App nicht. Öffne 1Password und entsperre es. Prüfe unter Einstellungen > Entwickler, dass „In 1Password CLI integrieren“ aktiv ist. Versuche es dann erneut.",
  "error.connector.onePasswordCliFailed": "Die 1Password CLI ist fehlgeschlagen: {detail}",
  "error.connector.onePasswordCliForbidden":
    "Dein 1Password-Konto erlaubt dir nicht, den geteilten Tresor oder ein Dienstkonto zu erstellen. Bitte einen Inhaber oder Administrator des Kontos um diese Berechtigung, oder bitte ihn um ein Dienstkonto-Token und klicke auf „Token verwenden“.",
  "error.connector.onePasswordUnexpected": "1Password hat eine unerwartete Antwort gesendet: {detail}",
  "error.connector.onePasswordTokenRejected": "1Password hat das Dienstkonto-Token nicht akzeptiert.",
  "error.connector.onePasswordUnreachable":
    "OpenBot konnte keine Verbindung zu 1Password herstellen. Prüfe die Internetverbindung und versuche es erneut.",
  "error.connector.onePasswordRateLimited":
    "1Password hat zu viele Anfragen erhalten. Warte ein paar Minuten und versuche es erneut.",
  "error.connector.onePasswordNoVault":
    "Das Dienstkonto kann keinen Tresor lesen. Gib ihm Zugriff auf einen Tresor und versuche es erneut.",
  "error.connector.onePasswordFileUnreadable": "Die 1Password-Verbindungsdatei ist nicht lesbar.",
  "error.connector.onePasswordFileTooLarge": "Die 1Password-Verbindungsdatei ist zu groß.",
  "error.connector.bitwardenFailed":
    "Bitwarden konnte nicht gelesen werden. Installiere die bw CLI, melde dich an, entsperre sie und erstelle einen Ordner mit dem Namen „Shared with OpenBot“. Verbinde dich mit einem neuen Sitzungsschlüssel.",
  "error.connector.bitwardenCliMissing":
    "OpenBot findet die Bitwarden CLI nicht. Installiere bw, prüfe, dass es in einem neuen Terminal funktioniert, und verbinde dich dann erneut.",
  "error.connector.bitwardenFolderMissing":
    "Bitwarden muss genau einen Ordner mit dem Namen „Shared with OpenBot“ haben. Erstelle ihn oder entferne den zusätzlichen Ordner und verbinde dich dann erneut.",
  "error.connector.bitwardenHostInput":
    "Gib eine HTTPS-Serveradresse, client_id und client_secret des API-Schlüssels und das Master-Passwort ein.",
  "error.connector.bitwardenHostFailed":
    "Bitwarden konnte auf diesem Server nicht geöffnet werden. Prüfe die Serveradresse, den API-Schlüssel und das Master-Passwort und stelle sicher, dass ein Ordner Shared with OpenBot heißt. Verbinde dann erneut.",
  "error.connector.bitwardenCliInstallFailed":
    "Die Bitwarden CLI konnte auf diesem Server nicht installiert werden. Prüfe seine Netzwerkverbindung und verbinde dann erneut.",
  "error.connector.bitwardenFileUnreadable": "Die Bitwarden-Verbindungsdatei ist nicht lesbar.",
  "error.connector.passwordManagerUnknown": "OpenBot kennt diesen Passwortmanager nicht.",
  "error.connector.passwordManagerMethod": "Dieser Passwortmanager kann sich so nicht verbinden.",
  "error.connector.passwordManagerNoSignIn": "Keine Anmeldeseite ist offen. Verbinde erneut.",
  "error.connector.protonPassFailed": "Proton Pass konnte nicht verbunden werden. Verbinde erneut.",
  "error.connector.protonPassCliInstallFailed":
    "Die Proton Pass CLI konnte nicht installiert werden. Prüfe die Netzwerkverbindung und verbinde dann erneut.",
  "error.connector.protonPassPlan":
    "Dein Proton-Tarif erlaubt die Proton Pass CLI nicht. Ändere den Tarif und verbinde dann erneut.",
  "error.connector.protonPassPlanMissing":
    "Dein Proton-Tarif enthält die Proton Pass CLI nicht. Sie braucht einen Proton-Tarif, der Pass Plus enthält. Ändere den Tarif und verbinde dann erneut.",
  "error.connector.protonPassExpired": "Der Zugriff auf Proton Pass ist abgelaufen. Verbinde erneut.",
  "error.connector.protonPassKeyInvalid": "Gib einen Proton Pass-Zugriffsschlüssel ein, der mit pst_ beginnt.",
  "error.connector.protonPassExtraPassword": "Das zusätzliche Passwort ist nicht korrekt. Gib es erneut ein.",
  "error.connector.protonPassExtraPasswordNotAsked": "Proton Pass hat nicht nach einem zusätzlichen Passwort gefragt.",
  "error.connector.protonPassFileUnreadable": "Die Proton Pass-Verbindungsdatei ist nicht lesbar.",
  "error.connector.protonPassSignInTimeout": "Die Proton-Anmeldung hat zu lange gedauert. Verbinde erneut.",
  "error.connector.protonPassSetupFailed":
    "Der Tresor Shared with OpenBot oder sein Zugriffsschlüssel konnte in Proton Pass nicht erstellt werden. Verbinde erneut.",
  "error.connector.keeperFailed": "Keeper konnte nicht verbunden werden. Verbinde erneut.",
  "error.connector.keeperCliInstallFailed":
    "Keeper Commander konnte nicht installiert werden. Prüfe die Netzwerkverbindung und verbinde dann erneut.",
  "error.connector.keeperPassword": "Die E-Mail-Adresse oder das Master-Passwort ist nicht korrekt.",
  "error.connector.keeperCode": "Der Code ist nicht korrekt. Gib ihn erneut ein.",
  "error.connector.keeperCodeNotAsked": "Keeper hat nicht nach einem Code gefragt.",
  "error.connector.keeperNotApproved":
    "Keeper hat dieses Gerät noch nicht genehmigt. Genehmige es und wähle dann Weiter.",
  "error.connector.keeperExpired": "Die Keeper-Sitzung auf diesem Computer wurde beendet. Verbinde erneut.",
  "error.connector.keeperPlan":
    "Dein Keeper-Administrator erlaubt Keeper Commander für dieses Konto nicht. Bitte ihn, es zu erlauben, und verbinde dann erneut.",
  "error.connector.keeperSso": "Keeper-Konten, die sich per SSO anmelden, können noch nicht verbunden werden.",
  "error.connector.keeperTwoFactorUnsupported":
    "Die Zwei-Faktor-Methode dieses Kontos akzeptiert keinen eingegebenen Code. Füge in Keeper eine Authenticator-App oder SMS hinzu und verbinde dann erneut.",
  "error.connector.keeperLocked":
    "Keeper hat dieses Konto oder dieses Gerät gesperrt. Öffne Keeper, um es zu entsperren, und verbinde dann erneut.",
  "error.connector.keeperThrottled":
    "Keeper bittet, vor der nächsten Anmeldung ein paar Minuten zu warten. Verbinde dich später erneut.",
  "error.connector.keeperPersistentLogin":
    "Dein Keeper-Administrator hat „Stay logged in“ deaktiviert, das OpenBot braucht. Bitte ihn, es zu erlauben, und verbinde dich dann erneut.",
  "error.connector.keeperSignInTimeout": "Die Keeper-Anmeldung hat zu lange gedauert. Verbinde erneut.",
  "error.connector.keeperFileUnreadable": "Die Keeper-Verbindungsdatei ist nicht lesbar.",
} as const satisfies PartialTranslation<typeof source>;
