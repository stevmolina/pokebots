import { ArrowDown, ArrowUp, Button, Command, CornerDownLeft, Dialog, Input, Kbd, Search } from "@pokebots/ui";
import type { AgentProfile } from "@pokebots/ui/data";
import { AgentAvatar } from "@pokebots/ui/features/agents/AgentAvatar";
import { useText } from "@pokebots/ui/text";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { normalizedSearchText } from "./global-search-text";

const NEW_SESSION_SHORTCUT = "⌘⇧O";
const NEW_AGENT_SHORTCUT = "⌥⌘N";

export interface NewInstancePickerProps {
  open: boolean;
  agents: AgentProfile[];
  onOpenChange: (open: boolean) => void;
  onSelectAgent: (agentId: string) => void;
  onNewBot?: () => void;
}

/**
 * Centered command-palette picker opened by Cmd+Shift+O.
 * Opens a new instance (side thread) on an existing bot instead of creating a new bot.
 */
export function NewInstancePicker(props: NewInstancePickerProps) {
  const { t } = useText();
  const [query, setQuery] = createSignal("");
  const [activeIndex, setActiveIndex] = createSignal(0);
  let input: HTMLInputElement | undefined;

  const focused = document.activeElement;
  const opener = focused instanceof HTMLElement && focused !== document.body ? focused : undefined;
  let picked = false;
  onCleanup(() => {
    if (picked || !opener) return;
    requestAnimationFrame(() => {
      const current = document.activeElement;
      if (opener.isConnected && (!current || current === document.body)) opener.focus({ preventScroll: true });
    });
  });

  const filteredAgents = createMemo(() => {
    const q = normalizedSearchText(query());
    if (!q) return props.agents;
    return props.agents.filter((agent) => {
      const haystack = normalizedSearchText(`${agent.name} ${agent.title ?? ""} ${agent.description ?? ""}`);
      return haystack.includes(q);
    });
  });

  createEffect(
    () => props.open,
    (open) => {
      if (open) {
        setQuery("");
        setActiveIndex(0);
        requestAnimationFrame(() => input?.focus());
      }
    },
  );

  createEffect(
    () => filteredAgents().length,
    (count) => {
      if (count === 0) setActiveIndex(0);
      else if (activeIndex() >= count) setActiveIndex(count - 1);
    },
  );

  function selectAgent(agentId: string) {
    picked = true;
    props.onOpenChange(false);
    props.onSelectAgent(agentId);
  }

  function triggerNewBot() {
    if (!props.onNewBot) return;
    picked = true;
    props.onOpenChange(false);
    props.onNewBot();
  }

  function onKeyDown(event: KeyboardEvent) {
    const list = filteredAgents();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (list.length > 0) setActiveIndex((i) => (i + 1) % list.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (list.length > 0) setActiveIndex((i) => (i - 1 + list.length) % list.length);
      return;
    }
    if (event.key === "Enter") {
      const target = list[activeIndex()];
      if (!target) return;
      event.preventDefault();
      selectAgent(target.id);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      props.onOpenChange(false);
      return;
    }
    // ⌘1–⌘9 (or Ctrl+1–9) jumps directly to that bot's new instance.
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && /^[1-9]$/.test(event.key)) {
      const index = Number(event.key) - 1;
      const target = list[index];
      if (target) {
        event.preventDefault();
        selectAgent(target.id);
      }
      return;
    }
    // ⌥⌘N (or Alt+Ctrl+N) creates a new bot when available.
    if ((event.metaKey || event.ctrlKey) && event.altKey && event.key.toLowerCase() === "n" && props.onNewBot) {
      event.preventDefault();
      triggerNewBot();
    }
  }

  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay class="global-search-overlay" />
        <Dialog.Content
          class="global-search-dialog"
          aria-label={t("conversation.sessions.new")}
          onKeyDown={onKeyDown}
          style={{ width: "560px", "max-width": "92vw" }}
        >
          <div class="global-search-control">
            <Search aria-hidden="true" />
            <Input
              ref={(element: HTMLInputElement) => {
                input = element;
              }}
              class="global-search-input"
              aria-label={t("settings.transfer.copy.search")}
              placeholder={t("settings.transfer.copy.search")}
              value={query()}
              onInput={(event: InputEvent & { currentTarget: HTMLInputElement }) => {
                setQuery(event.currentTarget.value);
                setActiveIndex(0);
              }}
              autocomplete="off"
              autocapitalize="none"
              spellcheck={false}
            />
            <Kbd aria-hidden="true">{NEW_SESSION_SHORTCUT}</Kbd>
          </div>

          <div
            class="global-search-results"
            style={{ "max-height": "360px", "overflow-y": "auto", padding: "6px 8px 10px" }}
          >
            <div
              class="global-search-section"
              style={{
                "font-size": "var(--openbot-text-sm)",
                "font-weight": "600",
                padding: "6px 10px",
                opacity: "0.65",
              }}
            >
              {t("conversation.globalSearch.tab.agents")}
            </div>

            <Show
              when={filteredAgents().length > 0}
              fallback={
                <div class="global-search-empty" style={{ padding: "24px 12px", "text-align": "center" }}>
                  {t("conversation.globalSearch.empty")}
                </div>
              }
            >
              <For each={filteredAgents()}>
                {(agent, index) => {
                  const isActive = () => index() === activeIndex();
                  const subtitle = () => agent.title || agent.description || "";
                  return (
                    <Button
                      variant="ghost"
                      type="button"
                      aria-current={isActive() ? "true" : undefined}
                      class="global-search-result"
                      data-highlighted={isActive() ? "" : undefined}
                      onMouseEnter={() => setActiveIndex(index())}
                      onClick={() => selectAgent(agent.id)}
                      style={{
                        width: "100%",
                        display: "flex",
                        "align-items": "center",
                        "justify-content": "space-between",
                        gap: "12px",
                        padding: "8px 10px",
                        "border-radius": "var(--openbot-radius-card)",
                        border: "none",
                        background: isActive() ? "var(--openbot-bg-control-hover)" : "transparent",
                        cursor: "pointer",
                        "text-align": "left",
                      }}
                    >
                      <div
                        style={{ display: "flex", "align-items": "center", gap: "10px", "min-width": "0", flex: "1" }}
                      >
                        <AgentAvatar agent={agent} motion="hover" class="global-search-avatar" />
                        <div style={{ "min-width": "0", flex: "1" }}>
                          <div
                            style={{
                              "font-size": "var(--openbot-text-md)",
                              "font-weight": isActive() ? "600" : "500",
                              "white-space": "nowrap",
                              overflow: "hidden",
                              "text-overflow": "ellipsis",
                            }}
                          >
                            {agent.name}
                          </div>
                          <Show when={subtitle()}>
                            <div
                              style={{
                                "font-size": "var(--openbot-text-sm)",
                                opacity: "0.65",
                                "white-space": "nowrap",
                                overflow: "hidden",
                                "text-overflow": "ellipsis",
                              }}
                            >
                              {subtitle()}
                            </div>
                          </Show>
                        </div>
                      </div>

                      <Show when={index() < 9}>
                        <Kbd aria-hidden="true">⌘{index() + 1}</Kbd>
                      </Show>
                    </Button>
                  );
                }}
              </For>
            </Show>
          </div>

          <div
            class="global-search-footer"
            style={{ display: "flex", "align-items": "center", "justify-content": "space-between" }}
          >
            <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
              <span class="global-search-hint">
                <Kbd>
                  <ArrowUp />
                </Kbd>
                <Kbd>
                  <ArrowDown />
                </Kbd>
                {t("conversation.globalSearch.hint.navigate")}
              </span>
              <span class="global-search-hint">
                <Kbd>
                  <CornerDownLeft />
                </Kbd>
                {t("conversation.sessions.new")}
              </span>
              <span class="global-search-hint">
                <Kbd>
                  <Command />
                </Kbd>
                <Kbd>{"1–9"}</Kbd>
                {t("conversation.globalSearch.hint.jump")}
              </span>
              <span class="global-search-hint">
                <Kbd>{t("conversation.globalSearch.hint.escapeKey")}</Kbd>
                {t("conversation.globalSearch.hint.close")}
              </span>
            </div>

            <Show when={props.onNewBot}>
              <Button
                variant="ghost"
                type="button"
                class="global-search-hint"
                onClick={triggerNewBot}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "0",
                  color: "inherit",
                  display: "inline-flex",
                  "align-items": "center",
                  gap: "5px",
                }}
              >
                {t("sidebar.new.agent")}
                <Kbd>{NEW_AGENT_SHORTCUT}</Kbd>
              </Button>
            </Show>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
