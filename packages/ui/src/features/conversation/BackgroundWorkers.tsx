import { createEffect, createSignal, createUniqueId, For, Show } from "solid-js";
import { Button } from "../../button";
import type { AgentProfile } from "../../data";
import { ChevronRight, ChevronUp } from "../../icons";
import { useText } from "../../text";
import { AgentAvatar } from "../agents/AgentAvatar";

export interface BackgroundWorker {
  id: string;
  agent: AgentProfile | undefined;
  title: string;
  since: string;
  state: "running" | "queued";
  onOpen: () => void;
}

/**
 * Live work owned by the conversation. Only the agent avatar identifies a worker. Rows are keyed
 * by id: the parent rebuilds the list on each streamed token, and a row must update in place
 * instead of remounting, which restarted the avatar animation and flickered.
 */
export function BackgroundWorkers(props: { items: readonly BackgroundWorker[] }) {
  const { t, format } = useText();
  const [now, setNow] = createSignal(Date.now());
  const [expanded, setExpanded] = createSignal(false);
  const listId = createUniqueId();
  const collapsible = () => props.items.length > 1;
  const collapsed = () => collapsible() && !expanded();
  const countLabel = () => {
    const hasRunning = props.items.some((item) => item.state === "running");
    return t(hasRunning ? "chat.workers.runningCount" : "chat.workers.queuedCount", {
      count: props.items.length,
    });
  };
  createEffect(
    () => props.items.length <= 1,
    (single) => {
      if (single) setExpanded(false);
    },
  );
  createEffect(
    () => props.items.length > 0,
    (active) => {
      if (!active) return;
      setNow(Date.now());
      const clock = window.setInterval(() => setNow(Date.now()), 1_000);
      return () => window.clearInterval(clock);
    },
  );
  function elapsed(since: string) {
    const start = Date.parse(since);
    const seconds = Number.isFinite(start) ? Math.max(0, Math.floor((now() - start) / 1_000)) : 0;
    const unit = (value: number, name: "day" | "hour" | "minute" | "second") =>
      format.number(value, { style: "unit", unit: name, unitDisplay: "narrow" });
    // A long run reads "2h 5m" or "88d", not thousands of minutes.
    if (seconds >= 86_400) return unit(Math.floor(seconds / 86_400), "day");
    if (seconds >= 3_600)
      return `${unit(Math.floor(seconds / 3_600), "hour")} ${unit(Math.floor((seconds % 3_600) / 60), "minute")}`;
    return `${unit(Math.floor(seconds / 60), "minute")} ${unit(seconds % 60, "second")}`;
  }
  return (
    <Show when={props.items.length > 0}>
      <div
        class="background-workers"
        data-collapsible={collapsible() ? "true" : undefined}
        data-collapsed={collapsed() ? "true" : undefined}
      >
        <Show when={collapsible()}>
          <button
            type="button"
            class="background-workers-toggle"
            aria-expanded={expanded() ? "true" : "false"}
            aria-controls={listId}
            aria-label={
              expanded() ? t("chat.workers.showOne") : t("chat.workers.showAll", { count: props.items.length })
            }
            onClick={() => setExpanded((value) => !value)}
          >
            <span class="background-workers-toggle-pill">
              <ChevronUp class="background-workers-toggle-chevron" aria-hidden="true" />
              <span>{countLabel()}</span>
            </span>
          </button>
        </Show>
        <div id={listId} class="background-workers-list">
          <For each={props.items} keyed={(item) => item.id}>
            {(item) => (
              <Button variant="ghost" class="background-worker-row" onClick={() => item().onOpen()}>
                <span class="background-worker-avatar">
                  <AgentAvatar agent={item().agent} mood="working" />
                  <span class="background-worker-dot" />
                </span>
                <span class="background-worker-copy">
                  <span class="background-worker-title">{item().title}</span>
                  <span class="background-worker-status">
                    {t(item().state === "running" ? "chat.workers.running" : "chat.workers.queued")}
                  </span>
                </span>
                <span class="background-worker-elapsed">{elapsed(item().since)}</span>
                <ChevronRight class="background-worker-chevron" aria-hidden="true" />
              </Button>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
