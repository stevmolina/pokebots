import { create } from "zustand";
import { PREVIEW_MODEL_GROUPS } from "./preview-data";

export type PreviewReasoning = "low" | "medium" | "high";
export type PreviewSpeed = "standard" | "fast";

/**
 * The model choice of the preview. It lives only in memory: the profile row, the ••• sheet row and
 * the picker read the same value, so a choice shows everywhere at once. Nothing is saved.
 */
export const usePreviewModelChoice = create<{ modelId: string; reasoning: PreviewReasoning; speed: PreviewSpeed }>(
  () => ({ modelId: "gpt-6.1", reasoning: "medium", speed: "standard" }),
);

export function previewModelName(id: string): string {
  for (const group of PREVIEW_MODEL_GROUPS) {
    const model = group.models.find((candidate) => candidate.id === id);
    if (model) return model.name;
  }
  return id;
}
