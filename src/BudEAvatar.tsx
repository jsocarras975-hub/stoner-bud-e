// Bud-E's animated avatar — the green leaf with dreads, a Rasta beanie,
// big shades and a fat joint, drawn as an SVG so it can move. It bobs
// gently when idle, dances when Bud-E is thinking or speaking, and does
// a happy bounce when a new Bud-E message lands. Bud-E themed, not a
// copy of anyone else's avatar.

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
      <svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden>
        <defs>
          <clipPath id="beanieClip">
            <path d="M34 32 C34 14, 46 8, 60 8 C74 8, 86 14, 86 32 L86 36 L34 36 Z" />
          </clipPath>
        </defs>
        {/* Dreadlocks — dark brown strands hanging down both sides,
            behind the leaf face. */}
        <g stroke="#3a2314" strokeWidth="5" strokeLinecap="round" fill="none">
          <path d="M37 30 C31 46 29 64 33 86" />
          <path d="M43 28 C39 44 37 62 41 80" />
          <path d="M31 34 C25 50 23 68 27 88" />
          <path d="M83 30 C89 46 91 64 87 86" />
          <path d="M77 28 C81 44 83 62 79 80" />
          <path d="M89 34 C95 50 97 68 93 88" />
        </g>
        {/* Leaf face — a plump fresh-green leaf for the head. */}
        <path
          d="M60 12 C82 20, 94 44, 88 70 C84 88, 72 98, 60 98 C48 98, 36 88, 32 70 C26 44, 38 20, 60 12 Z"
          fill="#5fb84e"
        />
        {/* Leaf veins, top to bottom, with little side veins. */}
        <path d="M60 20 L60 92" stroke="#3d8a4a" strokeWidth="2" strokeLinecap="round" />
        <path d="M60 36 L46 48" stroke="#3d8a4a" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M60 36 L74 48" stroke="#3d8a4a" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M60 58 L48 68" stroke="#3d8a4a" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M60 58 L72 68" stroke="#3d8a4a" strokeWidth="1.6" strokeLinecap="round" />
        {/* Rasta beanie — red, yellow and green stripes, tilted a touch,
            with a dark green brim. */}
        <g transform="rotate(-6 60 22)">
          <g clipPath="url(#beanieClip)">
            <rect x="34" y="8" width="52" height="9" fill="#e33" />
            <rect x="34" y="17" width="52" height="9" fill="#ffcf3d" />
            <rect x="34" y="26" width="52" height="10" fill="#2fae4e" />
          </g>
          <path d="M34 32 C34 14, 46 8, 60 8 C74 8, 86 14, 86 32 L86 36 L34 36 Z" fill="none" stroke="#1c6b2e" strokeWidth="1.5" />
          <rect x="32" y="30" width="56" height="7" rx="3.5" fill="#1c6b2e" />
        </g>
        {/* Sunglasses — big dark lenses in a brown-gold frame. */}
        <rect x="28" y="50" width="25" height="18" rx="8" fill="#141414" stroke="#b07a3a" strokeWidth="2.5" />
        <rect x="67" y="50" width="25" height="18" rx="8" fill="#141414" stroke="#b07a3a" strokeWidth="2.5" />
        <rect x="51" y="56" width="18" height="4" rx="2" fill="#b07a3a" />
        <path d="M28 56 L22 54" stroke="#b07a3a" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M92 56 L98 54" stroke="#b07a3a" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M34 53 L40 65" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.5" className="bude-shine" />
        <path d="M73 53 L79 65" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.5" className="bude-shine" />
        {/* Smile — red lips. */}
        <path d="M46 82 Q60 94 74 82" stroke="#c0392b" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        {/* A fat joint at the mouth, angled up — filter at the lips, ember
            at the lit end. The smoke curls off the ember. */}
        <g transform="translate(70 80) rotate(-32)">
          <rect x="0" y="-4" width="32" height="8" rx="4" fill="#f5f0e1" stroke="#d8cfae" strokeWidth="0.6" />
          <rect x="0" y="-4" width="8" height="8" rx="3" fill="#c98a4b" />
          <circle cx="32" cy="0" r="3.5" fill="#ff6b35" className="bude-ember" />
          <circle cx="32" cy="0" r="6.5" fill="#ff6b35" opacity="0.25" className="bude-ember" />
        </g>
        {/* Smoke curling off the ember (ember lands near x=97, y=63). */}
        <path d="M98 58 C102 50, 94 46, 98 38 C102 30, 96 26, 98 20" stroke="#ffffff" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.45" className="bude-smoke" />
        <circle cx="98" cy="56" r="4" fill="#ffffff" opacity="0" className="bude-smoke bude-smoke-1" />
        <circle cx="102" cy="48" r="5" fill="#ffffff" opacity="0" className="bude-smoke bude-smoke-2" />
        <circle cx="96" cy="40" r="6" fill="#ffffff" opacity="0" className="bude-smoke bude-smoke-3" />
        {/* Every once in a while he blows out a puff — a soft cloud from
            the mouth that drifts up and away and fades. */}
        <g className="bude-puff" fill="#f5f5f5">
          <circle cx="54" cy="76" r="5" />
          <circle cx="60" cy="72" r="6" />
          <circle cx="48" cy="72" r="4.5" />
          <circle cx="56" cy="68" r="4" />
        </g>
      </svg>
    </div>
  );
}
