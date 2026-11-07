import { useEffect, useRef } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSidebarOpen, useSidebarSide, useTabLayout, useWindow, useWindowId, useWindowUi } from "../../state/browser/hooks";
import { useSidebarWidth } from "../../state/sidebar/hooks";
import { returnFocusToPage } from "../../state/sidebar/actions";
import { choosePresetColor, closeThemeEditor, holdThemedWindowsKeyLook, setProfileTheme } from "../../state/profiles/themeActions";
import { Box, PanelCloseButton, PANEL, POPOVER_MARGIN, PopoverSurface, Text, usePopoverMotion, usePopoverMotionStyle, usePopoverPresence } from "../ui";
import { ThemeEditor, ThemeSwatches, useThemeDraft } from "../settings/ThemeEditor";
import { ThemePresets } from "../settings/ThemePresets";

const WIDTH = 468;
const PRESET_TILE = 26;
const ESCAPE_KEY = [{ key: "Escape" }];

export function ThemePopover() {
  const windowId = useWindowId();
  const target = useWindowUi().themeEditorFor ?? null;
  const kept = useRef(target);
  if (target) kept.current = target;
  const { shown, closing, onClosed } = usePopoverPresence(!!target);
  if (!shown || !kept.current) return null;
  return <ThemePanel key={kept.current} windowId={windowId} profileId={kept.current} closing={closing} onClosed={onClosed} />;
}

function useSidebarEdge(windowId: string) {
  const open = useSidebarOpen();
  const side = useSidebarSide(windowId);
  const width = useSidebarWidth(windowId);
  const topTabs = useTabLayout() === "top";
  return { side, edge: open && !topTabs ? width : 0 };
}

function useClosesWhenWindowLeaves(windowId: string, profileId: string, close: () => void) {
  const shownProfile = useWindow(windowId, (w) => w?.profileId);
  const arrived = useRef(false);
  useEffect(() => {
    if (shownProfile === profileId) arrived.current = true;
    else if (arrived.current) close();
  }, [shownProfile, profileId]);
}

function ThemePanel({ windowId, profileId, closing, onClosed }: { windowId: string; profileId: string; closing: boolean; onClosed: () => void }) {
  const look = useThemeDraft(profileId, (theme) => setProfileTheme(profileId, theme));
  const { side, edge } = useSidebarEdge(windowId);
  const keys = useRef<View>(null);
  const close = () => closeThemeEditor(windowId);
  const gone = !look.profile;
  useClosesWhenWindowLeaves(windowId, profileId, close);
  useEffect(() => {
    if (gone) close();
  }, [gone]);
  useEffect(() => {
    if (closing) return;
    holdThemedWindowsKeyLook(true);
    keys.current?.focus();
    return () => holdThemedWindowsKeyLook(false);
  }, [closing]);
  useEffect(() => () => returnFocusToPage(windowId), []);
  const appear = usePopoverMotion(closing, onClosed);
  const motion = usePopoverMotionStyle(appear, side === "right" ? "bottom right" : "bottom left", true);
  if (!look.profile) return null;
  const { custom, shown, followsApp } = look;
  const place = side === "right" ? { right: edge + POPOVER_MARGIN } : { left: edge + POPOVER_MARGIN };
  return (
    <View pointerEvents={closing ? "none" : "box-none"} style={StyleSheet.absoluteFill}>
      {!closing ? <Pressable style={StyleSheet.absoluteFill} onPress={close} /> : null}
      <Animated.View pointerEvents="box-none" style={[POSITION, place, motion]}>
        <View
          ref={keys}
          focusable
          enableFocusRing={false}
          keyDownEvents={ESCAPE_KEY}
          onKeyDown={(e) => e.nativeEvent.key === "Escape" && close()}
          accessibilityLabel="Edit Theme"
          style={SHRINK}
        >
          <PopoverSurface style={SHRINK}>
            <View style={HEADER}>
              <Text weight="semibold" lines={1}>
                Edit Theme
              </Text>
              <Text size="caption" tone="textSecondary" lines={1}>
                {look.profile.name}
              </Text>
            </View>
            <PanelCloseButton onPress={close} tooltip="Done" />
            <ScrollView showsVerticalScrollIndicator={false} style={SCROLL}>
              <Box gap="l" style={BODY}>
                <Box gap="s">
                  <SectionLabel title="Presets" />
                  <ThemePresets theme={custom} size={PRESET_TILE} onApply={(theme) => look.change(theme, true)} />
                </Box>
                <Box gap="s">
                  <SectionLabel title="Colour" />
                  <ThemeSwatches color={custom ? null : look.profile.color} onPreset={(c) => choosePresetColor(profileId, c)} custom={custom} onCustom={look.startCustom} />
                </Box>
                {custom && shown ? <ThemeEditor theme={custom} look={{ shown, followsApp }} onChange={look.change} /> : null}
              </Box>
            </ScrollView>
          </PopoverSurface>
        </View>
      </Animated.View>
    </View>
  );
}

function SectionLabel({ title }: { title: string }) {
  return (
    <Text size="caption" weight="semibold" tone="textSecondary">
      {title}
    </Text>
  );
}

const POSITION = { position: "absolute", bottom: POPOVER_MARGIN, top: POPOVER_MARGIN, width: WIDTH, justifyContent: "flex-end" } as const;
const HEADER = { paddingHorizontal: PANEL.inset, paddingTop: PANEL.inset, paddingBottom: PANEL.headerGap } as const;
const BODY = { paddingHorizontal: PANEL.inset, paddingBottom: PANEL.inset } as const;
const SCROLL = { flexGrow: 0, flexShrink: 1 } as const;
const SHRINK = { flexShrink: 1 } as const;
