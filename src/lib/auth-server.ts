// Stoner Bud-E — Better Auth server instance (SERVER ONLY).
//
// NEVER import this file from client code (App.tsx, tabs, auth-client):
// it pulls in `pg` + the Better Auth server internals. The client uses
// src/lib/auth-client.ts; API routes use getAuth() / getSessionUser() /
// handleAuthRequest() from here.
//
// Pattern ported from the Grok app's src/lib/auth/server.ts (email+password,
// Postgres Pool, Better Auth tables in migrations/0001_auth.sql) and adapted
// to plain Vercel Node serverless functions — no TanStack Start, no PGLite.
// The database is a Neon Postgres DATABASE_URL, set in Vercel (Production +
// Preview). Until it lands, every call here fails closed with a clear error
// and the API routes answer 503 `auth_not_configured` — the app keeps working
// logged-out on localStorage exactly as before.

import { betterAuth } from 'better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { Pool } from 'pg';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { LIVE_ORIGIN, firstHeader, isPreflight, setCorsHeaders } from './cors.ts';
import type { ReqLike, ResLike } from './cors.ts';

/** Read an env var, treating empty/whitespace as unset. No `process` global
 *  here on purpose: this file is typechecked under both tsconfigs, and the
 *  app one does not include @types/node globals. */
function env(key: string): string | undefined {
  const proc = (globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  }).process;
  const value = proc?.env?.[key]?.trim();
  return value ? value : undefined;
}

export const AUTH_BASE_URL = env('BETTER_AUTH_URL') ?? LIVE_ORIGIN;

// Origins Better Auth accepts on credentialed auth POSTs (sign-up/sign-in).
// A missing entry surfaces as FORBIDDEN "Invalid origin" — so this must cover
// the production site, local dev, AND the Capacitor APK origins. Keep in step
// with ALLOWED_ORIGINS in ./cors.ts.
const TRUSTED_ORIGINS: string[] = [
  AUTH_BASE_URL,
  LIVE_ORIGIN,
  'capacitor://localhost',
  'ionic://localhost',
  'https://localhost',
  'http://localhost',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
];

function buildAuth(pool: Pool, secret: string) {
  return betterAuth({
    baseURL: AUTH_BASE_URL,
    secret,
    database: pool,
    trustedOrigins: [...new Set(TRUSTED_ORIGINS)],
    // Email + password only. No email verification: Bud-E sends no email, and
    // requiring verification with no mailer would lock every new account out.
    emailAndPassword: { enabled: true, minPasswordLength: 8, requireEmailVerification: false },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // refresh the expiry at most once a day
      // Cache the session in the short-lived signed `session_data` cookie so
      // get-session usually skips a DB round-trip.
      cookieCache: { enabled: true, maxAge: 300 },
    },
    advanced: {
      // Cross-origin cookies for the Capacitor APK: the app runs on
      // capacitor://localhost and calls the API on the Vercel origin, so the
      // session cookie must be SameSite=None + Secure or the WebView will not
      // send it back and every request looks signed-out. Secure cookies are
      // accepted on http://localhost too (localhost is a secure context), so
      // local dev keeps working. Web (same-origin) is unaffected.
      defaultCookieAttributes: { secure: true, sameSite: 'none', path: '/' },
    },
  });
}

// The concrete Auth type from buildAuth — NOT ReturnType<typeof betterAuth>,
// whose generic Auth<BetterAuthOptions> is not assignable from the
// option-specific instance buildAuth returns.
type AuthInstance = ReturnType<typeof buildAuth>;

type Cached = { auth: AuthInstance; pool: Pool };

const globalAuth = globalThis as typeof globalThis & { __budeAuth__?: Cached };

/**
 * Lazily build (once per warm serverless instance) the shared pg Pool and
 * Better Auth instance. Throws a plain Error when DATABASE_URL or
 * BETTER_AUTH_SECRET is missing — callers turn that into a 503, never a 500
 * with a stack trace, and never log the values.
 */
export function getAuth(): AuthInstance {
  if (globalAuth.__budeAuth__) return globalAuth.__budeAuth__.auth;
  const databaseUrl = env('DATABASE_URL');
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Create the Neon project and set DATABASE_URL in Vercel, then run scripts/setup-db.mjs.',
    );
  }
  const secret = env('BETTER_AUTH_SECRET');
  if (!secret) {
    throw new Error('BETTER_AUTH_SECRET is not set in the environment.');
  }
  // Serverless-friendly pool: one connection per warm instance. Neon caps
  // concurrent connections, and a big pool per function invocation exhausts it.
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const auth = buildAuth(pool, secret);
  globalAuth.__budeAuth__ = { auth, pool };
  return auth;
}

/** The shared Pool (same instance Better Auth uses). For api/sync.ts. */
export function getPool(): Pool {
  getAuth(); // ensures the cached entry exists (throws when unconfigured)
  return (globalAuth.__budeAuth__ as Cached).pool;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

/**
 * Verify the caller's Better Auth session from its cookie and return the
 * user, or null when there is no valid session. Throws when auth is not
 * configured (no DATABASE_URL yet) — the caller answers 503.
 */
export async function getSessionUser(req: {
  headers?: IncomingHttpHeaders;
}): Promise<SessionUser | null> {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers ?? {}) });
  if (!session?.user) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email };
}

/**
 * Catch-all handler for /api/auth/* (sign-up, sign-in, sign-out, get-session).
 * Uses Better Auth's fetch-style `auth.handler` with a Request we build
 * ourselves — deliberately NOT `toNodeHandler`: Vercel may already have
 * parsed the JSON body, which would leave the Node stream empty for a
 * stream-reading handler, so building the Request from `req.body` (parsed
 * object, raw string, or stream) works either way. The Response is copied
 * back onto the Node response, Set-Cookie included.
 */
export async function handleAuthRequest(req: ReqLike, res: ResLike): Promise<void> {
  res.setHeader('Content-Type', 'application/json');
  setCorsHeaders(req, res, 'GET, POST, OPTIONS');
  if (isPreflight(req)) {
    res.status(200).json({ ok: true });
    return;
  }

  let auth: AuthInstance;
  try {
    auth = getAuth();
  } catch {
    res.status(503).json({ ok: false, error: 'auth_not_configured' });
    return;
  }

  try {
    const host = firstHeader(req, 'host') ?? 'localhost';
    const proto = firstHeader(req, 'x-forwarded-proto') ?? 'https';
    const url = `${proto}://${host}${req.url ?? '/api/auth'}`;
    const headers = new Headers();
    const rawHeaders: Record<string, unknown> = req.headers ?? {};
    for (const [name, value] of Object.entries(rawHeaders)) {
      if (typeof value === 'string') headers.set(name, value);
      else if (Array.isArray(value)) headers.set(name, value.join(', '));
    }
    // Let undici compute content-length from the body we pass.
    headers.delete('content-length');

    let body: string | undefined;
    const method = (req.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      if (typeof req.body === 'string') {
        body = req.body;
      } else if (req.body && typeof req.body === 'object') {
        body = JSON.stringify(req.body);
      } else {
        const stream = req as unknown as AsyncIterable<Uint8Array>;
        if (typeof stream[Symbol.asyncIterator] === 'function') {
          const chunks: Uint8Array[] = [];
          for await (const chunk of stream) chunks.push(chunk);
          if (chunks.length > 0) {
            body = chunks.map((c) => new TextDecoder().decode(c)).join('');
          }
        }
      }
    }

    const webRes = await auth.handler(new Request(url, { method, headers, body }));
    // Copy status + headers. Set-Cookie needs getSetCookie(): plain
    // forEach() would merge multiple cookies into one broken header.
    const setCookie =
      (webRes.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    webRes.headers.forEach((value, name) => {
      if (name.toLowerCase() === 'set-cookie') return;
      (res as unknown as { setHeader: (n: string, v: string) => void }).setHeader(name, value);
    });
    if (setCookie.length > 0) {
      (res as unknown as { setHeader: (n: string, v: string[]) => void }).setHeader(
        'Set-Cookie',
        setCookie,
      );
    }
    const bytes = new Uint8Array(await webRes.arrayBuffer());
    const nodeRes = res as unknown as ServerResponse;
    nodeRes.statusCode = webRes.status;
    nodeRes.end(bytes);
  } catch {
    if (!res.headersSent) {
      res.status(503).json({ ok: false, error: 'auth_unavailable' });
    }
  }
}

// Re-exported so api routes can type their (req, res) as Node's.
export type { IncomingMessage, ServerResponse };
