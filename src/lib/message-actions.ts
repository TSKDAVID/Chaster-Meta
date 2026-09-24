import type { MessengerMessage } from "@/lib/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

/** Resolve reply target mid from column or webhook/raw payload. */
export function getReplyToMid(message: MessengerMessage): string | null {
  if (message.reply_to_mid?.trim()) return message.reply_to_mid.trim();
  const raw = asRecord(message.raw_payload);
  if (!raw) return null;
  const nestedMessage = asRecord(raw.message);
  const replyTo =
    asRecord(nestedMessage?.reply_to) ?? asRecord(raw.reply_to);
  const mid = replyTo?.mid;
  return typeof mid === "string" && mid.trim() ? mid.trim() : null;
}

/**
 * Column is source of truth once present on the row (including null = cleared).
 * Only fall back to raw_payload when the column field was never selected.
 */
export function getPageReaction(message: MessengerMessage): string | null {
  if ("page_reaction" in message && message.page_reaction !== undefined) {
    const col = message.page_reaction;
    return col && col.trim() ? col.trim() : null;
  }
  const raw = asRecord(message.raw_payload);
  const value = raw?.page_reaction;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getCustomerReaction(message: MessengerMessage): string | null {
  if ("customer_reaction" in message && message.customer_reaction !== undefined) {
    const col = message.customer_reaction;
    return col && col.trim() ? col.trim() : null;
  }
  const raw = asRecord(message.raw_payload);
  const value = raw?.customer_reaction;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export type OutgoingAuthor = "ai" | "you";

/** Who sent an outgoing Page message: AI auto-reply or a human on the desk. */
export function getOutgoingAuthor(message: MessengerMessage): OutgoingAuthor {
  const raw = asRecord(message.raw_payload);
  const source = typeof raw?.source === "string" ? raw.source : "";
  if (
    source === "groq_auto_reply" ||
    source === "groq_send_photo" ||
    source === "ai" ||
    source === "auto_reply"
  ) {
    return "ai";
  }
  // Desk sends and Meta echoes without our AI tag → treat as human / Page desk
  return "you";
}

/** Public image URL on an outgoing/incoming message, if any. */
export function getMessageImageUrl(message: MessengerMessage): string | null {
  const raw = asRecord(message.raw_payload);
  if (!raw) return null;

  const direct = raw.image_url;
  if (typeof direct === "string" && /^https:\/\//i.test(direct.trim())) {
    return direct.trim();
  }

  const nestedMessage = asRecord(raw.message) ?? raw;
  const attachments = nestedMessage.attachments;
  if (!Array.isArray(attachments)) return null;

  for (const entry of attachments) {
    const att = asRecord(entry);
    if (!att || att.type !== "image") continue;
    const payload = asRecord(att.payload);
    const url = payload?.url;
    if (typeof url === "string" && /^https:\/\//i.test(url.trim())) {
      return url.trim();
    }
  }
  return null;
}

/** Strip reaction keys from a raw_payload object (immutable). */
export function withSyncedReactionPayload(
  raw: unknown,
  kind: "page_reaction" | "customer_reaction",
  reaction: string | null,
): Record<string, unknown> {
  const prev = asRecord(raw) ?? {};
  const next = { ...prev };
  if (reaction && reaction.trim()) {
    next[kind] = reaction.trim();
  } else {
    delete next[kind];
  }
  return next;
}

export const PAGE_REACTIONS = ["👍", "❤️", "😆", "😮", "😢", "😡"] as const;

/** Compact emoji set for the “more” picker (Messenger-style custom react). */
export const EMOJI_PICKER_SET = [
  "😀", "😃", "😄", "😁", "😅", "😂", "🤣", "😊", "😇", "🙂", "😉", "😌",
  "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨",
  "🧐", "🤓", "😎", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁",
  "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬",
  "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭",
  "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲",
  "🥱", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒",
  "🤕", "🤑", "🤠", "😈", "👿", "👹", "👺", "🤡", "💩", "👻", "💀", "☠️",
  "👽", "👾", "🤖", "🎃", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿",
  "😾", "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟",
  "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍", "👎", "✊", "👊",
  "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✍️", "💅", "🤳", "💪",
  "🦾", "🦵", "🦶", "👂", "👃", "🧠", "👀", "👁️", "👅", "👄", "💋", "🩸",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕",
  "💞", "💓", "💗", "💖", "💘", "💝", "💟", "☮️", "✝️", "☪️", "🕉️", "☸️",
  "✡️", "🔯", "🕎", "☯️", "☦️", "🛐", "⛎", "♈", "♉", "♊", "♋", "♌",
  "🔥", "✨", "⭐", "🌟", "💫", "💥", "💢", "💦", "💨", "🕊️", "🐰", "🐱",
  "🐶", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🙈", "🙉",
  "🙊", "🦄", "🐝", "🦋", "🌸", "💮", "🏵️", "🌹", "🥀", "🌺", "🌻", "🌼",
  "🌷", "🌱", "🪴", "🌲", "🌳", "🌴", "🌵", "🌾", "🌿", "☘️", "🍀", "🍁",
  "🍂", "🍃", "🍇", "🍈", "🍉", "🍊", "🍋", "🍌", "🍍", "🥭", "🍎", "🍏",
  "🍐", "🍑", "🍒", "🍓", "🫐", "🥝", "🍅", "🫒", "🥥", "🥑", "🍆", "🥔",
  "🎉", "🎊", "🎈", "🎁", "🏆", "🥇", "🥈", "🥉", "⚽", "🏀", "🏈", "⚾",
  "🎾", "🏐", "🏉", "🥏", "🎱", "🪀", "🏓", "🏸", "🏒", "🏑", "🥍", "🏏",
  "🎯", "🎮", "🕹️", "🎲", "🧩", "♠️", "♥️", "♦️", "♣️", "♟️", "🃏", "🀄",
  "✅", "❌", "❓", "❗", "💯", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫",
  "⚪", "🟤", "🔶", "🔷", "🔸", "🔹", "🔺", "🔻", "💠", "🔘", "🔳", "🔲",
] as const;
