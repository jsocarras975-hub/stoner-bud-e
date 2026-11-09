// Stoner Bud-E — /api/voice/transcribe (Vercel Node serverless function).
// POST multipart/form-data with a file field named `audio` (the tap-to-talk
// mic sends audio.webm). Vercel does not parse multipart, so the raw stream
// is read and the single file part is pulled out by hand. Transcribes with
// Groq Whisper (whisper-large-v3-turbo). Never a 500 — every outcome is
// HTTP 200 with { ok: true, text } or { ok: false, error }. The key is
// never logged and never sent to the client.

import { isPreflight, setCorsHeaders } from '../../src/lib/cors.ts';
import type { ReqLike, ResLike } from '../../src/lib/cors.ts';
import { clientIp, rateLimited } from '../../src/lib/rate-limit.ts';

const GROQ_TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function multipartBoundary(req: ReqLike): string | null {
  const raw = req.headers?.['content-type'];
  const contentType = Array.isArray(raw) ? raw[0] : raw;
  if (!contentType) return null;
  const match = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType);
  const boundary = (match?.[1] ?? match?.[2] ?? '').trim();
  return boundary === '' ? null : boundary;
}

function contentLength(req: ReqLike): number {
  const raw = req.headers?.['content-length'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Read the raw request body. Throws Error('too big') past 25 MB. */
async function readRawBody(req: ReqLike): Promise<Buffer | null> {
  const raw = req.body;
  if (raw instanceof Buffer) return raw;
  if (typeof raw === 'string') return Buffer.from(raw, 'latin1');
  const stream = req as unknown as AsyncIterable<Uint8Array>;
  if (typeof stream[Symbol.asyncIterator] !== 'function') return null;
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_AUDIO_BYTES) throw new Error('too big');
    chunks.push(buf);
  }
  if (chunks.length === 0) return null;
  return Buffer.concat(chunks);
}

/**
 * Pull the `audio` file part out of a multipart body by hand. Returns the
 * raw audio bytes, or null when there is no such part.
 */
function extractAudioPart(body: Buffer, boundary: string): Buffer | null {
  const delimiter = Buffer.from(`--${boundary}`);
  const headerEndMarker = Buffer.from('\r\n\r\n');
  let pos = 0;
  for (;;) {
    const delimAt = body.indexOf(delimiter, pos);
    if (delimAt === -1) return null;
    let p = delimAt + delimiter.length;
    // "--" right after the delimiter means the closing boundary: done.
    if (body[p] === 0x2d && body[p + 1] === 0x2d) return null;
    if (body[p] === 0x0d && body[p + 1] === 0x0a) p += 2;
    const headerEnd = body.indexOf(headerEndMarker, p);
    if (headerEnd === -1) return null;
    const headers = body.subarray(p, headerEnd).toString('latin1');
    const contentStart = headerEnd + headerEndMarker.length;
    const nextDelim = body.indexOf(delimiter, contentStart);
    if (nextDelim === -1) return null;
    let contentEnd = nextDelim;
    if (body[contentEnd - 2] === 0x0d && body[contentEnd - 1] === 0x0a) contentEnd -= 2;
    if (/name="audio"/.test(headers)) return body.subarray(contentStart, contentEnd);
    pos = nextDelim;
  }
}

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  try {
    res.setHeader('Content-Type', 'application/json');
    setCorsHeaders(req, res, 'POST, OPTIONS');
    if (isPreflight(req)) {
      res.status(200).json({ ok: true });
      return;
    }
    if (req.method !== 'POST') {
      res.status(200).json({ ok: false, error: 'post only' });
      return;
    }
    // Generous per-IP cap (20/min) — a voice message is one call.
    if (rateLimited(`transcribe:${clientIp(req)}`, 20, 60_000)) {
      res.status(429).json({ ok: false, error: 'rate_limited' });
      return;
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      res.status(200).json({ ok: false, error: 'no key' });
      return;
    }

    if (contentLength(req) > MAX_AUDIO_BYTES) {
      res.status(200).json({ ok: false, error: 'audio too big' });
      return;
    }

    const boundary = multipartBoundary(req);
    if (!boundary) {
      res.status(200).json({ ok: false, error: 'no audio' });
      return;
    }

    let body: Buffer | null = null;
    try {
      body = await readRawBody(req);
    } catch (err) {
      if (err instanceof Error && err.message === 'too big') {
        res.status(200).json({ ok: false, error: 'audio too big' });
        return;
      }
      throw err;
    }
    const audio = body ? extractAudioPart(body, boundary) : null;
    if (!audio || audio.length === 0) {
      res.status(200).json({ ok: false, error: 'no audio' });
      return;
    }
    if (audio.length > MAX_AUDIO_BYTES) {
      res.status(200).json({ ok: false, error: 'audio too big' });
      return;
    }

    const form = new FormData();
    form.append('file', new File([audio], 'audio.webm', { type: 'audio/webm' }));
    form.append('model', 'whisper-large-v3-turbo');
    form.append('language', 'en');
    form.append('response_format', 'json');

    const groqRes = await fetch(GROQ_TRANSCRIBE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!groqRes.ok) {
      // Log status only (never the key or body).
      console.error(`[bud-e transcribe] Groq HTTP ${groqRes.status}`);
      res.status(200).json({ ok: false, error: 'could not hear that' });
      return;
    }

    const data = (await groqRes.json().catch(() => null)) as { text?: unknown } | null;
    const text = typeof data?.text === 'string' ? data.text.trim() : '';
    res.status(200).json({ ok: true, text });
  } catch {
    // Any surprise at all: a plain failure, never a 500.
    try {
      res.status(200).json({ ok: false, error: 'could not hear that' });
    } catch {
      // Response already sent — nothing left to do.
    }
  }
}
