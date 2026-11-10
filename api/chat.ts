// Stoner Bud-E — /api/chat (Vercel Node serverless function).
// POST only. Live AI via Groq Cloud when GROQ_API_KEY is set in the
// environment; otherwise returns { source: "fallback" } and the client answers
// with its local buddy engine. This function NEVER returns a 500 — any
// failure degrades to fallback so the chat always answers.
// The key is never logged and never sent to the client.

import { BUD_E_SYSTEM_PROMPT } from '../src/bude.ts';
import type { ChatMessage, Session } from '../src/bude.ts';
import { isPersonaId, personaById } from '../src/voice.ts';
import { clientIp, rateLimited } from '../src/lib/rate-limit.ts';

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

// Photo analysis: Groq cannot generate images, but its vision models can
// look at one. qwen/qwen3.8-27b is the free-tier vision model (up to 3
// images per request, each counts as 2,048 input tokens). It only takes
// images in — the answer is still text.
// CAUTION: Groq's free tier for these preview models is about ONE photo a
// minute per model — the second photo inside the same minute fails (proven
// live 2026-11-09: call 1 worked, calls 2–3 failed, call after a 65s pause
// worked). Llama 4 Scout is NOT a fallback: Groq decommissioned it
// 2026-07-17 (404 now). qwen3.6-27b is a second Qwen vision model on Groq
// (their named Scout replacement) with its own rate-limit bucket, so it is
// tried second; Gemini (callGeminiVision below) is the third try — the
// project's GEMINI_API_KEY, free tier, far more generous. Groq 3.8, then
// Groq 3.6, then Gemini.
const VISION_MODELS = ['qwen/qwen3.8-27b', 'qwen/qwen3.6-27b'];

interface SourceLink {
  title: string;
  url: string;
}

interface GroqChatMessage {
  role: 'system' | 'user' | 'assistant';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >;
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
  /** Short stash summary, e.g. "Stash: Blue Dream 6.5g, Gelato 3.5g." */
  stash?: string;
  persona?: string;
  memory?: string;
  /** Local wall-clock time from the client, ISO with offset (e.g. 2026-11-09T15:30:00-06:00). */
  now?: string;
  /** Optional photo attached to the last message, as a data URL
   *  (data:image/jpeg;base64,...). The client downscales it first; the
   *  server sends it to the vision model. Never stored — analysis only. */
  image?: string;
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

/**
 * Epoch milliseconds for the start of the user's local today (midnight),
 * so the model can work out event times by adding hours instead of doing
 * calendar math from scratch. Returns null when no usable time was sent.
 */
function localMidnightMillis(now: string | undefined): number | null {
  const m = typeof now === 'string'
    ? now.match(/^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2})?(Z|[+-]\d{2}:?\d{2})?$/)
    : null;
  if (!m) return null;
  let offsetMs = 0;
  const offsetStr = m[4];
  if (offsetStr && offsetStr !== 'Z') {
    const sign = offsetStr.startsWith('-') ? -1 : 1;
    const clean = offsetStr.replace(/[^0-9]/g, '');
    offsetMs = sign * (Number(clean.slice(0, 2)) * 60 + Number(clean.slice(2, 4))) * 60_000;
  }
  // Local midnight = UTC midnight of that date, shifted by the offset.
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - offsetMs;
}

// Device + app actions — Bud-E can DO things, not just talk. When the user
// asks for one of the eleven actions below, the reply ends with one short
// spoken sentence saying what will happen, then a JSON action block the
// app reads and runs. The app strips the block before showing or speaking
// the reply, so the user only ever hears the sentence.
const ACTIONS_GUIDE = (localTime: string, midnightMillis: number | null): string =>
  `Device actions — you can do things on this phone and in the Bud-E app, not just talk about them. The user's local time right now is ${localTime}. All times the user mentions are in their local time.\n` +
  (midnightMillis !== null
    ? `Today at local midnight is epoch ${midnightMillis}. Work out calendar event times from that anchor: tomorrow at noon is midnight + 36 hours, today at 3 PM is midnight + 15 hours. Double-check the date before you answer.\n`
    : '') +
  `When the user asks for one of these twelve things, end your reply with one short spoken sentence saying what will happen, then a JSON action block on its own lines, exactly like this:\n` +
  '```action\n{"action":"set_alarm","hour":7,"minute":0,"label":"Wake up"}\n```\n' +
  'The twelve actions:\n' +
  '- set_alarm {"action":"set_alarm","hour":0-23,"minute":0-59,"label":"optional"} — the phone opens the clock app with the alarm filled in; the user taps save there. Say something like "Opening your clock to set the alarm for 7 AM."\n' +
  '- set_timer {"action":"set_timer","seconds":600,"label":"optional"} — seconds is the total length. Say something like "Starting a 10 minute timer."\n' +
  '- set_reminder {"action":"set_reminder","minutes":30,"text":"water the plants"} — Bud-E buzzes them later with a notification. Say something like "I\'ll remind you in 30 minutes."\n' +
  '- add_event {"action":"add_event","title":"Lunch with Ryan","startMillis":1794348000000,"endMillis":1794351600000,"description":"optional"} — startMillis and endMillis are epoch milliseconds in the user\'s local time. The phone opens the calendar with it filled in. Say something like "Adding it to your calendar."\n' +
  '- flashlight {"action":"flashlight","on":true} — turn the flashlight on (true) or off (false). Say something like "Turning the flashlight on."\n' +
  '- call_contact {"action":"call_contact","name":"Ryan"} — the phone looks up the name in contacts and opens the dialer with their number filled in; it never calls silently. Use "number":"..." instead of "name" when the user says a number out loud. Never invent a number — if they only say a name, send the name. Say something like "Opening the dialer for Ryan."\n' +
  '- text_contact {"action":"text_contact","name":"Baby","message":"I\'ll be late"} — the phone looks up the name and opens the messaging app with the text filled in; it never sends silently. Use "number":"..." instead of "name" when the user says a number. Say something like "Opening your messages to text Baby."\n' +
  '- stash_add {"action":"stash_add","name":"Blue Dream","amount":3.5,"unit":"g"} — add to a stash jar. unit is "g", "mg", or "pieces". The user\'s stash list is in the prompt when one was sent — match the jar by name, and work out the new total from it for the sentence ("Added 3.5g to Blue Dream — 10g in the jar now."). When there is no jar with that name, a new jar is started for it. Say something like "Added 3.5g to Blue Dream."\n' +
  '- stash_subtract {"action":"stash_subtract","name":"Blue Dream","amount":1,"unit":"g"} — take off a stash jar. Never take a jar below zero — if the amount would empty it, the jar just runs out. Work out what is left from the stash list for the sentence ("Took 1g off Blue Dream — 5.5g left."). Say something like "Took 1g off Blue Dream."\n' +
  '- log_session {"action":"log_session","strain":"Blue Dream","amount":0.5,"unit":"g","method":"flower"} — log a session in the journal. method is "flower", "edible", "vape", "dab", "drink", or "other" — include it only when the user says how they took it, otherwise leave it out. The jar is reduced by the same amount automatically. Work out what is left from the stash list for the sentence ("Logged 0.5g of Blue Dream — 6g left in the jar."). Say something like "Logged 0.5g of Blue Dream."\n' +
  '- open_tab {"action":"open_tab","tab":"stash"} — open a part of the Bud-E app. tab is one of "tonight", "chat", "stash", "journal", "strains", "break", "dose", "music", "plan", "settings". Say something like "Opening your stash."\n' +
  '- image_search {"action":"image_search","query":"blue dream buds"} — find pictures of something on the web. Only when the user asks for pictures, images, or photos of something. Say something like "Finding pictures of blue dream buds."\n' +
  'Rules: only emit an action block when the user asked for one of these twelve AND every required field is clear from what they said. If anything is missing or unclear — no time for the alarm, no length for the timer, no reminder text, no title or time for the event, no name or number for a call or text, no message for a text, no jar name or amount for a stash change, no strain or amount for a session log, no tab for opening a part of the app, no subject for pictures — ask one short follow-up question instead and emit no action block. If several people share a name, the phone asks which one — just send the name. If the jar name does not match any jar in the stash list and the user is not clearly adding a new jar, ask which jar they mean instead of guessing. Amounts: "half a gram" is 0.5g, "500mg" is 500mg — send the amount in the unit the user said. Never emit an action block for anything else: no other phone features, no deleting, no account changes. Never explain the JSON or mention it. The spoken sentence comes first, the action block last.';

// Gemini vision fallback — the free tier is far more generous than Groq's
// preview vision model, so a second photo in the same minute still gets
// answered instead of failing. Native Gemini API (not the OpenAI-compatible
// one): the photo goes in as base64 with its mime type. The key is the
// project's GEMINI_API_KEY, already in Vercel.
async function callGeminiVision(
  apiKey: string,
  imageDataUrl: string,
  question: string,
): Promise<string | null> {
  try {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageDataUrl);
    if (!match) return null;
    const [, mimeType, data] = match;
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${question}\n\nLook at the attached photo closely and answer the question about it. Describe what you see, identify anything relevant (strains, products, plants, labels, amounts), and say plainly when something in the photo is unclear or you cannot tell.`,
                },
                { inline_data: { mime_type: mimeType, data } },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: 800, temperature: 0.9 },
        }),
      },
    );
    if (!res.ok) {
      console.error('[chat] gemini vision error', res.status);
      return null;
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text =
      json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    return text.trim() !== '' ? text.trim() : null;
  } catch (err) {
    console.error(
      '[chat] gemini vision exception',
      err instanceof Error ? err.message : 'unknown',
    );
    return null;
  }
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
    // Generous per-IP cap (60/min): normal use never trips it, a hammer
    // does. The client treats a non-ok answer as a fallback, so the chat
    // still answers.
    if (rateLimited(`chat:${clientIp(req)}`, 60, 60_000)) {
      res.status(429).json({ ok: false, error: 'rate_limited' });
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

    // Optional photo: must be an image data URL, capped so a huge upload
    // cannot blow up the request. The client downscales first (max 1024px).
    const image =
      typeof body.image === 'string' &&
      body.image.startsWith('data:image/') &&
      body.image.length <= 4_000_000
        ? body.image
        : null;

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
    const stashLine = body.stash?.trim()
      ? `The user's stash right now: ${body.stash.trim().slice(0, 600)}`
      : '';
    const systemPrompt = [
      BUD_E_SYSTEM_PROMPT.replace(/Bud-E/g, buddyName),
      persona?.tone ?? '',
      nameLine,
      lengthLine,
      styleLine,
      memoryLine,
      stashLine,
      image
        ? 'The user attached a photo to their last message. Look at it closely and answer their question about it. Describe what you see, identify anything relevant (strains, products, plants, labels, amounts), and say plainly when something in the photo is unclear or you cannot tell.'
        : '',
      ACTIONS_GUIDE(localTimeText(body.now), localMidnightMillis(body.now)),
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

    // Photo attached: the last user message becomes multimodal (text +
    // image) and goes to the vision model instead of the text models.
    // The vision model takes no search tool, so this is one call, no retry
    // to another vision model — there is not one on this tier.
    if (image) {
      for (let i = groqMessages.length - 1; i >= 0; i--) {
        if (groqMessages[i].role === 'user') {
          const text =
            typeof groqMessages[i].content === 'string'
              ? (groqMessages[i].content as string)
              : '';
          groqMessages[i] = {
            role: 'user',
            content: [
              { type: 'text', text },
              { type: 'image_url', image_url: { url: image } },
            ],
          };
          break;
        }
      }
      // Try each vision model in turn (separate rate-limit buckets), then
      // Gemini, so a second photo in the same minute still gets answered.
      let vision: { reply: string; sources: SourceLink[] } | null = null;
      for (const model of VISION_MODELS) {
        vision = await callGroq(apiKey, model, groqMessages, false, false);
        if (vision) break;
      }
      if (vision) {
        res.status(200).json({
          ok: true,
          source: 'live',
          reply: vision.reply,
          ...(vision.sources.length > 0 ? { sources: vision.sources } : {}),
        });
        return;
      }
      // Groq said no — usually its free tier's one-photo-a-minute limit.
      // Fall back to Gemini so the photo still gets answered right away.
      const geminiKey = process.env.GEMINI_API_KEY;
      if (geminiKey) {
        const lastUser = [...messages].reverse().find((m) => m.role === 'user');
        const geminiReply = await callGeminiVision(
          geminiKey,
          image,
          lastUser?.text ?? "What's in this photo?",
        );
        if (geminiReply) {
          res.status(200).json({ ok: true, source: 'live', reply: geminiReply });
          return;
        }
      }
      // Both eyes are closed — say so plainly instead of falling back to
      // a canned reply that ignores the photo entirely.
      res.status(200).json({
        ok: true,
        source: 'live',
        reply: "I couldn't look at that photo right now — give it a minute and try sending it again, or just tell me what's in it.",
      });
      return;
    }

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
