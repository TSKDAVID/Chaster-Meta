"use client";

import { Fragment, useMemo } from "react";
import { stripAttachmentUrls, tokenizeInline } from "@/lib/message-text";

type Props = {
  text: string;
  /** URL already rendered as an image bubble; never shown as text. */
  attachedUrl?: string | null;
  className?: string;
};

/** Renders bold / italic / links from message text. Never interprets HTML. */
export default function MessageText({ text, attachedUrl, className }: Props) {
  const tokens = useMemo(
    () => tokenizeInline(stripAttachmentUrls(text, attachedUrl)),
    [text, attachedUrl],
  );

  if (tokens.length === 0) return null;

  return (
    <span className={className}>
      {tokens.map((t, i) => {
        if (t.kind === "break") return <br key={i} />;
        if (t.kind === "bold") return <strong key={i}>{t.value}</strong>;
        if (t.kind === "italic") return <em key={i}>{t.value}</em>;
        if (t.kind === "link") {
          return (
            <a
              key={i}
              href={t.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="ch-msg-link"
            >
              {t.label}
            </a>
          );
        }
        return <Fragment key={i}>{t.value}</Fragment>;
      })}
    </span>
  );
}
