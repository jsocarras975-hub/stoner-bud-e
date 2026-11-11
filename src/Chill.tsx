// Hidden Chill screen — the calm corner only users who hold C + H together
// for 3 seconds on the Bud-E keyboard ever see. Once found it stays in the
// app (More menu). A slow breathing circle, soft colors, nothing to do.

export default function Chill() {
  return (
    <section style={{ textAlign: 'center', paddingTop: 24 }}>
      <p className="eyebrow">😌 Secret · chill</p>
      <h1>Chill.</h1>
      <p className="muted">Breathe with the circle. In slow, out slower. That&apos;s it.</p>
      <div
        aria-hidden
        style={{
          width: 180,
          height: 180,
          margin: '32px auto',
          borderRadius: '50%',
          background: 'radial-gradient(circle, var(--accent) 0%, var(--glow) 70%)',
          animation: 'bude-chill-breathe 8s ease-in-out infinite',
        }}
      />
      <p className="muted">In… and out…</p>
      <style>{`@keyframes bude-chill-breathe { 0%, 100% { transform: scale(0.85); opacity: 0.7; } 50% { transform: scale(1.15); opacity: 1; } }`}</style>
    </section>
  );
}
