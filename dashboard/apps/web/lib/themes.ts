/**
 * Theme tokens ported verbatim from docs/design/dashboard-preview.html.
 *
 * Every colour in the UI comes from `buildTheme()`. Status colours are fixed per
 * mode and never follow the theme. Midnight Teal dark returns the exact values
 * documented in docs/design/DESIGN.md.
 */

export interface ThemeDef {
  /** Name. */
  n: string;
  /** Hue, degrees. */
  h: number;
  /** Accent saturation, percent. */
  s: number;
  /** Tint saturation used for the surfaces, percent. */
  t: number;
}

export interface ThemeTokens {
  bg: string;
  sidebar: string;
  card: string;
  card2: string;
  input: string;
  border: string;
  border2: string;
  track: string;
  fg: string;
  fg2: string;
  muted: string;
  muted2: string;
  accent: string;
  accentFg: string;
  accentText: string;
  series2: string;
  accentSoft: string;
  accentBorder: string;
  ok: string;
  okBg: string;
  warn: string;
  warnBg: string;
  bad: string;
  badBg: string;
  info: string;
  infoBg: string;
  neutralBg: string;
  hot: string;
  overlay: string;
}

export type Rgb = [number, number, number];

export const THEMES: ThemeDef[] = [
  { n: "Midnight Teal", h: 173, s: 80, t: 18 },
  { n: "Ocean", h: 200, s: 80, t: 20 },
  { n: "Electric Blue", h: 217, s: 90, t: 18 },
  { n: "Cobalt", h: 225, s: 85, t: 22 },
  { n: "Indigo", h: 239, s: 80, t: 20 },
  { n: "Violet", h: 258, s: 80, t: 20 },
  { n: "Purple", h: 270, s: 75, t: 20 },
  { n: "Orchid", h: 285, s: 70, t: 18 },
  { n: "Fuchsia", h: 300, s: 80, t: 18 },
  { n: "Magenta", h: 320, s: 80, t: 18 },
  { n: "Pink", h: 330, s: 85, t: 18 },
  { n: "Rose", h: 345, s: 85, t: 18 },
  { n: "Rose Noir", h: 350, s: 90, t: 10 },
  { n: "Crimson", h: 355, s: 80, t: 16 },
  { n: "Scarlet", h: 2, s: 85, t: 16 },
  { n: "Tomato", h: 10, s: 85, t: 16 },
  { n: "Ember", h: 18, s: 90, t: 16 },
  { n: "Orange", h: 25, s: 95, t: 16 },
  { n: "Tangerine", h: 30, s: 95, t: 14 },
  { n: "Amber Ops", h: 38, s: 92, t: 12 },
  { n: "Gold", h: 45, s: 90, t: 14 },
  { n: "Sunflower", h: 50, s: 95, t: 14 },
  { n: "Lemon", h: 56, s: 90, t: 14 },
  { n: "Chartreuse", h: 75, s: 75, t: 14 },
  { n: "Lime", h: 85, s: 70, t: 14 },
  { n: "Fern", h: 100, s: 55, t: 14 },
  { n: "Green", h: 130, s: 60, t: 16 },
  { n: "Emerald", h: 152, s: 75, t: 18 },
  { n: "Jade", h: 160, s: 65, t: 18 },
  { n: "Mint", h: 165, s: 60, t: 16 },
  { n: "Aqua", h: 180, s: 75, t: 20 },
  { n: "Cyan", h: 188, s: 85, t: 20 },
  { n: "Sky", h: 195, s: 85, t: 20 },
  { n: "Azure", h: 207, s: 85, t: 20 },
  { n: "Royal", h: 230, s: 70, t: 20 },
  { n: "Periwinkle", h: 235, s: 55, t: 16 },
  { n: "Lavender", h: 255, s: 50, t: 14 },
  { n: "Plum", h: 290, s: 40, t: 14 },
  { n: "Mauve", h: 310, s: 30, t: 12 },
  { n: "Blush", h: 340, s: 45, t: 12 },
  { n: "Terracotta", h: 15, s: 50, t: 12 },
  { n: "Copper", h: 22, s: 65, t: 12 },
  { n: "Sand", h: 38, s: 40, t: 10 },
  { n: "Olive", h: 70, s: 40, t: 10 },
  { n: "Sage", h: 120, s: 22, t: 8 },
  { n: "Moss", h: 95, s: 35, t: 10 },
  { n: "Steel", h: 210, s: 30, t: 10 },
  { n: "Slate", h: 215, s: 16, t: 8 },
  { n: "Graphite", h: 220, s: 6, t: 4 },
  { n: "Mono", h: 0, s: 0, t: 0 },
];

export const DEFAULT_THEME_NAME = "Midnight Teal";
export const DEFAULT_DARK = true;

export function hslRgb(h: number, s: number, l: number): Rgb {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

export function rgbHex(c: Rgb): string {
  return (
    "#" +
    c
      .map((v) => ("0" + v.toString(16)).slice(-2))
      .join("")
      .toUpperCase()
  );
}

export function hx(h: number, s: number, l: number): string {
  return rgbHex(hslRgb(h, s, l));
}

export function hexRgb(x: string): Rgb {
  return [
    parseInt(x.slice(1, 3), 16),
    parseInt(x.slice(3, 5), 16),
    parseInt(x.slice(5, 7), 16),
  ];
}

export function lum(c: Rgb | number[]): number {
  const v = c.map((u) => {
    u /= 255;
    return u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}

export function contrast(a: string, b: string): number {
  const x = lum(hexRgb(a));
  const y = lum(hexRgb(b));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function rgba(x: string, al: number): string {
  const c = hexRgb(x);
  return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + al + ")";
}

export const ORIGINAL_DARK = {
  bg: "#070B0B",
  sidebar: "#0A1010",
  card: "#0E1515",
  card2: "#121B1B",
  input: "#0A1111",
  border: "#1C2929",
  border2: "#253535",
  track: "#172424",
  fg: "#E6F0EF",
  fg2: "#C9D8D6",
  muted: "#8FA3A1",
  muted2: "#A7B8B6",
  accent: "#14B8A6",
  accentFg: "#042F2E",
  accentText: "#5EEAD4",
  series2: "#A5B4FC",
} as const;

export function buildTheme(t: ThemeDef, dark: boolean): ThemeTokens {
  const h = t.h;
  const accentSat = t.s;
  const ts = t.t;
  let p: Partial<ThemeTokens>;

  if (dark && t.n === "Midnight Teal") {
    p = { ...ORIGINAL_DARK };
  } else if (dark) {
    p = {
      bg: hx(h, ts, 4),
      sidebar: hx(h, ts, 5.5),
      card: hx(h, ts, 7.5),
      card2: hx(h, ts, 10),
      input: hx(h, ts, 5),
      border: hx(h, ts, 14),
      border2: hx(h, ts, 19),
      track: hx(h, ts, 12),
      fg: hx(h, Math.min(ts, 15), 93),
      fg2: hx(h, Math.min(ts, 12), 83),
      muted: hx(h, Math.min(ts, 10), 63),
      muted2: hx(h, Math.min(ts, 10), 71),
      accent: accentSat === 0 ? hx(0, 0, 90) : hx(h, accentSat, 50),
      series2: hx((h + 170) % 360, 70, 74),
    };
    let L = 66;
    while (L < 92 && contrast(hx(h, accentSat, L), p.card as string) < 6) L += 2;
    p.accentText = accentSat === 0 ? hx(0, 0, 88) : hx(h, accentSat, L);
  } else {
    const tl = Math.min(ts + 10, 30);
    p = {
      bg: hx(h, tl, 97),
      sidebar: hx(h, tl, 99),
      card: "#FFFFFF",
      card2: hx(h, tl, 95.5),
      input: "#FFFFFF",
      border: hx(h, ts, 88),
      border2: hx(h, ts, 81),
      track: hx(h, tl, 92),
      fg: hx(h, Math.min(ts + 5, 25), 10),
      fg2: hx(h, Math.min(ts, 15), 22),
      muted: hx(h, Math.min(ts, 8), 38),
      muted2: hx(h, Math.min(ts, 8), 33),
      accent: accentSat === 0 ? hx(0, 0, 12) : hx(h, accentSat, 44),
      series2: hx((h + 170) % 360, 65, 52),
    };
    let L2 = 38;
    while (L2 > 10 && contrast(hx(h, accentSat, L2), "#FFFFFF") < 4.8) L2 -= 2;
    p.accentText = accentSat === 0 ? hx(0, 0, 15) : hx(h, accentSat, L2);
  }

  if (!p.accentFg) {
    const darkInk = accentSat === 0 ? "#0A0A0A" : hx(h, 60, 9);
    p.accentFg =
      contrast(darkInk, p.accent as string) >= contrast("#FFFFFF", p.accent as string)
        ? darkInk
        : "#FFFFFF";
  }

  // Mid-luminance accents can leave the generated ink just under 4.5:1. Black or
  // white always has a passing side, so only upgrade the themes that need it.
  const ink = p.accentFg as string;
  if (contrast(ink, p.accent as string) < 4.5) {
    p.accentFg = ["#000000", "#FFFFFF"].reduce(
      (best, candidate) =>
        contrast(candidate, p.accent as string) > contrast(best, p.accent as string)
          ? candidate
          : best,
      ink,
    );
  }

  p.accentSoft = rgba(p.accent as string, dark ? 0.14 : 0.12);
  p.accentBorder = rgba(p.accent as string, 0.45);

  if (dark) {
    Object.assign(p, {
      ok: "#2DD4BF",
      okBg: "rgba(45,212,191,0.14)",
      warn: "#FBBF24",
      warnBg: "rgba(245,158,11,0.14)",
      bad: "#FCA5A5",
      badBg: "rgba(248,113,113,0.13)",
      info: "#93C5FD",
      infoBg: "rgba(96,165,250,0.14)",
      neutralBg: "rgba(148,163,184,0.12)",
      hot: "#F59E0B",
      overlay: "rgba(0,0,0,0.6)",
    });
  } else {
    Object.assign(p, {
      ok: "#047857",
      okBg: "rgba(5,150,105,0.12)",
      warn: "#B45309",
      warnBg: "rgba(217,119,6,0.10)",
      bad: "#B91C1C",
      badBg: "rgba(220,38,38,0.10)",
      info: "#1D4ED8",
      infoBg: "rgba(37,99,235,0.10)",
      neutralBg: "rgba(100,116,139,0.12)",
      hot: "#D97706",
      overlay: "rgba(15,23,42,0.35)",
    });
  }

  return p as ThemeTokens;
}

/** Token object → `--token:value;…;color-scheme:dark|light`. */
export function themeVars(p: ThemeTokens, dark: boolean): string {
  return (
    Object.keys(p)
      .map((k) => "--" + k + ":" + p[k as keyof ThemeTokens])
      .join(";") + ";color-scheme:" + (dark ? "dark" : "light")
  );
}

export function themeIndex(name: string): number {
  for (let i = 0; i < THEMES.length; i++) if (THEMES[i].n === name) return i;
  return 0;
}

export function themeByName(name: string): ThemeDef {
  return THEMES[themeIndex(name)];
}
