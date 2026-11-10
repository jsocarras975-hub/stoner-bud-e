// Stoner Bud-E — Strain of the Day.
// One strain per day, the same for everyone all day, different tomorrow.
// Deterministic from the calendar date (day-of-year), so it never needs a
// network call and the widget and the app always agree. The "why" line comes
// from the strain's strongest effect, so it reads like a real pick, not a
// random name.

import { STRAINS } from '../data/strains';
import type { Strain } from '../data/strains';

/** Day-of-year (1–366) for a date, in local time. */
function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((d.getTime() - start.getTime()) / msPerDay);
}

/** The strain's strongest effect name, e.g. "Relaxed". */
export function topEffect(strain: Strain): string {
  let best = strain.effects[0];
  for (const e of strain.effects) {
    if (e.level > (best?.level ?? 0)) best = e;
  }
  return best?.name ?? '';
}

const WHY_LINES: Record<string, string> = {
  Relaxed: 'A slow one for winding down — let the day melt off.',
  Sleepy: 'A proper nightcap — good for when the lights go low.',
  Happy: 'A bright one for a good mood — easy and upbeat.',
  Creative: 'A spark for making things — good for a creative night.',
  Focused: 'A clear-headed one — good for getting stuff done.',
  Hungry: 'A munchies classic — have snacks ready.',
  Energetic: 'A lift for the evening — not a couch strain.',
  Calm: 'A steady one — smooth, no rush.',
  Uplifted: 'A mood-lifter — light and easy.',
  Euphoric: 'A floaty one — big smiles, easy laughs.',
};

function whyLine(strain: Strain): string {
  const top = topEffect(strain);
  return WHY_LINES[top] ?? `Known for feeling ${top.toLowerCase()} — a solid pick for tonight.`;
}

export interface DailyPick {
  strain: Strain;
  /** Plain-words line for why this one today. */
  why: string;
  /** "Tuesday, Nov 10" style label for the day. */
  dayLabel: string;
}

/** Today's strain pick. Pass a date to test another day; defaults to now. */
export function strainOfTheDay(when: Date = new Date()): DailyPick {
  const idx = dayOfYear(when) % STRAINS.length;
  const strain = STRAINS[idx];
  const dayLabel = when.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  return { strain, why: whyLine(strain), dayLabel };
}
