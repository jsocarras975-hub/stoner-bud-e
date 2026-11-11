// Hidden codes — tucked around the app for users who look closely. Enter
// one where codes go (in the Secret Room) and it earns the Code Breaker
// badge. Client-side only — these are easter eggs, not a secure system.

import { earnBadge } from './badges';

const CODES: Record<string, string> = {
  PURPLE: 'You cracked the Vault code. 🗝️',
  LIT420: 'You cracked the 420 code. 🌿',
  GELATO: 'You cracked the Gelato code. 🍦',
  N3XUS: 'You cracked the N3xUs code. ✨',
};

const REDEEMED_KEY = 'bude-codes-redeemed';

function getRedeemed(): string[] {
  try {
    const raw = localStorage.getItem(REDEEMED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** Redeem a code. Returns a message when it works, null when it is not a code. */
export function redeemSecretCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  const message = CODES[code];
  if (!message) return null;
  const redeemed = getRedeemed();
  if (!redeemed.includes(code)) {
    try {
      localStorage.setItem(REDEEMED_KEY, JSON.stringify([...redeemed, code]));
    } catch {
      // Storage blocked — the redemption just will not stick.
    }
  }
  earnBadge('code-breaker');
  return message;
}
