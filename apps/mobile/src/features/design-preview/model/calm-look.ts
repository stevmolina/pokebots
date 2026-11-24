import { createContext, useContext } from "react";
import { create } from "zustand";

/**
 * The calm look (the Grok-style design) is the only look of the app since 2026-11-24: every build and
 * every device draws it, with no switch. The store stays so callers keep one shape; it is always on.
 */
export const useCalmLookStore = create<{ on: boolean; ready: boolean; saving: boolean }>(() => ({
  on: true,
  ready: true,
  saving: false,
}));

/** Kept for the app start, which calls it; there is nothing to read. */
export async function loadCalmLook(): Promise<void> {}

/** Whether the app draws the calm look: always. */
export function useCalmLook(): boolean {
  return true;
}

/**
 * The look that home decided for its rows: the calm look, unless the switch is off or home is the pane
 * of a wide window. Rows read it here, so the pane keeps the current rows, and a row does not subscribe
 * to the switch itself. Outside home it is false.
 */
export const CalmRowsContext = createContext(false);

/** Whether a home row draws the calm look. */
export function useCalmRows(): boolean {
  return useContext(CalmRowsContext);
}

/**
 * The fill of an agent's message bubble in the calm look, from the chat list down to its bubbles.
 * Null in the current look, where the bubble keeps its theme fill.
 */
export const CalmBubbleContext = createContext<string | null>(null);
