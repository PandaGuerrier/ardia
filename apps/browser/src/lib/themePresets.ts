import type { ThemeShape, ThemeTexture } from "@ardia/core";
import { lookGrainSize, lookShape, padColor, type ProfileTheme, type ThemeStop } from "./profileLook";

export type ThemePreset = { id: string; name: string; theme: ProfileTheme };

type Hsl = readonly [hue: number, saturation: number, lightness: number];
type PresetSpec = {
  id: string;
  name: string;
  shape: ThemeShape;
  stops: Hsl[];
  intensity: number;
  grain: number;
  grainSize?: number;
  texture?: ThemeTexture;
  translucency?: number;
  angle?: number;
  mode?: ProfileTheme["mode"];
};

function hslStop([hue, saturation, lightness]: Hsl): ThemeStop {
  const r = (hue * Math.PI) / 180;
  const x = 0.5 + 0.5 * saturation * Math.cos(r), y = 0.5 + 0.5 * saturation * Math.sin(r);
  return { x, y, color: padColor(x, y, lightness) };
}

function preset({ id, name, shape, stops, intensity, grain, grainSize = 0.5, texture = "grain", translucency = 1, angle, mode = "auto" }: PresetSpec): ThemePreset {
  return {
    id,
    name,
    theme: { stops: stops.map(hslStop), intensity, grain, grainSize, texture, translucency, shape, mode, ...(angle === undefined ? {} : { angle }) },
  };
}

export const THEME_PRESETS: readonly ThemePreset[] = [
  preset({ id: "aurora", name: "Aurora", shape: "mesh", stops: [[170, 0.85, 0.55], [130, 0.7, 0.6], [275, 0.75, 0.62], [215, 0.85, 0.55]], intensity: 0.75, grain: 0.35, grainSize: 0.4 }),
  preset({ id: "peach", name: "Peach", shape: "linear", stops: [[22, 0.9, 0.74], [345, 0.8, 0.78]], intensity: 0.55, grain: 0.2, angle: 135 }),
  preset({ id: "ocean", name: "Ocean", shape: "radial", stops: [[195, 0.9, 0.55], [222, 0.85, 0.36], [185, 0.7, 0.66]], intensity: 0.7, grain: 0.25 }),
  preset({ id: "mint", name: "Mint", shape: "linear", stops: [[150, 0.6, 0.78], [172, 0.55, 0.68]], intensity: 0.5, grain: 0.15, angle: 180 }),
  preset({ id: "neon", name: "Neon", shape: "mesh", stops: [[310, 1, 0.55], [265, 1, 0.56], [190, 1, 0.5], [55, 1, 0.56], [335, 1, 0.6]], intensity: 0.9, grain: 0.5, grainSize: 0.3 }),
  preset({ id: "dusk", name: "Dusk", shape: "linear", stops: [[25, 0.85, 0.62], [330, 0.6, 0.46], [255, 0.55, 0.34]], intensity: 0.8, grain: 0.3, angle: 180 }),
  preset({ id: "lavender", name: "Lavender", shape: "radial", stops: [[270, 0.6, 0.8], [292, 0.45, 0.7]], intensity: 0.5, grain: 0.3, texture: "sand" }),
  preset({ id: "ember", name: "Ember", shape: "mesh", stops: [[5, 0.9, 0.55], [35, 0.95, 0.6], [340, 0.8, 0.5]], intensity: 0.85, grain: 0.4, grainSize: 0.6 }),
  preset({ id: "forest", name: "Forest", shape: "linear", stops: [[140, 0.5, 0.35], [95, 0.45, 0.45], [170, 0.4, 0.3]], intensity: 0.7, grain: 0.45, texture: "denim", angle: 160 }),
  preset({ id: "lagoon", name: "Lagoon", shape: "radial", stops: [[175, 0.8, 0.55], [195, 0.8, 0.6], [150, 0.6, 0.7], [210, 0.7, 0.45]], intensity: 0.7, grain: 0.3, grainSize: 0.35 }),
  preset({ id: "rose", name: "Rosé", shape: "linear", stops: [[340, 0.55, 0.8], [15, 0.5, 0.82]], intensity: 0.5, grain: 0.3, texture: "tweed", angle: 90 }),
  preset({ id: "midnight", name: "Midnight", shape: "mesh", stops: [[235, 0.6, 0.25], [265, 0.55, 0.3], [210, 0.6, 0.2], [290, 0.4, 0.35]], intensity: 0.8, grain: 0.45, grainSize: 0.7, mode: "dark" }),
];

const rounded = (v: number) => Math.round(v * 1000) / 1000;

function lookKey(theme: ProfileTheme): string {
  return JSON.stringify([
    theme.stops.map((s) => [s.x, s.y, s.color.r, s.color.g, s.color.b, s.color.a].map(rounded)),
    lookShape(theme),
    rounded(lookGrainSize(theme)),
    rounded(theme.intensity),
    rounded(theme.grain),
    theme.texture,
    rounded(theme.translucency),
    lookShape(theme) === "linear" ? (theme.angle ?? null) : null,
    theme.mode,
    !!theme.dark,
  ]);
}

export function presetOf(theme: ProfileTheme | null | undefined): ThemePreset | null {
  if (!theme) return null;
  const key = lookKey(theme);
  return THEME_PRESETS.find((p) => lookKey(p.theme) === key) ?? null;
}
