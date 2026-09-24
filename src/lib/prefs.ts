import { applyTheme, isThemeId, type ThemeId } from "@/lib/themes";

export const PREFS_KEY = "chaster_operator_prefs_v1";
export const TOUR_DONE_KEY = "chaster_tour_done_v1";

export type OperatorPrefs = {
  defaultAiReplies: boolean;
  theme: ThemeId;
};

export const defaultPrefs: OperatorPrefs = {
  defaultAiReplies: true,
  theme: "slate",
};

type PrefsCacheV2 = {
  v: 2;
  lastAccountId: string;
  byAccount: Record<string, OperatorPrefs>;
};

function normalizeAccountId(accountId?: string | null) {
  const id = accountId?.trim();
  return id && id.length > 0 ? id : "local";
}

function sanitizePrefs(parsed: Partial<OperatorPrefs> | null | undefined): OperatorPrefs {
  return {
    defaultAiReplies:
      typeof parsed?.defaultAiReplies === "boolean"
        ? parsed.defaultAiReplies
        : defaultPrefs.defaultAiReplies,
    theme: isThemeId(parsed?.theme) ? parsed.theme : defaultPrefs.theme,
  };
}

function readCache(): PrefsCacheV2 {
  if (typeof window === "undefined") {
    return { v: 2, lastAccountId: "local", byAccount: {} };
  }
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { v: 2, lastAccountId: "local", byAccount: {} };
    const parsed = JSON.parse(raw) as PrefsCacheV2 | Partial<OperatorPrefs>;

    if (parsed && typeof parsed === "object" && "v" in parsed && parsed.v === 2) {
      const byAccount: Record<string, OperatorPrefs> = {};
      for (const [key, value] of Object.entries(parsed.byAccount ?? {})) {
        byAccount[key] = sanitizePrefs(value);
      }
      return {
        v: 2,
        lastAccountId: normalizeAccountId(parsed.lastAccountId),
        byAccount,
      };
    }

    // Migrate flat v1 shape → per-account cache
    const legacy = sanitizePrefs(parsed as Partial<OperatorPrefs>);
    return {
      v: 2,
      lastAccountId: "local",
      byAccount: { local: legacy },
    };
  } catch {
    return { v: 2, lastAccountId: "local", byAccount: {} };
  }
}

function writeCache(cache: PrefsCacheV2) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(cache));
}

export function loadPrefs(accountId?: string | null): OperatorPrefs {
  const cache = readCache();
  const id = normalizeAccountId(accountId ?? cache.lastAccountId);
  if (cache.byAccount[id]) return cache.byAccount[id];
  if (cache.byAccount[cache.lastAccountId]) return cache.byAccount[cache.lastAccountId];
  if (cache.byAccount.local) return cache.byAccount.local;
  return defaultPrefs;
}

export function savePrefs(prefs: OperatorPrefs, accountId?: string | null) {
  const id = normalizeAccountId(accountId);
  const cache = readCache();
  cache.lastAccountId = id;
  cache.byAccount[id] = sanitizePrefs(prefs);
  writeCache(cache);
  applyTheme(prefs.theme);
}

export async function fetchAccountPrefs(
  accountId?: string | null,
): Promise<{ prefs: OperatorPrefs; source: string }> {
  const id = normalizeAccountId(accountId);
  const res = await fetch(
    `/api/prefs?facebook_user_id=${encodeURIComponent(id)}`,
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to load account prefs");
  const prefs = sanitizePrefs(data.prefs as Partial<OperatorPrefs>);
  const source = typeof data.source === "string" ? data.source : "default";
  if (source !== "default") {
    savePrefs(prefs, id);
  }
  return { prefs, source };
}

export async function persistAccountPrefs(
  prefs: OperatorPrefs,
  accountId?: string | null,
): Promise<OperatorPrefs> {
  const id = normalizeAccountId(accountId);
  const next = sanitizePrefs(prefs);
  savePrefs(next, id);

  const res = await fetch("/api/prefs", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      facebook_user_id: id,
      theme: next.theme,
      defaultAiReplies: next.defaultAiReplies,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to save account prefs");
  const saved = sanitizePrefs(data.prefs as Partial<OperatorPrefs>);
  savePrefs(saved, id);
  return saved;
}

export function isTourDone() {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(TOUR_DONE_KEY) === "1";
}

export function markTourDone() {
  localStorage.setItem(TOUR_DONE_KEY, "1");
}

export function resetTourDone() {
  localStorage.removeItem(TOUR_DONE_KEY);
}
