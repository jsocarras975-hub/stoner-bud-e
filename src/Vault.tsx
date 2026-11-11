// Hidden Strain Vault — the strains that don't live in the main guide.
// Opened by holding B + E together for 3 seconds on the Bud-E keyboard.
// Once found it stays in the app (More menu). These are static content,
// so no server needed — the secret is just that the vault is hidden.

const VAULT_STRAINS: {
  name: string;
  type: string;
  thc: string;
  flavors: string;
  effects: string;
  note: string;
}[] = [
  {
    name: 'Purple Punch',
    type: 'Indica',
    thc: 'THC about 18–22%',
    flavors: 'Grape candy, berry',
    effects: 'Heavy, sleepy relaxer',
    note: 'The one strain that doesn’t live in the main guide. (Psst — its name is a code. Try it where codes go.)',
  },
  {
    name: 'Secret OG',
    type: 'Hybrid',
    thc: 'THC about 20–25%',
    flavors: 'Pine, earth, lemon',
    effects: 'Balanced, calm body with a clear head',
    note: 'The OG they don’t put on the menu.',
  },
  {
    name: 'Mystery Haze',
    type: 'Sativa',
    thc: 'THC about 18–23%',
    flavors: 'Citrus, spice, sweet',
    effects: 'Uplifting, talkative, creative',
    note: 'Nobody knows the cross. That’s the point.',
  },
  {
    name: 'Ghost Train Haze',
    type: 'Sativa',
    thc: 'THC about 22–27%',
    flavors: 'Citrus, floral, sour',
    effects: 'Energetic, buzzy, all aboard',
    note: 'Strong. Newer folks should start small.',
  },
];

export default function Vault({ onAskAboutStrain }: { onAskAboutStrain: (strain: string) => void }) {
  return (
    <section>
      <p className="eyebrow">🗝️ Secret · hidden strains</p>
      <h1>The Strain Vault</h1>
      <p className="muted">
        Strains that don’t live in the main guide. You found the vault — it
        stays in your app from here on.
      </p>
      {VAULT_STRAINS.map((s) => (
        <div key={s.name} className="card">
          <p className="eyebrow">🌿 Hidden strain</p>
          <h2>{s.name}</h2>
          <p className="muted">
            {s.type} · {s.thc}
          </p>
          <p>
            <strong>Flavors:</strong> {s.flavors}
            <br />
            <strong>Effects:</strong> {s.effects}
          </p>
          <p className="muted">{s.note}</p>
          <button type="button" className="btn" onClick={() => onAskAboutStrain(s.name)}>
            💬 Ask Bud-E about it
          </button>
        </div>
      ))}
    </section>
  );
}
