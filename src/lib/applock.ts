// Stoner Bud-E — app lock: a PIN and/or the phone's fingerprint / face
// unlock. The PIN is a privacy lock for the app itself (keeps a casual
// snooper out); the PIN itself is never stored — only a salted SHA-256 hash
// in localStorage, so a wrong guess just fails. Biometrics go through the
// phone's own BiometricPrompt (hardware-backed, via the native
// BudEBiometric plugin), which is the stronger of the two.
//
// The lock lives on this device only (it is not synced — a lock is about
// this phone, not the account). When the app is locked it shows the lock
// screen instead of the app; the lock also engages when the app comes back
// from the background after the grace period. Forgot the PIN? The only way
// back in is to sign out and wipe this phone's copy — your stuff is saved
// on your account, so signing back in brings it back. That way nobody can
// tap "forgot" to walk past the lock.
//
// On the plain web there is no BiometricPrompt, so the biometric option
// simply does not appear there — the PIN still works.
import { Capacitor, registerPlugin } from '@capacitor/core';

export interface AppLockSettings {
  /** Salted SHA-256 of the PIN (hex). The raw PIN is never stored. */
  pinHash: string;
  salt: string;
  /** Unlock with the phone's fingerprint / face when it is available. */
  biometric: boolean;
  /** Seconds in the background before the lock engages (0 = right away). */
  graceSec: number;
}

export const LOCK_KEY = 'bude-app-lock-v1';
export const PIN_LENGTH = 4;

export function loadLockSettings(): AppLockSettings | null {
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const s = parsed as Partial<AppLockSettings>;
    if (typeof s.pinHash !== 'string' || s.pinHash === '') return null;
    if (typeof s.salt !== 'string' || s.salt === '') return null;
    return {
      pinHash: s.pinHash,
      salt: s.salt,
      biometric: s.biometric === true,
      graceSec:
        typeof s.graceSec === 'number' && Number.isFinite(s.graceSec) && s.graceSec >= 0
          ? s.graceSec
          : 0,
    };
  } catch {
    return null;
  }
}

export function saveLockSettings(settings: AppLockSettings): void {
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked — the lock just won't stick this time.
  }
}

export function clearLockSettings(): void {
  try {
    localStorage.removeItem(LOCK_KEY);
  } catch {
    // Already gone or storage blocked — nothing to do.
  }
}

export function hasPin(settings: AppLockSettings | null): settings is AppLockSettings {
  return settings !== null && settings.pinHash !== '';
}

/** A random salt (hex). One per PIN, so two phones with the same PIN hash differently. */
export function generateSalt(): string {
  const bytes = new Uint8Array(16);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 of (salt + ':' + pin), as hex. Falls back to a small FNV-style
 *  hash when Web Crypto is unavailable (very old WebViews) — weaker, but
 *  the PIN is still never stored in plain text. */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const text = `${salt}:${pin}`;
  try {
    if (crypto?.subtle) {
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(text),
      );
      return toHex(digest);
    }
  } catch {
    // Fall through to the small hash below.
  }
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export async function verifyPin(pin: string, settings: AppLockSettings): Promise<boolean> {
  if (pin.length !== PIN_LENGTH || !/^\d+$/.test(pin)) return false;
  const hash = await hashPin(pin, settings.salt);
  return hash === settings.pinHash;
}

// --- Biometrics (native plugin, phone app only) ---

export type BiometryType = 'fingerprint' | 'face' | 'none';

export interface BiometricStatus {
  available: boolean;
  type: BiometryType;
  /** Plain-words reason when it is not available ('no_hardware', 'none_enrolled', 'unavailable'). */
  reason: string;
}

interface BudEBiometricPlugin {
  isAvailable(): Promise<{ available: boolean; type: string; reason: string }>;
  authenticate(options: { title: string; subtitle: string }): Promise<{ success: boolean }>;
  publishLockState(options: { locked: boolean }): Promise<void>;
}

const BudEBiometric = registerPlugin<BudEBiometricPlugin>('BudEBiometric');

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Is the phone's fingerprint / face unlock usable right now? On the web
 *  this is always unavailable — there is no BiometricPrompt there. */
export async function biometricStatus(): Promise<BiometricStatus> {
  if (!isNativeApp()) return { available: false, type: 'none', reason: 'web' };
  try {
    const r = await BudEBiometric.isAvailable();
    const type: BiometryType =
      r.type === 'fingerprint' || r.type === 'face' ? r.type : 'none';
    return {
      available: r.available === true && type !== 'none',
      type,
      reason: typeof r.reason === 'string' ? r.reason : 'unavailable',
    };
  } catch {
    return { available: false, type: 'none', reason: 'unavailable' };
  }
}

/** Show the phone's own fingerprint / face prompt. True when it unlocks;
 *  false when the user cancels, fails, or picks "Use PIN instead". */
export async function authenticateBiometric(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const r = await BudEBiometric.authenticate({
      title: 'Unlock Bud-E',
      subtitle: 'Use your fingerprint or face to open the app',
    });
    return r?.success === true;
  } catch {
    return false;
  }
}

/** Tell the native side (bubble, voice session) whether the app is
 *  currently locked, so those entry points stay shut while it is. A no-op
 *  on the web. Best-effort — a failure here never breaks the lock screen. */
export async function publishLockState(locked: boolean): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await BudEBiometric.publishLockState({ locked });
  } catch {
    // The app lock still works; only the bubble/voice gate misses an update.
  }
}
