export const PREFS_PAGE_PREFIX = "__chaster_prefs__";

export function prefsPageId(facebookUserId: string) {
  return `${PREFS_PAGE_PREFIX}${facebookUserId}`;
}

export function normalizeAccountId(value: string | null | undefined) {
  const id = value?.trim();
  return id && id.length > 0 ? id : "local";
}
