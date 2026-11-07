import { canonical, type Adapter } from "../../platform/sync";
import { useBrowser } from "../browser/store";
import { DEFAULT_PROFILE_ID } from "../settings/settings";
import { LEGACY_THEME_STOPS, sanitizeTheme } from "../../lib/profileLook";
import type { ThemeShape } from "@ardia/core";
import type { Profile, ProfileTheme, ThemeLook, ThemeStop } from "../browser/types";
import { PROFILE, PROFILE_THEME, PROFILE_TOP_APPS, SHARE, profileRecord, topAppsRecord, type TopAppsRecord } from "./records";

const store = () => useBrowser.getState();

export type ProfileRecord = { n: string; c: Profile["color"]; i: string | null; d?: true; o?: true; th?: ProfileTheme | null };

export type ProfileThemeRecord = { t: ProfileTheme } | { preset: true };

export type ThemeAngleRecord = { a?: number; d?: number };

export type ThemeLookExtras = { s?: ThemeShape; g?: number; x?: ThemeStop[] };

export type ThemeLookRecord = ThemeLookExtras & { d?: ThemeLookExtras };

export const themeAngleKey = (syncId: string) => `${PROFILE_THEME}${syncId}:angle`;

export const themeLookKey = (syncId: string) => `${PROFILE_THEME}${syncId}:look`;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function withoutAngles({ angle: _angle, dark, ...theme }: ProfileTheme): ProfileTheme {
  if (!dark) return theme;
  const { angle: _darkAngle, ...darkLook } = dark;
  return { ...theme, dark: darkLook };
}

function legacyLook<T extends ThemeLook>({ shape: _shape, grainSize: _grainSize, ...look }: T): Omit<T, "shape" | "grainSize"> {
  return look.stops.length > LEGACY_THEME_STOPS ? { ...look, stops: look.stops.slice(0, LEGACY_THEME_STOPS) } : look;
}

function publishedTheme(theme: ProfileTheme): ProfileTheme {
  const { dark, ...light } = withoutAngles(theme);
  return { ...legacyLook(light), ...(dark ? { dark: legacyLook(dark) } : {}) };
}

function extrasOf(look: ThemeLook): ThemeLookExtras {
  return {
    ...(look.shape !== undefined ? { s: look.shape } : {}),
    ...(look.grainSize !== undefined ? { g: look.grainSize } : {}),
    ...(look.stops.length > LEGACY_THEME_STOPS ? { x: look.stops.slice(LEGACY_THEME_STOPS) } : {}),
  };
}

function lookRecordOf(theme: ProfileTheme): ThemeLookRecord {
  const dark = theme.dark ? extrasOf(theme.dark) : {};
  return { ...extrasOf(theme), ...(Object.keys(dark).length ? { d: dark } : {}) };
}

function withExtras<T extends ThemeLook>({ shape: _shape, grainSize: _grainSize, ...look }: T, extras: unknown): T {
  if (!isRecord(extras)) return look as T;
  const more = look.stops.length === LEGACY_THEME_STOPS && Array.isArray(extras.x) ? (extras.x as ThemeStop[]) : [];
  return {
    ...look,
    stops: [...look.stops, ...more],
    ...(extras.s !== undefined ? { shape: extras.s } : {}),
    ...(extras.g !== undefined ? { grainSize: extras.g } : {}),
  } as T;
}

function anglesOf(theme: ProfileTheme): ThemeAngleRecord {
  return { ...(theme.angle !== undefined ? { a: theme.angle } : {}), ...(theme.dark?.angle !== undefined ? { d: theme.dark.angle } : {}) };
}

export function themeFromRecord(record: unknown, angles?: unknown, extras?: unknown): Pick<Profile, "theme"> | null {
  if (!record || typeof record !== "object") return null;
  if ("preset" in record && record.preset === true) return { theme: null };
  const theme = "t" in record ? sanitizeTheme(record.t) : null;
  if (!theme) return null;
  if (!isRecord(angles) && !isRecord(extras)) return { theme };
  let merged = theme;
  if (isRecord(angles)) {
    const look = withoutAngles(merged);
    merged = { ...look, angle: angles.a as number, ...(look.dark ? { dark: { ...look.dark, angle: angles.d as number } } : {}) };
  }
  if (isRecord(extras)) {
    const { dark, ...light } = merged;
    merged = { ...withExtras(light, extras), ...(dark ? { dark: withExtras(dark, extras.d) } : {}) };
  }
  return { theme: sanitizeTheme(merged) };
}

export function legacyThemeOf(record: ProfileRecord): Pick<Profile, "theme"> | null {
  const theme = record.th ? sanitizeTheme(record.th) : null;
  return theme ? { theme } : null;
}

export function profilesAdapter(links: () => Record<string, { syncId: string }>): Adapter {
  const linked = () => Object.entries(links()).filter(([id]) => store().profiles[id]);
  return {
    prefix: PROFILE,
    adoptRemoteOnJoin: true,
    extract: (_base, _queued, _now, known) => {
      const values = new Map<string, unknown>();
      const all = links();
      for (const [id, { syncId }] of linked()) {
        const p = store().profiles[id]!;
        const sharesSyncedData = !!p.dataId && p.dataId !== id && !!all[p.dataId] && !!store().profiles[p.dataId];
        if (sharesSyncedData && !known(`${SHARE}${syncId}`)) continue;
        values.set(`${PROFILE}${syncId}`, {
          n: p.name,
          c: p.color,
          i: p.icon,
          ...(id === DEFAULT_PROFILE_ID ? { d: true } : {}),
        } satisfies ProfileRecord);
      }
      const mine = new Set(values.keys());
      return { values, ignore: (key) => !mine.has(key) };
    },
    apply: (visible, changed, _base, records) => {
      for (const [id, { syncId }] of linked()) {
        const record = profileRecord(visible.get(`${PROFILE}${syncId}`));
        if (!record || !changed.has(`${PROFILE}${syncId}`)) continue;
        const legacy = store().profiles[id]!.theme === undefined && !records.known(`${PROFILE_THEME}${syncId}`) ? legacyThemeOf(record) : null;
        store().updateProfile(id, { name: record.n, icon: record.i });
        store().setProfileLook(id, { color: record.c, ...legacy });
      }
    },
  };
}

export function profileThemesAdapter(
  links: () => Record<string, { syncId: string; themeAdopting?: true }>,
  records: () => Record<string, { v: unknown }> | undefined,
): Adapter {
  const linked = () => Object.entries(links()).filter(([id]) => store().profiles[id]);
  const unapplied = (key: string, base: (key: string) => unknown) => {
    const record = records()?.[key];
    return !!record && record.v !== null && canonical(record.v) !== canonical(base(key) ?? null);
  };
  return {
    prefix: PROFILE_THEME,
    adoptRemoteOnJoin: true,
    extract: (base, _queued, _now, known) => {
      const values = new Map<string, unknown>();
      for (const [id, { syncId, themeAdopting }] of linked()) {
        const theme = store().profiles[id]!.theme;
        const key = `${PROFILE_THEME}${syncId}`;
        const angleKey = themeAngleKey(syncId);
        const lookKey = themeLookKey(syncId);
        if (theme === undefined || themeAdopting || unapplied(key, base) || unapplied(angleKey, base) || unapplied(lookKey, base)) continue;
        values.set(key, (theme ? { t: publishedTheme(theme) } : { preset: true }) satisfies ProfileThemeRecord);
        const angles = theme ? anglesOf(theme) : {};
        if (Object.keys(angles).length || known(angleKey)) values.set(angleKey, angles satisfies ThemeAngleRecord);
        const extras = theme ? lookRecordOf(theme) : {};
        if (Object.keys(extras).length || known(lookKey)) values.set(lookKey, extras satisfies ThemeLookRecord);
      }
      const mine = new Set(values.keys());
      return { values, ignore: (key) => !mine.has(key) };
    },
    apply: (visible, changed) => {
      for (const [id, { syncId }] of linked()) {
        const angleKey = themeAngleKey(syncId);
        const lookKey = themeLookKey(syncId);
        if (!changed.has(`${PROFILE_THEME}${syncId}`) && !changed.has(angleKey) && !changed.has(lookKey)) continue;
        const patch = themeFromRecord(visible.get(`${PROFILE_THEME}${syncId}`), visible.get(angleKey), visible.get(lookKey));
        if (!patch) continue;
        store().setProfileLook(id, patch);
      }
    },
  };
}

export function profileTopAppsAdapter(links: () => Record<string, { syncId: string }>): Adapter {
  const linked = () => Object.entries(links()).filter(([id]) => store().profiles[id]);
  return {
    prefix: PROFILE_TOP_APPS,
    adoptRemoteOnJoin: true,
    extract: (base, _queued, _now, known, remote) => {
      const values = new Map<string, unknown>();
      for (const [id, { syncId }] of linked()) {
        const key = `${PROFILE_TOP_APPS}${syncId}`;
        const on = !!store().profiles[id]!.shareTopApps;
        const unapplied = known(key) && remote(key) !== null && canonical(remote(key)) !== canonical(base(key) ?? null);
        if ((on || known(key)) && !unapplied) values.set(key, { on } satisfies TopAppsRecord);
      }
      const mine = new Set(values.keys());
      return { values, ignore: (key) => !mine.has(key) };
    },
    apply: (visible, changed) => {
      for (const [id, { syncId }] of linked()) {
        const key = `${PROFILE_TOP_APPS}${syncId}`;
        const record = changed.has(key) ? topAppsRecord(visible.get(key)) : null;
        if (record) store().updateProfile(id, { shareTopApps: record.on || undefined });
      }
    },
  };
}
