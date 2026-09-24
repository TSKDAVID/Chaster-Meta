type IconProps = {
  size?: number;
  className?: string;
};

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconBook({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path {...stroke} d="M5 4.5h11.5A2.5 2.5 0 0 1 19 7v12.5H7.5A2.5 2.5 0 0 0 5 22" />
      <path {...stroke} d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19" />
      <path {...stroke} d="M9 8h6M9 12h6" />
    </svg>
  );
}

export function IconLink({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path {...stroke} d="M9.5 14.5 14.5 9.5" />
      <path
        {...stroke}
        d="M11 7.2 12.8 5.4a3.2 3.2 0 1 1 4.5 4.5L15.5 11.7M13 16.8l-1.8 1.8a3.2 3.2 0 1 1-4.5-4.5L8.5 12.3"
      />
    </svg>
  );
}

export function IconCaret({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path {...stroke} d="m7 10 5 5 5-5" />
    </svg>
  );
}

export function IconLayers({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path {...stroke} d="m4.5 9.2 7.5 3.8 7.5-3.8L12 5.4 4.5 9.2Z" />
      <path {...stroke} d="m4.5 13.2 7.5 3.8 7.5-3.8" />
      <path {...stroke} d="m4.5 17.2 7.5 3.8 7.5-3.8" />
    </svg>
  );
}

export function IconUser({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <circle {...stroke} cx="12" cy="8" r="3.2" />
      <path {...stroke} d="M5.5 19.2c1.4-3 3.6-4.5 6.5-4.5s5.1 1.5 6.5 4.5" />
    </svg>
  );
}

export function IconDisconnect({ size = 15, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path {...stroke} d="M10 5H6.5A2.5 2.5 0 0 0 4 7.5v9A2.5 2.5 0 0 0 6.5 19H10" />
      <path {...stroke} d="M14 12H8.5M14 12l-2.2-2.2M14 12l-2.2 2.2" />
      <path {...stroke} d="M14 5h3.5A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5H14" />
    </svg>
  );
}

export function IconRefresh({ size = 15, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path {...stroke} d="M19.5 12a7.5 7.5 0 1 1-2.1-5.2" />
      <path {...stroke} d="M19.5 4.5V9H15" />
    </svg>
  );
}

export function IconSend({ size = 15, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path {...stroke} d="M5 12h12.5" />
      <path {...stroke} d="m12.5 6.5 5.5 5.5-5.5 5.5" />
    </svg>
  );
}

export function IconHand({ size = 15, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        {...stroke}
        d="M8 11V6.2a1.2 1.2 0 0 1 2.4 0V11M10.4 10.2V5.5a1.2 1.2 0 0 1 2.4 0V11M12.8 10V6.8a1.2 1.2 0 1 1 2.4 0V12M15.2 11.2v-1a1.2 1.2 0 1 1 2.4 0v4.3c0 2.6-1.9 4.5-4.6 4.5h-.4c-2 0-3.5-1-4.6-2.5L8 14.2"
      />
    </svg>
  );
}

export function IconSpark({ size = 15, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path {...stroke} d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" />
      <circle {...stroke} cx="12" cy="12" r="3.2" />
    </svg>
  );
}

export function IconStop({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <rect {...stroke} x="6.5" y="6.5" width="11" height="11" rx="1.2" />
    </svg>
  );
}

export function IconDown({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path {...stroke} d="M12 5v12.5M7.5 13.5 12 18l4.5-4.5" />
    </svg>
  );
}

export function IconBack({ size = 15, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path {...stroke} d="M15.5 5.5 9 12l6.5 6.5" />
      <path {...stroke} d="M9 12h11" />
    </svg>
  );
}

export function IconCalendar({ size = 15, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <rect {...stroke} x="4" y="5.5" width="16" height="14.5" rx="1.2" />
      <path {...stroke} d="M4 10h16M8 3.5v4M16 3.5v4" />
      <path {...stroke} d="M8 13.5h2.2M12 13.5h2.2M16 13.5h.5M8 16.5h2.2M12 16.5h2.2" />
    </svg>
  );
}

export function IconSearch({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <circle {...stroke} cx="11" cy="11" r="6" />
      <path {...stroke} d="m16 16 3.5 3.5" />
    </svg>
  );
}

export function IconClose({ size = 15, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path {...stroke} d="m7 7 10 10M17 7 7 17" />
    </svg>
  );
}

export function IconPalette({ size = 15, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        {...stroke}
        d="M12 4a8 8 0 1 0 0 16h1.2a2.3 2.3 0 0 0 2.2-2.8 2.3 2.3 0 0 1 2.2-2.8H19a8 8 0 0 0-7-10.4Z"
      />
      <circle cx="8.2" cy="10" r="1" fill="currentColor" />
      <circle cx="11" cy="7.8" r="1" fill="currentColor" />
      <circle cx="14.5" cy="8.5" r="1" fill="currentColor" />
    </svg>
  );
}

export function IconCheck({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path {...stroke} d="m5.5 12.5 4 4 9-10" />
    </svg>
  );
}

export function IconLamp({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path {...stroke} d="M9 18h6M10.5 18v2.5h3V18" />
      <path {...stroke} d="M8 14.5c0-3 1.8-4.5 4-6.5 2.2 2 4 3.5 4 6.5H8Z" />
    </svg>
  );
}

export function IconReply({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path {...stroke} d="M9.5 14.5 4.5 9.5 9.5 4.5" />
      <path {...stroke} d="M4.5 9.5H14a5.5 5.5 0 0 1 5.5 5.5V19" />
    </svg>
  );
}

export function IconClock({ size = 15, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <circle {...stroke} cx="12" cy="12" r="8" />
      <path {...stroke} d="M12 8v4.5l3 2" />
    </svg>
  );
}

export function IconGlobe({ size = 15, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <circle {...stroke} cx="12" cy="12" r="8" />
      <path {...stroke} d="M4.5 12h15M12 4.5c2.2 2.4 3.3 4.9 3.3 7.5S14.2 17.1 12 19.5C9.8 17.1 8.7 14.6 8.7 12S9.8 6.9 12 4.5Z" />
    </svg>
  );
}

export function IconChevron({
  size = 14,
  className,
  dir = "left",
}: IconProps & { dir?: "left" | "right" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      style={dir === "right" ? { transform: "scaleX(-1)" } : undefined}
    >
      <path {...stroke} d="M14.5 6 9 12l5.5 6" />
    </svg>
  );
}
