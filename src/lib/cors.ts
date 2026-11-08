// Stoner Bud-E — shared CORS for the credentialed API routes (/api/auth, /api/sync).
// Mirrors api/chat.ts: only reflect an origin we recognize. Unlike chat, these
// routes use cookies, so a recognized origin also gets
// Access-Control-Allow-Credentials — without it the browser/WebView drops the
// session cookie on cross-origin calls (notably from the Capacitor APK) and
// every request looks signed-out. Never use "*" here: credentials + "*" is
// rejected by browsers anyway.

export type HeadersLike = Record<string, string | string[] | undefined>;

export type ReqLike = {
  method?: string;
  url?: string;
  body?: unknown;
  headers?: HeadersLike;
};

export type ResLike = {
  status: (code: number) => ResLike;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string | string[]) => void;
  end: (data?: unknown) => void;
  headersSent?: boolean;
};

export const LIVE_ORIGIN = 'https://stoner-bud-e-toonzkorner-9149s-projects.vercel.app';

// Origins allowed to call the credentialed API with cookies. The live web app
// is same-origin and needs no CORS, but it is listed anyway so a reflected
// origin is always one of these. Keep in step with Better Auth's
// trustedOrigins in src/lib/auth-server.ts.
export const ALLOWED_ORIGINS = new Set([
  LIVE_ORIGIN,
  'capacitor://localhost',
  'ionic://localhost',
  'https://localhost',
  'http://localhost',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
]);

export function corsOrigin(req: ReqLike): string | null {
  const raw = req.headers?.origin;
  const origin = Array.isArray(raw) ? raw[0] : raw;
  return origin && ALLOWED_ORIGINS.has(origin) ? origin : null;
}

export function setCorsHeaders(req: ReqLike, res: ResLike, methods: string): void {
  const origin = corsOrigin(req);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    // Cookies only ever go to a recognized origin (see above).
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
}

/** True when this request is a CORS preflight (handled without touching auth). */
export function isPreflight(req: ReqLike): boolean {
  return req.method === 'OPTIONS';
}

function headerValue(req: ReqLike, name: string): string | undefined {
  const raw = req.headers?.[name];
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Read a JSON body the way Vercel delivers it: `req.body` may already be a
 * parsed object, a raw string, or absent (then read the stream). Returns {}
 * when there is no usable body instead of throwing.
 */
export async function readJsonBody<T>(req: ReqLike & { on?: unknown }): Promise<T> {
  const raw = req.body;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return {} as T;
    }
  }
  if (raw && typeof raw === 'object') return raw as T;
  // No parsed body — read the raw stream (Vercel Node functions).
  const stream = req as unknown as AsyncIterable<Uint8Array>;
  if (typeof stream[Symbol.asyncIterator] === 'function') {
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    if (chunks.length === 0) return {} as T;
    try {
      const text = chunks.map((c) => new TextDecoder().decode(c)).join('');
      return JSON.parse(text) as T;
    } catch {
      return {} as T;
    }
  }
  return {} as T;
}

/** Single header lookup (first value wins) for the web-Request builder. */
export function firstHeader(req: ReqLike, name: string): string | undefined {
  return headerValue(req, name);
}
