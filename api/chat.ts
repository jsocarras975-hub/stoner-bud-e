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
  memory?: string;
  /** Local wall-clock time from the client, ISO with offset (e.g. 2026-11-09T15:30:00-06:00). */
  now?: string;
  personalization?: {
    buddyName?: string;
    userName?: string;
    replyLength?: string;
    chatStyle?: string;
  };
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

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Turn the client's local-time ISO string (with offset) into plain words
 * for the prompt, e.g. "Sunday, November 9, 2026 at 3:45 PM (UTC-06:00)".
 * The wall-clock parts come straight from the string so no timezone math
 * is needed on the server. Falls back to server time when missing.
 */
function localTimeText(now: string | undefined): string {
  const m = typeof now === 'string'
    ? now.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?(Z|[+-]\d{2}:?\d{2})?$/)
    : null;
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    let hour = Number(m[4]);
    const minute = m[5];
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12;
    if (hour === 0) hour = 12;
    const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()];
    const offset = m[6] && m[6] !== 'Z' ? ` (UTC${m[6]})` : '';
    return `${weekday}, ${MONTHS[month - 1]} ${day}, ${year} at ${hour}:${minute} ${ampm}${offset}`;
  }
  const d = new Date();
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} at ${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC (server time — the user's local time was not sent)`;
}

// Device actions — the phone can DO things, not just talk. When the user
// asks for one of the five actions below, the reply ends with one short
// spoken sentence saying what will happen, then a JSON action block the
// app reads and runs. The app strips the block before showing or speaking
// the reply, so the user only ever hears the sentence.
const ACTIONS_GUIDE = (localTime: string): string =>
  `Device actions — you can do things on this phone, not just talk about them. The user's local time right now is ${localTime}. All times the user mentions are in their local time.\n` +
  `When the user asks for one of these five things, end your reply with one short spoken sentence saying what will happen, then a JSON action block on its own lines, exactly like this:\n` +
  '```action\n{"action":"set_alarm","hour":7,"minute":0,"label":"Wake up"}\n```\n' +
  'The five actions:\n' +
  '- set_alarm {"action":"set_alarm","hour":0-23,"minute":0-59,"label":"optional"} — the phone opens the clock app with the alarm filled in; the user taps save there. Say something like "Opening your clock to set the alarm for 7 AM."\n' +
  '- set_timer {"action":"set_timer","seconds":600,"label":"optional"} — seconds is the total length. Say something like "Starting a 10 minute timer."\n' +
  '- set_reminder {"action":"set_reminder","minutes":30,"text":"water the plants"} — Bud-E buzzes them later with a notification. Say something like "I\'ll remind you in 30 minutes."\n' +
  '- add_event {"action":"add_event","title":"Lunch with Ryan","startMillis":1794348000000,"endMillis":1794351600000,"description":"optional"} — startMillis and endMillis are epoch milliseconds in the user\'s local time. The phone opens the calendar with it filled in. Say something like "Adding it to your calendar."\n' +
  '- flashlight {"action":"flashlight","on":true} — turn the flashlight on (true) or off (false). Say something like "Turning the flashlight on."\n' +
  'Rules: only emit an action block when the user asked for one of these five AND every required field is clear from what they said. If anything is missing or unclear — no time for the alarm, no length for the timer, no reminder text, no title or time for the event — ask one short follow-up question instead and emit no action block. Never emit an action block for anything else: no calls, no texts, no messages, no other phone features. Never explain the JSON or mention it. The spoken sentence comes first, the action block last.';

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

    const persona = isPersonaId(body.persona) ? personaById(body.persona) : null;
    const p = body.personalization;
    const buddyName = p?.buddyName?.trim() || 'Bud-E';
    const userName = p?.userName?.trim();
    const lengthLine =
      p?.replyLength === 'short'
        ? 'Keep replies to 1–2 short sentences.'
        : p?.replyLength === 'detailed'
          ? 'Give a fuller answer, up to a short paragraph, then one follow-up.'
          : 'Keep replies to about 3–5 sentences, then one short follow-up question.';
    const styleLine =
      p?.chatStyle === 'plain'
        ? 'Use plain text. No emoji.'
        : 'A little warmth is fine. Emoji only when it fits, never forced.';
    const nameLine = userName
      ? `Your name is ${buddyName}. The user prefers to be called ${userName}.`
      : `Your name is ${buddyName}.`;
    const memoryLine = body.memory?.trim()
      ? `Things you remember about this person:\n${body.memory.trim().slice(0, 800)}`
      : '';
    const systemPrompt = [
      BUD_E_SYSTEM_PROMPT.replace(/Bud-E/g, buddyName),
      persona?.tone ?? '',
      nameLine,
      lengthLine,
      styleLine,
      memoryLine,
      ACTIONS_GUIDE(localTimeText(body.now)),
    ]
      .filter(Boolean)
      .join(' ');

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
