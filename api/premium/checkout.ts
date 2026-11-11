// Stoner Bud-E — /api/premium/checkout (Vercel Node serverless).
//
// Crypto checkout for a one-time Lit ($19) or Cloud Nine ($49) purchase,
// via Coinbase Commerce. Stripe won't take this app (cannabis), so premium
// is sold as redeem codes (see api/sync.ts) OR paid here in crypto — the
// buyer pays with any crypto, Coinbase confirms it, and the tier unlocks.
//
// Env var required (set in Vercel project settings):
//   COINBASE_COMMERCE_API_KEY — the API key secret (shown once when the
//   key is created in the Coinbase Commerce dashboard). Production +
//   Preview, Secret.
//
// How it works (no webhook secret needed):
//   1. The app POSTs { tier } (signed in) -> we create a Coinbase
//      Commerce charge with metadata { userId, tier } and return its
//      hosted_url. The app opens that page; the buyer pays there.
//   2. Coinbase POSTs a charge:confirmed webhook to this same URL with
//      ?webhook=coinbase. We do NOT trust the event alone — we re-fetch
//      the charge from Coinbase with the API key and only grant the tier
//      when Coinbase itself says it is confirmed. A faked webhook cannot
//      grant anything, because the grant always goes through the API.
//   3. Fallback: the app POSTs { checkChargeId } (signed in) to ask
//      whether a charge is confirmed yet — for the buyer who paid and
//      came back before the webhook landed. Same verify-then-grant.
//
// The tier is written straight into user_settings (server-only, the same
// place redeem codes write it). It never downgrades: a Lit payment cannot
// take Cloud Nine away, and an owner already has everything.

import { getPool, getSessionUser } from '../../src/lib/auth-server.ts';
import { isPreflight, readJsonBody, setCorsHeaders } from '../../src/lib/cors.ts';
import type { ReqLike, ResLike } from '../../src/lib/cors.ts';
import { clientIp, rateLimited } from '../../src/lib/rate-limit.ts';

type Req = ReqLike & { on?: unknown; url?: string };
type Res = ResLike & { headersSent?: boolean };

const COINBASE_API = 'https://api.commerce.coinbase.com';
const CC_VERSION = '2018-03-22';

const PRICES: Record<string, { amount: string; name: string }> = {
  lit: { amount: '19.00', name: 'Bud-E Lit' },
  cloudnine: { amount: '49.00', name: 'Bud-E Cloud Nine' },
};

function tierRank(tier: unknown): number {
  if (tier === 'owner') return 3;
  if (tier === 'cloudnine') return 2;
  if (tier === 'lit') return 1;
  return 0;
}

/** Set a user's premium tier (never downgrades). Returns the tier set, or null. */
async function grantTier(userId: string, tier: string): Promise<string | null> {
  if (tier !== 'lit' && tier !== 'cloudnine') return null;
  const pool = getPool();
  const current = await pool.query<{ data: Record<string, unknown> | null }>(
    'select data from user_settings where user_id = $1',
    [userId],
  );
  const currentTier = current.rows[0]?.data?.premiumTier;
  if (tierRank(currentTier) >= tierRank(tier)) return null;
  const data = { ...(current.rows[0]?.data ?? {}), premiumTier: tier };
  await pool.query(
    `insert into user_settings (user_id, data, updated_at)
     values ($1, $2, now())
     on conflict (user_id) do update
       set data = excluded.data, updated_at = excluded.updated_at`,
    [userId, JSON.stringify(data)],
  );
  return tier;
}

interface CoinbaseCharge {
  id?: string;
  code?: string;
  hosted_url?: string;
  timeline?: Array<{ status?: string }>;
  payments?: Array<{ status?: string }>;
  metadata?: Record<string, unknown>;
}

function chargeIsConfirmed(charge: CoinbaseCharge): boolean {
  if (Array.isArray(charge.timeline)) {
    if (charge.timeline.some((t) => t.status === 'CONFIRMED')) return true;
  }
  if (Array.isArray(charge.payments)) {
    if (charge.payments.some((p) => p.status === 'CONFIRMED')) return true;
  }
  return false;
}

async function fetchCharge(apiKey: string, chargeId: string): Promise<CoinbaseCharge | null> {
  const res = await fetch(`${COINBASE_API}/charges/${encodeURIComponent(chargeId)}`, {
    headers: {
      'X-CC-Api-Key': apiKey,
      'X-CC-Version': CC_VERSION,
    },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: CoinbaseCharge };
  return body.data ?? null;
}

/** Re-fetch a charge from Coinbase; if it is confirmed, grant its tier.
 *  Returns { confirmed, tier? }. This is the only place a tier is granted
 *  from a crypto payment — the webhook and the check button both go here. */
async function verifyAndGrant(apiKey: string, chargeId: string): Promise<{ confirmed: boolean; tier?: string }> {
  const charge = await fetchCharge(apiKey, chargeId);
  if (!charge || !chargeIsConfirmed(charge)) return { confirmed: false };
  const meta = charge.metadata ?? {};
  const userId = typeof meta.userId === 'string' ? meta.userId : '';
  const tier = typeof meta.tier === 'string' ? meta.tier : '';
  if (!userId || (tier !== 'lit' && tier !== 'cloudnine')) return { confirmed: true };
  const granted = await grantTier(userId, tier);
  return { confirmed: true, tier: granted ?? undefined };
}

export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    res.setHeader('Content-Type', 'application/json');
    setCorsHeaders(req, res, 'POST, OPTIONS');
    if (isPreflight(req)) {
      res.status(200).json({ ok: true });
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'method_not_allowed' });
      return;
    }

    const apiKey = process.env.COINBASE_COMMERCE_API_KEY;
    if (!apiKey) {
      res.status(503).json({
        ok: false,
        error: 'payments_not_configured',
        message: 'Crypto payments are not set up yet — the Coinbase Commerce API key is missing in Vercel.',
      });
      return;
    }

    const isWebhook = typeof req.url === 'string' && req.url.includes('webhook=coinbase');

    // ---- Coinbase webhook (charge:confirmed). No session — the grant is
    // gated on re-fetching the charge from Coinbase, not on the event. ----
    if (isWebhook) {
      const body = await readJsonBody<{ type?: string; data?: { id?: string } }>(req);
      const chargeId = body.data?.id;
      if (body.type === 'charge:confirmed' && typeof chargeId === 'string') {
        await verifyAndGrant(apiKey, chargeId).catch(() => {});
      }
      res.status(200).json({ ok: true });
      return;
    }

    // ---- Rate limit the signed-in checkout path (not webhooks — those
    // come from Coinbase). Caps charge-creation abuse per IP. ----
    if (rateLimited(`checkout:${clientIp(req)}`, 30, 60_000)) {
      res.status(429).json({ ok: false, error: 'rate_limited' });
      return;
    }

    const user = await getSessionUser(req);
    if (!user) {
      res.status(401).json({ ok: false, error: 'sign_in_required' });
      return;
    }

    const body = await readJsonBody<{ tier?: string; checkChargeId?: string }>(req);

    // ---- "Did my payment go through?" (the buyer came back) ----
    if (typeof body.checkChargeId === 'string' && body.checkChargeId) {
      const result = await verifyAndGrant(apiKey, body.checkChargeId);
      res.status(200).json({ ok: true, ...result });
      return;
    }

    // ---- Create a charge and hand the app the hosted checkout page ----
    const tier = body.tier === 'lit' || body.tier === 'cloudnine' ? body.tier : null;
    if (!tier) {
      res.status(400).json({ ok: false, error: 'bad_tier' });
      return;
    }
    const price = PRICES[tier];
    const createRes = await fetch(`${COINBASE_API}/charges`, {
      method: 'POST',
      headers: {
        'X-CC-Api-Key': apiKey,
        'X-CC-Version': CC_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: price.name,
        description: 'Stoner Bud-E premium — one-time purchase. 21+ only.',
        pricing_type: 'fixed_price',
        local_price: { amount: price.amount, currency: 'USD' },
        metadata: { userId: user.id, tier },
      }),
    });
    const created = (await createRes.json()) as { data?: CoinbaseCharge; error?: { message?: string } };
    if (!createRes.ok || !created.data?.hosted_url || !created.data?.id) {
      res.status(502).json({
        ok: false,
        error: 'coinbase_failed',
        message: created.error?.message || 'Could not start crypto checkout.',
      });
      return;
    }
    res.status(200).json({
      ok: true,
      hostedUrl: created.data.hosted_url,
      chargeId: created.data.id,
      code: created.data.code,
    });
  } catch {
    res.status(500).json({ ok: false, error: 'internal' });
  }
}
