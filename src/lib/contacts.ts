import { fetchMessengerUserProfile } from "@/lib/meta";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { MessagePlatform } from "@/lib/types";

export type ContactRow = {
  page_id: string;
  peer_id: string;
  platform: MessagePlatform;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  profile_pic: string | null;
};

function buildDisplayName(profile: {
  name?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
}): string | null {
  if (profile.name?.trim()) return profile.name.trim();
  const combined = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
  if (combined) return combined;
  if (profile.username?.trim()) return `@${profile.username.trim()}`;
  return null;
}

/** Detect mojibake / broken encoding like "????? ????" */
export function isBrokenDisplayName(name: string | null | undefined): boolean {
  if (!name?.trim()) return true;
  // Only question marks / replacement chars / spaces means encoding was lost
  return /^[\s?�]+$/u.test(name);
}

/** Fetch Meta profile and upsert into messenger_contacts (best-effort). */
export async function resolveAndStoreContact(options: {
  pageId: string;
  peerId: string;
  pageAccessToken: string;
  platform?: MessagePlatform;
  force?: boolean;
}): Promise<ContactRow | null> {
  const { pageId, peerId, pageAccessToken, platform = "messenger", force = false } =
    options;
  const supabase = getSupabaseAdmin();

  if (!force) {
    const { data: existing } = await supabase
      .from("messenger_contacts")
      .select("*")
      .eq("page_id", pageId)
      .eq("peer_id", peerId)
      .maybeSingle();

    if (existing?.display_name && !isBrokenDisplayName(existing.display_name)) {
      return existing as ContactRow;
    }
  }

  const profile = await fetchMessengerUserProfile(peerId, pageAccessToken);
  if (!profile) return null;

  const displayName = buildDisplayName(profile);
  const row = {
    page_id: pageId,
    peer_id: peerId,
    platform,
    display_name: displayName,
    first_name: profile.first_name ?? null,
    last_name: profile.last_name ?? null,
    username: profile.username ?? null,
    profile_pic: profile.profile_pic ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("messenger_contacts")
    .upsert(row, { onConflict: "page_id,peer_id" })
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("contact upsert failed", error.message);
    return null;
  }

  return (data as ContactRow) ?? null;
}
