// Stoner Bud-E — taste learning ("Picked for you").
// Bud-E looks at what you actually logged and liked, then suggests strains
// from the guide that match your taste. Simple counting, not machine
// learning — the same style as recap.ts's usualDose.
// - A journal strain name is matched to one of the 12 guide strains by a
//   forgiving name match (free text in the journal vs the guide's names).
// - A recap that felt "just right" (rating 5) counts as a strong like; a
//   4 is a like; 1–2 is a dislike. Plain Log entries use their star rating.
// - Liked strains vote for their effects and terpenes. A guide strain
//   scores by how many of your liked effects/terpenes it shares, with a
//   boost when you have not tried it yet and a penalty when you tried it
//   and did not like it.
// - Returns at most 3 picks with a plain-words reason each. Returns [] when
//   there are not enough rated entries to learn from yet (fewer than 2).

import { STRAINS } from '../data/strains';
import type { Strain } from '../data/strains';
import type { JournalEntry } from '../journal';

/** "Blue Dream" -> "bluedream" so free-text journal names match the guide. */
function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Match a journal strain name to a guide strain, or null when it is not one of the 12. */
function matchStrain(name: string): Strain | null {
  const s = slug(name);
  if (s === '') return null;
  for (const strain of STRAINS) {
    if (slug(strain.name) === s) return strain;
  }
  // Partial: the journal name contains the guide name or vice versa
  // ("Blue Dream buds" still matches Blue Dream).
  for (const strain of STRAINS) {
    const g = slug(strain.name);
    if (s.includes(g) || g.includes(s)) return strain;
  }
  return null;
}

/** How much this entry liked the strain: +2 strong like, +1 like, 0 meh, -1 dislike. */
function likeScore(entry: JournalEntry): number {
  if (entry.feel === 'just-right') return 2;
  if (entry.feel === 'too-little' || entry.feel === 'too-much') return 0;
  if (entry.rating >= 5) return 2;
  if (entry.rating === 4) return 1;
  if (entry.rating <= 2) return -1;
  return 0;
}

export interface TastePick {
  strain: Strain;
  /** Plain-words reason, e.g. "Same relaxed vibe as Blue Dream". */
  reason: string;
  /** True when you have not logged this strain yet. */
  isNew: boolean;
}

/**
 * Top taste picks from the journal. Empty when there is not enough to learn
 * from yet — the caller shows a "log a few recaps" hint instead.
 */
export function tasteRecommendations(entries: JournalEntry[], limit = 3): TastePick[] {
  // Score each guide strain from the journal: how often it was liked.
  const tried = new Map<string, number>(); // strain id -> total like score
  const effectVotes = new Map<string, number>();
  const terpeneVotes = new Map<string, number>();
  let rated = 0;

  for (const entry of entries) {
    const strain = matchStrain(entry.strain);
    if (!strain) continue;
    const score = likeScore(entry);
    rated += 1;
    tried.set(strain.id, (tried.get(strain.id) ?? 0) + score);
    if (score > 0) {
      for (const e of strain.effects) {
        if (e.level >= 4) effectVotes.set(e.name, (effectVotes.get(e.name) ?? 0) + score);
      }
      for (const t of strain.terpenes) {
        terpeneVotes.set(t.name, (terpeneVotes.get(t.name) ?? 0) + score);
      }
    }
  }

  if (rated < 2 || effectVotes.size === 0) return [];

  // The strain you liked most — named in the reasons so they feel personal.
  let favoriteId = '';
  let favoriteScore = 0;
  for (const [id, score] of tried) {
    if (score > favoriteScore) {
      favoriteScore = score;
      favoriteId = id;
    }
  }
  const favorite = STRAINS.find((s) => s.id === favoriteId);

  // Score every guide strain against your taste profile.
  const scored: { strain: Strain; score: number; reason: string }[] = [];
  for (const strain of STRAINS) {
    // Skip a strain you already love — recommending what you already have
    // is not a discovery. Keep ones you tried and disliked out too.
    const own = tried.get(strain.id) ?? 0;
    if (own >= 2) continue;
    let score = 0;
    const sharedEffects: string[] = [];
    for (const e of strain.effects) {
      if (e.level >= 4) {
        const votes = effectVotes.get(e.name) ?? 0;
        if (votes > 0) {
          score += votes;
          sharedEffects.push(e.name);
        }
      }
    }
    const sharedTerps: string[] = [];
    for (const t of strain.terpenes) {
      const votes = terpeneVotes.get(t.name) ?? 0;
      if (votes > 0) {
        score += votes;
        sharedTerps.push(t.name);
      }
    }
    // Untried strains get a discovery boost; disliked ones get docked.
    const isNew = !tried.has(strain.id);
    if (isNew) score += 2;
    if (own < 0) score += own * 2;
    if (score <= 0) continue;

    let reason: string;
    if (favorite && sharedEffects.length > 0) {
      reason = `Same ${sharedEffects[0].toLowerCase()} vibe as ${favorite.name}`;
    } else if (sharedTerps.length > 0) {
      reason = `Shares the ${sharedTerps[0]} terpene you like`;
    } else if (isNew) {
      reason = 'You have not tried this one yet — it fits your taste';
    } else {
      reason = 'Fits the effects you keep coming back to';
    }
    if (isNew) reason += ' · new to you';
    scored.push({ strain, score, reason });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => ({
    strain: s.strain,
    reason: s.reason,
    isNew: !tried.has(s.strain.id),
  }));
}

/**
 * One short line about your taste, for the chat context — so Bud-E can
 * recommend strains in conversation. '' when there is nothing to learn yet.
 */
export function tasteSummary(entries: JournalEntry[]): string {
  const picks = tasteRecommendations(entries, 2);
  if (picks.length === 0) return '';
  const names = picks.map((p) => p.strain.name).join(', ');
  return `Strains Bud-E thinks you would like, from your own recaps: ${names}.`;
}
