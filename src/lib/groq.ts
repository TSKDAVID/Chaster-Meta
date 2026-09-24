import {
  collectAiTools,
  collectSystemPromptSections,
  dispatchAiTool,
  getEntitlements,
  type ModuleContext,
} from "@/modules";
import type { BookingSettings, ResourceSummary } from "@/lib/types";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b";

const BASE_SYSTEM_PROMPT = `You are Chaster's helpful Messenger assistant for Chaster LLC.
Reply briefly and naturally like a human chat agent (1-3 short sentences unless the user asks for detail).
Be friendly, clear, and professional.
Prefer answers from the provided FAQ / knowledge base when relevant.
If the knowledge base does not cover the question, say you are not sure and offer to help another way.
Do not invent company policies, prices, or commitments.
Never invent appointment availability or confirm booking changes without using the booking tools when they are available.`;

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type FaqKnowledgeItem = {
  entry_type: "qa" | "info";
  question: string | null;
  content: string;
};

export type BookingToolContext = {
  pageId: string;
  peerId: string;
  customerName?: string | null;
  settings: BookingSettings;
  resources?: ResourceSummary[];
};

type GroqMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
};

function buildModuleContext(
  knowledge: FaqKnowledgeItem[],
  booking: BookingToolContext | null,
): ModuleContext {
  return {
    pageId: booking?.pageId ?? "",
    peerId: booking?.peerId ?? "",
    customerName: booking?.customerName ?? null,
    entitlements: getEntitlements(),
    bookingSettings: booking?.settings ?? null,
    resources: booking?.resources ?? [],
    knowledge,
  };
}

function buildSystemPrompt(ctx: ModuleContext) {
  const sections = collectSystemPromptSections(ctx);
  if (sections.length === 0) return BASE_SYSTEM_PROMPT;
  return `${BASE_SYSTEM_PROMPT}\n\n${sections.join("\n\n")}`;
}

export async function generateMessengerReply(
  userText: string,
  history: ChatTurn[] = [],
  knowledge: FaqKnowledgeItem[] = [],
  booking: BookingToolContext | null = null,
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GROQ_API_KEY");
  }

  const model = process.env.GROQ_MODEL ?? DEFAULT_MODEL;
  const moduleCtx = buildModuleContext(knowledge, booking);
  const tools = collectAiTools(moduleCtx);
  const toolsEnabled = tools.length > 0;

  const messages: GroqMessage[] = [
    { role: "system", content: buildSystemPrompt(moduleCtx) },
    ...history.slice(-8).map((t) => ({
      role: t.role as "user" | "assistant",
      content: t.content,
    })),
    { role: "user", content: userText },
  ];

  for (let round = 0; round < 6; round++) {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 400,
        messages,
        ...(toolsEnabled ? { tools, tool_choice: "auto" } : {}),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message ?? `Groq error ${res.status}`);
    }

    const msg = data.choices?.[0]?.message as GroqMessage | undefined;
    if (!msg) {
      throw new Error("Groq returned an empty reply");
    }

    const toolCalls = msg.tool_calls ?? [];
    if (toolsEnabled && toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: msg.content ?? null,
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        console.log(
          `[ai-tools] ${call.function.name}`,
          call.function.arguments?.slice?.(0, 200) ?? "",
        );
        const result = await dispatchAiTool(
          call.function.name,
          call.function.arguments,
          moduleCtx,
        );
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: result,
        });
      }
      continue;
    }

    const text = (msg.content ?? "").trim();
    if (!text) {
      throw new Error("Groq returned an empty reply");
    }
    return text.slice(0, 1900);
  }

  throw new Error("Groq tool loop exceeded without a final reply");
}

export function isAiAutoReplyEnabled() {
  const flag = process.env.AI_AUTO_REPLY?.toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") return false;
  return Boolean(process.env.GROQ_API_KEY);
}

export type FaqSuggestionDraft = {
  entry_type: "qa" | "info";
  question: string | null;
  content: string;
  overlap_note: string | null;
};

export type EndChatAiResult = {
  summary: string;
  suggestions: FaqSuggestionDraft[];
};

function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI did not return JSON");
  }
  return JSON.parse(raw.slice(start, end + 1));
}

export async function summarizeChatAndSuggestFaqs(
  transcript: string,
  existingFaqs: FaqKnowledgeItem[],
): Promise<EndChatAiResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GROQ_API_KEY");
  }

  const model = process.env.GROQ_MODEL ?? DEFAULT_MODEL;
  const existingBlock =
    existingFaqs.length === 0
      ? "(none yet)"
      : existingFaqs
          .map((item, i) => {
            if (item.entry_type === "qa" && item.question) {
              return `${i + 1}. Q: ${item.question}\n   A: ${item.content}`;
            }
            return `${i + 1}. Info: ${item.content}`;
          })
          .join("\n");

  const system = `You are helping Chaster LLC improve its Messenger FAQ knowledge base.
Given a finished chat transcript and the EXISTING FAQ list, produce:
1) A short chat summary (2-4 sentences)
2) FAQ suggestions that capture NEW reusable knowledge from this chat

Rules for suggestions:
- Compare carefully against EXISTING FAQs.
- Do NOT suggest anything that duplicates, overlaps, or only rephrases an existing FAQ.
- Prefer 0-3 high-quality suggestions. Empty suggestions array is fine if nothing new.
- Use entry_type "qa" for clear question/answer pairs, "info" for general reusable facts.
- Keep answers concise and factual. Do not invent details not supported by the transcript.
- overlap_note: briefly say why this is new vs existing FAQs, or null if obvious.

Return ONLY valid JSON with this shape:
{
  "summary": "string",
  "suggestions": [
    {
      "entry_type": "qa" | "info",
      "question": "string or null",
      "content": "string",
      "overlap_note": "string or null"
    }
  ]
}`;

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 1200,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `## Existing FAQs\n${existingBlock}\n\n## Chat transcript\n${transcript}`,
        },
      ],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message ?? `Groq error ${res.status}`);
  }

  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("Groq returned an empty end-chat result");
  }

  const parsed = extractJsonObject(text) as {
    summary?: unknown;
    suggestions?: unknown;
  };

  const summary =
    typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim()
      : "Conversation ended.";

  const suggestionsRaw = Array.isArray(parsed.suggestions)
    ? parsed.suggestions
    : [];
  const suggestions: FaqSuggestionDraft[] = [];

  for (const item of suggestionsRaw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const entryType = row.entry_type === "info" ? "info" : "qa";
    const content = typeof row.content === "string" ? row.content.trim() : "";
    const question =
      typeof row.question === "string" && row.question.trim()
        ? row.question.trim()
        : null;
    const overlapNote =
      typeof row.overlap_note === "string" && row.overlap_note.trim()
        ? row.overlap_note.trim()
        : null;

    if (!content) continue;
    if (entryType === "qa" && !question) continue;

    suggestions.push({
      entry_type: entryType,
      question: entryType === "qa" ? question : null,
      content,
      overlap_note: overlapNote,
    });
  }

  return { summary, suggestions: suggestions.slice(0, 5) };
}
