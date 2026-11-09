// Stoner Bud-E — stash data.
// Local only: items live in localStorage, no network, no accounts.

export type StashForm = 'flower' | 'edible' | 'vape' | 'dab' | 'drink' | 'other';

export interface StashItem {
  id: string;
  name: string;
  form: StashForm;
  amount: number;
  unit: 'g' | 'mg' | 'pieces';
  thcPct: string; // "" when unknown, so "22" or "" both work
  lowAt: number; // low-stock threshold, in the same unit as amount
  /**
   * How much the jar started with, in the same unit. Recorded when the jar
   * is added; jars added before this existed don't have it. The low rule
   * falls back to the current amount for those (see baseline()).
   */
  startedAt?: number;
}

export const STASH_KEY = 'bude-stash-v1';

export function newStashId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Running low — one rule, used by the jar card, the Stash summary, and the
// Tonight nudge, so all three always agree.
//
// - When the user set a "warn under" amount (lowAt > 0), that wins: low
//   when the amount drops to it or under.
// - Otherwise the default: low when the amount drops to 10% of what the
//   jar started with, or under the absolute floor — whichever is higher.
//   The floor is 1g for flower, 10mg (about one dose) for edibles, and
//   1 piece for counted items. Jars added before startedAt existed use
//   their current amount as the baseline, so the floor still catches them.
// ---------------------------------------------------------------------------

/** What the jar started with; the current amount when unknown. */
function baseline(item: StashItem): number {
  return item.startedAt !== undefined && item.startedAt > 0 ? item.startedAt : item.amount;
}

/** Absolute floor for the default rule, in the item's unit. */
function lowFloor(unit: StashItem['unit']): number {
  return unit === 'g' ? 1 : unit === 'mg' ? 10 : 1;
}

/** The amount at or under which this jar counts as running low. */
export function lowThreshold(item: StashItem): number {
  if (item.lowAt > 0) return item.lowAt;
  return Math.max(baseline(item) * 0.1, lowFloor(item.unit));
}

export function isRunningLow(item: StashItem): boolean {
  return item.amount <= lowThreshold(item);
}

/** Plain-words line for a low jar: "Blue Dream is running low — 0.5g left." */
export function lowNote(item: StashItem): string {
  if (item.amount <= 0) return `${item.name} is out — time to grab more.`;
  return `${item.name} is running low — ${item.amount}${item.unit} left.`;
}

/**
 * Change a jar's amount. A refill (amount raised above what the jar
 * started with) moves the baseline up too, so the 10% rule tracks the
 * new full jar instead of the old one. Also fills in startedAt for jars
 * added before it existed.
 */
export function withAmount(item: StashItem, amount: number): StashItem {
  return {
    ...item,
    amount,
    startedAt: Math.max(item.startedAt ?? 0, amount),
  };
}
