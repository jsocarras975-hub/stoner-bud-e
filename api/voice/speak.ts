// Stoner Bud-E — /api/voice/speak (Vercel Node serverless function).
// POST JSON { text, persona }. Reads the reply out loud with Groq TTS
// (Orpheus, the persona's voice + direction), split into short chunks so no
// single call is too long. Returns { ok: true, source: 'groq', clips }
// (base64 WAV) or { ok: false, source: 'unavailable' } — the client falls
// back to the device voice. Never a 500, always HTTP 200. The key is never
// logged and never sent to the client. Empty text never calls Groq.

import { isPreflight, readJsonBody, setCorsHeaders } from '../../src/lib/cors.ts';
import type { ReqLike, ResLike } from '../../src/lib/cors.ts';
import { isPersonaId, personaById } from '../../src/voice.ts';

const GROQ_SPEECH_URL = 'https://api.groq.com/openai/v1/audio/speech';
const GROQ_MODEL = 'canopylabs/orpheus-v1-english';
const MAX_CHUNK_CHARS = 180;
const MAX_CHUNKS = 3;

/**
 * Split text into short chunks for TTS: sentence by sentence, and a long
 * sentence is split again at word boundaries. At most 3 chunks.
 */
function splitChunks(text: string): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned === '') return [];
  const sentences = cleaned.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [cleaned];
  const chunks: string[] = [];
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (sentence === '') continue;
    if (sentence.length <= MAX_CHUNK_CHARS) {
      chunks.push(sentence);
      continue;
    }
    let current = '';
    for (const word of sentence.split(' ')) {
      const next = current === '' ? word : `${current} ${word}`;
      if (next.length > MAX_CHUNK_CHARS && current !== '') {
        chunks.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current !== '') chunks.push(current);
  }
  return chunks.slice(0, MAX_CHUNKS);
}

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  const unavailable = () => {
    try {
      res.status(200).json({ ok: false, source: 'unavailable' });
    } catch {
      // Response already sent — nothing left to do.
    }
  };
  try {
    res.setHeader('Content-Type', 'application/json');
    setCorsHeaders(req, res, 'POST, OPTIONS');
    if (isPreflight(req)) {
      res.status(200).json({ ok: true });
      return;
    }
    if (req.method !== 'POST') {
      unavailable();
      return;
    }

    const apiKey = process.env.GROQ_API_KEY;
    const body = await readJsonBody<{ text?: unknown; persona?: unknown }>(req);
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const persona = isPersonaId(body.persona) ? personaById(body.persona) : personaById('chill');

    // No key, or nothing to say: do not call Groq at all.
    if (!apiKey || text === '') {
      unavailable();
      return;
    }

    const chunks = splitChunks(text);
    if (chunks.length === 0) {
      unavailable();
      return;
    }

    const clips: string[] = [];
    for (const chunk of chunks) {
      let groqRes: Response;
      try {
        groqRes = await fetch(GROQ_SPEECH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: GROQ_MODEL,
            voice: persona.voice,
            input: `${persona.direction} ${chunk}`,
            response_format: 'wav',
          }),
        });
      } catch {
        unavailable();
        return;
      }
      if (!groqRes.ok) {
        // Log status only (never the key or body).
        console.error(`[bud-e speak] Groq HTTP ${groqRes.status}`);
        unavailable();
        return;
      }
      const wav = Buffer.from(await groqRes.arrayBuffer());
      if (wav.length === 0) {
        unavailable();
        return;
      }
      clips.push(wav.toString('base64'));
    }

    res.status(200).json({ ok: true, source: 'groq', clips });
  } catch {
    // Any surprise at all: unavailable, never a 500.
    unavailable();
  }
}
