import { getSupabaseAdmin } from "@/lib/supabase/admin";

export function isSafeMetaId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9A-Za-z._-]{1,128}$/.test(value);
}

/**
 * One customer's thread on a page, filtered in the database so busy pages
 * can't push this customer's messages out of the window.
 * Returns the newest `limit` rows, oldest first.
 */
export async function loadPeerThread<Row = Record<string, unknown>>(
  pageId: string,
  peerId: string,
  opts: { columns?: string; limit?: number } = {},
): Promise<Row[]> {
  if (!isSafeMetaId(pageId) || !isSafeMetaId(peerId)) {
    throw new Error("Invalid page_id or peer_id");
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("messenger_messages")
    .select(opts.columns ?? "*")
    .eq("page_id", pageId)
    .or(`sender_id.eq.${peerId},recipient_id.eq.${peerId}`)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);

  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).reverse();
}
