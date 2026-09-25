/**
 * Live regression eval: runs customer messages through the real reply pipeline
 * (router + reply model + tools) against a Page's own catalog/FAQ, without
 * sending anything to Messenger. Cases are generated from whatever catalog
 * the Page has, so this works for any business.
 *
 * Fails on: photo bleed into later turns, missing/extra photos, volunteered
 * prices or dates, leaked markers/markdown/links, replying in the wrong language.
 *
 *   npm run eval:ai
 *   EVAL_PAGE_ID=<page> EVAL_REPEAT=3 EVAL_ONLY=photo-two npm run eval:ai
 */
import { decideAndGenerate, loadBrainContext, type BrainContext } from "@/ai/brain";
import type { ChatTurn } from "@/ai/groq";
import { formatCatalogPrice } from "@/lib/catalog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { CatalogItem } from "@/lib/types";

const PEER_ID = "eval-regression-peer";
const REPEAT = Math.max(1, Number(process.env.EVAL_REPEAT ?? 1));
const ONLY = process.env.EVAL_ONLY;

const PRICE =
  /\d+(?:[.,]\d+)?\s*(?:[A-Z]{3}\b|[$€£₾₽₺¥₹]|ლარ|lari|dollars?|euros?)|[$€£₾₽₺¥₹]\s?\d+/i;
const MARKERS = /\*\*|\[send_photo\]|send_photo|📷|უკვე\s*(?:გა|გამო)გზავნ|already (?:sent|attached)/i;
const LINK = /https?:\/\//i;

type Lang = "ka" | "en";

type Case = {
  id: string;
  lang: Lang;
  history?: ChatTurn[];
  text: string;
  /** Exact set of catalog photos that must go out (empty = none). */
  photos: string[];
  /** Photo-only / greeting turns must not volunteer prices or other numbers. */
  numbersAllowed: boolean;
  mustInclude?: string[];
};

async function resolvePageId(): Promise<string> {
  if (process.env.EVAL_PAGE_ID) return process.env.EVAL_PAGE_ID;
  const { data } = await getSupabaseAdmin()
    .from("messenger_pages")
    .select("page_id, page_access_token")
    .not("page_id", "like", "\\_\\_%")
    .order("connected_at", { ascending: false });
  const page = (data ?? []).find((p) => p.page_access_token);
  if (!page) throw new Error("No connected Page; set EVAL_PAGE_ID");
  return page.page_id as string;
}

function priceDigits(item: CatalogItem): string | null {
  if (item.price == null) return null;
  return String(Math.round(Number(item.price)));
}

function buildCases(catalog: CatalogItem[]): Case[] {
  const withPhoto = catalog.filter((i) => i.active && i.image_url);
  const [a, b] = withPhoto;
  const cases: Case[] = [
    { id: "greeting-ka", lang: "ka", text: "გამარჯობა", photos: [], numbersAllowed: false },
    { id: "greeting-en", lang: "en", text: "hi there!", photos: [], numbersAllowed: false },
    { id: "call-me-is-not-photo", lang: "ka", text: "ჩამირეკე ხვალ, გთხოვ", photos: [], numbersAllowed: false },
  ];
  if (!a) return cases;

  cases.push(
    {
      id: "photo-one-en",
      lang: "en",
      text: `can you send me a picture of ${a.name}?`,
      photos: [a.name],
      numbersAllowed: false,
    },
    {
      id: "photo-one-ka",
      lang: "ka",
      text: `${a.name} ფოტო ჩამიგდე`,
      photos: [a.name],
      numbersAllowed: false,
    },
    {
      id: "photo-retry",
      lang: "en",
      history: [
        { role: "user", content: `show me a photo of ${a.name}` },
        { role: "assistant", content: "Sorry, something went wrong." },
      ],
      text: "try again",
      photos: [a.name],
      numbersAllowed: false,
    },
  );

  const photoHistory: ChatTurn[] = [
    { role: "user", content: `send me a photo of ${a.name}` },
    { role: "assistant", content: `Here is ${a.name}.` },
  ];
  cases.push(
    {
      id: "no-bleed-hours",
      lang: "en",
      history: photoHistory,
      text: "what are your opening hours?",
      photos: [],
      numbersAllowed: true,
    },
    {
      id: "no-bleed-reschedule-ka",
      lang: "ka",
      history: photoHistory,
      text: "ჩემი ჯავშანი გადაიტანე ოთხშაბათს იგივე დროზე",
      photos: [],
      numbersAllowed: true,
    },
  );

  const digits = priceDigits(a);
  if (digits) {
    cases.push({
      id: "price-question",
      lang: "en",
      text: `how much is ${a.name}?`,
      photos: [],
      numbersAllowed: true,
      mustInclude: [digits],
    });
  }

  if (b) {
    cases.push(
      {
        id: "photo-two-en",
        lang: "en",
        text: `send me photos of ${a.name} and ${b.name}`,
        photos: [a.name, b.name],
        numbersAllowed: false,
      },
      {
        id: "photo-two-ka",
        lang: "ka",
        text: `${a.name} და ${b.name} ფოტოები გამომიგზავნე`,
        photos: [a.name, b.name],
        numbersAllowed: false,
      },
    );
  }
  return cases;
}

function stripNames(text: string, names: string[]) {
  let rest = text;
  for (const n of names) rest = rest.split(n).join(" ");
  return rest;
}

function languageProblem(text: string, lang: Lang, names: string[]): string | null {
  const rest = stripNames(text, names);
  const georgian = (rest.match(/[\u10A0-\u10FF]/g) ?? []).length;
  const latin = (rest.match(/[A-Za-z]/g) ?? []).length;
  const total = georgian + latin;
  if (total < 6) return null;
  if (lang === "ka" && latin / total > 0.25) return `mixed-in Latin text in a Georgian reply (${latin}/${total})`;
  if (lang === "en" && georgian / total > 0.25) return "Georgian in an English reply";
  return null;
}

async function runCase(c: Case, base: BrainContext, catalogNames: string[]) {
  const ctx: BrainContext = {
    ...base,
    userText: c.text,
    history: c.history ?? [],
    conversation: { status: "open", summary: null, state: { active_booking: null, pending: null } },
    moduleCtx: { ...base.moduleCtx },
  };
  const decision = await decideAndGenerate(ctx);
  if (decision.action !== "reply") {
    return { problems: [`skipped: ${decision.reason}`], text: "", photos: [] as string[], intents: "", guards: "" };
  }

  const problems: string[] = [];
  const text = decision.replyText;
  const sent = decision.pendingPhotos.map((p) => p.itemName ?? p.url);
  if (JSON.stringify([...c.photos].sort()) !== JSON.stringify([...sent].sort())) {
    problems.push(`photos: expected [${c.photos.join(", ")}], got [${sent.join(", ")}]`);
  }

  const ownCaption = sent.length > 0 && /^📷 [^\n]+$/.test(text);
  if (!ownCaption && MARKERS.test(text)) problems.push("leaked marker / markdown / 'already sent'");
  if (LINK.test(text)) problems.push("pasted a link");
  if (!c.numbersAllowed) {
    const rest = stripNames(text, catalogNames);
    if (PRICE.test(rest)) problems.push("volunteered a price");
    else if (/\d/.test(rest)) problems.push("volunteered numbers (dates/prices/stock)");
  }
  for (const s of c.mustInclude ?? []) if (!text.includes(s)) problems.push(`missing "${s}"`);
  const lang = languageProblem(text, c.lang, catalogNames);
  if (lang) problems.push(lang);
  if (decision.toolCalls.some((t) => /create_booking|update_booking|cancel_booking/.test(t.name) && t.ok)) {
    problems.push("changed a booking during eval");
  }

  return {
    problems,
    text,
    photos: sent,
    intents: decision.route.intents?.join(",") ?? "ALL",
    guards: decision.guards.join(","),
  };
}

async function main() {
  const pageId = await resolvePageId();
  const base = await loadBrainContext({ pageId, customerId: PEER_ID, userText: "eval", platform: "messenger" });
  if (!base.pageAccessToken) throw new Error(`Page ${pageId} is not connected`);

  const catalog = base.moduleCtx.catalogItems ?? [];
  const catalogNames = catalog.map((i) => i.name).sort((x, y) => y.length - x.length);
  const cases = buildCases(catalog).filter((c) => !ONLY || c.id === ONLY);
  console.log(`Page ${pageId}: ${catalog.length} catalog items, ${cases.length} cases × ${REPEAT}\n`);
  for (const item of catalog.slice(0, 5)) console.log(`  catalog: ${item.name} — ${formatCatalogPrice(item)}`);
  console.log("");

  let failed = 0;
  try {
    for (const c of cases) {
      for (let run = 1; run <= REPEAT; run++) {
        const label = REPEAT > 1 ? `${c.id} #${run}` : c.id;
        try {
          const r = await runCase(c, base, catalogNames);
          const ok = r.problems.length === 0;
          if (!ok) failed++;
          console.log(`${ok ? "PASS" : "FAIL"}  ${label}  [${r.intents}]${r.guards ? ` guards=${r.guards}` : ""}  photos=[${r.photos.join(", ")}]`);
          console.log(`      > ${c.text}`);
          console.log(`      < ${r.text.replace(/\n/g, " / ")}`);
          for (const p of r.problems) console.log(`      ! ${p}`);
        } catch (err) {
          failed++;
          console.log(`FAIL  ${label}  error: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
  } finally {
    await getSupabaseAdmin().from("messenger_bookings").delete().eq("page_id", pageId).eq("peer_id", PEER_ID);
  }

  const total = cases.length * REPEAT;
  console.log(`\n${total - failed}/${total} passed`);
  process.exit(failed ? 1 : 0);
}

void main();
