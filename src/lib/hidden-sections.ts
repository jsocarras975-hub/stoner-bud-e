// Hidden one-off sections (Hi, Chill, Go) — unlock state. Opened by their
// keyboard hold (H+I, C+H, G+O). Once found they stay in the app (More
// menu). Stored on-device only.

export type HiddenSection = 'hi' | 'chill' | 'go';

const KEYS: Record<HiddenSection, string> = {
  hi: 'bude-hi-unlocked',
  chill: 'bude-chill-unlocked',
  go: 'bude-go-unlocked',
};

export function isSectionUnlocked(section: HiddenSection): boolean {
  try {
    return localStorage.getItem(KEYS[section]) === 'yes';
  } catch {
    return false;
  }
}

export function markSectionUnlocked(section: HiddenSection): void {
  try {
    localStorage.setItem(KEYS[section], 'yes');
  } catch {
    // Storage blocked — the section just will not stick for this visit.
  }
}
