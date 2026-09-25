/**
 * Messenger shows raw text, so markdown the model slips in must go:
 * **bold**, __bold__, # headings, [text](url) links, `code`, tables, fake tool calls.
 */
export function toMessengerText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/!\[[^\]]*\]\(([^)\s]+)\)/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, label: string, url: string) =>
      label.trim() === url ? url : `${label} ${url}`,
    )
    .replace(/^\s*\[?(?:send_photo|search_catalog|list_open_slots|check_availability|create_booking|update_booking|cancel_booking|search_faq)\]?\s*(\([\s\S]*\))?\.?\s*$/gim, "")
    .replace(/\[send_photo\]/gi, "")
    // Photo markers belong to our stored photo rows, not the model's text.
    .replace(/📷\uFE0F?/gu, "")
    .replace(/^[ \t]+$/gm, "")
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/__([\s\S]+?)__/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/gm, "")
    .replace(/^\s*[*•]\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const ALREADY_SENT =
  /(?:ფოტო|სურათი|photo|picture|image)?\s*უკვე\s*(?:გამოგზავნილ(?:ია|ი)|გამოვგზავნ(?:ე|ილია)|გაგზავნილ(?:ია|ი))|(?:already\s+(?:sent|delivered|attached)|photo (?:is|was) already)/gi;

const NO_PHOTO =
  /(?:ფოტო|სურათ)\S*\s+(?:\S+\s+){0,3}(?:არ\s+(?:გვაქვს|მაქვს|არის|მოიძებნა)|ვერ\s+(?:ვიპოვე|მოიძებნა|გამოგიგზავნ))|(?:no|don't have (?:a|any)?|do not have (?:a|any)?|couldn't find (?:a|any)?)\s*(?:photos?|pictures?|images?)/i;

/**
 * Drop "already sent" wording when a photo is actually going out with this reply.
 * Also drops sentences claiming there is no photo when one is going out anyway.
 */
export function captionWithPhotos(
  text: string,
  photos: Array<{ itemName?: string }>,
): string {
  if (photos.length === 0) return text;
  const stripped = text
    .split(/(?<=[.!?\n])/)
    .filter((sentence) => !NO_PHOTO.test(sentence))
    .join("")
    .replace(ALREADY_SENT, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[,.;:–—\- ]+|[,.;:–—\- ]+$/g, "")
    .trim();
  if (stripped) return stripped;
  const name = photos[0]?.itemName;
  return name ? `📷 ${name}` : "";
}
