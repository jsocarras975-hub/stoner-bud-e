// Stoner Bud-E — closed-app timer alerts via Capacitor local notifications.
// Only ever runs inside the installed phone app; on the web it is a no-op,
// so the web/PWA build never touches it. Every call is guarded — if the
// plugin is missing or the phone refuses, the timer still works, just
// without the closed-app buzzes.
//
// The plugin is loaded with a dynamic import so the web bundle stays clean,
// and everything is wrapped in try/catch: a notification failure must never
// break the timer or the chat.

import { Capacitor } from '@capacitor/core';
import { TIMER_ALERTS, type PlannedAlert, type TimerAlertId } from './timer-alerts';

export type AlertPermission = 'granted' | 'denied' | 'prompt' | 'unavailable';

/** Fixed notification ids, so re-scheduling a run replaces the old one. */
const ALERT_IDS: Record<TimerAlertId, number> = {
  'kick-in': 1001,
  peak: 1002,
  'wearing-off': 1003,
};

/** True only inside the installed phone app (Capacitor native runtime). */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

async function plugin() {
  const mod = await import('@capacitor/local-notifications');
  return mod.LocalNotifications;
}

/** What the phone currently says about notifications — no prompt shown. */
export async function checkAlertPermission(): Promise<AlertPermission> {
  if (!isNativeApp()) return 'unavailable';
  try {
    const p = await plugin();
    const res = await p.checkPermissions();
    if (res.display === 'granted') return 'granted';
    if (res.display === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unavailable';
  }
}

/**
 * Ask the phone, plainly, whether Bud-E may buzz when an edible milestone
 * hits. Call only from a user tap — never on load, never silently.
 */
export async function requestAlertPermission(): Promise<AlertPermission> {
  if (!isNativeApp()) return 'unavailable';
  try {
    const p = await plugin();
    const res = await p.requestPermissions();
    if (res.display === 'granted') return 'granted';
    if (res.display === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unavailable';
  }
}

/**
 * Schedule the milestone notifications for a timer run, from wall-clock
 * delays. Cancels any previous run's notifications first, so a new timer
 * never leaves stale buzzes behind. Returns false when nothing was
 * scheduled (not a native app, or the phone refused).
 */
export async function scheduleNativeAlerts(planned: PlannedAlert[]): Promise<boolean> {
  if (!isNativeApp() || planned.length === 0) return false;
  try {
    const p = await plugin();
    await p.cancel({ notifications: Object.values(ALERT_IDS).map((id) => ({ id })) });
    const now = Date.now();
    const notifications = planned.map((a) => ({
      id: ALERT_IDS[a.id],
      title: TIMER_ALERTS[a.id].title,
      body: TIMER_ALERTS[a.id].body,
      schedule: { at: new Date(now + a.delayMs), allowWhileIdle: true },
    }));
    await p.schedule({ notifications });
    return true;
  } catch {
    return false;
  }
}

/** Schedule a single milestone (used for wearing-off after the timer ends). */
export async function scheduleNativeAlert(id: TimerAlertId, delayMs: number): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const p = await plugin();
    // Cancel first, so this replaces the one scheduled when the run started.
    await p.cancel({ notifications: [{ id: ALERT_IDS[id] }] });
    await p.schedule({
      notifications: [
        {
          id: ALERT_IDS[id],
          title: TIMER_ALERTS[id].title,
          body: TIMER_ALERTS[id].body,
          schedule: { at: new Date(Date.now() + delayMs), allowWhileIdle: true },
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
}

/** Cancel every pending timer buzz — on reset, and on pause (resumed later). */
export async function cancelNativeAlerts(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const p = await plugin();
    await p.cancel({ notifications: Object.values(ALERT_IDS).map((id) => ({ id })) });
  } catch {
    // Nothing pending, or the phone said no — either way, nothing to do.
  }
}
