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
}

export const STASH_KEY = 'bude-stash-v1';

export function newStashId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
