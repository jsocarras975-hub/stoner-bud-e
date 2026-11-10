// Stoner Bud-E — Bud-E Keyboard (web side of BudEKeyboardPlugin).
//
// The keyboard itself is a native input method (BudEKeyboardService) in
// this same app. Android makes the user turn it on in Settings and pick it
// from the keyboard switcher — an app can never set itself. This module
// just reads the status and opens those system screens.

import { Capacitor, registerPlugin } from '@capacitor/core';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

interface BudEKeyboardPlugin {
  isKeyboardEnabled(): Promise<{ enabled: boolean }>;
  isKeyboardActive(): Promise<{ active: boolean }>;
  openKeyboardSettings(): Promise<void>;
  showKeyboardPicker(): Promise<void>;
}

const BudEKeyboard = registerPlugin<BudEKeyboardPlugin>('BudEKeyboard');

export interface KeyboardStatus {
  enabled: boolean;
  active: boolean;
}

/** Read the keyboard status. On the web (or if the plugin is missing) it
 *  reports not enabled and not active — the Keyboard section says so. */
export async function getKeyboardStatus(): Promise<KeyboardStatus> {
  if (!isNativeApp()) return { enabled: false, active: false };
  try {
    const [enabled, active] = await Promise.all([
      BudEKeyboard.isKeyboardEnabled(),
      BudEKeyboard.isKeyboardActive(),
    ]);
    return { enabled: enabled.enabled === true, active: active.active === true };
  } catch {
    return { enabled: false, active: false };
  }
}

/** Open the system keyboard settings (where the user enables Bud-E Keyboard). */
export async function openKeyboardSettings(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await BudEKeyboard.openKeyboardSettings();
  } catch {
    // Best-effort — the user can get there from the phone's Settings.
  }
}

/** Show the system keyboard picker (where the user switches to Bud-E). */
export async function showKeyboardPicker(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await BudEKeyboard.showKeyboardPicker();
  } catch {
    // Best-effort.
  }
}
