// Stoner Bud-E — Cash App payments for premium (owner verifies himself).
//
// The buyer sends the money to the owner's $Cashtag ($kartoon93), taps
// "I paid" in the app, and the owner checks Cash App and taps Confirm —
// the tier unlocks straight away, no code to redeem. Cash App Pay (the
// checkout button) won't take this app, so this is the person-to-person
// route instead. Server side lives in api/sync.ts (cashapp_payments).

import { CommunityError, communityCall } from './community.ts';

export const CASHAPP_TAG = '$kartoon93';
export const CASHAPP_URL = 'https://cash.app/$kartoon93';

export interface CashAppPayment {
  id: string;
  userId?: string;
  tier: string;
  note: string;
  status: 'pending' | 'confirmed' | 'declined';
  createdAt: string;
  email?: string | null;
  name?: string | null;
}

function toPayment(raw: unknown): CashAppPayment | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.tier !== 'string' || typeof r.status !== 'string') return null;
  return {
    id: r.id,
    userId: typeof r.user_id === 'string' ? r.user_id : undefined,
    tier: r.tier,
    note: typeof r.note === 'string' ? r.note : '',
    status: r.status as CashAppPayment['status'],
    createdAt: typeof r.created_at === 'string' ? r.created_at : '',
    email: typeof r.email === 'string' ? r.email : null,
    name: typeof r.name === 'string' ? r.name : null,
  };
}

/** The buyer sent the money and taps "I paid". One pending claim per tier. */
export async function claimCashAppPayment(
  tier: 'lit' | 'cloudnine',
  note: string,
): Promise<{ paymentId: string }> {
  const body = await communityCall('cashapp_claim', { tier, note });
  if (typeof body.paymentId !== 'string') {
    throw new CommunityError('other', 'That did not go through — try again.');
  }
  return { paymentId: body.paymentId };
}

/** The buyer's own Cash App claims (pending -> confirmed). */
export async function fetchMyCashAppPayments(): Promise<CashAppPayment[]> {
  const body = await communityCall('cashapp_mine', {});
  const list = Array.isArray(body.payments) ? body.payments : [];
  return list.map(toPayment).filter((p): p is CashAppPayment => p !== null);
}

/** Owner only: the Cash App payments waiting to be verified. */
export async function fetchPendingCashAppPayments(): Promise<CashAppPayment[]> {
  const body = await communityCall('cashapp_pending', {});
  const list = Array.isArray(body.payments) ? body.payments : [];
  return list.map(toPayment).filter((p): p is CashAppPayment => p !== null);
}

/** Owner only: the money arrived — unlock the buyer's tier. */
export async function confirmCashAppPayment(paymentId: string): Promise<{ tier?: string }> {
  const body = await communityCall('cashapp_confirm', { paymentId });
  return { tier: typeof body.tier === 'string' ? body.tier : undefined };
}

/** Owner only: no money arrived — take it off the list. */
export async function declineCashAppPayment(paymentId: string): Promise<void> {
  await communityCall('cashapp_decline', { paymentId });
}
