import type { AgentProviderId } from "@pokebots/contracts/ipc";
import { create } from "zustand";
import { PREVIEW_DEFAULT_MODEL, PREVIEW_MODEL_GROUPS } from "./preview-data";

export type PreviewReasoning = "low" | "medium" | "high";
export type PreviewSpeed = "standard" | "fast";

/**
 * The model choice of the preview. It lives only in memory: the profile row, the ••• sheet row and
 * the picker read the same value, so a choice shows everywhere at once. Nothing is saved.
 */
export const usePreviewModelChoice = create<{ modelId: string; reasoning: PreviewReasoning; speed: PreviewSpeed }>(
  () => ({ modelId: PREVIEW_DEFAULT_MODEL, reasoning: "medium", speed: "standard" }),
);

export function previewModelName(id: string): string {
  for (const group of PREVIEW_MODEL_GROUPS) {
    const model = group.models.find((candidate) => candidate.id === id);
    if (model) return model.name;
  }
  return id;
}

/** The provider whose logo stands for a model, such as Claude for Claude Opus. */
export function previewModelMark(id: string): AgentProviderId {
  return PREVIEW_MODEL_GROUPS.find((group) => group.models.some((model) => model.id === id))?.mark ?? "codex";
}
