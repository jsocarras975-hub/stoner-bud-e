// Stoner Bud-E — tiny in-memory sliding-window rate limiter for the
// serverless API routes. Vercel functions are stateless across instances,
// so this caps abuse per warm instance: a real start, not a guarantee.
// Keys are per-IP (x-forwarded-for first hop). Caps are generous on
// purpose — normal use, even heavy testing, never trips them; a hammer
// does. When tripped the route answers 429 and the client falls back.

import type { ReqLike } from './cors.ts';

const buckets = new Map<string, number[]>();

/** True when the key already used up its allowance in the window. */
export function rateLimited(key: string, maxHits: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  let hits = buckets.get(key);
  if (!hits) {
    hits = [];
    buckets.set(key, hits);
  }
  while (hits.length > 0 && hits[0] <= cutoff) hits.shift();
  if (hits.length >= maxHits) return true;
  hits.push(now);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.length === 0 || v[v.length - 1] <= cutoff) buckets.delete(k);
    }
  }
  return false;
}

/** Best-effort client IP from the request headers. */
export function clientIp(req: ReqLike): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return 'unknown';
}
