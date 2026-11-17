import type { ComputerManagementInput } from "@openbot/contracts/ipc";
import { Button, ConfirmDialog, Field, Input } from "@openbot/ui";
import { createStore, Show } from "solid-js";
import { useText } from "../../text";
import type { CloudComputer } from "./CloudComputerList";

export type ComputerAction = (input: ComputerManagementInput) => Promise<void>;

export function ComputerStartForm(props: { busy: boolean; onManage: ComputerAction }) {
  const { t } = useText();
  const [state, setState] = createStore<{ context: string; size: "standard" | "large" }>({
    context: "",
    size: "standard",
  });
  return (
    <form
      class="agent-computer-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!props.busy && /^[a-z0-9-]{1,32}$/u.test(state.context))
          void props.onManage({ operation: "start", target: state.context, size: state.size, confirm: "no" });
      }}
    >
      <Field label={t("server.computers.context")} description={t("server.computers.contextHint")}>
        <Input
          value={state.context}
          maxlength={32}
          pattern="[a-z0-9-]{1,32}"
          required
          onInput={(event) =>
            setState((state) => {
              state.context = event.currentTarget.value;
            })
          }
        />
      </Field>
      <div class="agent-computer-actions">
        <Button
          type="button"
          variant="outline"
          aria-pressed={state.size === "standard" ? "true" : "false"}
          disabled={props.busy}
          onClick={() =>
            setState((state) => {
              state.size = "standard";
            })
          }
        >
          {t("server.computers.standard")}
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-pressed={state.size === "large" ? "true" : "false"}
          disabled={props.busy}
          onClick={() =>
            setState((state) => {
              state.size = "large";
            })
          }
        >
          {t("server.computers.large")}
        </Button>
        <Button type="submit" disabled={props.busy || !/^[a-z0-9-]{1,32}$/u.test(state.context)}>
          {t("server.computers.start")}
        </Button>
      </div>
    </form>
  );
}

export function ComputerControls(props: { machine: CloudComputer; busy: boolean; onManage: ComputerAction }) {
  const { t } = useText();
  const [state, setState] = createStore({ confirm: false });
  const act = (operation: ComputerManagementInput["operation"]) =>
    props.onManage({
      operation,
      target: operation === "start" ? props.machine.context : props.machine.id,
      size: "standard",
      confirm: operation === "destroy" ? "yes" : "no",
    });
  return (
    <>
      <details class="computer-details">
        <summary>{t("server.computers.actions")}</summary>
        <p>{t("server.computers.agentUnknown")}</p>
        <div class="agent-computer-actions">
          <Show
            when={props.machine.status === "running"}
            fallback={
              <Button disabled={props.busy} onClick={() => void act("start")}>
                {t("server.computers.start")}
              </Button>
            }
          >
            <Button disabled={props.busy} onClick={() => void act("stop")}>
              {t("server.computers.stop")}
            </Button>
            <Button variant="outline" disabled={props.busy} onClick={() => void act("screenshot")}>
              {t("server.computers.screenshot")}
            </Button>
          </Show>
          <Button
            variant="ghost"
            disabled={props.busy}
            onClick={() =>
              setState((state) => {
                state.confirm = true;
              })
            }
          >
            {t("server.computers.destroy")}
          </Button>
        </div>
      </details>
      <ConfirmDialog
        open={state.confirm}
        onCancel={() =>
          setState((state) => {
            state.confirm = false;
          })
        }
        title={t("server.computers.destroyTitle", { name: props.machine.context })}
        description={t("server.computers.destroyDescription")}
        confirmLabel={t("server.computers.destroy")}
        pending={props.busy}
        onConfirm={async () => {
          await act("destroy");
          setState((state) => {
            state.confirm = false;
          });
        }}
      />
    </>
  );
}
