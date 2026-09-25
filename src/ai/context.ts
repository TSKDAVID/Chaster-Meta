/**
 * Assembles the reply model's system prompt: identity, clock, rules,
 * conversation memory, then only the module sections routed for this turn.
 */

const DEFAULT_TIMEZONE = "Asia/Tbilisi";

const GEORGIAN_WEEKDAYS = [
  "კვირა",
  "ორშაბათი",
  "სამშაბათი",
  "ოთხშაბათი",
  "ხუთშაბათი",
  "პარასკევი",
  "შაბათი",
];

const EN_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function zonedParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    time: `${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}`,
  };
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** "Now" line plus today + the next 7 days with weekday names and ISO dates. */
export function clockBlock(opts: { timeZone?: string | null; lang: string; now?: Date }): string {
  const timeZone = opts.timeZone || DEFAULT_TIMEZONE;
  const { year, month, day, time } = zonedParts(opts.now ?? new Date(), timeZone);
  const today = new Date(Date.UTC(year, month - 1, day, 12));
  const withKa = opts.lang === "ka";

  const label = (d: Date) => {
    const wd = d.getUTCDay();
    const name = withKa ? `${EN_WEEKDAYS[wd]} (${GEORGIAN_WEEKDAYS[wd]})` : EN_WEEKDAYS[wd];
    return `${name} ${d.getUTCDate()} ${EN_MONTHS[d.getUTCMonth()]} = ${ymd(d)}`;
  };

  const days: string[] = [];
  for (let i = 0; i <= 7; i++) {
    const d = new Date(today.getTime() + i * 86_400_000);
    const tag = i === 0 ? "today" : i === 1 ? "tomorrow" : null;
    days.push(`- ${label(d)}${tag ? ` (${tag})` : ""}`);
  }

  return `## Now
${EN_WEEKDAYS[today.getUTCDay()]} ${day} ${EN_MONTHS[month - 1]} ${year}, ${time} (${timeZone}).
Calendar — use these exact dates for day names ("Monday" = the next Monday below, unless the customer says otherwise):
${days.join("\n")}`;
}

export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export type MemoryBlock = {
  summary: string | null;
  stateLines: string[];
};

export function buildSystemPrompt(input: {
  businessName: string;
  lang: string;
  timeZone?: string | null;
  memory: MemoryBlock;
  needsHuman: boolean;
  sections: string[];
  now?: Date;
}): string {
  const language = languageName(input.lang);

  const base = `You are the Messenger assistant of ${input.businessName}. You chat with customers on its behalf, like a helpful member of the team.

## How to reply
- Write in ${language} — the language of the customer's latest message. Keep that language for the whole reply (names of items may stay as written in the catalog).
- Plain text only: no markdown, no **bold**, no # headings, no tables, no [text](url) links. For a list use short lines starting with "- ".
- Be brief and natural: 1-3 short sentences unless the customer asks for details or a list.
- Answer only what THIS message asks. Do not volunteer prices, tour/season dates, stock, booking times, or other catalog facts unless the customer asked for them in this message.
- Quote prices and fees only when asked, and exactly as written in their source (catalog, FAQ, tool result), with the same currency symbol/code. Never convert currencies or swap $ for GEL/₾.
- Use only facts from the sections below and tool results. If something isn't covered, say you'll check with the team — never invent prices, policies, hours, availability or commitments.
- Answer every question in the customer's message; don't drop any part — but don't add extra topics.
- Photos: if they ask to see a picture in this message, call send_photo this turn even if it was sent before. Caption briefly (item name is enough); no prices or dates unless they also asked. Never paste image links. If they did not ask for a photo in this message, do not call send_photo.`;

  const human = input.needsHuman
    ? `\n\nThe customer wants to talk to a person: say a team member will reply here soon, and still help with anything you can answer.`
    : "";

  const memoryParts: string[] = [];
  if (input.memory.summary) {
    memoryParts.push(`Earlier in this conversation (summary):\n${input.memory.summary}`);
  }
  if (input.memory.stateLines.length) {
    memoryParts.push(`Working state:\n${input.memory.stateLines.join("\n")}`);
  }
  const memory = memoryParts.length ? `\n\n## Conversation memory\n${memoryParts.join("\n\n")}` : "";

  const clock = `\n\n${clockBlock({ timeZone: input.timeZone, lang: input.lang, now: input.now })}`;
  const sections = input.sections.length ? `\n\n${input.sections.join("\n\n")}` : "";

  return `${base}${human}${clock}${memory}${sections}`;
}
