// Secret badges — earned by finding the hidden things in the app. Each
// secret you figure out earns a badge on your profile. Locked badges stay
// hidden so they stay secret. Stored on-device only.

export type BadgeId =
  | 'secret-finder'
  | 'vault-raider'
  | 'four-twenty'
  | 'lit-up'
  | 'code-breaker'
  | 'say-hi'
  | 'chill-out'
  | 'munchies'
  | 'go-getter';

export const BADGES: { id: BadgeId; emoji: string; name: string; detail: string }[] = [
  { id: 'secret-finder', emoji: '🤫', name: 'Secret Finder', detail: 'Found the Secret Room.' },
  { id: 'vault-raider', emoji: '🗝️', name: 'Vault Raider', detail: 'Opened the hidden Strain Vault.' },
  { id: 'four-twenty', emoji: '🌿', name: '4:20', detail: 'Found the deeper 420 Room.' },
  { id: 'lit-up', emoji: '💡', name: 'Lit Up', detail: 'Turned on Lit Mode.' },
  { id: 'code-breaker', emoji: '🔓', name: 'Code Breaker', detail: 'Cracked a hidden code.' },
  { id: 'say-hi', emoji: '👋', name: 'Say Hi', detail: 'Found the secret Hi.' },
  { id: 'chill-out', emoji: '😌', name: 'Chill Out', detail: 'Found the hidden Chill screen.' },
  { id: 'munchies', emoji: '🍕', name: 'Munchies', detail: 'Found the Munchies Room.' },
  { id: 'go-getter', emoji: '🚀', name: 'Go Getter', detail: 'Found the hidden Go screen.' },
];

const BADGES_KEY = 'bude-secret-badges';

export function getBadges(): BadgeId[] {
  try {
    const raw = localStorage.getItem(BADGES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is BadgeId => typeof v === 'string' && BADGES.some((b) => b.id === v));
  } catch {
    return [];
  }
}

export function hasBadge(id: BadgeId): boolean {
  return getBadges().includes(id);
}

export function earnBadge(id: BadgeId): void {
  try {
    const current = getBadges();
    if (current.includes(id)) return;
    localStorage.setItem(BADGES_KEY, JSON.stringify([...current, id]));
  } catch {
    // Storage blocked — the badge just will not stick.
  }
}
