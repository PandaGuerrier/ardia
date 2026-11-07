import { useBrowser } from "../browser/store";
import type { ProfileColor, ProfileTheme } from "../browser/types";
import { adoptProfileTheme } from "../sync/engine";

export { holdThemedWindowsKeyLook } from "../../platform/theme";

export function setProfileTheme(profileId: string, theme: ProfileTheme | null, adopt = adoptProfileTheme) {
  adopt(profileId);
  useBrowser.getState().setProfileLook(profileId, { theme });
}

export function openThemeEditor(windowId: string, profileId: string) {
  const s = useBrowser.getState();
  if (s.windows[windowId]?.kind !== "main" || !s.profiles[profileId]) return;
  s.setThemeEditorFor(windowId, profileId);
}

export const closeThemeEditor = (windowId: string) => useBrowser.getState().setThemeEditorFor(windowId, null);

export function choosePresetColor(profileId: string, color: ProfileColor, adopt = adoptProfileTheme) {
  adopt(profileId);
  useBrowser.getState().setProfileLook(profileId, { color, theme: null });
}
