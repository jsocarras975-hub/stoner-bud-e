// Stoner Bud-E — theme + age-gate storage keys. Theme ids match the
// Grok night-garden app exactly (ember = Amber lounge).

export const THEME_KEY = 'bude-theme-v1';
export const AGE_GATE_KEY = 'bude-age-gate-v1';

export const THEMES: { id: ThemeId; name: string; detail: string; premium?: boolean; ownerOnly?: boolean; secret?: 'vault' }[] = [
  { id: 'night', name: 'Night garden', detail: 'Deep green. The original.' },
  { id: 'day', name: 'Day garden', detail: 'Paper and daylight.' },
  { id: 'ember', name: 'Amber lounge', detail: 'Warm lamp light.' },
  { id: 'moon', name: 'Moon', detail: 'Cool blue night.' },
  // Premium (Lit+)
  { id: 'forest', name: 'Deep forest', detail: 'Darker greens, quieter.', premium: true },
  { id: 'sunset', name: 'Sunset', detail: 'Warm oranges and pinks.', premium: true },
  // Owner only — the Kartoon cut, deep purple with the Bud-E lime.
  { id: 'kartoon', name: 'Kartoon', detail: 'Deep purple night, lime accent.', ownerOnly: true },
  // Secret — only shows once the hidden Strain Vault is found (B+E).
  { id: 'midnight', name: 'Midnight', detail: 'Deep violet night, unlocked in the Vault.', secret: 'vault' },
];

export type ThemeId = 'night' | 'day' | 'ember' | 'moon' | 'forest' | 'sunset' | 'kartoon' | 'midnight';

export function isPremiumTheme(id: string): boolean {
  return THEMES.some((t) => t.id === id && t.premium);
}

export function isOwnerTheme(id: string): boolean {
  return THEMES.some((t) => t.id === id && t.ownerOnly);
}

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

export function loadTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (isThemeId(raw)) return raw;
  } catch {
    // Storage blocked — fall back to night garden.
  }
  return 'night';
}
