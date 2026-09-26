/** Theme ids — keep in sync with prefs API + boot script. */
export type ThemeId =
  | "chaster"
  | "light"
  | "dark"
  | "slate"
  | "ocean"
  | "forest"
  | "midnight"
  | "sand"
  | "ember"
  | "glacier"
  | "matcha"
  | "noir"
  | "bloom"
  | "custom";

export type CustomThemeColors = {
  /** Deepest shell / page background */
  base: string;
  /** Floating panels (nav, stage, menus) */
  panel: string;
  /** Primary actions + client bubbles */
  accent: string;
};

export type ThemeOption = {
  id: ThemeId;
  label: string;
  description: string;
  swatch: [string, string, string];
};

export const DEFAULT_CUSTOM_COLORS: CustomThemeColors = {
  base: "#0D0A1B",
  panel: "#181529",
  accent: "#AB97FF",
};
export const THEMES: ThemeOption[] = [
  {
    id: "chaster",
    label: "Chaster",
    description: "Brand navy and lavender",
    swatch: ["#0D0A1B", "#AB97FF", "#181529"],
  },
  {
    id: "slate",
    label: "Slate",
    description: "Cool paper",
    swatch: ["#dfe2e8", "#3557c7", "#f3f4f7"],
  },
  {
    id: "light",
    label: "Light",
    description: "Warm paper",
    swatch: ["#e8e4dd", "#3557c7", "#f6f4ef"],
  },
  {
    id: "dark",
    label: "Dark",
    description: "Blue black",
    swatch: ["#0b0c10", "#5a78dd", "#12141a"],
  },
  {
    id: "ocean",
    label: "Ocean",
    description: "Harbour teal",
    swatch: ["#07222b", "#2fc4dc", "#0c3340"],
  },
  {
    id: "forest",
    label: "Forest",
    description: "Deep moss",
    swatch: ["#0a1a11", "#9ed649", "#10281b"],
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Navy",
    swatch: ["#050916", "#4fa8e6", "#0c1327"],
  },
  {
    id: "sand",
    label: "Sand",
    description: "Warm stone",
    swatch: ["#d9c2a3", "#a8642a", "#f5efe4"],
  },
  {
    id: "ember",
    label: "Ember",
    description: "Charcoal",
    swatch: ["#17100d", "#e8843f", "#221a16"],
  },
  {
    id: "glacier",
    label: "Glacier",
    description: "Ice",
    swatch: ["#b9dcf2", "#1f7fbf", "#eaf5fc"],
  },
  {
    id: "matcha",
    label: "Matcha",
    description: "Cream",
    swatch: ["#bfe3c4", "#5f9a1f", "#eef8ea"],
  },
  {
    id: "noir",
    label: "Noir",
    description: "Brass",
    swatch: ["#000000", "#d4a54a", "#0f0f10"],
  },
  {
    id: "bloom",
    label: "Bloom",
    description: "Blush",
    swatch: ["#f3b3bf", "#c2264f", "#fff0f2"],
  },
  {
    id: "custom",
    label: "Custom",
    description: "Your colors",
    swatch: ["#0c0a09", "#f97316", "#1c1917"],
  },
];

const BUILTIN_IDS = new Set(
  THEMES.filter((t) => t.id !== "custom").map((t) => t.id),
);

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

export function getTheme(id: ThemeId): ThemeOption {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

function clampByte(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function parseHex(input: string): [number, number, number] | null {
  const raw = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return [
      parseInt(raw[0] + raw[0], 16),
      parseInt(raw[1] + raw[1], 16),
      parseInt(raw[2] + raw[2], 16),
    ];
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return [
      parseInt(raw.slice(0, 2), 16),
      parseInt(raw.slice(2, 4), 16),
      parseInt(raw.slice(4, 6), 16),
    ];
  }
  return null;
}

export function toHex(r: number, g: number, b: number) {
  return (
    "#" +
    [r, g, b]
      .map((v) => clampByte(v).toString(16).padStart(2, "0"))
      .join("")
  );
}

function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function luminance(rgb: [number, number, number]) {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function normalizeHex(input: string, fallback: string): string {
  const parsed = parseHex(input);
  if (!parsed) return normalizeHex(fallback, "#18181b");
  return toHex(...parsed);
}

export function sanitizeCustomColors(
  input: Partial<CustomThemeColors> | null | undefined,
): CustomThemeColors {
  return {
    base: normalizeHex(input?.base ?? "", DEFAULT_CUSTOM_COLORS.base),
    panel: normalizeHex(input?.panel ?? "", DEFAULT_CUSTOM_COLORS.panel),
    accent: normalizeHex(input?.accent ?? "", DEFAULT_CUSTOM_COLORS.accent),
  };
}

/** Build full CSS variable map from 3 user colors. */
export function buildCustomThemeVars(
  colors: CustomThemeColors,
): Record<string, string> {
  const c = sanitizeCustomColors(colors);
  const base = parseHex(c.base)!;
  const panel = parseHex(c.panel)!;
  const accent = parseHex(c.accent)!;
  const dark = luminance(base) < 0.42;
  const white: [number, number, number] = [255, 255, 255];
  const black: [number, number, number] = [0, 0, 0];
  const ink = dark ? mixRgb(white, panel, 0.08) : mixRgb(black, panel, 0.15);
  const muted = dark
    ? mixRgb(white, base, 0.45)
    : mixRgb(black, base, 0.45);
  const mutedSoft = dark
    ? mixRgb(white, base, 0.58)
    : mixRgb(black, base, 0.58);
  // Surface ladder: panel → card → field, distinguishable by luminance
  const card = dark ? mixRgb(panel, white, 0.05) : mixRgb(panel, white, 0.5);
  const field = dark ? mixRgb(panel, white, 0.09) : white;
  const onAccent =
    luminance(accent) > 0.45
      ? mixRgb(black, accent, 0.1)
      : white;
  const accentHover = dark
    ? mixRgb(accent, white, 0.14)
    : mixRgb(accent, black, 0.12);
  const bubbleOut = mixRgb(card, accent, 0.1);
  const hair = dark ? "255, 255, 255" : "0, 0, 0";
  const accentRgb = accent.map((v) => Math.round(v)).join(", ");
  const inkHex = toHex(...ink);
  const mutedHex = toHex(...muted);
  const cardHex = toHex(...card);
  const fieldHex = toHex(...field);

  return {
    background: c.base,
    foreground: inkHex,
    "chaster-ink": inkHex,
    "chaster-muted": mutedHex,
    "chaster-muted-soft": toHex(...mutedSoft),
    "chaster-panel": c.panel,
    "chaster-card": cardHex,
    "chaster-field": fieldHex,
    "chaster-panel-soft": cardHex,
    "chaster-chat-bg": c.panel,
    "chaster-border": `rgba(${hair}, ${dark ? 0.07 : 0.09})`,
    "chaster-border-strong": `rgba(${hair}, ${dark ? 0.13 : 0.15})`,
    "chaster-accent": c.accent,
    "chaster-accent-hover": toHex(...accentHover),
    "chaster-on-accent": toHex(...onAccent),
    "chaster-accent-soft": `rgba(${accentRgb}, ${dark ? 0.16 : 0.11})`,
    "chaster-header": c.panel,
    "chaster-bubble-out": toHex(...bubbleOut),
    "chaster-bubble-out-text": inkHex,
    "chaster-bubble-in": fieldHex,
    "chaster-bubble-in-text": inkHex,
    "chaster-bubble-in-ring": `rgba(${hair}, ${dark ? 0.09 : 0.1})`,
    "chaster-tab-active": `rgba(${accentRgb}, ${dark ? 0.16 : 0.11})`,
    "chaster-inset-ring": `inset 0 0 0 1px rgba(${hair}, ${dark ? 0.08 : 0.09})`,
    "chaster-shadow-sm": dark
      ? "0 1px 2px rgba(0, 0, 0, 0.4)"
      : "0 1px 2px rgba(0, 0, 0, 0.06)",
    "chaster-shadow": dark
      ? "0 16px 40px rgba(0, 0, 0, 0.45)"
      : "0 12px 32px rgba(0, 0, 0, 0.1)",
    "chaster-success-text": dark ? "#7fd39a" : "#2f7a3e",
    "chaster-danger-text": dark ? "#f0736f" : "#b3261e",
    "chaster-warn-text": dark ? "#e3b04b" : "#92400e",
    "chaster-ring": `rgba(${accentRgb}, ${dark ? 0.3 : 0.22})`,
    "chaster-rule": `repeating-linear-gradient(transparent, transparent 27px, rgba(${hair}, ${dark ? 0.04 : 0.05}) 28px)`,
  };
}

const CUSTOM_VAR_KEYS = Object.keys(
  buildCustomThemeVars(DEFAULT_CUSTOM_COLORS),
);

function clearInlineThemeVars(root: HTMLElement) {
  for (const key of CUSTOM_VAR_KEYS) {
    root.style.removeProperty(`--${key}`);
  }
}

export function applyTheme(
  theme: ThemeId,
  customColors?: CustomThemeColors | null,
) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const id = isThemeId(theme) ? theme : "chaster";
  root.setAttribute("data-theme", id);

  if (id === "custom") {
    const vars = buildCustomThemeVars(
      customColors ?? DEFAULT_CUSTOM_COLORS,
    );
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(`--${key}`, value);
    }
    return;
  }

  if (BUILTIN_IDS.has(id)) {
    clearInlineThemeVars(root);
  }
}

export function customSwatch(colors: CustomThemeColors): [string, string, string] {
  const c = sanitizeCustomColors(colors);
  return [c.base, c.accent, c.panel];
}
