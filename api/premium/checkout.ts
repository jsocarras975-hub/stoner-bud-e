// Stoner Bud-E — /api/premium/checkout (Vercel Node serverless).
//
// Creates a Stripe Checkout Session for a one-time Lit ($19) or Cloud Nine
// ($49) purchase, tied to the signed-in user. Records nothing until the
// webhook confirms the charge succeeded.
//
// Env vars required (set in Vercel project settings):
//   STRIPE_SECRET_KEY     — sk_live_... or sk_test_...
//   STRIPE_WEBHOOK_SECRET — whsec_... (for the webhook endpoint)
//   STRIPE_PRICE_LIT      — price_... for the $19 Lit product
//   STRIPE_PRICE_CLOUDNINE — price_... for the $49 Cloud Nine product
//
// Cannabis policy note: Stripe (and most processors) restrict or require
// special approval for cannabis-related businesses. This is a 21+ cannabis
// app. If the processor blocks the account or the checkout, the button
// will not complete a real charge. Do not ship a pay button that cannot
// work — resolve with the processor first. Square is an alternative the
// owner already uses elsewhere; the same pattern applies (different env
// vars and API).

import { getSessionUser } from '../../src/lib/auth-server.ts';
import { isPreflight, readJsonBody, setCorsHeaders } from '../../src/lib/cors.ts';
import type { ReqLike, ResLike } from '../../src/lib/cors.ts';

type Req = ReqLike & { on?: unknown };
type Res = ResLike & { headersSent?: boolean };

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

    const user = await getSessionUser(req);
    if (!user) {
      res.status(401).json({ ok: false, error: 'sign_in_required' });
      return;
    }

    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      res.status(503).json({
        ok: false,
        error: 'payments_not_configured',
        message:
          'Payments are not set up yet. Cannabis-related businesses may need special approval from the processor (Stripe or Square). Resolve that before enabling checkout.',
      });
      return;
    }

    const body = await readJsonBody<{ tier?: string }>(req);
    const tier = body.tier === 'lit' || body.tier === 'cloudnine' ? body.tier : null;
    if (!tier) {
      res.status(400).json({ ok: false, error: 'bad_tier' });
      return;
    }

    const priceId =
      tier === 'lit' ? process.env.STRIPE_PRICE_LIT : process.env.STRIPE_PRICE_CLOUDNINE;
    if (!priceId) {
      res.status(503).json({ ok: false, error: 'price_not_configured' });
      return;
    }

    // Create Stripe Checkout Session via REST (no SDK dependency).
    const origin = req.headers?.origin || 'https://stoner-bud-e-toonzkorner-9149s-projects.vercel.app';
    const params = new URLSearchParams();
    params.set('mode', 'payment');
    params.set('success_url', `${origin}/?premium=success`);
    params.set('cancel_url', `${origin}/?premium=cancel`);
    params.set('client_reference_id', user.id);
    params.set('line_items[0][price]', priceId);
    params.set('line_items[0][quantity]', '1');
    params.set('metadata[userId]', user.id);
    params.set('metadata[tier]', tier);

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const stripeData = (await stripeRes.json()) as { id?: string; url?: string; error?: { message?: string } };
    if (!stripeRes.ok || !stripeData.url) {
      res.status(502).json({
        ok: false,
        error: 'stripe_failed',
        message: stripeData.error?.message || 'Could not start checkout.',
      });
      return;
    }

    res.status(200).json({ ok: true, url: stripeData.url });
  } catch {
    res.status(500).json({ ok: false, error: 'internal' });
  }
}
