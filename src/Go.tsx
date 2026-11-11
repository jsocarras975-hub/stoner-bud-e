// Hidden Go screen — quick actions only users who hold G + O together for
// 3 seconds on the Bud-E keyboard ever see. Once found it stays in the app
// (More menu). One tap to do the thing, no digging through tabs.

export default function Go({ onGo }: { onGo: (tab: 'chat' | 'journal' | 'stash' | 'tools') => void }) {
  return (
    <section>
      <p className="eyebrow">🚀 Secret · go</p>
      <h1>Go.</h1>
      <p className="muted">One tap, straight to it. No digging.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        <button type="button" className="btn" onClick={() => onGo('journal')}>
          📝 Log a session
        </button>
        <button type="button" className="btn" onClick={() => onGo('tools')}>
          ⏱️ Start the edible timer
        </button>
        <button type="button" className="btn" onClick={() => onGo('stash')}>
          🫙 Open my stash
        </button>
        <button type="button" className="btn" onClick={() => onGo('chat')}>
          💬 Ask Bud-E something
        </button>
      </div>
    </section>
  );
}
