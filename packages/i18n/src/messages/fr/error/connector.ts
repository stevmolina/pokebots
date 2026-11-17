import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/error/connector";

export const messages = {
  "error.connector.githubUnavailable": "Cette version d’OpenBot n’a pas d’application GitHub.",
  "error.connector.githubDenied": "La connexion à GitHub a été refusée.",
  "error.connector.githubCodeExpired": "Le code GitHub a expiré. Connectez GitHub à nouveau.",
  "error.connector.githubDeviceFlowDisabled": "L’application GitHub n’autorise pas la connexion par appareil.",
  "error.connector.githubClientUnknown": "GitHub ne connaît pas le Client ID de cette application GitHub.",
  "error.connector.githubUnexpected": "GitHub a envoyé une réponse inattendue : {detail}",
  "error.connector.githubUnreachable": "OpenBot ne peut pas joindre GitHub : {detail}",
  "error.connector.githubExpired": "La connexion GitHub a expiré. Connectez GitHub à nouveau.",
  "error.connector.githubFileUnreadable": "Le fichier de connexion GitHub est illisible.",
  "error.connector.githubFileTooLarge": "Le fichier de connexion GitHub est trop volumineux.",
  "error.connector.onePasswordCliMissing":
    "OpenBot ne trouve pas la CLI 1Password. Installez-la et activez son intégration dans l’application 1Password, ou utilisez un jeton de compte de service.",
  "error.connector.onePasswordCliInstallFailed":
    "OpenBot n’a pas pu installer la CLI 1Password. Vérifiez la connexion à Internet, puis réessayez.",
  "error.connector.onePasswordCliSignedOut":
    "La CLI 1Password n’est pas connectée. Activez son intégration dans l’application 1Password, puis connectez-vous à nouveau.",
  "error.connector.onePasswordCliFailed": "La CLI 1Password a échoué : {detail}",
  "error.connector.onePasswordUnexpected": "1Password a envoyé une réponse inattendue : {detail}",
  "error.connector.onePasswordTokenRejected": "1Password n’a pas accepté le jeton du compte de service.",
  "error.connector.onePasswordNoVault":
    "Le compte de service ne peut lire aucun coffre. Donnez-lui accès à un coffre, puis réessayez.",
  "error.connector.onePasswordFileUnreadable": "Le fichier de connexion 1Password est illisible.",
  "error.connector.onePasswordFileTooLarge": "Le fichier de connexion 1Password est trop volumineux.",
  "error.connector.bitwardenFailed":
    "Impossible de lire Bitwarden. Installez la CLI bw, connectez-vous, déverrouillez-la et créez un dossier nommé « Shared with OpenBot ». Connectez-vous avec une nouvelle clé de session.",
  "error.connector.bitwardenCliMissing":
    "OpenBot ne trouve pas la CLI Bitwarden. Installez bw, vérifiez qu’il fonctionne dans un nouveau terminal, puis reconnectez-vous.",
  "error.connector.bitwardenFolderMissing":
    "Bitwarden doit avoir exactement un dossier nommé Shared with OpenBot. Créez-le ou supprimez le dossier en trop, puis reconnectez-vous.",
  "error.connector.bitwardenHostInput":
    "Saisissez une adresse de serveur HTTPS, le client_id et le client_secret de la clé d’API et le mot de passe principal.",
  "error.connector.bitwardenHostFailed":
    "Impossible d’ouvrir Bitwarden sur ce serveur. Vérifiez l’adresse du serveur, la clé d’API et le mot de passe principal, et assurez-vous qu’un dossier se nomme « Shared with OpenBot ». Puis connectez-vous à nouveau.",
  "error.connector.bitwardenCliInstallFailed":
    "Impossible d’installer la CLI Bitwarden sur ce serveur. Vérifiez sa connexion réseau, puis connectez-vous à nouveau.",
  "error.connector.bitwardenFileUnreadable": "Le fichier de connexion Bitwarden est illisible.",
  "error.connector.passwordManagerUnknown": "OpenBot ne connaît pas ce gestionnaire de mots de passe.",
  "error.connector.passwordManagerMethod": "Ce gestionnaire de mots de passe ne peut pas se connecter de cette façon.",
  "error.connector.passwordManagerNoSignIn": "Aucune page de connexion n’est ouverte. Connectez-vous à nouveau.",
  "error.connector.protonPassFailed": "Impossible de connecter Proton Pass. Connectez-vous à nouveau.",
  "error.connector.protonPassCliInstallFailed":
    "Impossible d’installer la CLI Proton Pass. Vérifiez la connexion réseau, puis connectez-vous à nouveau.",
  "error.connector.protonPassPlan":
    "Votre forfait Proton n’autorise pas la CLI Proton Pass. Changez de forfait, puis connectez-vous à nouveau.",
  "error.connector.protonPassExpired": "L’accès à Proton Pass a pris fin. Connectez-vous à nouveau.",
  "error.connector.protonPassKeyInvalid": "Saisissez une clé d’accès Proton Pass qui commence par pst_.",
  "error.connector.protonPassExtraPassword": "Le mot de passe supplémentaire est incorrect. Saisissez-le à nouveau.",
  "error.connector.protonPassExtraPasswordNotAsked": "Proton Pass n’a pas demandé de mot de passe supplémentaire.",
  "error.connector.protonPassFileUnreadable": "Le fichier de connexion Proton Pass est illisible.",
  "error.connector.protonPassSignInTimeout": "La connexion à Proton a pris trop de temps. Connectez-vous à nouveau.",
  "error.connector.protonPassSetupFailed":
    "Impossible de créer le coffre Shared with OpenBot ou sa clé d’accès dans Proton Pass. Connectez-vous à nouveau.",
  "error.connector.keeperFailed": "Impossible de connecter Keeper. Connectez-vous à nouveau.",
  "error.connector.keeperCliInstallFailed":
    "Impossible d’installer Keeper Commander. Vérifiez la connexion réseau, puis connectez-vous à nouveau.",
  "error.connector.keeperPassword": "L’e-mail ou le mot de passe principal est incorrect.",
  "error.connector.keeperCode": "Le code est incorrect. Saisissez-le à nouveau.",
  "error.connector.keeperCodeNotAsked": "Keeper n’a pas demandé de code.",
  "error.connector.keeperNotApproved":
    "Keeper n’a pas encore approuvé cet appareil. Approuvez-le, puis sélectionnez Continuer.",
  "error.connector.keeperExpired": "La session Keeper sur cet ordinateur est terminée. Connectez-vous à nouveau.",
  "error.connector.keeperPlan":
    "Votre administrateur Keeper n’autorise pas Keeper Commander pour ce compte. Demandez-lui de l’autoriser, puis connectez-vous à nouveau.",
  "error.connector.keeperSso": "Les comptes Keeper qui se connectent avec le SSO ne peuvent pas encore être connectés.",
  "error.connector.keeperTwoFactorUnsupported":
    "La méthode en deux étapes de ce compte n’accepte pas de code saisi. Ajoutez une application d’authentification ou les SMS dans Keeper, puis connectez-vous à nouveau.",
  "error.connector.keeperLocked":
    "Keeper a verrouillé ce compte ou cet appareil. Ouvrez Keeper pour le déverrouiller, puis connectez-vous à nouveau.",
  "error.connector.keeperThrottled":
    "Keeper demande d’attendre quelques minutes avant la prochaine connexion. Reconnectez-vous plus tard.",
  "error.connector.keeperSignInTimeout": "La connexion à Keeper a pris trop de temps. Connectez-vous à nouveau.",
  "error.connector.keeperFileUnreadable": "Le fichier de connexion Keeper est illisible.",
} as const satisfies PartialTranslation<typeof source>;
