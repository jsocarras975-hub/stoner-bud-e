// Stoner Bud-E — edible timer alerts.
// Three safety-first milestones tied to a timer run, so the phone can buzz
// when the edible should be kicking in, at peak, and when it's wearing off.
// The wording never suggests taking more — the whole point is stopping an
// early redose.
//
// Milestones are anchored to the dose, not to the timer's length:
//   kick-in     ~45 min after the dose — "it should be starting to hit"
//   peak        ~2 h after the dose — the timer's end — "you're at peak"
//   wearing-off ~4 h after the dose — 2 h after the timer ends — "it's fading"
// Alerts are keyed to the timer's own countdown, so pausing the timer pauses
// the alerts too. The wearing-off alert is the one exception: it fires on a
// wall-clock timeout started when the timer finishes, because the countdown
// has stopped by then.

export type TimerAlertId = 'kick-in' | 'peak' | 'wearing-off';

export interface TimerAlert {
  id: TimerAlertId;
  title: string;
  body: string;
}

export const TIMER_ALERTS: Record<TimerAlertId, TimerAlert> = {
  'kick-in': {
    id: 'kick-in',
    title: '🌿 It should be starting to hit',
    body: 'Give it time — edibles creep up slow. Do not take more yet.',
  },
  peak: {
    id: 'peak',
    title: '🌿 You should be at peak now',
    body: 'This is the strongest part. Ride it out — still no need for more.',
  },
  'wearing-off': {
    id: 'wearing-off',
    title: '🌿 It should be wearing off',
    body: 'The worst of it is behind you. You are clear to decide what is next — and to log how it went.',
  },
};

/** Minutes after the dose each milestone lands. */
export const KICK_IN_MIN = 45;
export const PEAK_MIN = 120;
export const WEAR_OFF_MIN = 240;

export interface PlannedAlert {
  id: TimerAlertId;
  /** Milliseconds from the timer's start until this alert fires. */
  delayMs: number;
  /** Seconds into the timer run at which this alert fires. */
  atElapsedSec: number;
}

/**
 * Work out which alerts a timer run should fire, and when.
 * `totalSec` is the timer's length; `elapsedAtStartSec` is how long ago the
 * dose was taken when the timer starts (0 for a manual timer).
 * - A threshold of 0 means "already due — fire right away" (e.g. the dose
 *   was taken over 45 minutes ago, so it's already kicking in).
 * - The kick-in alert is skipped when the timer is too short for it (a
 *   30-minute manual timer ends before kick-in would happen).
 * - Peak always lands at the timer's end; wearing-off always lands 2 hours
 *   after that.
 */
export function planAlerts(totalSec: number, elapsedAtStartSec: number): PlannedAlert[] {
  const list: PlannedAlert[] = [];
  const kickInAt = Math.max(0, KICK_IN_MIN * 60 - elapsedAtStartSec);
  if (kickInAt < totalSec) {
    list.push({ id: 'kick-in', delayMs: kickInAt * 1000, atElapsedSec: kickInAt });
  }
  list.push({ id: 'peak', delayMs: totalSec * 1000, atElapsedSec: totalSec });
  const wearOffAt = totalSec + (WEAR_OFF_MIN - PEAK_MIN) * 60;
  list.push({ id: 'wearing-off', delayMs: wearOffAt * 1000, atElapsedSec: wearOffAt });
  return list;
}

/** Buzz the phone in a short double-pulse, where the device supports it. */
export function buzz(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([200, 120, 200]);
    }
  } catch {
    // Vibration is a nice-to-have — the banner still shows.
  }
}
