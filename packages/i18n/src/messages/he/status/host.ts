import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/status/host";

export const messages = {
  // Status lines of the WebRTC host.
  "status.host.registered": "ה-Pokebots הזה נרשם לגישת WebRTC.",
  "status.host.keyRotated": "מפתח השרת השתנה. המכשירים המותאמים נשארים מותאמים.",
  "status.host.identityUpdated": "זהות השרת עודכנה.",
  "status.host.starting": "מפעיל את מארח ה-WebRTC…",
  "status.host.ready": "ה-Pokebots הזה מוכן לחיבורי WebRTC.",
  "status.host.signalLost": "מכשירים אחרים לא יכולים להגיע ל-Pokebots הזה כרגע. הוא מתחבר שוב.",
  "status.host.stopping": "הופך את ה-Pokebots הזה לפרטי…",
  "status.host.private": "ה-Pokebots הזה פרטי.",
  "status.host.removed": "ה-Pokebots הזה הוסר מהחשבון שלך. יש לפרסם אותו שוב כדי לשתף אותו.",
} as const satisfies PartialTranslation<typeof source>;
