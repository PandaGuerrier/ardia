import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { flatColors, lookAngle, lookGrainScale, lookShape, themeAccent, themeGrainAlpha } from "../../lib/profileLook";
import { presetOf, THEME_PRESETS } from "../../lib/themePresets";
import type { ProfileTheme } from "../../state/browser/types";
import { Swatch, swatch, ThemeSwatch } from "../ui";

export function ColorButton({ name, ring, size, selected, onPress, children }: { name: string; ring: string; size: number; selected: boolean; onPress: () => void; children?: ReactNode }) {
  return (
    <View tooltip={name}>
      <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={name}>
        {({ pressed }) => (
          <View style={{ transform: [{ scale: pressed ? PRESSED_SCALE : 1 }] }}>
            <Swatch animated size={size} selected={selected} ring={ring} fill={children ? undefined : ring}>
              {children}
            </Swatch>
          </View>
        )}
      </Pressable>
    </View>
  );
}

export function LookSwatch({ theme }: { theme: ProfileTheme }) {
  return (
    <ThemeSwatch
      colors={flatColors(theme)}
      angle={lookAngle(theme)}
      shape={lookShape(theme)}
      grain={themeGrainAlpha(theme)}
      grainScale={lookGrainScale(theme)}
      texture={theme.texture}
      style={FILL}
    />
  );
}

export function ThemePresets({
  theme,
  onApply,
  size = PRESET_SIZE,
  gap = swatch.gap,
}: {
  theme: ProfileTheme | null;
  onApply: (theme: ProfileTheme) => void;
  size?: number;
  gap?: number;
}) {
  const current = presetOf(theme)?.id ?? null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap }} accessibilityRole="radiogroup" accessibilityLabel="Theme presets">
      {THEME_PRESETS.map((p) => (
        <ColorButton key={p.id} name={p.name} ring={themeAccent(p.theme)} size={size} selected={current === p.id} onPress={() => onApply(p.theme)}>
          <LookSwatch theme={p.theme} />
        </ColorButton>
      ))}
    </View>
  );
}

const FILL = { flex: 1 } as const;
const PRESSED_SCALE = 0.94;
const PRESET_SIZE = 28;
