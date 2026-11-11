// Lit Mode — the special glowing look, turned on by holding L + T together
// for 3 seconds on the Bud-E keyboard. Once found it stays unlocked, and
// the app remembers whether it is on. Stored on-device only.

const LIT_MODE_KEY = 'bude-lit-mode';
const LIT_UNLOCK_KEY = 'bude-lit-unlocked';

export function isLitModeUnlocked(): boolean {
  try {
    return localStorage.getItem(LIT_UNLOCK_KEY) === 'yes';
  } catch {
    return false;
  }
}

export function markLitModeUnlocked(): void {
  try {
    localStorage.setItem(LIT_UNLOCK_KEY, 'yes');
  } catch {
    // Storage blocked — the unlock just will not stick.
  }
}

export function isLitMode(): boolean {
  try {
    return localStorage.getItem(LIT_MODE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function setLitMode(on: boolean): void {
  try {
    localStorage.setItem(LIT_MODE_KEY, on ? 'on' : 'off');
  } catch {
    // Storage blocked — the mode just will not stick.
  }
}

export function toggleLitMode(): boolean {
  const next = !isLitMode();
  setLitMode(next);
  return next;
}
