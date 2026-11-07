import { hslToRgb, rgbToHsl } from "./color";

export type ThemeColor = { r: number; g: number; b: number; a: number };

export const PAD_LIGHTNESS = 0.6;

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function padColor(x: number, y: number, lightness = PAD_LIGHTNESS): ThemeColor {
  const dx = clamp01(x) - 0.5, dy = clamp01(y) - 0.5;
  let hue = Math.atan2(dy, dx) / (2 * Math.PI);
  if (hue < 0) hue += 1;
  const sat = Math.min(1, Math.hypot(dx, dy) / 0.5);
  const [r, g, b] = hslToRgb(hue, sat, clamp01(lightness));
  return { r, g, b, a: 1 };
}

export function padPosition(color: ThemeColor): { x: number; y: number } {
  const [h, s] = rgbToHsl(clamp01(color.r), clamp01(color.g), clamp01(color.b));
  const angle = h * 2 * Math.PI;
  return { x: 0.5 + 0.5 * s * Math.cos(angle), y: 0.5 + 0.5 * s * Math.sin(angle) };
}

type Lab = [number, number, number];

export const decode = (v: number) => Math.sign(v) * (Math.abs(v) <= 0.04045 ? Math.abs(v) / 12.92 : ((Math.abs(v) + 0.055) / 1.055) ** 2.4);
const encode = (v: number) => Math.sign(v) * (Math.abs(v) <= 0.0031308 ? Math.abs(v) * 12.92 : 1.055 * Math.abs(v) ** (1 / 2.4) - 0.055);

export function oklab(c: ThemeColor): Lab {  const [r, g, b] = [c.r, c.g, c.b].map(decode) as Lab;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function fromOklab([L, A, B]: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(encode) as [number, number, number];
}

export function mixOklab(a: ThemeColor, b: ThemeColor, t: number): [number, number, number] {
  const [la, lb] = [oklab(a), oklab(b)];
  return fromOklab(la.map((v, i) => v + (lb[i]! - v) * t) as Lab);
}
