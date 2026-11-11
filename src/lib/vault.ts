// Hidden Strain Vault — unlock state. Opened by holding B + E together for
// 3 seconds on the Bud-E keyboard. Once found it stays in the app (More
// menu). Stored on-device only.

const VAULT_UNLOCK_KEY = 'bude-vault-unlocked';

export function isVaultUnlocked(): boolean {
  try {
    return localStorage.getItem(VAULT_UNLOCK_KEY) === 'yes';
  } catch {
    return false;
  }
}

export function markVaultUnlocked(): void {
  try {
    localStorage.setItem(VAULT_UNLOCK_KEY, 'yes');
  } catch {
    // Storage blocked — the vault just will not stick for this visit.
  }
}
