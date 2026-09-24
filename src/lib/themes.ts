export type ThemeId =
  | "light"
  | "dark"
  | "slate"
  | "ocean"
  | "forest"
  | "midnight"
  | "sand";

export type ThemeOption = {
  id: ThemeId;
  label: string;
  description: string;
  swatch: [string, string, string];
};

export const THEMES: ThemeOption[] = [
  {
    id: "light",
    label: "Light",
    description: "Paper field · ink actions",
    swatch: ["#e8e6e1", "#1c1917", "#f7f5f1"],
  },
  {
    id: "dark",
    label: "Dark",
    description: "Night desk · brass signal",
    swatch: ["#0e0f10", "#ece8e1", "#e8a87c"],
  },
  {
    id: "slate",
    label: "Slate",
    description: "Cool paper · signal red",
    swatch: ["#dfe3e8", "#14171c", "#b42318"],
  },
  {
    id: "ocean",
    label: "Ocean",
    description: "Harbour ink · deep teal desk",
    swatch: ["#d5e4e8", "#0c2e38", "#eef6f8"],
  },
  {
    id: "forest",
    label: "Forest",
    description: "Moss desk · sap accent",
    swatch: ["#d9e0d4", "#1a2e1c", "#3f6212"],
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Signal room · brass cue",
    swatch: ["#0a0e16", "#e6e9ef", "#e8a87c"],
  },
  {
    id: "sand",
    label: "Sand",
    description: "Warm stone · ink primary",
    swatch: ["#e4dccf", "#2a241c", "#f4efe6"],
  },
];

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

export function getTheme(id: ThemeId): ThemeOption {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function applyTheme(theme: ThemeId) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}
