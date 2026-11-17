import { getCalendars } from "expo-localization";
import { useMemo } from "react";
import { useText } from "@/shared/lib/text";

const DAY_MINUTES = 24 * 60;

/** Times of the made-up data, written as the reference writes them: 4:00 PM, Yesterday, Saturday, Nov 2. */
export function usePreviewTime() {
  const { t, format } = useText();
  return useMemo(() => {
    const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
    const dayOffset = (date: Date) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const day = new Date(date);
      day.setHours(0, 0, 0, 0);
      return Math.round((today.getTime() - day.getTime()) / (DAY_MINUTES * 60_000));
    };
    // The phone's 12 or 24 hour setting, as the status bar shows it.
    const hour12 = getCalendars()[0]?.uses24hourClock === false;
    const clock = (date: Date) => format.date(date, { hour: "numeric", minute: "2-digit", hour12 });
    return {
      /** The time on the right of a chat row. */
      row(minutesAgo: number): string {
        const date = at(minutesAgo);
        const days = dayOffset(date);
        if (days === 0) return clock(date);
        if (days === 1) return t("mobile.workspace.preview.yesterday");
        if (days < 7) return format.date(date, { weekday: "long" });
        return format.date(date, { month: "short", day: "numeric" });
      },
      /** A centered stamp between message groups. */
      stamp(minutesAgo: number): string {
        const date = at(minutesAgo);
        const days = dayOffset(date);
        const time = clock(date);
        if (days === 0) return time;
        if (days === 1) return t("mobile.chat.day.yesterday", { time });
        return t("mobile.chat.day.date", { date: format.date(date, { month: "short", day: "numeric" }), time });
      },
    };
  }, [t, format]);
}
