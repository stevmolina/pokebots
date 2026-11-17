/**
 * Opens the model picker of the open agent. The picker is a row of the agent settings, so the caller
 * opens the settings first and this waits for the row to show, a few frames at most, then clicks it.
 * A picker that is off, such as one with the model fixed by another app, stays closed.
 */
const MODEL_PICKER_TRIGGER = ".agent-settings-page .provider-model-trigger-field";
const MAX_WAIT_FRAMES = 30;

export function openSettingsModelPicker(target: Window): void {
  let frames = 0;
  const attempt = () => {
    const trigger = target.document.querySelector<HTMLButtonElement>(MODEL_PICKER_TRIGGER);
    if (trigger && !trigger.disabled) {
      trigger.focus();
      trigger.click();
      return;
    }
    frames += 1;
    if (frames < MAX_WAIT_FRAMES) target.requestAnimationFrame(attempt);
  };
  attempt();
}
