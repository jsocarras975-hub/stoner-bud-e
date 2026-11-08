// Stoner Bud-E — /api/chat (Vercel Node serverless function).
// POST only. Live AI via Groq Cloud when GROQ_API_KEY is set in the
// environment; otherwise returns { source: "fallback" } and the client answers
// with its local buddy engine. This function NEVER returns a 500 — any
// failure degrades to fallback so the chat always answers.
// The key is never logged and never sent to the client.

import { BUD_E_SYSTEM_PROMPT } from '../src/bude.ts';
import type { ChatMessage, Session } from '../src/bude.ts';
import { isPersonaId, personaById } from '../src/voice.ts';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// NOTE (2026-11-08): Groq retired llama-3.3-70b-versatile and
// llama-3.1-8b-instant for free/developer tier on 2026-08-16
// (console.groq.com/docs/deprecations). Groq's recommended replacements:
// gpt-oss-120b (for the 70B) and gpt-oss-20b (for the 8B).
const GROQ_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'] as const;

// Web search: groq/compound was shut down 2026-09-21 (same deprecations
// page). Search now lives on the gpt-oss models as the built-in
// `browser_search` tool — Groq runs it server-side and returns the final
// answer plus executed_tools with the sources. No extra key needed.
const SEARCH_TOOL = { type: 'browser_search' } as const;

interface SourceLink {
  title: string;
  url: string;
}

interface GroqChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GroqSearchResult {
  title?: unknown;
  url?: unknown;
}

interface GroqExecutedTool {
  type?: unknown;
  search_results?: { results?: GroqSearchResult[] };
  results?: GroqSearchResult[];
}

interface GroqMessage {
  content?: string | null;
  executed_tools?: GroqExecutedTool[];
}

interface GroqResponse {
  choices?: Array<{
    message?: GroqMessage;
  }>;
}

// Words that mean "this needs today's information, not training data".
// When the last user message matches, the search tool is forced on.
const CURRENT_INFO_RE =
  /\b(today|tonight|now|current|latest|news|weather|forecast|score|scores|won|winning|price|prices|open now|hours|release|released|update|yesterday|this week|this month|2026|who won|what happened|happening)\b/i;

type Body = {
  messages?: ChatMessage[];
  session?: Partial<Session>;
  journal?: string;
  persona?: string;
};

type ReqLike = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};

type ResLike = {
  status: (code: number) => ResLike;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

// CORS: the Capacitor APK calls this API cross-origin from its local origin
// (capacitor://localhost / https://localhost). Only reflect an origin we
// recognize; everything else gets no Access-Control-Allow-Origin and the
// browser blocks the read. The live web app is same-origin and needs no CORS.
const ALLOWED_ORIGINS = new Set([
  'https://stoner-bud-e-toonzkorner-9149s-projects.vercel.app',
  'capacitor://localhost',
  'ionic://localhost',
  'https://localhost',
  'http://localhost',
]);

function corsOrigin(req: ReqLike): string | null {
  const raw = req.headers?.origin;
  const origin = Array.isArray(raw) ? raw[0] : raw;
  return origin && ALLOWED_ORIGINS.has(origin) ? origin : null;
}

function setCorsHeaders(req: ReqLike, res: ResLike): void {
  const origin = corsOrigin(req);
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

function fallback(res: ResLike): void {
  res.status(200).json({ ok: true, source: 'fallback', reply: null });
}

function parseBody(raw: unknown): Body {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Body;
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === 'object') return raw as Body;
  return {};
}

function sessionLine(session: Partial<Session> | undefined, journal?: string): string {
  const bits: string[] = [];
  if (session) {
    if (session.method) bits.push(`method: ${session.method}`);
    if (session.amount) bits.push(`amount: ${session.amount}${session.unit ?? 'mg'}`);
    if (session.timeTaken) bits.push(`time taken: ${session.timeTaken}`);
    if (session.experience) bits.push(`experience: ${session.experience}`);
  }
  const base =
    bits.length > 0 ? `Tonight's session — ${bits.join(', ')}.` : 'No session details were given.';
  const journalBit = journal && journal.trim() !== '' ? ` ${journal.trim()}` : '';
  return `${base}${journalBit}`;
}

/** Pull web sources out of Groq's executed_tools (defensive: shape varies). */
function extractSources(message: GroqMessage | undefined): SourceLink[] {
  const out: SourceLink[] = [];
  const seen = new Set<string>();
  const tools = message?.executed_tools;
  if (!Array.isArray(tools)) return out;
  for (const tool of tools) {
    const results: unknown[] = Array.isArray(tool?.search_results?.results)
      ? tool.search_results.results
      : Array.isArray(tool?.results)
        ? tool.results
        : [];
    for (const r of results) {
      const rec = r as GroqSearchResult;
      const url = typeof rec?.url === 'string' ? rec.url : '';
      const title =
        typeof rec?.title === 'string' && rec.title.trim() !== '' ? rec.title.trim() : url;
      if (url.startsWith('http') && !seen.has(url)) {
        seen.add(url);
        out.push({ title, url });
      }
      if (out.length >= 4) return out;
    }
  }
  return out;
}

function cleanReply(text: string): string {
  // Groq returns inline citation markers like 【2‡L6-L10】; the client shows
  // real source links instead, so drop the markers from the text.
  return text
    .replace(/【[^】]*】/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

async function callGroq(
  apiKey: string,
  model: string,
  messages: GroqChatMessage[],
  useSearch: boolean,
  forceSearch: boolean,
): Promise<{ reply: string; sources: SourceLink[] } | null> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.9,
    max_tokens: 800,
  };
  if (useSearch) {
    body.tools = [SEARCH_TOOL];
    body.tool_choice = forceSearch ? 'required' : 'auto';
  }

  const groqRes = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!groqRes.ok) {
    // Log status only (never the key or body) so a dead model/key shows
    // up in Vercel runtime logs instead of failing silently to fallback.
    console.error(
      `[bud-e chat] Groq ${model} HTTP ${groqRes.status}${useSearch ? ' (search on)' : ''}`,
    );
    return null;
  }

  const data = (await groqRes.json()) as GroqResponse;
  const msg = data.choices?.[0]?.message;
  const raw = msg?.content?.trim();
  if (!raw) return null;
  return { reply: cleanReply(raw), sources: extractSources(msg) };
}

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  try {
    res.setHeader('Content-Type', 'application/json');
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') {
      // CORS preflight from the APK — no body, just the headers above.
      res.status(200).json({ ok: true });
      return;
    }
    if (req.method !== 'POST') {
      res.status(200).json({ ok: true, source: 'fallback', reply: null });
      return;
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      fallback(res);
      return;
    }

    const body = parseBody(req.body);
    const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
    if (messages.length === 0) {
      fallback(res);
      return;
    }

    // The persona only adds its tone line — the system prompt itself is
    // never edited here, so the harm-reduction rules stay exactly as they are.
    const persona = isPersonaId(body.persona) ? personaById(body.persona) : null;
    const systemPrompt = persona
      ? `${BUD_E_SYSTEM_PROMPT} ${persona.tone}`
      : BUD_E_SYSTEM_PROMPT;

    const groqMessages: GroqChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: sessionLine(body.session, body.journal) },
      ...messages.map((m): GroqChatMessage => ({
        role: m.role === 'bud' ? 'assistant' : 'user',
        content: m.text,
      })),
    ];

    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const forceSearch = lastUser ? CURRENT_INFO_RE.test(lastUser.text) : false;

    // Search-capable calls first (both models), so a question about today
    // gets real web results when Groq can search.
    let result: { reply: string; sources: SourceLink[] } | null = null;
    for (const model of GROQ_MODELS) {
      result = await callGroq(apiKey, model, groqMessages, true, forceSearch);
      if (result) break;
    }
    // If the search-capable calls failed (tool unsupported on this tier,
    // search outage, ...), retry plain before giving up on live AI.
    if (!result) {
      result = await callGroq(apiKey, GROQ_MODELS[0], groqMessages, false, false);
    }
    if (!result) {
      fallback(res);
      return;
    }

    res.status(200).json({
      ok: true,
      source: 'live',
      reply: result.reply,
      ...(result.sources.length > 0 ? { sources: result.sources } : {}),
    });
  } catch {
    // Any surprise at all: degrade to fallback, never a 500.
    try {
      fallback(res);
    } catch {
      // Response already sent — nothing left to do.
    }
  }
}
