// Stoner Bud-E — /api/images/search (Vercel Node serverless function).
// GET ?q=... — web image search via Openverse (api.openverse.org), which
// is free and needs no key. This endpoint proxies Openverse and returns a
// small normalized list for the chat. The images are Creative Commons
// licensed; the client links each thumbnail to its source page, which is
// where the creator and license live. This function NEVER returns a 500.

import { clientIp, rateLimited } from '../../src/lib/rate-limit.ts';

const OPENVERSE_URL = 'https://api.openverse.org/v1/images/';
const MAX_RESULTS = 8;

type ReqLike = {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
};

type ResLike = {
  status: (code: number) => ResLike;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

// Same CORS as /api/chat: the Capacitor APK calls this cross-origin from
// its local origin; the live web app is same-origin and needs no CORS.
const ALLOWED_ORIGINS = new Set([
  'https://stoner-bud-e-toonzkorner-9149s-projects.vercel.app',
  'capacitor://localhost',
  'ionic://localhost',
  'https://localhost',
  'http://localhost',
]);

function setCorsHeaders(req: ReqLike, res: ResLike): void {
  const raw = req.headers?.origin;
  const origin = Array.isArray(raw) ? raw[0] : raw;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

interface OpenverseResult {
  title?: unknown;
  url?: unknown;
  foreign_landing_url?: unknown;
  creator?: unknown;
  license?: unknown;
  thumbnail?: unknown;
}

interface OpenverseResponse {
  results?: OpenverseResult[];
}

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  try {
    res.setHeader('Content-Type', 'application/json');
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') {
      res.status(200).json({ ok: true });
      return;
    }
    if (req.method !== 'GET') {
      res.status(200).json({ ok: false, error: 'method_not_allowed' });
      return;
    }
    // Modest per-IP cap (30/min): normal use never trips it.
    if (rateLimited(`images:${clientIp(req)}`, 30, 60_000)) {
      res.status(429).json({ ok: false, error: 'rate_limited' });
      return;
    }
    let q = '';
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      q = (url.searchParams.get('q') ?? '').trim();
    } catch {
      q = '';
    }
    if (q === '' || q.length > 200) {
      res.status(200).json({ ok: false, error: 'bad_query' });
      return;
    }
    const ov = await fetch(
      `${OPENVERSE_URL}?q=${encodeURIComponent(q)}&page_size=${MAX_RESULTS}`,
      { headers: { 'User-Agent': 'StonerBudE/1.0' } },
    );
    if (!ov.ok) {
      res.status(200).json({ ok: false, error: 'search_unavailable' });
      return;
    }
    const data = (await ov.json()) as OpenverseResponse;
    const results = (Array.isArray(data.results) ? data.results : [])
      .map((r) => {
        const thumb = asText(r.thumbnail);
        const url = asText(r.url);
        const page = asText(r.foreign_landing_url);
        if (page === '' || (thumb === '' && url === '')) return null;
        return {
          title: asText(r.title) || q,
          thumb: thumb || url,
          url: url || thumb,
          page,
          creator: asText(r.creator),
          license: asText(r.license),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .slice(0, MAX_RESULTS);
    res.status(200).json({ ok: true, results });
  } catch {
    // Any surprise at all: a plain no-results answer, never a 500.
    try {
      res.status(200).json({ ok: false, error: 'search_unavailable' });
    } catch {
      // Response already sent — nothing left to do.
    }
  }
}
