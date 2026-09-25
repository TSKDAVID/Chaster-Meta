/** What a customer message is about — decides which data and tools the reply gets. */
export const INTENTS = [
  "greeting",
  "faq",
  "catalog",
  "photo",
  "hours_location",
  "availability",
  "booking_new",
  "booking_change",
  "booking_cancel",
  "human",
  "other",
] as const;

export type Intent = (typeof INTENTS)[number];

export const BOOKING_INTENTS: Intent[] = [
  "availability",
  "booking_new",
  "booking_change",
  "booking_cancel",
];

export function isIntent(value: unknown): value is Intent {
  return typeof value === "string" && (INTENTS as readonly string[]).includes(value);
}

const PHOTO_RE =
  /ფოტო|სურათ|photo|picture|\bpic\b|გამომიგზავნ|ჩამირეკ|show me/i;
const RETRY_RE = /თავიდან|სცადე|try again|\bagain\b|კიდევ/i;

export function messageWantsPhoto(text: string): boolean {
  return PHOTO_RE.test(text);
}

export function looksLikePhotoRetry(text: string, recent: string): boolean {
  return RETRY_RE.test(text) && PHOTO_RE.test(recent);
}

/**
 * True when an item tagged with `itemIntents` should be included for this turn.
 * `routed` undefined = router unavailable → include everything.
 * `itemIntents` undefined = always included.
 */
export function intentsMatch(
  itemIntents: readonly Intent[] | undefined,
  routed: readonly Intent[] | undefined,
): boolean {
  if (!routed || !itemIntents) return true;
  return itemIntents.some((intent) => routed.includes(intent));
}
