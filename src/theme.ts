// Stoner Bud-E — theme + age-gate storage keys. Theme ids match the
// Grok night-garden app exactly (ember = Amber lounge).

export const THEME_KEY = 'bude-theme-v1';
export const AGE_GATE_KEY = 'bude-age-gate-v1';

export type ThemeId = 'night' | 'day' | 'ember' | 'moon';

export const THEMES: { id: ThemeId; name: string; detail: string }[] = [
  { id: 'night', name: 'Night garden', detail: 'Deep green. The original.' },
  { id: 'day', name: 'Day garden', detail: 'Paper and daylight.' },
  { id: 'ember', name: 'Amber lounge', detail: 'Warm lamp light.' },
  { id: 'moon', name: 'Moon', detail: 'Cool blue night.' },
];

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
