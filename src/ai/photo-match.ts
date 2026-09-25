import { tokenSimilarity, tokenize } from "@/ai/retrieval";

type PhotoItem = {
  name: string;
  image_url?: string | null;
  active?: boolean;
  variants?: Array<{ name: string }>;
};

const MAX_PHOTOS = 4;
const SHORT_TOKEN = 4;

function nameTokens(item: PhotoItem): string[] {
  return tokenize([item.name, ...(item.variants ?? []).map((v) => v.name)].join(" "));
}

function tokenHits(query: string, target: string): number {
  const sim = tokenSimilarity(query, target);
  if (sim >= 0.8) return sim;
  // Loose prefix/bigram matches only count for longer words ("და" must not match "დასვენება").
  if (sim >= 0.5 && Math.min(query.length, target.length) >= SHORT_TOKEN) return sim;
  return 0;
}

/**
 * Catalog items the customer named in this message, for photo sending.
 * Specific words are applied first; a common word ("pizza", "hoodie") only adds
 * items when no more specific word already picked one of the items it covers —
 * so "pepperoni pizza" sends one photo, while "hoodie photos" sends every hoodie.
 */
export function matchRequestedPhotos<T extends PhotoItem>(items: T[], query: string): T[] {
  const withPhotos = items.filter((i) => i.active !== false && i.image_url);
  if (withPhotos.length === 0) return [];
  const names = withPhotos.map(nameTokens);

  const matchSets: number[][] = [];
  for (const q of new Set(tokenize(query))) {
    const matched: number[] = [];
    names.forEach((tokens, idx) => {
      if (tokens.some((t) => tokenHits(q, t) > 0)) matched.push(idx);
    });
    if (matched.length === 0) continue;
    // A word in every item name (e.g. the brand) says nothing about which item.
    if (withPhotos.length > 2 && matched.length === withPhotos.length) continue;
    matchSets.push(matched);
  }

  matchSets.sort((a, b) => a.length - b.length);
  const selected: number[] = [];
  for (const matched of matchSets) {
    const refinesSelection = matched.some((idx) => selected.includes(idx));
    if (refinesSelection) continue;
    for (const idx of matched) if (!selected.includes(idx)) selected.push(idx);
  }

  return selected.slice(0, MAX_PHOTOS).map((idx) => withPhotos[idx]);
}
