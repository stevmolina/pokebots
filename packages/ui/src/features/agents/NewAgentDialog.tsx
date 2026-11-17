import { INPUT_LIMITS } from "@openbot/contracts/input-limits";
import { Button, Dialog, Field, Input } from "@openbot/ui";
import { For, Show } from "solid-js";
import { avatarArtworkColor, avatarColorChoices, isAvatarArtworkColorChoice } from "../../bloub-avatar";
import { useText } from "../../text";
import { AgentAvatar } from "./AgentAvatar";
import { avatarColorChoiceLabel } from "./avatar-hue-label";
import { FIRST_AGENT_AVATAR_SEEDS, type FirstAgentDraft } from "./FirstAgentSetup";
import { instructionsTooLong } from "./InstructionsLimit";

/** The face choices are small. At the default eye size their eyes are too small to compare. */
const FACE_CHOICE_EYE_SCALE = 1.25;

export interface NewAgentDialogProps {
  value: FirstAgentDraft;
  submitting?: boolean;
  error?: string | null;
  onChange: (value: FirstAgentDraft) => void;
  onSubmit: (value: FirstAgentDraft) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * A new agent, as a small dialog: a face, a color and a name. The purpose and the model are not asked here: the
 * draft keeps the model that the window resolved for it, and the user sets both in Edit agent later. The first
 * agent of a server keeps the full page (`FirstAgentSetup`), where a suggestion fills all of the form.
 */
export function NewAgentDialog(props: NewAgentDialogProps) {
  const { t, sourceText } = useText();
  const canSubmit = () =>
    Boolean(props.value.name.trim()) && !instructionsTooLong(props.value.purpose) && !props.submitting;
  const automaticColor = () => props.value.avatarHue === null && (props.value.avatarColor ?? null) === null;

  function updateDraft(updates: Partial<FirstAgentDraft>): void {
    if (props.submitting) return;
    props.onChange({ ...props.value, ...updates, suggestionId: null });
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !props.submitting) props.onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay class="new-agent-dialog-overlay" />
        <Dialog.Content class="new-agent-dialog" aria-describedby={undefined}>
          <form
            class="new-agent-dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSubmit()) void props.onSubmit(props.value);
            }}
          >
            <Dialog.Title as="h2" class="new-agent-dialog-title">
              {t("agent.setup.titleAdditional")}
            </Dialog.Title>

            <div class="new-agent-dialog-avatar">
              <AgentAvatar
                seed={props.value.avatarSeed}
                hue={props.value.avatarHue}
                color={props.value.avatarColor ?? null}
                motion="idle"
                animationOffset={0.4}
              />
            </div>

            <fieldset class="first-agent-avatar-fieldset new-agent-dialog-fieldset" disabled={props.submitting}>
              <legend class="sr-only">{t("agent.setup.color")}</legend>
              <div class="first-agent-color-options">
                <Button
                  variant="ghost"
                  type="button"
                  size="sm"
                  class="first-agent-color-choice"
                  aria-label={t("agent.setup.colorAutomatic")}
                  aria-pressed={automaticColor() ? "true" : "false"}
                  data-cuelume-tap="select"
                  onClick={() => updateDraft({ avatarHue: null, avatarColor: null })}
                >
                  <span
                    class="first-agent-color-swatch"
                    style={{ background: avatarArtworkColor(props.value.avatarSeed, null) }}
                  />
                </Button>
                <For each={avatarColorChoices(props.value.avatarSeed)}>
                  {(option) => (
                    <Button
                      variant="ghost"
                      type="button"
                      size="sm"
                      class="first-agent-color-choice"
                      aria-label={t("agent.setup.colorOption", { color: t(avatarColorChoiceLabel(option)) })}
                      aria-pressed={
                        isAvatarArtworkColorChoice(
                          props.value.avatarSeed,
                          option,
                          props.value.avatarHue,
                          props.value.avatarColor,
                        )
                          ? "true"
                          : "false"
                      }
                      data-cuelume-tap="select"
                      onClick={() => updateDraft({ avatarHue: option.hue, avatarColor: option.color })}
                    >
                      <span class="first-agent-color-swatch" style={{ background: option.swatch }} />
                    </Button>
                  )}
                </For>
              </div>
            </fieldset>

            <fieldset class="first-agent-avatar-fieldset new-agent-dialog-fieldset" disabled={props.submitting}>
              <legend class="sr-only">{t("agent.setup.face")}</legend>
              <div class="first-agent-face-options">
                <For each={FIRST_AGENT_AVATAR_SEEDS}>
                  {(seed, index) => (
                    <Button
                      variant="ghost"
                      type="button"
                      size="sm"
                      class="first-agent-face-choice"
                      aria-label={t("agent.setup.faceOption", { number: index() + 1 })}
                      aria-pressed={props.value.avatarSeed === seed ? "true" : "false"}
                      data-cuelume-tap="select"
                      onClick={() => updateDraft({ avatarSeed: seed })}
                    >
                      <AgentAvatar
                        seed={seed}
                        hue={props.value.avatarHue}
                        color={props.value.avatarColor ?? null}
                        motion="idle"
                        animationOffset={index() * 0.16}
                        eyeScale={FACE_CHOICE_EYE_SCALE}
                      />
                    </Button>
                  )}
                </For>
              </div>
            </fieldset>

            <Field label={t("agent.setup.name")} required>
              <Input
                value={props.value.name}
                maxlength={INPUT_LIMITS.agentName}
                autocomplete="off"
                disabled={props.submitting}
                onValueChange={(name) => updateDraft({ name })}
              />
            </Field>

            <Show when={props.error}>
              {(error) => (
                <p class="first-agent-error" role="alert">
                  {sourceText(error())}
                </p>
              )}
            </Show>

            <div class="new-agent-dialog-actions">
              <Button type="button" variant="ghost" disabled={props.submitting} onClick={() => props.onCancel()}>
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                variant="default"
                disabled={!canSubmit()}
                loading={props.submitting}
                loadingLabel={t("agent.setup.creating")}
              >
                {t("agent.setup.create")}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
