/**
 * Minimal, safe inline markdown for AI replies: **bold**, *italic*, links.
 * No HTML is ever interpreted; output is a token list rendered by React.
 */

export type InlineToken =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "italic"; value: string }
  | { kind: "link"; href: string; label: string }
  | { kind: "break" };

const URL_RE = /https?:\/\/[^\s<>()\]]+/gi;

/** Public storage / CDN URLs that are attachments, never something to show as text. */
export function isStorageUrl(url: string): boolean {
  return (
    /\/storage\/v1\/object\/(public|sign)\//i.test(url) ||
    /supabase\.(co|in)\//i.test(url) ||
    /fbcdn\.net\//i.test(url) ||
    /cdninstagram\.com\//i.test(url) ||
    /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)
  );
}

/**
 * Remove any storage URL (and the URL of an already-attached image) from the
 * text, tidying leftover punctuation and blank lines.
 */
export function stripAttachmentUrls(
  text: string,
  attachedUrl?: string | null,
): string {
  if (!text) return "";
  let out = text.replace(URL_RE, (url) => {
    const bare = url.replace(/[.,;:!?]+$/, "");
    if ((attachedUrl && bare === attachedUrl.trim()) || isStorageUrl(bare)) {
      return "";
    }
    return url;
  });
  // Markdown image / link leftovers: ![alt]() or [label]()
  out = out.replace(/!?\[([^\]]*)\]\(\s*\)/g, "$1");
  // Collapse whitespace artefacts
  out = out
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return out;
}

function pushText(tokens: InlineToken[], value: string) {
  if (!value) return;
  const parts = value.split("\n");
  parts.forEach((part, i) => {
    if (part) tokens.push({ kind: "text", value: part });
    if (i < parts.length - 1) tokens.push({ kind: "break" });
  });
}

/** Tokenize a single string into inline tokens. */
export function tokenizeInline(input: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const src = input ?? "";
  let i = 0;
  let buf = "";

  const flush = () => {
    pushText(tokens, buf);
    buf = "";
  };

  while (i < src.length) {
    // [label](https://…)
    if (src[i] === "[") {
      const close = src.indexOf("]", i + 1);
      if (close > i && src[close + 1] === "(") {
        const end = src.indexOf(")", close + 2);
        if (end > close) {
          const href = src.slice(close + 2, end).trim();
          const label = src.slice(i + 1, close);
          if (/^https?:\/\//i.test(href)) {
            flush();
            tokens.push({ kind: "link", href, label: label || href });
            i = end + 1;
            continue;
          }
        }
      }
    }
    // **bold**
    if (src.startsWith("**", i)) {
      const end = src.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        tokens.push({ kind: "bold", value: src.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    // *italic* or _italic_ (single, not at word-interior for underscores)
    if (
      (src[i] === "*" && src[i + 1] !== "*") ||
      (src[i] === "_" && (i === 0 || /\s/.test(src[i - 1])))
    ) {
      const mark = src[i];
      const end = src.indexOf(mark, i + 1);
      if (
        end > i + 1 &&
        !/\s/.test(src[i + 1]) &&
        !/\s/.test(src[end - 1])
      ) {
        flush();
        tokens.push({ kind: "italic", value: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    // bare URL
    if (src.startsWith("http://", i) || src.startsWith("https://", i)) {
      URL_RE.lastIndex = i;
      const m = URL_RE.exec(src);
      if (m && m.index === i) {
        const raw = m[0];
        const trailing = /[.,;:!?]+$/.exec(raw)?.[0] ?? "";
        const href = raw.slice(0, raw.length - trailing.length);
        flush();
        tokens.push({ kind: "link", href, label: href });
        buf += trailing;
        i += raw.length;
        continue;
      }
    }
    buf += src[i];
    i += 1;
  }
  flush();
  return tokens;
}

/** Plain-text version (for previews): markdown marks removed, URLs stripped. */
export function toPlainText(text: string, attachedUrl?: string | null): string {
  const clean = stripAttachmentUrls(text, attachedUrl);
  return clean
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|\s)\*([^*\s][^*]*?)\*/g, "$1$2")
    .replace(/(^|\s)_([^_\s][^_]*?)_/g, "$1$2")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1");
}
