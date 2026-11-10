// Stoner Bud-E — share a recap.
// A recap is a journal entry. Sharing turns it into a short plain-text
// summary and hands it to the phone's share sheet (Messages, WhatsApp, ...)
// via the Web Share API. When the share sheet is not available (desktop,
// old WebView), it copies the same text to the clipboard instead.
// Returns 'shared' | 'copied' | 'failed' so the caller can say what happened.

import { METHOD_LABELS } from '../bude';
import { FEEL_LABELS } from '../journal';
import type { JournalEntry } from '../journal';

function showDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** The text that gets shared — short, plain, no app jargon. */
export function formatRecapText(entry: JournalEntry): string {
  const lines: string[] = [];
  lines.push(`🌿 My Bud-E recap — ${showDate(entry.date)}`);
  const strainBit = entry.strain.trim() ? ` · ${entry.strain.trim()}` : '';
  lines.push(`${entry.amount}${entry.unit} ${METHOD_LABELS[entry.method]}${strainBit}`);
  const felt = entry.feel ? FEEL_LABELS[entry.feel] : `${entry.rating}/5 stars`;
  lines.push(`Felt: ${felt}`);
  if (entry.note.trim()) lines.push(`"${entry.note.trim()}"`);
  return lines.join('\n');
}

export type ShareResult = 'shared' | 'copied' | 'failed';

export async function shareRecap(entry: JournalEntry): Promise<ShareResult> {
  const text = formatRecapText(entry);
  try {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      await navigator.share({ title: 'My Bud-E recap', text });
      return 'shared';
    }
  } catch {
    // The user closed the share sheet (AbortError) or sharing failed —
    // fall through to the clipboard copy.
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
  } catch {
    return 'failed';
  }
  return 'failed';
}
