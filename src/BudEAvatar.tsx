// Bud-E's animated avatar — the green leaf with sunglasses and a smile,
// drawn as an SVG so it can move. It bobs gently when idle, dances when
// Bud-E is thinking or speaking, and does a happy bounce when a new Bud-E
// message lands. Bud-E themed, not a copy of anyone else's avatar.

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
      <svg viewBox="0 0 120 128" width="64" height="68" aria-hidden>
        {/* Leaf body — a friendly pointed leaf, fresh green. */}
        <path
          d="M60 6 C 90 24, 103 56, 89 86 C 79 107, 68 113, 60 113 C 52 113, 41 107, 31 86 C 17 56, 30 24, 60 6 Z"
          fill="#66bb4a"
        />
        {/* Leaf vein, top to bottom, with little side veins. */}
        <path d="M60 14 L60 106" stroke="#4a8c2f" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M60 34 L44 48" stroke="#4a8c2f" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M60 34 L76 48" stroke="#4a8c2f" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M60 58 L46 70" stroke="#4a8c2f" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M60 58 L74 70" stroke="#4a8c2f" strokeWidth="1.8" strokeLinecap="round" />
        {/* Stem at the bottom. */}
        <path d="M60 113 Q60 121 56 126" stroke="#6b4f2a" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        {/* Sunglasses — dark lenses, bridge, and a little shine. */}
        <rect x="32" y="44" width="25" height="17" rx="8" fill="#161616" />
        <rect x="63" y="44" width="25" height="17" rx="8" fill="#161616" />
        <rect x="55" y="50" width="10" height="4" rx="2" fill="#161616" />
        <path d="M38 47 L44 58" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.55" className="bude-shine" />
        <path d="M69 47 L75 58" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.55" className="bude-shine" />
        {/* Smile. */}
        <path d="M47 80 Q60 91 73 80" stroke="#1a3a12" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}
