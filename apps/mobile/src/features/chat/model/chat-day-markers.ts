import type { AppFormat, MobileTranslate } from "@openbot/i18n/mobile";
import { messageDay, messageTime, startOfDay } from "./message-time";

/**
 * The separators of the chat, as on desktop (`packages/ui/src/features/conversation/chat-day-markers.ts`):
 * the first message of the chat and the first message of each later day get a label with their day
 * and time. Rows without a time, such as markers, get none and do not end a day. While older
 * messages are not loaded, the first loaded row gets no label: the older page can be of the same
 * day, and the label would leave that row and move the rows below it while the reader scrolls up.
 */

const DAY_MS = 86_400_000;
const TIME = { hour: "numeric", minute: "2-digit" } as const;
const DATE = { weekday: "short", month: "short", day: "numeric" } as const;

/**
 * The label of each message that opens a day, by message ID. One pass over the loaded rows.
 *
 * `groupGapMs` also labels a message that comes this long after the message before it, so a quiet
 * chat shows its time stamps between groups of messages, as the calm look of the design preview does.
 */
export function chatDayLabels(
  rows: readonly { id: string; createdAt?: string }[],
  text: { t: MobileTranslate; format: AppFormat },
  { hasOlder = false, now = new Date(), groupGapMs }: { hasOlder?: boolean; now?: Date; groupGapMs?: number } = {},
): ReadonlyMap<string, string> {
  const labels = new Map<string, string>();
  const today = startOfDay(now);
  const timeZoneOffset = now.getTimezoneOffset();
  let previousDay: number | undefined;
  let previousTime: number | undefined;
  let skipFirst = hasOlder;
  for (const row of rows) {
    if (!row.createdAt) continue;
    const day = messageDay(row.createdAt, timeZoneOffset);
    if (Number.isNaN(day)) continue;
    // Only the calm look reads the time: without a gap the pass is the same as before.
    let gap = false;
    if (groupGapMs !== undefined) {
      const at = messageTime(row.createdAt);
      gap = previousTime !== undefined && at - previousTime >= groupGapMs;
      previousTime = at;
    }
    if (day === previousDay && !gap) continue;
    previousDay = day;
    if (skipFirst) {
      skipFirst = false;
      continue;
    }
    const created = new Date(row.createdAt);
    const time = text.format.date(created, TIME);
    const age = Math.round((today - day) / DAY_MS);
    labels.set(
      row.id,
      age === 0
        ? text.t("mobile.chat.day.today", { time })
        : age === 1
          ? text.t("mobile.chat.day.yesterday", { time })
          : text.t("mobile.chat.day.date", { date: text.format.date(created, DATE), time }),
    );
  }
  return labels;
}
