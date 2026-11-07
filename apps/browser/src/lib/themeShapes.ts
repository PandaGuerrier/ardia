import { clamp01, mixOklab, padPosition, type ThemeColor } from "./themeColor";

export const MESH_REACH = 0.65;
const GRAIN_BOOST = 0.5;

const smoothstep = (t: number) => t * t * (3 - 2 * t);

const rgbOf = (c: ThemeColor): [number, number, number] => [c.r, c.g, c.b];

export function acrossStops(colors: ThemeColor[], t: number): [number, number, number] {
  if (colors.length === 1) return rgbOf(colors[0]!);
  const at = clamp01(t) * (colors.length - 1);
  const i = Math.min(Math.floor(at), colors.length - 2);
  return mixOklab(colors[i]!, colors[i + 1]!, at - i);
}

export function radialArea(colors: ThemeColor[], x: number, y: number, width: number, height: number): [number, number, number] {
  const center = padPosition(colors[0]!);
  const cx = center.x * width, cy = center.y * height;
  const reach = Math.max(Math.hypot(cx, cy), Math.hypot(width - cx, cy), Math.hypot(cx, height - cy), Math.hypot(width - cx, height - cy)) || 1;
  return acrossStops(colors, Math.hypot(x - cx, y - cy) / reach);
}

export function meshArea(colors: ThemeColor[], x: number, y: number, width: number, height: number): [number, number, number] {
  const reach = MESH_REACH * Math.max(width, height) || 1;
  let rgb = rgbOf(colors[0]!);
  for (const c of colors.slice(1)) {
    const p = padPosition(c);
    const a = c.a * (1 - smoothstep(clamp01(Math.hypot(x - p.x * width, y - p.y * height) / reach)));
    const top = rgbOf(c);
    rgb = rgb.map((v, i) => v + (top[i]! - v) * a) as [number, number, number];
  }
  return rgb;
}

export function grainStrength(grain: number): number {
  const g = clamp01(grain);
  return g * (1 + GRAIN_BOOST * g ** 4);
}

export function grainForStrength(strength: number): number {
  if (strength >= grainStrength(1)) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (grainStrength(mid) < strength) lo = mid;
    else hi = mid;
  }
  return Math.max(0, (lo + hi) / 2);
}
