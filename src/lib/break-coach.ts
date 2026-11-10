// Stoner Bud-E — break coach lines.
// The Break tab already tracks check-ins (mood + cravings 1–5). The coach
// adds the buddy part: a short supportive line after a check-in, and a
// rotating daily tip on the active break. Plain words, no medical claims,
// no diagnosis — encouragement and practical tips only.

const TIPS: string[] = [
  'Cravings come in waves and pass in about 20 minutes. Drink some water and wait one out.',
  'Sleep might be restless for a few nights — that is normal and it settles down.',
  'A walk, a shower, or texting a friend all help more than white-knuckling it.',
  'Keep your hands busy — cook something, clean a drawer, play a game.',
  'Your tolerance is already dropping. That first session back will hit harder, so go slow.',
  'Dreams might get vivid for a bit. Weird, but normal — it passes.',
  'If the evening feels empty, swap the ritual: same spot, same snack, a tea instead.',
  'You have already done the hardest part — starting. Every day after that is easier.',
];

/** Rotating daily tip for the active break card. */
export function dailyTip(dayNumber: number): string {
  return TIPS[Math.max(0, dayNumber - 1) % TIPS.length];
}

/**
 * A supportive line after today's check-in. Adapts to how hard the day is:
 * high cravings get a steadying line, a great mood gets a celebration, and
 * the early days get a reminder that they are the hardest.
 */
export function coachLine(dayNumber: number, mood: string, cravings: number): string {
  if (cravings >= 4) {
    return 'That craving is loud today — it will pass. Drink some water, go for a walk, and give it 20 minutes. You have made it this far for a reason.';
  }
  if (mood === 'Great') {
    return `Day ${dayNumber} and feeling great — that is the break working. Keep this feeling in your pocket for the harder days.`;
  }
  if (mood === 'Craving hard') {
    return 'Cravings are the worst right before they fade. You are not starting over — you are one hard hour from a calmer evening.';
  }
  if (dayNumber <= 2) {
    return 'The first couple of days are the hardest part. It gets easier from here — your body is already resetting.';
  }
  if (mood === 'Rough') {
    return 'Rough days still count. A break does not have to feel good to be working — your tolerance is dropping either way.';
  }
  return `Day ${dayNumber} — steady. You are doing the thing, one day at a time.`;
}
