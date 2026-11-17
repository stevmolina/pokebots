import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { APP_BRAND } from "@/shared/lib/app-brand";

const key = "openbot.mobile.design-preview.v1";

/**
 * The preview exists only in development builds and in Steven's Pokebots build. The store build
 * ignores the switch, the link and the long press, so a link from another app cannot replace its
 * sign-in screen with made-up data.
 */
export const DESIGN_PREVIEW_ALLOWED = __DEV__ || APP_BRAND === "pokebots";

/**
 * The switch of the calm design preview, with made-up data; the preview touches no server. A long
 * press on the sign-in title, or the link `openbot://design-preview`, opens it, and the profile menu of
 * the preview closes it. A signed-out start always shows sign-in, so the switch never hides it.
 */
export const useDesignPreview = create<{ on: boolean; ready: boolean }>(() => ({ on: false, ready: false }));

export async function loadDesignPreview(): Promise<void> {
  if (useDesignPreview.getState().ready) return;
  if (!DESIGN_PREVIEW_ALLOWED) {
    useDesignPreview.setState({ on: false, ready: true });
    return;
  }
  try {
    const stored = await SecureStore.getItemAsync(key);
    if (!useDesignPreview.getState().ready) useDesignPreview.setState({ on: stored === "true" });
  } catch {
    // A failed read leaves the preview off, as on a new install.
  } finally {
    useDesignPreview.setState({ ready: true });
  }
}

export function setDesignPreview(on: boolean): void {
  if (!DESIGN_PREVIEW_ALLOWED) return;
  useDesignPreview.setState({ on, ready: true });
  SecureStore.setItemAsync(key, String(on)).catch(() => undefined);
}

const PREVIEW_LINK =
  /^(?:[a-z][\w+.-]*:\/\/)?\/?(design-preview(?:\/chat\/[\w-]+|\/agent\/[\w-]+(?:\/(?:edit|routines|library))?)?)\/?(\?sheet=(?:sessions|message|model))?$/;

/**
 * The route of a link to the preview, such as `openbot://design-preview` or
 * `openbot://design-preview/chat/flights?sheet=message` or
 * `openbot://design-preview/agent/flights?sheet=model`, or null for another link.
 */
export function designPreviewRoute(path: string): string | null {
  if (!DESIGN_PREVIEW_ALLOWED) return null;
  const match = PREVIEW_LINK.exec(path);
  return match ? `/${match[1]}${match[2] ?? ""}` : null;
}
