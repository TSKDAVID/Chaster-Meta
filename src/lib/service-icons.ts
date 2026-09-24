import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Baby,
  Bath,
  Bike,
  BookOpen,
  Briefcase,
  Brush,
  Cake,
  Camera,
  Car,
  Cat,
  Coffee,
  Cpu,
  Dog,
  Droplets,
  Dumbbell,
  Flower2,
  Footprints,
  Gamepad2,
  Gem,
  Gift,
  Glasses,
  Hammer,
  HandHeart,
  Heart,
  HeartPulse,
  Home,
  KeyRound,
  Laptop,
  Leaf,
  Mic2,
  Moon,
  Music,
  Palette,
  PawPrint,
  Pill,
  Plane,
  Scissors,
  Shirt,
  ShoppingBag,
  Sparkles,
  Stethoscope,
  Sun,
  Syringe,
  Trees,
  Utensils,
  WashingMachine,
  Wrench,
  Zap,
} from "lucide-react";

/** Curated set of general-purpose service icons (not haircut-only). */
export const SERVICE_ICON_IDS = [
  "sparkles",
  "scissors",
  "brush",
  "palette",
  "gem",
  "shirt",
  "glasses",
  "heart",
  "hand-heart",
  "heart-pulse",
  "stethoscope",
  "pill",
  "syringe",
  "activity",
  "dumbbell",
  "footprints",
  "bath",
  "droplets",
  "leaf",
  "flower",
  "sun",
  "moon",
  "coffee",
  "utensils",
  "cake",
  "shopping-bag",
  "gift",
  "camera",
  "music",
  "mic",
  "gamepad",
  "book",
  "laptop",
  "cpu",
  "zap",
  "car",
  "bike",
  "plane",
  "home",
  "key",
  "wrench",
  "hammer",
  "washing-machine",
  "briefcase",
  "paw",
  "dog",
  "cat",
  "baby",
  "trees",
] as const;

export type ServiceIconId = (typeof SERVICE_ICON_IDS)[number];

const DEFAULT_SERVICE_ICON: ServiceIconId = "sparkles";
const DEFAULT_ROOM_ICON: ServiceIconId = "home";

const ICON_MAP: Record<ServiceIconId, LucideIcon> = {
  sparkles: Sparkles,
  scissors: Scissors,
  brush: Brush,
  palette: Palette,
  gem: Gem,
  shirt: Shirt,
  glasses: Glasses,
  heart: Heart,
  "hand-heart": HandHeart,
  "heart-pulse": HeartPulse,
  stethoscope: Stethoscope,
  pill: Pill,
  syringe: Syringe,
  activity: Activity,
  dumbbell: Dumbbell,
  footprints: Footprints,
  bath: Bath,
  droplets: Droplets,
  leaf: Leaf,
  flower: Flower2,
  sun: Sun,
  moon: Moon,
  coffee: Coffee,
  utensils: Utensils,
  cake: Cake,
  "shopping-bag": ShoppingBag,
  gift: Gift,
  camera: Camera,
  music: Music,
  mic: Mic2,
  gamepad: Gamepad2,
  book: BookOpen,
  laptop: Laptop,
  cpu: Cpu,
  zap: Zap,
  car: Car,
  bike: Bike,
  plane: Plane,
  home: Home,
  key: KeyRound,
  wrench: Wrench,
  hammer: Hammer,
  "washing-machine": WashingMachine,
  briefcase: Briefcase,
  paw: PawPrint,
  dog: Dog,
  cat: Cat,
  baby: Baby,
  trees: Trees,
};

export function isServiceIconId(value: unknown): value is ServiceIconId {
  return (
    typeof value === "string" &&
    (SERVICE_ICON_IDS as readonly string[]).includes(value)
  );
}

export function normalizeServiceIcon(
  value: unknown,
  fallback: ServiceIconId = DEFAULT_SERVICE_ICON,
): ServiceIconId {
  return isServiceIconId(value) ? value : fallback;
}

export function defaultIconForKind(
  kind: "service" | "room" | "equipment" | "other" | "staff",
): ServiceIconId | null {
  if (kind === "service") return DEFAULT_SERVICE_ICON;
  if (kind === "room" || kind === "equipment" || kind === "other") {
    return DEFAULT_ROOM_ICON;
  }
  return null;
}

export function getServiceIconComponent(id: string | null | undefined): LucideIcon {
  return ICON_MAP[normalizeServiceIcon(id)] ?? Sparkles;
}
