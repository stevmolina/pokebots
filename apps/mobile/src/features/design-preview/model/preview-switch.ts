import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

const key = "openbot.mobile.design-preview.v1";

/**
 * The switch of the calm design preview. Off by default. While it is on, the app opens on the
 * preview screens with made-up data, signed in or not; the preview touches no server. A long press on
 * the sign-in title, or the link `openbot://design-preview`, turns it on. The profile menu of the
 * preview turns it off.
 */
export const useDesignPreview = create<{ on: boolean; ready: boolean }>(() => ({ on: false, ready: false }));

export async function loadDesignPreview(): Promise<void> {
  if (useDesignPreview.getState().ready) return;
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
  useDesignPreview.setState({ on, ready: true });
  SecureStore.setItemAsync(key, String(on)).catch(() => undefined);
}

const PREVIEW_LINK =
  /^(?:[a-z][\w+.-]*:\/\/)?\/?(design-preview(?:\/chat\/[\w-]+|\/agent\/[\w-]+(?:\/(?:edit|routines|library))?)?)\/?(\?sheet=(?:sessions|message|model))?$/i;

/**
 * The route of a link to the preview, such as `openbot://design-preview` or
 * `openbot://design-preview/chat/flights?sheet=message` or
 * `openbot://design-preview/agent/flights?sheet=model`, or null for another link.
 */
export function designPreviewRoute(path: string): string | null {
  const match = PREVIEW_LINK.exec(path);
  return match ? `/${match[1]}${match[2] ?? ""}` : null;
}
