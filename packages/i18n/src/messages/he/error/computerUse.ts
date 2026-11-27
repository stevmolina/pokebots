import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/error/computerUse";

export const messages = {
  "error.computerUse.noAppToDrag": "בגרסה הזו של Pokebots אין אפליקציה לגרירה.",
  "error.computerUse.helpWindowChanged": "חלון העזרה להרשאות השתנה לפני תחילת הגרירה.",
  "error.computerUse.noAppToShow": "בגרסה הזו של Pokebots אין אפליקציה להצגה.",
  "error.computerUse.noDriver": "במחשב הזה אין מנהל התקן לשליטה במחשב.",
  "error.computerUse.socketPathTooLong": "נתיב הסוקט של שליטה במחשב באורך {length} תווים, והמערכת מאפשרת {limit}.",
  "error.computerUse.socketDirectoryNotDirectory": "הנתיב {path} של תיקיית הסוקט של שליטה במחשב אינו תיקייה.",
  "error.computerUse.socketDirectoryOtherOwner": "תיקיית הסוקט {path} של שליטה במחשב שייכת למשתמש אחר.",
  "error.computerUse.socketDirectoryShared": "תיקיית הסוקט {path} של שליטה במחשב פתוחה למשתמשים אחרים.",
  "error.computerUse.socketNotReady": "לא התקבל חיבור תוך {seconds} שניות. {reason}",
  "error.computerUse.appInUse": "{app} בשימוש של {agent} ({thread}). נסה שוב מאוחר יותר או השתמש באפליקציה אחרת.",
  "error.computerUse.desktopBusy": "פעולה אחרת במחשב הזה לא הסתיימה בזמן. נסה שוב בעוד רגע.",
} as const satisfies PartialTranslation<typeof source>;
