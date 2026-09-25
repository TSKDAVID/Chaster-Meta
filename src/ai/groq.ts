import { AsyncLocalStorage } from "node:async_hooks";
import { dispatchAiTool, type ModuleContext } from "@/ai/modules";
import type { AiToolDefinition } from "@/ai/tools/types";

export type LlmUsage = {
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  rate_limit_wait_ms: number;
  models: string[];
};

const usageStore = new AsyncLocalStorage<LlmUsage>();

/** Run `fn` and total every Groq call made inside it (for the audit log). */
export function newLlmUsage(): LlmUsage {
  return { calls: 0, prompt_tokens: 0, completion_tokens: 0, rate_limit_wait_ms: 0, models: [] };
}

/** Run `fn` with every Groq call inside it added to `usage` (for the audit log). */
export function withLlmUsage<T>(usage: LlmUsage, fn: () => Promise<T>): Promise<T> {
  return usageStore.run(usage, fn);
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
/**
 * 120b for replies, 20b for routing — separate Groq TPM buckets.
 * Free tier is 8K TPM on every chat model; keep reasoning low so thinking
 * tokens don't eat the whole minute in one call.
 */
const DEFAULT_MODEL = "openai/gpt-oss-120b";
const DEFAULT_SMALL_MODEL = "openai/gpt-oss-20b";
const MAX_RATE_LIMIT_WAIT_MS = 90_000;
const MAX_RATE_LIMIT_DELAY_MS = 12_000;
/** Low-reasoning replies need less hidden budget than medium. */
const REPLY_COMPLETION_TOKENS = 768;
const MAX_COMPLETION_TOKENS = 4096;
const MAX_TOOL_ROUNDS = 8;
const MAX_REPLY_CHARS = 1900;

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type FaqKnowledgeItem = {
  entry_type: "qa" | "info";
  question: string | null;
  content: string;
};

export type GroqMessage = {
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

type GroqChoice = { message?: GroqMessage; finish_reason?: string };

function groqModel() {
  return process.env.GROQ_MODEL ?? DEFAULT_MODEL;
}

/** Cheap model for routing + memory (separate Groq rate-limit bucket). */
export function groqSmallModel() {
  return process.env.GROQ_ROUTER_MODEL ?? DEFAULT_SMALL_MODEL;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rateLimitDelayMs(res: Response, message: string): number {
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return header * 1000;
  const match = message.match(/try again in (?:(\d+)m)?([\d.]+)s/i);
  if (match) return (Number(match[1] ?? 0) * 60 + Number(match[2])) * 1000;
  return 5000;
}

export async function callGroq(body: {
  model?: string;
  temperature: number;
  maxCompletionTokens: number;
  messages: GroqMessage[];
  tools?: unknown[];
  toolChoice?: "auto" | "none";
  reasoningEffort?: "low" | "medium" | "high";
  responseFormat?: "json_object";
  /** Give up on rate limits after this much waiting. */
  maxWaitMs?: number;
}): Promise<GroqChoice> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Missing GROQ_API_KEY");

  const model = body.model ?? groqModel();
  const payload = {
    model,
    temperature: body.temperature,
    max_completion_tokens: body.maxCompletionTokens,
    messages: body.messages,
    ...(model.startsWith("openai/gpt-oss")
      ? {
          reasoning_effort:
            body.reasoningEffort ?? process.env.GROQ_REASONING_EFFORT ?? "low",
        }
      : {}),
    ...(body.responseFormat ? { response_format: { type: body.responseFormat } } : {}),
    ...(body.tools && body.tools.length > 0
      ? { tools: body.tools, tool_choice: body.toolChoice ?? "auto" }
      : {}),
  };

  const maxWait = body.maxWaitMs ?? MAX_RATE_LIMIT_WAIT_MS;
  let waited = 0;
  for (;;) {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 429) {
      const message: string = data.error?.message ?? "Groq rate limit reached";
      const delay = Math.min(rateLimitDelayMs(res, message) + 250, MAX_RATE_LIMIT_DELAY_MS);
      if (waited + delay > maxWait) throw new Error(message);
      console.warn(`[groq] ${model} rate limited, retrying in ${Math.ceil(delay / 1000)}s`);
      await sleep(delay);
      waited += delay;
      const usage = usageStore.getStore();
      if (usage) usage.rate_limit_wait_ms += delay;
      continue;
    }

    if (!res.ok) {
      throw new Error(data.error?.message ?? `Groq error ${res.status}`);
    }

    const usage = usageStore.getStore();
    if (usage) {
      usage.calls += 1;
      usage.prompt_tokens += Number(data.usage?.prompt_tokens) || 0;
      usage.completion_tokens += Number(data.usage?.completion_tokens) || 0;
      if (!usage.models.includes(model)) usage.models.push(model);
    }

    const choice = data.choices?.[0] as GroqChoice | undefined;
    if (!choice?.message) throw new Error("Groq returned no message");
    return choice;
  }
}

export type ToolCallTrace = {
  name: string;
  args: Record<string, unknown>;
  /** Parsed tool result (JSON object when the tool returned one). */
  result: unknown;
  ok: boolean | null;
  ms?: number;
  /** Tool's own failure message when ok is false. */
  error?: string | null;
  /** The model wrote the call as text instead of a real tool call. */
  from_text?: boolean;
};

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Some models write `[send_photo]` instead of a real tool call. */
function parseTextToolCall(
  text: string,
): { name: string; arguments: string } | null {
  const trimmed = text.trim();
  const match =
    /^(?:\[)?(send_photo|search_catalog)(?:\])?(?:\s*(\{[\s\S]*\}|\([\s\S]*\)))?\s*$/i.exec(
      trimmed,
    );
  if (!match) return null;
  let args = (match[2] ?? "").trim();
  if (args.startsWith("(") && args.endsWith(")")) {
    args = args.slice(1, -1).trim();
  }
  if (!args.startsWith("{")) args = "{}";
  return { name: match[1], arguments: args };
}

async function runTraced(
  name: string,
  argsJson: string,
  moduleCtx: ModuleContext,
  trace: ToolCallTrace[],
  fromText = false,
): Promise<string> {
  const started = Date.now();
  const result = await dispatchAiTool(name, argsJson, moduleCtx);
  const parsedArgs = parseJsonSafe(argsJson || "{}");
  const parsedResult = parseJsonSafe(result);
  const resultObj =
    parsedResult && typeof parsedResult === "object" ? (parsedResult as Record<string, unknown>) : null;
  trace.push({
    name,
    args: parsedArgs && typeof parsedArgs === "object" ? (parsedArgs as Record<string, unknown>) : {},
    result: parsedResult,
    ok: resultObj && "ok" in resultObj ? Boolean(resultObj.ok) : null,
    ms: Date.now() - started,
    error:
      resultObj && resultObj.ok === false
        ? String(resultObj.message ?? resultObj.error ?? "failed").slice(0, 200)
        : null,
    from_text: fromText,
  });
  return result;
}

export async function generateMessengerReply(input: {
  systemPrompt: string;
  history: ChatTurn[];
  userText: string;
  tools: AiToolDefinition[];
  moduleCtx: ModuleContext;
}): Promise<{ text: string; toolCalls: ToolCallTrace[] }> {
  const { tools, moduleCtx } = input;
  const toolsEnabled = tools.length > 0;
  const trace: ToolCallTrace[] = [];

  const messages: GroqMessage[] = [
    { role: "system", content: input.systemPrompt },
    ...input.history.map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: input.userText },
  ];

  let budget = REPLY_COMPLETION_TOKENS;
  let emptyRetried = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const lastRound = round === MAX_TOOL_ROUNDS - 1;
    const choice = await callGroq({
      temperature: 0.4,
      maxCompletionTokens: budget,
      messages,
      tools: toolsEnabled ? tools : undefined,
      // Final round must produce text so tool side effects are never left unreported.
      toolChoice: lastRound ? "none" : "auto",
    });
    const msg = choice.message!;

    const toolCalls = msg.tool_calls ?? [];
    if (toolsEnabled && !lastRound && toolCalls.length > 0) {
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
        const result = await runTraced(call.function.name, call.function.arguments, moduleCtx, trace);
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
    const asTool = parseTextToolCall(text);
    if (toolsEnabled && !lastRound && asTool) {
      const args =
        asTool.name === "send_photo" && asTool.arguments === "{}"
          ? JSON.stringify({ query: input.userText })
          : asTool.arguments;
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: `text-${round}-${asTool.name}`,
            type: "function",
            function: { name: asTool.name, arguments: args },
          },
        ],
      });
      console.log(`[ai-tools] ${asTool.name} (from text)`, args.slice(0, 200));
      const result = await runTraced(asTool.name, args, moduleCtx, trace, true);
      messages.push({
        role: "tool",
        tool_call_id: `text-${round}-${asTool.name}`,
        name: asTool.name,
        content: result,
      });
      continue;
    }
    if (!text) {
      // Reasoning used the whole budget before writing the reply.
      if (!emptyRetried) {
        emptyRetried = true;
        budget = Math.min(budget * 2, MAX_COMPLETION_TOKENS);
        round--;
        continue;
      }
      throw new Error(
        `Groq returned an empty reply (finish_reason: ${choice.finish_reason ?? "unknown"})`,
      );
    }
    return { text: text.slice(0, MAX_REPLY_CHARS), toolCalls: trace };
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

export function extractJsonObject(text: string): unknown {
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

  const system = `You are helping a business improve its Messenger FAQ knowledge base.
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

  const choice = await callGroq({
    temperature: 0.2,
    maxCompletionTokens: 2048,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: `## Existing FAQs\n${existingBlock}\n\n## Chat transcript\n${transcript}`,
      },
    ],
  });

  const text = choice.message?.content?.trim();
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
