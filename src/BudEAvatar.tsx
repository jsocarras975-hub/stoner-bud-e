// Bud-E's animated avatar — the actual sticker artwork he sent (dreads,
// Rasta beanie, big shades, fat joint), with the black background cut
// out so it floats clean. It bobs gently when idle, dances when Bud-E
// is thinking or speaking, and does a happy bounce when a new Bud-E
// message lands. Every few seconds he blows out a puff.

export type BudEMood = 'idle' | 'thinking' | 'speaking' | 'happy';

export default function BudEAvatar({ mood = 'idle' }: { mood?: BudEMood }) {
  const cls =
    mood === 'thinking' || mood === 'speaking'
      ? 'bude-avatar-dance'
      : mood === 'happy'
        ? 'bude-avatar-happy'
        : 'bude-avatar-bob';
  return (
    <div className={`bude-avatar ${cls}`} role="img" aria-label="Bud-E">
      <img src="/bude-avatar.png" alt="" className="bude-avatar-img" draggable={false} />
      {/* Periodic exhale — a soft cloud from the mouth that drifts up
          and away and fades, about every 7 seconds. */}
      <span className="bude-puff-img" aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}
