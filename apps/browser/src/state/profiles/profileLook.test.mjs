import assert from "node:assert/strict";
import { test } from "node:test";
import { mount } from "../../test-hooks.mjs";

globalThis.__DEV__ = false;

const { useBrowser } = await import("../browser/store.ts");
const { useProfileLook } = await import("./hooks.ts");
const { setSwitcherIcon } = await import("./actions.ts");

const S = () => useBrowser.getState();

const lookOf = (profile, appDark, settings) => ({ color: profile?.color, appDark, follows: settings.spacesFollowAppearance });

test("a profile's look ignores tab switches, new tabs and profile switches, and follows appearance, its colour and the spaces setting", () => {
  S().hydrate({});
  const w = S().createWindow({ url: "https://a.com/" });
  const work = S().createProfile({ name: "Work", color: "blue" });
  const b = S().newTab(w, { url: "https://b.com/", background: true });
  const h = mount(() => useProfileLook(work, lookOf));
  const first = h.value;
  assert.equal(first.color, "blue");
  const renders = h.renders;

  S().activate(b);
  S().newTab(w, { url: "https://c.com/" });
  S().switchProfile(w, work);
  assert.equal(h.pending, false);
  assert.equal(h.renders, renders);
  assert.equal(h.value, first);

  S().setAppDark(!first.appDark);
  assert.equal(h.value.appDark, !first.appDark);

  S().updateProfile(work, { color: "green" });
  assert.equal(h.value.color, "green");

  S().updateSettings({ spacesFollowAppearance: !first.follows });
  assert.equal(h.value.follows, !first.follows);

  const settled = h.value;
  S().activate(b);
  assert.equal(h.value, settled);
  h.unmount();
});

const profile = (id, name, icon) => ({ id, name, color: "plum", icon, createdAt: 0 });

test("picking an icon from the switcher turns icons on, and clearing one leaves the setting alone", () => {
  S().hydrate({ profiles: { work: profile("work", "Work", null), home: profile("home", "Home", null) }, profileOrder: ["work", "home"] });
  S().updateSettings({ profileSwitcherIcons: false });
  setSwitcherIcon("work", null);
  assert.equal(S().settings.profileSwitcherIcons, false);
  setSwitcherIcon("work", "symbol:briefcase.fill");
  assert.equal(S().profiles.work.icon, "symbol:briefcase.fill");
  assert.equal(S().settings.profileSwitcherIcons, true);
  setSwitcherIcon("work", null);
  assert.equal(S().profiles.work.icon, null);
  assert.equal(S().settings.profileSwitcherIcons, true);
});

const P = await import("../../lib/profileLook.ts");
const { themeFromRecord } = await import("../sync/profileAdapters.ts");
const { parseSession } = await import("../session/persist.ts");

const rgb = (r, g, b, a = 1) => ({ r, g, b, a });
const stopOf = (color) => ({ color, ...P.padPosition(color) });
const LOOK = {
  stops: [rgb(0.9, 0.2, 0.2), rgb(0.2, 0.8, 0.3), rgb(0.2, 0.3, 0.9), rgb(0.95, 0.85, 0.1), rgb(0.7, 0.2, 0.9)].map(stopOf),
  intensity: 0.7,
  grain: 0.5,
  texture: "grain",
  translucency: 1,
  mode: "auto",
};

const close = (actual, expected, label, tolerance = 1e-6) =>
  actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < tolerance, `${label}: ${actual} vs ${expected}`));
const rgbOf = (c) => [c.r, c.g, c.b];

test("sanitizeTheme keeps a known shape and a grain size in range, and up to five stops", () => {
  const t = P.sanitizeTheme({ ...LOOK, stops: [...LOOK.stops, ...LOOK.stops], shape: "mesh", grainSize: 1.7, dark: { ...LOOK, shape: "radial", grainSize: -1 } });
  assert.equal(t.stops.length, P.MAX_THEME_STOPS);
  assert.equal(P.MAX_THEME_STOPS, 5);
  assert.equal(t.shape, "mesh");
  assert.equal(t.grainSize, 1);
  assert.equal(t.dark.shape, "radial");
  assert.equal(t.dark.grainSize, 0);
  const odd = P.sanitizeTheme({ ...LOOK, shape: "spiral", grainSize: "big" });
  assert.equal("shape" in odd, false);
  assert.equal("grainSize" in odd, false);
  assert.equal(P.lookShape(odd), "linear");
  assert.equal(P.lookGrainSize(odd), 0.5);
  const plain = P.sanitizeTheme({ ...LOOK, stops: LOOK.stops.slice(0, 2) });
  assert.deepEqual(Object.keys(plain).sort(), ["intensity", "grain", "mode", "stops", "texture", "translucency"].sort(), "an old theme gains no fields");
});

test("a linear theme of up to three stops renders exactly as before, with or without an explicit shape", () => {
  for (const n of [1, 2, 3]) {
    const theme = { ...LOOK, stops: LOOK.stops.slice(0, n) };
    for (const [x, y] of [[0, 0], [300, 200], [1200, 800], [900, 100]]) {
      assert.deepEqual(P.themeArea({ ...theme, shape: "linear", grainSize: 0.5 }, x, y, 1200, 800), P.themeArea(theme, x, y, 1200, 800));
    }
    const backdrop = P.themeBackdrop(theme, false);
    assert.equal(backdrop.themeShape, "linear");
    assert.equal(backdrop.themeGrainScale, 1);
    assert.equal(backdrop.themeColors.length, n * 4);
  }
});

test("a five-stop linear theme runs through every stop in order along its direction", () => {
  const theme = { ...LOOK, angle: 90 };
  const half = Math.hypot(1200, 800) / 2;
  const xAt = (t) => 600 + (0.75 * t - 0.5) * 2 * half;
  for (let i = 0; i < 5; i++) close(P.themeArea(theme, xAt(i / 4), 400, 1200, 800), rgbOf(LOOK.stops[i].color), `stop ${i + 1} sits at its share of the reach`);
  close(P.themeArea(theme, 1200, 400, 1200, 800), rgbOf(LOOK.stops[4].color), "the right edge holds stop 5");
  assert.equal(P.flatColors(theme).length, 20);
});

test("a radial theme starts at stop 1's place on the pad and ends on the last stop at the farthest corner", () => {
  const theme = { ...LOOK, stops: LOOK.stops.slice(0, 3), shape: "radial" };
  const c = P.padPosition(LOOK.stops[0].color);
  close(P.themeArea(theme, c.x * 1200, c.y * 800, 1200, 800), rgbOf(LOOK.stops[0].color), "center");
  const corners = [[0, 0], [1200, 0], [0, 800], [1200, 800]];
  const far = corners.reduce((a, b) => (Math.hypot(b[0] - c.x * 1200, b[1] - c.y * 800) > Math.hypot(a[0] - c.x * 1200, a[1] - c.y * 800) ? b : a));
  close(P.themeArea(theme, far[0], far[1], 1200, 800), rgbOf(LOOK.stops[2].color), "farthest corner");
  assert.equal(P.themeBackdrop(theme, false).themeShape, "radial");
});

test("a mesh theme lays each later stop as a soft blob on a base of stop 1", () => {
  const blob = rgb(0.2, 0.3, 0.9);
  const theme = { ...LOOK, stops: [stopOf(rgb(0.9, 0.9, 0.9)), stopOf(blob)], shape: "mesh" };
  const p = P.padPosition(blob);
  close(P.themeArea(theme, p.x * 1000, p.y * 1000, 1000, 1000), rgbOf(blob), "blob center");
  const away = [p.x < 0.5 ? 1000 : 0, p.y < 0.5 ? 1000 : 0];
  if (Math.hypot(away[0] - p.x * 1000, away[1] - p.y * 1000) >= P.MESH_REACH * 1000) close(P.themeArea(theme, away[0], away[1], 1000, 1000), [0.9, 0.9, 0.9], "outside the blob");
  const mid = P.themeArea(theme, p.x * 1000 + 0.3 * P.MESH_REACH * 1000, p.y * 1000, 1000, 1000);
  assert.ok(mid[0] > blob.r && mid[0] < 0.9 && mid[1] > blob.g && mid[1] < 0.9, `the blob fades: ${mid}`);
  const single = { ...theme, stops: theme.stops.slice(0, 1) };
  close(P.themeArea(single, 10, 10, 100, 100), [0.9, 0.9, 0.9], "one stop is flat");
});

test("grain size maps to a pattern scale of 0.5× to 3× with 1× in the middle, and the strongest grain is 1.5× the old one", () => {
  assert.equal(P.lookGrainScale({ grainSize: 0 }), 0.5);
  assert.equal(P.lookGrainScale({}), 1);
  assert.equal(P.lookGrainScale({ grainSize: 1 }), 3);
  assert.ok(P.lookGrainScale({ grainSize: 0.75 }) > 1 && P.lookGrainScale({ grainSize: 0.25 }) < 1);
  assert.equal(P.themeGrainAlpha({ ...LOOK, grain: 1 }), 1.5 * 0.8);
  assert.ok(Math.abs(P.themeGrainAlpha({ ...LOOK, grain: 0.3 }) - 0.3 * 0.8) < 0.002, "low grain barely moves");
  assert.ok(Math.abs(P.grainStrength(P.grainForStrength(0.7)) - 0.7) < 1e-9);
  assert.equal(P.themeBackdrop({ ...LOOK, grainSize: 1 }, false).themeGrainScale, 3);
});

test("a theme's shape, grain size and stops past the third ride in their own record and come back whole", () => {
  const theme = { ...LOOK, shape: "mesh", grainSize: 0.8, dark: { ...LOOK, stops: LOOK.stops.slice(0, 4), shape: "radial", grainSize: 0.2 } };
  const base = { ...theme, stops: theme.stops.slice(0, 3), dark: { ...theme.dark, stops: theme.dark.stops.slice(0, 3) } };
  delete base.shape, delete base.grainSize, delete base.dark.shape, delete base.dark.grainSize;
  const extras = { s: "mesh", g: 0.8, x: theme.stops.slice(3), d: { s: "radial", g: 0.2, x: theme.dark.stops.slice(3) } };
  assert.deepEqual(themeFromRecord({ t: base }, undefined, extras).theme, P.sanitizeTheme(theme));
  const olderEdit = { ...base, stops: base.stops.slice(0, 2) };
  const merged = themeFromRecord({ t: olderEdit }, undefined, extras).theme;
  assert.equal(merged.stops.length, 2, "stops past the third only follow a full set of three");
  assert.equal(merged.shape, "mesh");
  assert.deepEqual(themeFromRecord({ t: base }).theme, P.sanitizeTheme(base), "an older record alone stays a plain theme");
});

test("a saved session's profile theme goes through sanitizeTheme on load", () => {
  const profile = (id, theme) => ({ id, name: id, color: "plum", icon: null, createdAt: 0, ...(theme === undefined ? {} : { theme }) });
  const json = JSON.stringify({
    version: 10,
    profiles: {
      ok: profile("ok", { ...LOOK, shape: "radial", grainSize: 4, stops: [...LOOK.stops, ...LOOK.stops] }),
      broken: profile("broken", { stops: "nope" }),
      preset: profile("preset", null),
      fresh: profile("fresh"),
    },
  });
  const { profiles } = parseSession(json);
  assert.equal(profiles.ok.theme.stops.length, 5);
  assert.equal(profiles.ok.theme.grainSize, 1);
  assert.equal(profiles.ok.theme.shape, "radial");
  assert.equal("theme" in profiles.broken, false);
  assert.equal(profiles.preset.theme, null);
  assert.equal("theme" in profiles.fresh, false);
});
