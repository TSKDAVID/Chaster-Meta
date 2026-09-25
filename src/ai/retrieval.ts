/**
 * Lexical ranking for FAQ / catalog entries.
 * Georgian (and most other languages here) inflects word endings, so tokens
 * also match on a shared stem prefix: "თმის" ~ "თმა", "haircuts" ~ "haircut".
 */

export type WeightedField = { text: string | null | undefined; weight: number };

const MIN_TOKEN = 2;
const MIN_STEM = 3;

export function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= MIN_TOKEN);
}

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}

const GEORGIAN = /[\u10A0-\u10FF\u1C90-\u1CBF]/;

/** Case / plural endings, longest first. Nominative -ა/-ი drops in most cases (თმა → თმის). */
const GEORGIAN_SUFFIXES = [
  "ებისთვის", "ისთვის", "ებთან", "ებში", "ებზე", "ებით", "ების", "ებს", "ები",
  "თვის", "თან", "ში", "ზე", "ით", "ად", "ის", "ს", "ა", "ი", "ე", "ო", "უ",
];

function georgianStem(token: string): string {
  for (const suffix of GEORGIAN_SUFFIXES) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 2) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

function bigramDice(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  let common = 0;
  for (const [g, n] of ga) common += Math.min(n, gb.get(g) ?? 0);
  return (2 * common) / (a.length - 1 + (b.length - 1));
}

/** 1 = exact, 0.8 = same stem, 0.6 = prefix match, 0.5 = close Georgian form, 0 = unrelated. */
function tokenSimilarity(query: string, target: string): number {
  if (query === target) return 1;

  if (GEORGIAN.test(query) && GEORGIAN.test(target)) {
    const qs = georgianStem(query);
    const ts = georgianStem(target);
    if (qs === ts) return 0.8;
    const shorter = Math.min(qs.length, ts.length);
    if (shorter >= 2 && commonPrefixLength(qs, ts) === shorter) return 0.6;
    // Verb forms with preverbs/infixes: შემეჭრა ~ შეჭრა.
    if (Math.max(qs.length, ts.length) >= 4 && bigramDice(qs, ts) >= 0.6) return 0.5;
    return 0;
  }

  const shorter = Math.min(query.length, target.length);
  if (shorter < MIN_STEM) return 0;
  const prefix = commonPrefixLength(query, target);
  if (prefix === shorter) return 0.6;
  if (prefix >= Math.max(MIN_STEM, Math.ceil(shorter * 0.75))) return 0.6;
  return 0;
}

export function scoreFields(queryTokens: string[], fields: WeightedField[]): number {
  if (queryTokens.length === 0) return 0;
  let score = 0;
  const tokenized = fields.map((field) => ({
    tokens: tokenize(field.text),
    weight: field.weight,
  }));
  for (const q of new Set(queryTokens)) {
    let best = 0;
    for (const field of tokenized) {
      for (const t of field.tokens) {
        const sim = tokenSimilarity(q, t) * field.weight;
        if (sim > best) best = sim;
      }
    }
    score += best;
  }
  return score;
}

export type Selection<T> = {
  items: T[];
  /** True when some entries were left out of the prompt. */
  truncated: boolean;
  total: number;
};

/**
 * Small lists go in whole (cross-language questions can't be matched
 * lexically). Larger lists: best matches first, topped up in original order
 * so the model still sees representative entries when nothing matches.
 */
export function selectRelevant<T>(
  items: T[],
  query: string,
  fields: (item: T) => WeightedField[],
  opts: { includeAllUpTo: number; topK: number },
): Selection<T> {
  if (items.length <= opts.includeAllUpTo) {
    return { items, truncated: false, total: items.length };
  }
  const ranked = rankByQuery(items, query, fields);
  const picked = ranked.filter((r) => r.score > 0).slice(0, opts.topK).map((r) => r.item);
  if (picked.length < opts.topK) {
    for (const item of items) {
      if (picked.length >= opts.topK) break;
      if (!picked.includes(item)) picked.push(item);
    }
  }
  return { items: picked, truncated: true, total: items.length };
}

export function rankByQuery<T>(
  items: T[],
  query: string,
  fields: (item: T) => WeightedField[],
): Array<{ item: T; score: number }> {
  const queryTokens = tokenize(query);
  return items
    .map((item, index) => ({ item, index, score: scoreFields(queryTokens, fields(item)) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item, score }) => ({ item, score }));
}

type KnowledgeEntry = {
  entry_type: "qa" | "info";
  question: string | null;
  content: string;
};

export function knowledgeFields(entry: KnowledgeEntry): WeightedField[] {
  return [
    { text: entry.question, weight: 3 },
    { text: entry.content, weight: 1 },
  ];
}

export function formatKnowledgeLine(entry: KnowledgeEntry): string {
  if (entry.entry_type === "qa" && entry.question) {
    return `- Q: ${entry.question}\n  A: ${entry.content}`;
  }
  return `- Info: ${entry.content}`;
}
