import { THEME_SHAPES, THEME_TEXTURES, type ThemeBackdropProps, type ThemeMode, type ThemeShape, type ThemeTexture } from "@ardia/core";
import { parseColor, rgbToHsl, toHex } from "./color";
import { clamp01, decode, mixOklab, padColor, padPosition, type ThemeColor } from "./themeColor";
import { acrossStops, grainStrength, meshArea, radialArea } from "./themeShapes";

export { fromOklab, mixOklab, oklab, PAD_LIGHTNESS, padColor, padPosition, type ThemeColor } from "./themeColor";
export { grainForStrength, grainStrength, MESH_REACH } from "./themeShapes";
import { numberOr } from "./decode";

export type ProfileColor = "plum" | "blue" | "purple" | "pink" | "red" | "orange" | "yellow" | "green" | "neutral";

export type ThemeStop = { color: ThemeColor; x: number; y: number };

export type ThemeLook = {
  stops: ThemeStop[];
  intensity: number;
  grain: number;
  texture: ThemeTexture;
  translucency: number;
  angle?: number;
  shape?: ThemeShape;
  grainSize?: number;
};

export type ProfileTheme = ThemeLook & {
  mode: ThemeMode;
  dark?: ThemeLook;
};

export type ProfileLookFields = { color: ProfileColor; theme?: ProfileTheme | null };

export const MAX_THEME_STOPS = 5;
export const LEGACY_THEME_STOPS = 3;

const TEXTURE_STRENGTH: Record<ThemeTexture, number> = { grain: 0.8, sand: 0.15, denim: 0.6, tweed: 0.4 };
const BASE_REACH = 0.75;
export const DEFAULT_THEME_ANGLE = 135;
export const DEFAULT_THEME_SHAPE: ThemeShape = "linear";
export const DEFAULT_GRAIN_SIZE = 0.5;

export const PRESET_BACKDROP: ThemeBackdropProps = {
  themeColors: [],
  themeOpacity: 1,
  themeBaseAlpha: 0,
  themeGrain: 0,
  themeTexture: "grain",
  themeAppearance: "auto",
  themeAngle: DEFAULT_THEME_ANGLE,
  themeShape: DEFAULT_THEME_SHAPE,
  themeGrainScale: 1,
};


const unitHex = (c: number[]) => toHex(c.map((v) => clamp01(v) * 255));

export function colorHex(color: ThemeColor): string {
  return unitHex([color.r, color.g, color.b]);
}

export function hexColor(hex: string): ThemeColor {
  const [r, g, b] = parseColor(hex);
  return { r: r / 255, g: g / 255, b: b / 255, a: 1 };
}

export function lookAngle(theme: Pick<ThemeLook, "angle">): number {
  return theme.angle ?? DEFAULT_THEME_ANGLE;
}

export function lookShape(theme: Pick<ThemeLook, "shape">): ThemeShape {
  return theme.shape ?? DEFAULT_THEME_SHAPE;
}

export function lookGrainSize(theme: Pick<ThemeLook, "grainSize">): number {
  return theme.grainSize ?? DEFAULT_GRAIN_SIZE;
}

export function lookGrainScale(theme: Pick<ThemeLook, "grainSize">): number {
  const size = clamp01(lookGrainSize(theme));
  return size <= 0.5 ? 0.5 * 2 ** (2 * size) : 3 ** (2 * size - 1);
}

export function usesLegacyGradient(theme: Pick<ThemeLook, "shape" | "stops">): boolean {
  return lookShape(theme) === "linear" && theme.stops.length <= LEGACY_THEME_STOPS;
}

const direction = (degrees: number) => {
  const r = (degrees * Math.PI) / 180;
  return { dx: Math.sin(r), dy: -Math.cos(r) };
};

const baseHalf = (width: number, height: number, dx: number, dy: number) =>
  (Math.hypot(width * dx, height * dy) * Math.hypot(width, height)) / (2 * Math.max(width, height));

const overlayHalf = (width: number, height: number, dx: number, dy: number) => (width * Math.abs(dx) + height * Math.abs(dy)) / 2;

function along(degrees: number, x: number, y: number, width: number, height: number, half: typeof baseHalf): number {
  const { dx, dy } = direction(degrees);
  return ((x - width / 2) * dx + (y - height / 2) * dy) / (2 * half(width, height, dx, dy)) + 0.5;
}

export function themeArea(theme: ProfileTheme, x: number, y: number, width: number, height: number): [number, number, number] {
  if (!usesLegacyGradient(theme)) {
    const colors = theme.stops.slice(0, MAX_THEME_STOPS).map((s) => s.color);
    const shape = lookShape(theme);
    if (shape === "radial") return radialArea(colors, x, y, width, height);
    if (shape === "mesh") return meshArea(colors, x, y, width, height);
    return acrossStops(colors, along(lookAngle(theme), x, y, width, height, baseHalf) / BASE_REACH);
  }
  const [c0, c1 = c0, c2] = theme.stops.map((s) => s.color) as [ThemeColor, ThemeColor?, ThemeColor?];
  const angle = lookAngle(theme);
  const t = clamp01(along(angle, x, y, width, height, baseHalf) / BASE_REACH);
  const base = mixOklab(c0, c1, t);
  if (!c2) return base;
  const a = clamp01(along(angle + 45, x, y, width, height, overlayHalf)) * c2.a;
  return base.map((v, i) => v + ((i === 0 ? c2.r : i === 1 ? c2.g : c2.b) - v) * a) as [number, number, number];
}

export function themeDark(theme: ProfileTheme, appDark: boolean): boolean {
  return theme.mode === "auto" ? appDark : theme.mode === "dark";
}

export function resolveTheme(theme: ProfileTheme, dark: boolean): ProfileTheme {
  const { dark: darkLook, ...base } = theme;
  if (!dark || !darkLook) return base;
  const { angle: _lightAngle, ...light } = base;
  return { ...light, ...darkLook };
}

export const DARKENED_LOOK_KEEP = 0.4;

export function darkenedLook(theme: ProfileTheme, keep = DARKENED_LOOK_KEEP): ProfileTheme {
  return { ...theme, stops: theme.stops.map((s) => ({ ...s, color: { ...s.color, r: s.color.r * keep, g: s.color.g * keep, b: s.color.b * keep } })) };
}

export type LookSource = "own" | "app" | "utility";

export function spaceLookSource(settings: { spacesFollowAppearance: boolean }): LookSource {
  return settings.spacesFollowAppearance ? "app" : "own";
}

export type ShownLook = { look: ProfileTheme; requestedDark: boolean; dark: boolean };

export function requestedDarkFor(theme: ProfileTheme, appDark: boolean, source: LookSource): boolean {
  return source === "own" ? themeDark(theme, appDark) : appDark;
}

export function shownLook(theme: ProfileTheme, appDark: boolean, source: LookSource): ShownLook {
  const requestedDark = requestedDarkFor(theme, appDark, source);
  const resolved = resolveTheme(theme, requestedDark);
  const lightOnly = theme.mode !== "dark" && !theme.dark;
  const look = source !== "own" && requestedDark && lightOnly && !readableDark(resolved, true) ? darkenedLook(resolved) : resolved;
  const dark = source === "utility" ? requestedDark : readableDark(look, requestedDark);
  return { look, requestedDark, dark };
}

export function arcLayerAlpha(intensity: number): number {
  return 0.2 + 0.55 * clamp01(intensity);
}

export function themeLayerAlpha(theme: ProfileTheme): number {
  return 1 - clamp01(theme.translucency) * (1 - arcLayerAlpha(theme.intensity));
}

export function themeUnderlayAlpha(theme: ProfileTheme, dark: boolean): number {
  const arc = Math.min(arcLayerAlpha(theme.intensity), 0.5);
  return clamp01(theme.translucency) * (dark ? 0.35 * arc : arc);
}

export function themeGrainAlpha(theme: ProfileTheme): number {
  return grainStrength(theme.grain) * TEXTURE_STRENGTH[theme.texture];
}

export function flatColors(theme: ProfileTheme): number[] {
  return theme.stops.slice(0, MAX_THEME_STOPS).flatMap((s) => [s.color.r, s.color.g, s.color.b, s.color.a]);
}

export function themeBackdrop(theme: ProfileTheme, dark: boolean): ThemeBackdropProps {
  return {
    themeColors: flatColors(theme),
    themeOpacity: themeLayerAlpha(theme),
    themeBaseAlpha: themeUnderlayAlpha(theme, dark),
    themeGrain: themeGrainAlpha(theme),
    themeTexture: theme.texture,
    themeAppearance: theme.mode,
    themeAngle: lookAngle(theme),
    themeShape: lookShape(theme),
    themeGrainScale: lookGrainScale(theme),
  };
}

export function themeAccent(theme: ProfileTheme): string {
  return unitHex(themeArea(theme, 0.5, 0.5, 1, 1));
}

export function themePalette(theme: ProfileTheme): string[] {
  return theme.stops.map((s) => colorHex(s.color));
}

function underGrey(theme: ProfileTheme, dark: boolean): number {
  const u = themeUnderlayAlpha(theme, dark);
  const blur = dark ? 0.16 : 0.92;
  return (dark ? 0 : 1) * u + blur * (1 - u);
}

export function themeUnderColor(theme: ProfileTheme, dark: boolean): string {
  const grey = underGrey(theme, dark);
  return unitHex([grey, grey, grey]);
}

function composite(theme: ProfileTheme, dark: boolean, x: number, y: number): number[] {
  const a = themeLayerAlpha(theme);
  const under = underGrey(theme, dark);
  return themeArea(theme, x, y, 1, 1).map((v) => a * clamp01(v) + (1 - a) * under);
}

export function opaqueThemeTint(theme: ProfileTheme, dark: boolean): [string, string] {
  return [unitHex(composite(theme, dark, 0, 0)), unitHex(composite(theme, dark, 1, 1))];
}

const SAMPLE_POINTS = [0, 0.5, 1];
const MIN_BLACK_TEXT_CONTRAST = 3;
const MIN_WHITE_TEXT_CONTRAST = 2;

const relativeLuminance = (c: number[]) => {
  const [r, g, b] = c.map((v) => decode(clamp01(v))) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function themeLuminance(theme: ProfileTheme, dark: boolean): number {
  let sum = 0;
  for (const x of SAMPLE_POINTS) for (const y of SAMPLE_POINTS) sum += relativeLuminance(composite(theme, dark, x, y));
  return sum / SAMPLE_POINTS.length ** 2;
}

export function readableDark(theme: ProfileTheme, dark: boolean): boolean {
  const y = themeLuminance(theme, dark);
  const blackText = (y + 0.05) / 0.05, whiteText = 1.05 / (y + 0.05);
  if (dark) return !(whiteText < MIN_WHITE_TEXT_CONTRAST && blackText > whiteText);
  return blackText < MIN_BLACK_TEXT_CONTRAST && whiteText > blackText;
}

export function stopLightness(stop: ThemeStop): number {
  return rgbToHsl(clamp01(stop.color.r), clamp01(stop.color.g), clamp01(stop.color.b))[2];
}

export function withStopAt(theme: ProfileTheme, index: number, x: number, y: number): ProfileTheme {
  const stops = theme.stops.map((s, i) => (i === index ? { x, y, color: { ...padColor(x, y, stopLightness(s)), a: s.color.a } } : s));
  return { ...theme, stops };
}

export function withStopLightness(theme: ProfileTheme, index: number, lightness: number): ProfileTheme {
  const stops = theme.stops.map((s, i) => (i === index ? { ...s, color: { ...padColor(s.x, s.y, lightness), a: s.color.a } } : s));
  return { ...theme, stops };
}

export function withAngle(theme: ProfileTheme, degrees: number): ProfileTheme {
  return { ...theme, angle: ((Math.round(degrees) % 360) + 360) % 360 };
}

export function withAddedStop(theme: ProfileTheme): ProfileTheme {
  if (theme.stops.length >= MAX_THEME_STOPS) return theme;
  const last = theme.stops[theme.stops.length - 1] ?? { x: 0.8, y: 0.5 };
  const angle = Math.atan2(last.y - 0.5, last.x - 0.5) + (2 * Math.PI) / 5;
  const radius = Math.max(0.3, Math.hypot(last.x - 0.5, last.y - 0.5));
  const x = 0.5 + radius * Math.cos(angle), y = 0.5 + radius * Math.sin(angle);
  return { ...theme, stops: [...theme.stops, { x, y, color: padColor(x, y) }] };
}

export function withoutStop(theme: ProfileTheme, index: number): ProfileTheme {
  if (theme.stops.length <= 1) return theme;
  return { ...theme, stops: theme.stops.filter((_, i) => i !== index) };
}

export function startingTheme(swatch: string): ProfileTheme {
  const base = padPosition(hexColor(swatch));
  const angle = Math.atan2(base.y - 0.5, base.x - 0.5);
  const radius = Math.max(0.3, Math.hypot(base.x - 0.5, base.y - 0.5));
  const stop = (offset: number): ThemeStop => {
    const x = 0.5 + radius * Math.cos(angle + offset), y = 0.5 + radius * Math.sin(angle + offset);
    return { x, y, color: padColor(x, y) };
  };
  return { stops: [stop(-0.45), stop(0.45)], intensity: 0.6, mode: "auto", grain: 0, texture: "grain", translucency: 1 };
}

function sanitizeColor(v: unknown): ThemeColor | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  const parts = [c.r, c.g, c.b];
  if (!parts.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 4)) return null;
  return { r: c.r as number, g: c.g as number, b: c.b as number, a: clamp01(numberOr(c.a, 1)) };
}

const MAX_SANITIZED_STOPS = 16;

function sanitizeLook(v: unknown): ThemeLook | null {
  if (!v || typeof v !== "object") return null;
  const t = v as Record<string, unknown>;
  if (!Array.isArray(t.stops)) return null;
  const stops: ThemeStop[] = [];
  for (const raw of t.stops.slice(0, MAX_SANITIZED_STOPS)) {
    if (stops.length >= MAX_THEME_STOPS) break;
    const s = raw as Record<string, unknown> | null;
    const color = sanitizeColor(s?.color);
    if (color) stops.push({ color, x: clamp01(numberOr(s!.x, 0.5)), y: clamp01(numberOr(s!.y, 0.5)) });
  }
  if (!stops.length) return null;
  return {
    stops,
    intensity: clamp01(numberOr(t.intensity, 0.6)),
    grain: clamp01(numberOr(t.grain, 0)),
    texture: THEME_TEXTURES.includes(t.texture as ThemeTexture) ? (t.texture as ThemeTexture) : "grain",
    translucency: clamp01(numberOr(t.translucency, 1)),
    ...(typeof t.angle === "number" && Number.isFinite(t.angle) ? { angle: ((t.angle % 360) + 360) % 360 } : {}),
    ...(THEME_SHAPES.includes(t.shape as ThemeShape) ? { shape: t.shape as ThemeShape } : {}),
    ...(typeof t.grainSize === "number" && Number.isFinite(t.grainSize) ? { grainSize: clamp01(t.grainSize) } : {}),
  };
}

export function sanitizeTheme(v: unknown): ProfileTheme | null {
  const look = sanitizeLook(v);
  if (!look) return null;
  const t = v as Record<string, unknown>;
  const dark = sanitizeLook(t.dark);
  return { ...look, mode: t.mode === "light" || t.mode === "dark" ? t.mode : "auto", ...(dark ? { dark } : {}) };
}
