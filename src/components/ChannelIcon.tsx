"use client";

import { useId } from "react";
import type { MessagePlatform } from "@/lib/types";

type Props = {
  platform: MessagePlatform;
  size?: number;
  className?: string;
};

/** Recognizable channel marks — people need to know where the chat came from. */
export default function ChannelIcon({ platform, size = 18, className = "" }: Props) {
  const uid = useId().replace(/:/g, "");

  if (platform === "instagram") {
    const gid = `ig-${uid}`;
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center ${className}`}
        title="Instagram"
        aria-label="Instagram"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <defs>
            <linearGradient id={gid} x1="2" y1="22" x2="22" y2="2">
              <stop stopColor="#F58529" />
              <stop offset="0.5" stopColor="#DD2A7B" />
              <stop offset="1" stopColor="#515BD4" />
            </linearGradient>
          </defs>
          <rect width="24" height="24" rx="6" fill={`url(#${gid})`} />
          <rect
            x="5"
            y="5"
            width="14"
            height="14"
            rx="4"
            stroke="#fff"
            strokeWidth="1.75"
          />
          <circle cx="12" cy="12" r="3.5" stroke="#fff" strokeWidth="1.75" />
          <circle cx="16.6" cy="7.4" r="1.15" fill="#fff" />
        </svg>
      </span>
    );
  }

  // Official-style Messenger: blue bubble + white lightning
  const grad = `msgr-${uid}`;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      title="Messenger"
      aria-label="Messenger"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <defs>
          <linearGradient id={grad} x1="4" y1="2" x2="20" y2="22">
            <stop stopColor="#00B2FF" />
            <stop offset="1" stopColor="#006AFF" />
          </linearGradient>
        </defs>
        <path
          d="M12 2.1C6.55 2.1 2.15 6.2 2.15 11.25c0 2.86 1.42 5.4 3.64 7.1v3.45l3.34-1.83c.9.25 1.86.38 2.87.38 5.45 0 9.85-4.1 9.85-9.1S17.45 2.1 12 2.1Z"
          fill={`url(#${grad})`}
        />
        <path
          d="m7.05 13.85 3.55-5.65 3.05 2.4 3.3-2.4-3.55 5.65-3.05-2.4-3.3 2.4Z"
          fill="#fff"
        />
      </svg>
    </span>
  );
}
