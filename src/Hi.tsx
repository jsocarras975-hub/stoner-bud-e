// Secret Hi — the greeting only users who hold H + I together for 3
// seconds on the Bud-E keyboard ever see. Once found it stays in the app
// (More menu). Just a little hello from Bud-E.

export default function Hi() {
  return (
    <section style={{ textAlign: 'center', paddingTop: 40 }}>
      <p style={{ fontSize: '4rem', margin: 0 }} aria-hidden>
        👋🍃
      </p>
      <p className="eyebrow">🤫 Secret · hi</p>
      <h1>Hi. You found it.</h1>
      <p className="muted">
        H + I. That&apos;s all it took. Bud-E sees you — and now you know
        there&apos;s more hiding in here than the app lets on.
      </p>
      <p className="muted">Keep looking. There&apos;s more where this came from.</p>
    </section>
  );
}
