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
  /ფოტო|სურათ|გამოიყურებ|photo|picture|\bpics?\b|\bimages?\b|show me|look(?:s)? like|фото|картин/i;
const RETRY_RE = /თავიდან|სცადე|კიდევ ერთხელ|ხელახლა|try again|\bagain\b|retry|ещё раз|еще раз/i;
/** A retry is a short nudge, not a new question that happens to contain "again". */
const RETRY_MAX_CHARS = 40;

export function messageWantsPhoto(text: string): boolean {
  return PHOTO_RE.test(text);
}

/** "Try again" right after the customer asked for a photo. */
export function looksLikePhotoRetry(text: string, previousUserText: string | null | undefined): boolean {
  return (
    text.trim().length <= RETRY_MAX_CHARS &&
    RETRY_RE.test(text) &&
    Boolean(previousUserText && PHOTO_RE.test(previousUserText))
  );
}

/** Whether the latest message (or a retry of the previous one) asks for a picture. */
export function turnWantsPhoto(
  text: string,
  history: ReadonlyArray<{ role: string; content: string }>,
): boolean {
  if (messageWantsPhoto(text)) return true;
  const previousUser = [...history].reverse().find((t) => t.role === "user")?.content;
  return looksLikePhotoRetry(text, previousUser);
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
