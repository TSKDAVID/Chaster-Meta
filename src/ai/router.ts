import { callGroq, extractJsonObject, groqSmallModel, type ChatTurn } from "@/ai/groq";
import { INTENTS, isIntent, looksLikePhotoRetry, messageWantsPhoto, type Intent } from "@/ai/intents";

export type RouteEntities = {
  service: string | null;
  staff: string | null;
  date_text: string | null;
  time: string | null;
  product: string | null;
};

export type Route = {
  /** ISO 639-1 code of the customer's latest message. */
  lang: string;
  /** Undefined = router failed; every section and tool is offered. */
  intents: Intent[] | undefined;
  entities: RouteEntities;
  needs_human: boolean;
  /** "router" or "fallback" — for logs. */
  source: "router" | "fallback";
};

const EMPTY_ENTITIES: RouteEntities = {
  service: null,
  staff: null,
  date_text: null,
  time: null,
  product: null,
};

const INTENT_HELP: Record<Intent, string> = {
  greeting: "hello / thanks / small talk only",
  faq: "policies, rules, general questions about the business (refunds, shipping, payment, delivery…)",
  catalog: "products, services, prices, menu, options, stock",
  photo: "wants to see a picture of an item",
  hours_location: "opening hours, address, directions, contact details",
  availability: "asks which times/days are free",
  booking_new: "wants to book an appointment",
  booking_change: "wants to move / change an existing appointment (time, day, staff, service)",
  booking_cancel: "wants to cancel an appointment",
  human: "asks for a real person / operator, or is angry and wants escalation",
  other: "anything else",
};

/** Script-based guess used when the router call fails. */
function guessLang(text: string): string {
  if (/[\u10A0-\u10FF\u1C90-\u1CBF]/.test(text)) return "ka";
  if (/[\u0400-\u04FF]/.test(text)) return "ru";
  return "en";
}

function fallbackRoute(userText: string): Route {
  return {
    lang: guessLang(userText),
    intents: undefined,
    entities: { ...EMPTY_ENTITIES },
    needs_human: false,
    source: "fallback",
  };
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : null;
}

export async function routeMessage(input: {
  userText: string;
  history: ChatTurn[];
  /** Human names of what this Page offers (e.g. "bookings", "catalog"). */
  capabilities: string[];
}): Promise<Route> {
  const recent = input.history
    .slice(-4)
    .map((t) => `${t.role === "user" ? "Customer" : "Business"}: ${t.content.slice(0, 300)}`)
    .join("\n");

  const system = `You classify a customer's latest Messenger message for a business assistant. Return ONLY JSON.
This business offers: ${input.capabilities.join(", ") || "basic chat"}.

Intents (pick ALL that apply to the LATEST message only; use recent chat only to resolve short follow-ups like "yes" / "the 15:00 one"):
${INTENTS.map((i) => `- ${i}: ${INTENT_HELP[i]}`).join("\n")}

Rules:
- photo: ONLY if the latest message asks to see a picture (or is a clear "try again" retry after a photo ask). Do NOT keep photo just because an earlier message asked for photos.
- catalog: ONLY if they ask about products/prices/options. A photo-only ask is photo, not catalog.
- A short follow-up like "yes", "the 15:00 one", "with Nika then" continues the previous topic — use the intents of that topic.

JSON shape:
{"lang":"<ISO 639-1 code of the language the customer wrote the latest message in; Georgian (also Latin-letter Georgian) = ka>","intents":["..."],"entities":{"service":null,"staff":null,"date_text":null,"time":null,"product":null},"needs_human":false}
entities: copy the customer's own words (null when absent). date_text = day/date words exactly as said (e.g. "ორშაბათს", "tomorrow"). time = HH:mm if a time was given.`;

  try {
    const choice = await callGroq({
      model: groqSmallModel(),
      temperature: 0,
      maxCompletionTokens: 600,
      reasoningEffort: "low",
      responseFormat: "json_object",
      maxWaitMs: 8_000,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `${recent ? `Recent chat:\n${recent}\n\n` : ""}Latest customer message:\n${input.userText.slice(0, 1000)}`,
        },
      ],
    });

    const parsed = extractJsonObject(choice.message?.content ?? "") as Record<string, unknown>;
    const intents = Array.isArray(parsed.intents)
      ? [...new Set(parsed.intents.filter(isIntent))]
      : [];
    if (intents.length === 0) return fallbackRoute(input.userText);

    const recentBlob = `${input.userText}\n${input.history.slice(-4).map((t) => t.content).join("\n")}`;
    const wantsPhoto =
      messageWantsPhoto(input.userText) || looksLikePhotoRetry(input.userText, recentBlob);
    if (!intents.includes("photo") && wantsPhoto) {
      intents.push("photo");
    }
    // Drop stale photo intent carried over from earlier turns.
    if (intents.includes("photo") && !wantsPhoto) {
      const filtered = intents.filter((i) => i !== "photo");
      if (filtered.length > 0) intents.splice(0, intents.length, ...filtered);
    }

    const rawEntities =
      parsed.entities && typeof parsed.entities === "object"
        ? (parsed.entities as Record<string, unknown>)
        : {};
    const lang =
      typeof parsed.lang === "string" && /^[a-z]{2}$/i.test(parsed.lang.trim())
        ? parsed.lang.trim().toLowerCase()
        : guessLang(input.userText);

    return {
      lang,
      intents,
      entities: {
        service: strOrNull(rawEntities.service),
        staff: strOrNull(rawEntities.staff),
        date_text: strOrNull(rawEntities.date_text),
        time: strOrNull(rawEntities.time),
        product: strOrNull(rawEntities.product),
      },
      needs_human: parsed.needs_human === true || intents.includes("human"),
      source: "router",
    };
  } catch (err) {
    console.warn("[ai-route] router failed, using all intents:", err instanceof Error ? err.message : err);
    return fallbackRoute(input.userText);
  }
}
