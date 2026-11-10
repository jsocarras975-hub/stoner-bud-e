// Stoner Bud-E — crypto checkout (Coinbase Commerce) for premium.
//
// The buyer pays with any crypto on Coinbase's hosted checkout page; when
// Coinbase confirms the payment, the server grants the tier (see
// api/premium/checkout.ts). No card, no Stripe — Stripe won't take this app.
//
// The pending charge id is kept in localStorage so the "I've paid — check"
// button knows which charge to ask about, even if the buyer left the app
// and came back.

import { authedFetch } from './auth-client.ts';

const PENDING_CHARGE_KEY = 'bude-crypto-charge';

export interface CryptoCheckout {
  hostedUrl: string;
  chargeId: string;
  code: string;
}

export function getPendingChargeId(): string | null {
  try {
    return localStorage.getItem(PENDING_CHARGE_KEY);
  } catch {
    return null;
  }
}

function setPendingChargeId(chargeId: string | null): void {
  try {
    if (chargeId) localStorage.setItem(PENDING_CHARGE_KEY, chargeId);
    else localStorage.removeItem(PENDING_CHARGE_KEY);
  } catch {
    // Storage blocked — the check button just will not know the charge.
  }
}

/** Start a crypto checkout for a tier. Returns the hosted checkout page. */
export async function createCryptoCheckout(
  tier: 'lit' | 'cloudnine',
): Promise<CryptoCheckout> {
  const res = await authedFetch('/api/premium/checkout', {
    method: 'POST',
    body: JSON.stringify({ tier }),
  });
  const body: unknown = await res.json().catch(() => ({}));
  const data = body as { ok?: boolean; hostedUrl?: unknown; chargeId?: unknown; code?: unknown; error?: unknown; message?: unknown };
  if (!res.ok || !data.ok || typeof data.hostedUrl !== 'string' || typeof data.chargeId !== 'string') {
    if (res.status === 503 || data.error === 'payments_not_configured') {
      throw new Error('Crypto payments are not set up yet — the Coinbase key is missing.');
    }
    throw new Error(typeof data.message === 'string' ? data.message : 'Could not start crypto checkout.');
  }
  setPendingChargeId(data.chargeId);
  return {
    hostedUrl: data.hostedUrl,
    chargeId: data.chargeId,
    code: typeof data.code === 'string' ? data.code : '',
  };
}

/** Ask the server whether a charge is confirmed yet (and grant the tier
 *  when it is). Returns true when the tier was just unlocked. */
export async function checkCryptoCharge(chargeId: string): Promise<{ confirmed: boolean; tier?: string }> {
  const res = await authedFetch('/api/premium/checkout', {
    method: 'POST',
    body: JSON.stringify({ checkChargeId: chargeId }),
  });
  const body: unknown = await res.json().catch(() => ({}));
  const data = body as { ok?: boolean; confirmed?: unknown; tier?: unknown };
  if (!res.ok || !data.ok) return { confirmed: false };
  const confirmed = data.confirmed === true;
  if (confirmed) setPendingChargeId(null);
  return {
    confirmed,
    tier: typeof data.tier === 'string' ? data.tier : undefined,
  };
}
