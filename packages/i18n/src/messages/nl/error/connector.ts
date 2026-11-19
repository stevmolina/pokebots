import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/error/connector";

export const messages = {
  "error.connector.githubUnavailable": "Deze build van OpenBot heeft geen GitHub-app.",
  "error.connector.githubDenied": "Het inloggen bij GitHub is geweigerd.",
  "error.connector.githubCodeExpired": "De GitHub-code is verlopen. Verbind GitHub opnieuw.",
  "error.connector.githubDeviceFlowDisabled": "De GitHub-app staat inloggen via een apparaat niet toe.",
  "error.connector.githubClientUnknown": "GitHub kent de Client ID van deze GitHub-app niet.",
  "error.connector.githubUnexpected": "GitHub gaf een onverwacht antwoord: {detail}",
  "error.connector.githubUnreachable": "OpenBot kan GitHub niet bereiken: {detail}",
  "error.connector.githubExpired": "De verbinding met GitHub is verlopen. Verbind GitHub opnieuw.",
  "error.connector.githubFileUnreadable": "Het verbindingsbestand van GitHub is onleesbaar.",
  "error.connector.githubFileTooLarge": "Het verbindingsbestand van GitHub is te groot.",
  "error.connector.onePasswordCliMissing":
    "OpenBot kan de 1Password-CLI niet vinden. Installeer deze en zet de integratie aan in de 1Password-app, of gebruik een token van een serviceaccount.",
  "error.connector.onePasswordCliInstallFailed":
    "OpenBot kon de 1Password-CLI niet installeren. Controleer de internetverbinding en probeer het opnieuw.",
  "error.connector.onePasswordCliSignedOut":
    "De 1Password-CLI is niet ingelogd. Zet de integratie aan in de 1Password-app en verbind opnieuw.",
  "error.connector.onePasswordAppUnreachable":
    "OpenBot kan de 1Password-app niet bereiken. Open 1Password en ontgrendel het. Controleer in Instellingen > Ontwikkelaar dat “Integreren met 1Password CLI” aan staat. Probeer het dan opnieuw.",
  "error.connector.onePasswordCliFailed": "De 1Password-CLI is mislukt: {detail}",
  "error.connector.onePasswordCliForbidden":
    "Je 1Password-account staat niet toe dat je de gedeelde kluis of een serviceaccount maakt. Vraag een eigenaar of beheerder van het account om deze toestemming, of vraag om een token van een serviceaccount en klik op “Gebruik token”.",
  "error.connector.onePasswordUnexpected": "1Password gaf een onverwacht antwoord: {detail}",
  "error.connector.onePasswordTokenRejected": "1Password heeft het token van het serviceaccount niet geaccepteerd.",
  "error.connector.onePasswordUnreachable":
    "OpenBot kon geen verbinding maken met 1Password. Controleer de internetverbinding en probeer het opnieuw.",
  "error.connector.onePasswordRateLimited":
    "1Password heeft te veel verzoeken ontvangen. Wacht een paar minuten en probeer het opnieuw.",
  "error.connector.onePasswordNoVault":
    "Het serviceaccount kan geen kluis lezen. Geef het toegang tot een kluis en probeer het opnieuw.",
  "error.connector.onePasswordFileUnreadable": "Het verbindingsbestand van 1Password is onleesbaar.",
  "error.connector.onePasswordFileTooLarge": "Het verbindingsbestand van 1Password is te groot.",
  "error.connector.bitwardenFailed":
    "Kan Bitwarden niet lezen. Installeer de bw-CLI, log in, ontgrendel deze en maak één map met de naam Shared with OpenBot. Verbind met een nieuwe sessiesleutel.",
  "error.connector.bitwardenCliMissing":
    "OpenBot kan de Bitwarden CLI niet vinden. Installeer bw, controleer dat het in een nieuwe terminal werkt en maak daarna opnieuw verbinding.",
  "error.connector.bitwardenFolderMissing":
    "Bitwarden moet precies één map met de naam Shared with OpenBot hebben. Maak die map of verwijder de extra map en maak daarna opnieuw verbinding.",
  "error.connector.bitwardenHostInput":
    "Voer een HTTPS-serveradres, de client_id en client_secret van de API-sleutel en het hoofdwachtwoord in.",
  "error.connector.bitwardenHostFailed":
    "Kan Bitwarden niet openen op deze server. Controleer het serveradres, de API-sleutel en het hoofdwachtwoord, en zorg dat één map de naam Shared with OpenBot heeft. Verbind daarna opnieuw.",
  "error.connector.bitwardenCliInstallFailed":
    "Kan de Bitwarden-CLI niet installeren op deze server. Controleer de netwerkverbinding en verbind opnieuw.",
  "error.connector.bitwardenFileUnreadable": "Het verbindingsbestand van Bitwarden is onleesbaar.",
  "error.connector.passwordManagerUnknown": "OpenBot kent deze wachtwoordbeheerder niet.",
  "error.connector.passwordManagerMethod": "Deze wachtwoordbeheerder kan niet op deze manier verbinden.",
  "error.connector.passwordManagerNoSignIn": "Er is geen aanmeldpagina open. Verbind opnieuw.",
  "error.connector.protonPassFailed": "Kan Proton Pass niet verbinden. Verbind opnieuw.",
  "error.connector.protonPassCliInstallFailed":
    "Kan de Proton Pass CLI niet installeren. Controleer de netwerkverbinding en verbind daarna opnieuw.",
  "error.connector.protonPassPlan":
    "Je Proton-abonnement staat de Proton Pass CLI niet toe. Wijzig het abonnement en verbind daarna opnieuw.",
  "error.connector.protonPassPlanMissing":
    "Je Proton-abonnement bevat de Proton Pass CLI niet. Daarvoor is een Proton-abonnement nodig waarin Pass Plus zit. Wijzig het abonnement en verbind daarna opnieuw.",
  "error.connector.protonPassExpired": "De toegang tot Proton Pass is beëindigd. Verbind opnieuw.",
  "error.connector.protonPassKeyInvalid": "Voer een Proton Pass-toegangssleutel in die met pst_ begint.",
  "error.connector.protonPassExtraPassword": "Het extra wachtwoord is onjuist. Voer het opnieuw in.",
  "error.connector.protonPassExtraPasswordNotAsked": "Proton Pass heeft niet om een extra wachtwoord gevraagd.",
  "error.connector.protonPassFileUnreadable": "Het Proton Pass-verbindingsbestand is onleesbaar.",
  "error.connector.protonPassSignInTimeout": "Het aanmelden bij Proton duurde te lang. Verbind opnieuw.",
  "error.connector.protonPassSetupFailed":
    "Kan de kluis Shared with OpenBot of de toegangssleutel ervan niet maken in Proton Pass. Verbind opnieuw.",
  "error.connector.keeperFailed": "Kan Keeper niet verbinden. Verbind opnieuw.",
  "error.connector.keeperCliInstallFailed":
    "Kan Keeper Commander niet installeren. Controleer de netwerkverbinding en verbind daarna opnieuw.",
  "error.connector.keeperPassword": "Het e-mailadres of het hoofdwachtwoord is onjuist.",
  "error.connector.keeperCode": "De code is onjuist. Voer hem opnieuw in.",
  "error.connector.keeperCodeNotAsked": "Keeper heeft niet om een code gevraagd.",
  "error.connector.keeperNotApproved":
    "Keeper heeft dit apparaat nog niet goedgekeurd. Keur het goed en kies dan Doorgaan.",
  "error.connector.keeperExpired": "De Keeper-sessie op deze computer is beëindigd. Verbind opnieuw.",
  "error.connector.keeperPlan":
    "Je Keeper-beheerder staat Keeper Commander niet toe voor dit account. Vraag of het toegestaan kan worden en verbind daarna opnieuw.",
  "error.connector.keeperSso": "Keeper-accounts die zich met SSO aanmelden, kunnen nog niet verbinden.",
  "error.connector.keeperTwoFactorUnsupported":
    "De tweestapsmethode van dit account kan geen getypte code gebruiken. Voeg in Keeper een authenticator-app of sms toe en verbind daarna opnieuw.",
  "error.connector.keeperLocked":
    "Keeper heeft dit account of dit apparaat vergrendeld. Open Keeper om het te ontgrendelen en verbind daarna opnieuw.",
  "error.connector.keeperThrottled":
    "Keeper vraagt een paar minuten te wachten voor de volgende aanmelding. Maak later opnieuw verbinding.",
  "error.connector.keeperPersistentLogin":
    'Je Keeper-beheerder heeft "Stay logged in" uitgezet, wat OpenBot nodig heeft. Vraag om het toe te staan en maak dan opnieuw verbinding.',
  "error.connector.keeperSignInTimeout": "Het aanmelden bij Keeper duurde te lang. Verbind opnieuw.",
  "error.connector.keeperFileUnreadable": "Het Keeper-verbindingsbestand is onleesbaar.",
} as const satisfies PartialTranslation<typeof source>;
