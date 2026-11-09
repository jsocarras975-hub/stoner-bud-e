// Stoner Bud-E — session recaps: what Bud-E remembers.
// A recap IS a journal entry (same localStorage list, same sync — no new
// table, no migration). The only extra bit is `feel`: how the dose landed.
// The learning is simple counting, not machine learning:
// - usualDose: the most common dose (method + amount + unit) in recent
//   recaps, plus the strain most often taken with it.
// - usualStrains: strains ordered by how often they show up in recaps.
// Tonight uses both to pre-fill the dose and to show "your usuals" first.

import type { JournalEntry } from './journal';
import type { Method } from './bude';

export interface UsualDose {
  method: Method;
  amount: string;
  unit: 'mg' | 'g';
  /** Most common strain taken with this dose, '' when none was named. */
  strain: string;
  /** How many recaps used this exact dose. */
  count: number;
}

const RECENT_LIMIT = 20;

/** Most recent entries first (they already are, but be safe). */
function sortedRecent(entries: JournalEntry[]): JournalEntry[] {
  return [...entries]
    .filter((e) => e.amount.trim() !== '' && !Number.isNaN(Number(e.amount)) && Number(e.amount) > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, RECENT_LIMIT);
}

/**
 * The dose that shows up most in recent recaps. Ties go to the most
 * recent entry. Returns null when there is nothing to learn from yet.
 */
export function usualDose(entries: JournalEntry[]): UsualDose | null {
  const recent = sortedRecent(entries);
  if (recent.length === 0) return null;
  const byKey = new Map<string, { entry: JournalEntry; count: number }>();
  for (const entry of recent) {
    const key = `${entry.method}|${entry.amount.trim()}|${entry.unit}`;
    const found = byKey.get(key);
    if (found) found.count += 1;
    else byKey.set(key, { entry, count: 1 });
  }
  let best: { entry: JournalEntry; count: number } | null = null;
  for (const candidate of byKey.values()) {
    if (!best || candidate.count > best.count) best = candidate;
  }
  if (!best) return null;
  // Most common strain taken with this exact dose ('' when none named).
  const strainCounts = new Map<string, { label: string; count: number }>();
  for (const entry of recent) {
    if (
      entry.method !== best.entry.method ||
      entry.amount.trim() !== best.entry.amount.trim() ||
      entry.unit !== best.entry.unit
    ) {
      continue;
    }
    const strain = entry.strain.trim();
    if (strain === '') continue;
    const key = strain.toLowerCase();
    const found = strainCounts.get(key);
    if (found) found.count += 1;
    else strainCounts.set(key, { label: strain, count: 1 });
  }
  let strain = '';
  let strainBest = 0;
  for (const candidate of strainCounts.values()) {
    if (candidate.count > strainBest) {
      strainBest = candidate.count;
      strain = candidate.label;
    }
  }
  return {
    method: best.entry.method,
    amount: best.entry.amount.trim(),
    unit: best.entry.unit,
    strain,
    count: best.count,
  };
}

/**
 * Strains ordered by how often they show up in recaps, most-used first.
 * Ties go to the most recent. Returns at most `limit` names.
 */
export function usualStrains(entries: JournalEntry[], limit = 5): string[] {
  const recent = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const byKey = new Map<string, { label: string; count: number }>();
  for (const entry of recent) {
    const strain = entry.strain.trim();
    if (strain === '') continue;
    const key = strain.toLowerCase();
    const found = byKey.get(key);
    if (found) found.count += 1;
    else byKey.set(key, { label: strain, count: 1 });
  }
  return [...byKey.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((s) => s.label);
}

/** Plain-words line for Tonight: "Your usual: 10mg edible, Blue Dream". */
export function usualLine(usual: UsualDose): string {
  const strainBit = usual.strain ? `, ${usual.strain}` : '';
  return `Your usual: ${usual.amount}${usual.unit} ${usual.method}${strainBit}`;
}
