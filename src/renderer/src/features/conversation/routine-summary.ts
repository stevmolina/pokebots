import type { RoutineSchedule } from "@openbot/contracts/ipc";
import type { EventRoutine, RoutineWebhookTriggerInput } from "@openbot/contracts/ipc-events";
import { routineDraftSummary } from "@openbot/ui/features/conversation/routine-schedule-draft";
import { routineOnceCompleted, routineScheduleToDraft } from "@openbot/ui/features/conversation/routine-schedule-saved";
import { type RoutineText, routineScheduleSummary } from "@openbot/ui/features/conversation/routine-schedule-ui";
import type { RoutineEditorRecord } from "./routines-port";

export function isEventRoutine(routine: RoutineEditorRecord): routine is EventRoutine {
  return "owner" in routine;
}

export function routineScheduleOf(routine: RoutineEditorRecord): RoutineSchedule {
  if (isEventRoutine(routine)) {
    return routine.trigger.kind === "schedule" ? routine.trigger.schedule : { kind: "daily", time: "09:00" };
  }
  return routine.trigger.schedule;
}

export function routineTriggerKind(routine: RoutineEditorRecord): "schedule" | "webhook" {
  return isEventRoutine(routine) && routine.trigger.kind === "webhook" ? "webhook" : "schedule";
}

export function routineCompleted(routine: RoutineEditorRecord): boolean {
  if (routineTriggerKind(routine) === "webhook") return false;
  return routineOnceCompleted({
    active: routine.active,
    timezone: routine.timezone,
    schedule: routineScheduleOf(routine),
    updatedAt: routine.updatedAt,
  });
}

export function routineWebhookTrigger(routine: RoutineEditorRecord): RoutineWebhookTriggerInput | null {
  if (!isEventRoutine(routine) || routine.trigger.kind !== "webhook") return null;
  return { kind: "webhook", eventType: routine.trigger.eventType, filters: routine.trigger.filters };
}

/**
 * The list row reads the schedule as the chips do. A schedule the chips show only as cron, such
 * as an interval, keeps its own summary: "Every 15 minutes", not the cron text.
 */
export function routineListSummary(routine: RoutineEditorRecord, text: RoutineText): string {
  if (isEventRoutine(routine) && routine.trigger.kind === "webhook") {
    const eventType = routine.trigger.eventType;
    return eventType
      ? text.t("routine.settings.webhookSummary", { eventType })
      : text.t("routine.settings.webhookSummaryAny");
  }
  const schedule = routineScheduleOf(routine);
  const draft = routineScheduleToDraft(schedule);
  if (draft.kind === "custom") return routineScheduleSummary(schedule, false, text);
  return routineDraftSummary(draft, text);
}
