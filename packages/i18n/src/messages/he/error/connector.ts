import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/error/connector";

export const messages = {
  "error.connector.githubUnavailable": "בגרסה הזאת של OpenBot אין GitHub App.",
  "error.connector.githubDenied": "ההתחברות ל-GitHub נדחתה.",
  "error.connector.githubCodeExpired": "הקוד של GitHub פג תוקף. יש לחבר את GitHub מחדש.",
  "error.connector.githubDeviceFlowDisabled": "ה-GitHub App לא מאפשר התחברות מהתקן.",
  "error.connector.githubClientUnknown": "GitHub לא מכיר את ה-Client ID של ה-GitHub App הזה.",
  "error.connector.githubUnexpected": "GitHub שלח תשובה לא צפויה: {detail}",
  "error.connector.githubUnreachable": "OpenBot לא מצליח להגיע אל GitHub: {detail}",
  "error.connector.githubExpired": "החיבור ל-GitHub פג תוקף. יש לחבר את GitHub מחדש.",
  "error.connector.githubFileUnreadable": "קובץ החיבור ל-GitHub אינו קריא.",
  "error.connector.githubFileTooLarge": "קובץ החיבור ל-GitHub גדול מדי.",
  "error.connector.linkDenied": "ההתחברות ל-Link נדחתה.",
  "error.connector.linkCodeExpired": "ההתחברות ל-Link פגה. יש לחבר את Link מחדש.",
  "error.connector.linkUnexpected": "Link שלח תשובה לא צפויה: {detail}",
  "error.connector.linkUnreachable": "OpenBot לא מצליח להגיע אל Link: {detail}",
  "error.connector.linkExpired": "החיבור ל-Link פג תוקף. יש לחבר את Link מחדש.",
  "error.connector.linkNotConnected": "Link לא מחובר. אפשר לחבר אותו בהגדרות השרת > כספת > כרטיסים.",
  "error.connector.linkNoCard": "בחשבון Link אין כרטיס. יש להוסיף כרטיס ב-Link.",
  "error.connector.linkFileUnreadable": "קובץ החיבור ל-Link אינו קריא.",
  "error.connector.linkFileTooLarge": "קובץ החיבור ל-Link גדול מדי.",
  "error.connector.onePasswordCliMissing":
    "OpenBot לא מוצא את ה-CLI של 1Password. יש להתקין אותו ולהפעיל את האינטגרציה שלו באפליקציית 1Password, או להשתמש באסימון של חשבון שירות.",
  "error.connector.onePasswordCliInstallFailed":
    "OpenBot לא הצליח להתקין את ה-CLI של 1Password. יש לבדוק את החיבור לאינטרנט ולנסות שוב.",
  "error.connector.onePasswordCliSignedOut":
    "ה-CLI של 1Password לא מחובר. יש להפעיל את האינטגרציה שלו באפליקציית 1Password ולהתחבר שוב.",
  "error.connector.onePasswordAppUnreachable":
    "OpenBot לא מצליח להתחבר לאפליקציית 1Password. יש לפתוח את 1Password ולבטל את הנעילה. בהגדרות > מפתחים יש לוודא ש״Integrate with 1Password CLI״ מופעל. לאחר מכן יש לנסות שוב.",
  "error.connector.onePasswordCliFailed": "ה-CLI של 1Password נכשל: {detail}",
  "error.connector.onePasswordCliForbidden":
    "חשבון 1Password שלך לא מאפשר לך ליצור את הכספת המשותפת או חשבון שירות. יש לבקש את ההרשאה הזו מבעלים או ממנהל של החשבון, או לבקש מהם אסימון של חשבון שירות וללחוץ על ״שימוש באסימון״.",
  "error.connector.onePasswordUnexpected": "1Password שלח תשובה לא צפויה: {detail}",
  "error.connector.onePasswordTokenRejected": "1Password לא קיבל את האסימון של חשבון השירות.",
  "error.connector.onePasswordUnreachable":
    "OpenBot לא הצליח להתחבר ל-1Password. יש לבדוק את החיבור לאינטרנט ולנסות שוב.",
  "error.connector.onePasswordRateLimited": "1Password קיבל יותר מדי בקשות. יש להמתין כמה דקות ולנסות שוב.",
  "error.connector.onePasswordNoVault": "חשבון השירות לא יכול לקרוא אף כספת. יש לתת לו גישה לכספת ולנסות שוב.",
  "error.connector.onePasswordFileUnreadable": "קובץ החיבור ל-1Password אינו קריא.",
  "error.connector.onePasswordFileTooLarge": "קובץ החיבור ל-1Password גדול מדי.",
  "error.connector.bitwardenFailed":
    "לא ניתן לקרוא את Bitwarden. יש להתקין את ה-CLI bw, להתחבר, לבטל את הנעילה וליצור תיקייה אחת בשם Shared with OpenBot. יש להתחבר עם מפתח סשן חדש.",
  "error.connector.bitwardenCliMissing":
    "OpenBot לא מוצא את ה-CLI של Bitwarden. התקינו את bw, ודאו שהוא פועל בטרמינל חדש ואז התחברו שוב.",
  "error.connector.bitwardenFolderMissing":
    "ב-Bitwarden צריכה להיות בדיוק תיקייה אחת בשם Shared with OpenBot. צרו אותה או מחקו את התיקייה העודפת, ואז התחברו שוב.",
  "error.connector.bitwardenHostInput":
    "יש להזין כתובת שרת HTTPS, את client_id ו-client_secret של מפתח ה-API ואת הסיסמה הראשית.",
  "error.connector.bitwardenHostFailed":
    "לא ניתן לפתוח את Bitwarden בשרת הזה. יש לבדוק את כתובת השרת, את מפתח ה-API ואת הסיסמה הראשית, ולוודא שתיקייה אחת נקראת Shared with OpenBot. לאחר מכן יש להתחבר שוב.",
  "error.connector.bitwardenCliInstallFailed":
    "לא ניתן להתקין את ה-CLI של Bitwarden בשרת הזה. יש לבדוק את חיבור הרשת שלו ולהתחבר שוב.",
  "error.connector.bitwardenFileUnreadable": "קובץ החיבור ל-Bitwarden אינו קריא.",
  "error.connector.passwordManagerUnknown": "OpenBot לא מכיר את מנהל הסיסמאות הזה.",
  "error.connector.passwordManagerMethod": "מנהל הסיסמאות הזה לא יכול להתחבר בדרך הזאת.",
  "error.connector.passwordManagerNoSignIn": "אין דף התחברות פתוח. יש להתחבר שוב.",
  "error.connector.protonPassFailed": "לא ניתן לחבר את Proton Pass. יש להתחבר שוב.",
  "error.connector.protonPassCliInstallFailed":
    "לא ניתן להתקין את ה-CLI של Proton Pass. יש לבדוק את חיבור הרשת ולהתחבר שוב.",
  "error.connector.protonPassPlan":
    "התוכנית שלך ב-Proton לא כוללת את ה-CLI של Proton Pass. יש לשנות תוכנית ולהתחבר שוב.",
  "error.connector.protonPassExpired": "הגישה אל Proton Pass הסתיימה. יש להתחבר שוב.",
  "error.connector.protonPassKeyInvalid": "יש להזין מפתח גישה של Proton Pass שמתחיל ב-pst_.",
  "error.connector.protonPassExtraPassword": "הסיסמה הנוספת שגויה. יש להזין אותה שוב.",
  "error.connector.protonPassExtraPasswordNotAsked": "Proton Pass לא ביקש סיסמה נוספת.",
  "error.connector.protonPassFileUnreadable": "קובץ החיבור ל-Proton Pass אינו קריא.",
  "error.connector.protonPassSignInTimeout": "ההתחברות ל-Proton נמשכה זמן רב מדי. יש להתחבר שוב.",
  "error.connector.protonPassSetupFailed":
    "לא ניתן ליצור ב-Proton Pass את הכספת Shared with OpenBot או את מפתח הגישה שלה. יש להתחבר שוב.",
  "error.connector.keeperFailed": "לא ניתן לחבר את Keeper. יש להתחבר שוב.",
  "error.connector.keeperCliInstallFailed": "לא ניתן להתקין את Keeper Commander. יש לבדוק את חיבור הרשת ולהתחבר שוב.",
  "error.connector.keeperPassword": "האימייל או הסיסמה הראשית שגויים.",
  "error.connector.keeperCode": "הקוד שגוי. יש להזין אותו שוב.",
  "error.connector.keeperCodeNotAsked": "Keeper לא ביקש קוד.",
  "error.connector.keeperNotApproved": "המכשיר הזה עדיין לא אושר ב-Keeper. יש לאשר אותו ואז ללחוץ על ״המשך״.",
  "error.connector.keeperExpired": "הסשן של Keeper במחשב הזה הסתיים. יש להתחבר שוב.",
  "error.connector.keeperPlan":
    "מנהל Keeper שלך לא מאפשר את Keeper Commander לחשבון הזה. יש לבקש ממנו לאפשר אותו ואז להתחבר שוב.",
  "error.connector.keeperSso": "עדיין לא ניתן לחבר חשבונות Keeper שמתחברים באמצעות SSO.",
  "error.connector.keeperTwoFactorUnsupported":
    "שיטת האימות הדו־שלבי של החשבון הזה לא מקבלת קוד מוקלד. יש להוסיף ב-Keeper אפליקציית אימות או הודעות טקסט, ואז להתחבר שוב.",
  "error.connector.keeperLocked":
    "Keeper נעל את החשבון או את המכשיר הזה. יש לפתוח את Keeper כדי לבטל את הנעילה, ואז להתחבר שוב.",
  "error.connector.keeperThrottled": "Keeper מבקש להמתין כמה דקות לפני הכניסה הבאה. התחבר שוב מאוחר יותר.",
  "error.connector.keeperPersistentLogin":
    'מנהל Keeper כיבה את "Stay logged in", ש-OpenBot צריך. בקש ממנו לאפשר זאת ואז התחבר שוב.',
  "error.connector.keeperSignInTimeout": "ההתחברות ל-Keeper נמשכה זמן רב מדי. יש להתחבר שוב.",
  "error.connector.keeperFileUnreadable": "קובץ החיבור ל-Keeper אינו קריא.",
} as const satisfies PartialTranslation<typeof source>;
