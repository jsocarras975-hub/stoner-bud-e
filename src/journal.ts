// Stoner Bud-E — session journal data + helpers.
// Local only: entries live in localStorage, no network, no accounts.

import { METHOD_LABELS } from './bude';
import type { Method } from './bude';

export interface JournalEntry {
  id: string;
  date: string; // ISO string
  method: Method;
  strain: string;
  amount: string;
  unit: 'mg' | 'g';
  rating: number; // 1–5
  note: string;
  change: string; // "what I'd do different next time", may be empty
  /**
   * Recap only: how the dose landed — the simple scale from the recap
   * form. Older entries (and plain Log entries) have no feel; the rating
   * is what they carry instead. Rides inside the same synced JSON, so no
   * server change was needed.
   */
  feel?: RecapFeel;
}

/** How a recap's dose landed. */
export type RecapFeel = 'too-little' | 'just-right' | 'too-much';

export const FEEL_LABELS: Record<RecapFeel, string> = {
  'too-little': 'Too little',
  'just-right': 'Just right',
  'too-much': 'Too much',
};

export const JOURNAL_KEY = 'bude-journal-v1';

export function newEntryId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Short plain-words summary of the last 3 entries, for chat context.
 * Returns '' when there are no entries. Kept under ~300 chars.
 */
export function journalSummary(entries: JournalEntry[]): string {
  if (entries.length === 0) return '';
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const bits = sorted.slice(0, 3).map((e) => {
    const label = METHOD_LABELS[e.method].toLowerCase();
    const strainBit = e.strain.trim() ? ` ${e.strain.trim()}` : '';
    const noteBit = e.note.trim() ? `, "${e.note.trim()}"` : '';
    const feltBit = e.feel ? `, felt ${FEEL_LABELS[e.feel].toLowerCase()}` : `, felt ${e.rating}/5`;
    return `${shortDate(e.date)} — ${e.amount}${e.unit}${strainBit} ${label}${feltBit}${noteBit}`;
  });
  const text = `Last sessions: ${bits.join('; ')}.`;
  return text.length > 300 ? `${text.slice(0, 297)}…` : text;
}
