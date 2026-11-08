// Strain Guide tab — browse, search, filter, favorite, and compare strains.
// 21+ educational info only: no medical claims, no selling, start low go slow.
import { useEffect, useMemo, useState } from 'react';
import { EFFECT_NAMES, STRAINS, TERPENE_NAMES } from './data/strains';
import type { Strain, StrainType } from './data/strains';
import { Chip, ChipRow, Label, PageHead } from './bits';

const FAVS_KEY = 'bude-strain-favs-v1';

type Mood = 'Sleep' | 'Chill' | 'Creative' | 'Focused' | 'Party' | 'Hungry';

const MOOD_LABELS: Record<Mood, string> = {
  Sleep: '😴 Sleep',
  Chill: '🛋️ Chill',
  Creative: '🎨 Creative',
  Focused: '🎯 Focused',
  Party: '🎉 Party',
  Hungry: '🍕 Hungry',
};

/** Sensible picks per mood, by strain id. */
const MOOD_STRAINS: Record<Mood, string[]> = {
  Sleep: ['granddaddy-purple', 'northern-lights', 'wedding-cake'],
  Chill: ['blue-dream', 'og-kush', 'zkittlez'],
  Creative: ['jack-herer', 'durban-poison', 'pineapple-express'],
  Focused: ['durban-poison', 'jack-herer', 'sour-diesel'],
  Party: ['pineapple-express', 'gelato', 'gsc'],
  Hungry: ['gsc', 'og-kush', 'granddaddy-purple'],
};

const MOODS: Mood[] = ['Sleep', 'Chill', 'Creative', 'Focused', 'Party', 'Hungry'];

const TYPE_LABELS: Record<StrainType, string> = {
  indica: 'Indica',
  sativa: 'Sativa',
  hybrid: 'Hybrid',
};

function loadFavs(): string[] {
  try {
    const raw = localStorage.getItem(FAVS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = new Set(STRAINS.map((s) => s.id));
    return parsed.filter((id): id is string => typeof id === 'string' && valid.has(id));
  } catch {
    return [];
  }
}

function typeHint(type: StrainType): string {
  if (type === 'indica') return 'Body-heavy, mellow';
  if (type === 'sativa') return 'Head-high, upbeat';
  return 'A bit of both';
}

function StrainCard({
  strain,
  isFav,
  onToggleFav,
  inCompare,
  compareDisabled,
  onToggleCompare,
  onAskAbout,
}: {
  strain: Strain;
  isFav: boolean;
  onToggleFav: () => void;
  inCompare: boolean;
  compareDisabled: boolean;
  onToggleCompare: () => void;
  onAskAbout: (name: string) => void;
}) {
  return (
    <article className="card" aria-label={strain.name}>
      <h2 className="strain-name">{strain.name}</h2>
      <p className="muted small" style={{ marginTop: 4 }}>
        {TYPE_LABELS[strain.type]} · {typeHint(strain.type)}
      </p>
      <p className="muted small">
        THC about {strain.thcMin}–{strain.thcMax}% · From {strain.lineage}
      </p>
      <p>{strain.blurb}</p>

      <div className="result-box">
        <p className="small" style={{ marginBottom: 6 }}>
          <strong>Flavors:</strong> {strain.flavors.join(' · ')}
        </p>
        <p className="small" style={{ marginBottom: 10 }}>
          <strong>What it is known for:</strong>
        </p>
        {strain.effects.map((effect) => (
          <div key={effect.name} style={{ marginBottom: 8 }}>
            <div className="small" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{effect.name}</span>
              <span className="muted">
                {'●'.repeat(effect.level)}
                {'○'.repeat(5 - effect.level)}
              </span>
            </div>
            <div
              aria-hidden="true"
              style={{
                height: 8,
                borderRadius: 999,
                background: 'var(--line)',
                marginTop: 3,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${(effect.level / 5) * 100}%`,
                  background: 'var(--accent)',
                  borderRadius: 999,
                }}
              />
            </div>
          </div>
        ))}
        <p className="small" style={{ marginTop: 12, marginBottom: 4 }}>
          <strong>Terpenes — the smell and flavor oils:</strong>
        </p>
        {strain.terpenes.map((terp) => (
          <p key={terp.name} className="small" style={{ marginBottom: 4 }}>
            <strong>{terp.name}:</strong> {terp.note}
          </p>
        ))}
      </div>

      <ChipRow style={{ marginTop: 12 }}>
        <Chip on={isFav} onClick={onToggleFav} ariaPressed={isFav}>
          {isFav ? '★ Saved' : '☆ Save'}
        </Chip>
        <Chip
          on={inCompare}
          onClick={onToggleCompare}
          disabled={compareDisabled}
          ariaPressed={inCompare}
        >
          {inCompare ? '✓ Comparing' : '⇄ Compare'}
        </Chip>
      </ChipRow>
      <p style={{ marginTop: 12, marginBottom: 0 }}>
        <button className="btn btn-block" onClick={() => onAskAbout(strain.name)}>
          💬 Ask Bud-E about {strain.name}
        </button>
      </p>
    </article>
  );
}

export default function StrainsTab({ onAskAbout }: { onAskAbout: (strainName: string) => void }) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | StrainType>('all');
  const [effectFilter, setEffectFilter] = useState('all');
  const [terpeneFilter, setTerpeneFilter] = useState('all');
  const [mood, setMood] = useState<Mood | null>(null);
  const [favs, setFavs] = useState<string[]>(loadFavs);
  const [favsOnly, setFavsOnly] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem(FAVS_KEY, JSON.stringify(favs));
    } catch {
      // Storage full or blocked — favorites just won't stick this time.
    }
  }, [favs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return STRAINS.filter((strain) => {
      if (typeFilter !== 'all' && strain.type !== typeFilter) return false;
      if (mood !== null && !MOOD_STRAINS[mood].includes(strain.id)) return false;
      if (favsOnly && !favs.includes(strain.id)) return false;
      if (effectFilter !== 'all' && !strain.effects.some((e) => e.name === effectFilter))
        return false;
      if (terpeneFilter !== 'all' && !strain.terpenes.some((t) => t.name === terpeneFilter))
        return false;
      if (q !== '') {
        const haystack = [strain.name, strain.lineage, ...strain.flavors]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [query, typeFilter, mood, favsOnly, favs, effectFilter, terpeneFilter]);

  const compareStrains = useMemo(
    () => compareIds.map((id) => STRAINS.find((s) => s.id === id)).filter((s): s is Strain => s !== undefined),
    [compareIds],
  );

  function toggleFav(id: string) {
    setFavs((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  }

  function toggleCompare(id: string) {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  function clearFilters() {
    setQuery('');
    setTypeFilter('all');
    setEffectFilter('all');
    setTerpeneFilter('all');
    setMood(null);
    setFavsOnly(false);
  }

  return (
    <main>
      <PageHead
        title="Strains"
        sub="12 classics, plain and simple — what they taste like, how they tend to feel, and what is in them."
      />
      <section className="card" aria-label="Strain guide filters">
        <p className="muted" style={{ marginTop: 0 }}>
          THC numbers are typical ranges; every batch is a little different. Start low, go slow, and
          remember: this is general info, not medical advice.
        </p>
        <label htmlFor="strainSearch">Search strains</label>
        <input
          id="strainSearch"
          type="search"
          placeholder="Try “grape”, “pineapple”, or “OG Kush”…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div style={{ marginTop: 20 }}>
          <Label>Type</Label>
          <ChipRow>
            {(['all', 'indica', 'sativa', 'hybrid'] as const).map((t) => (
              <Chip
                key={t}
                on={typeFilter === t}
                onClick={() => setTypeFilter(t)}
                ariaPressed={typeFilter === t}
              >
                {t === 'all' ? 'All' : TYPE_LABELS[t]}
              </Chip>
            ))}
          </ChipRow>
        </div>

        <div className="field-row" style={{ marginTop: 20 }}>
          <div>
            <label htmlFor="effectFilter">Feeling</label>
            <select
              id="effectFilter"
              value={effectFilter}
              onChange={(e) => setEffectFilter(e.target.value)}
            >
              <option value="all">All feelings</option>
              {EFFECT_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="terpeneFilter">Terpene</label>
            <select
              id="terpeneFilter"
              value={terpeneFilter}
              onChange={(e) => setTerpeneFilter(e.target.value)}
            >
              <option value="all">All terpenes</option>
              {TERPENE_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <Label>What is the vibe tonight?</Label>
          <ChipRow>
            {MOODS.map((m) => (
              <Chip
                key={m}
                on={mood === m}
                onClick={() => setMood(mood === m ? null : m)}
                ariaPressed={mood === m}
              >
                {MOOD_LABELS[m]}
              </Chip>
            ))}
          </ChipRow>
        </div>

        <ChipRow style={{ marginTop: 20 }}>
          <Chip on={favsOnly} onClick={() => setFavsOnly((v) => !v)} ariaPressed={favsOnly}>
            ★ Favorites only {favs.length > 0 ? `(${favs.length})` : ''}
          </Chip>
          <Chip onClick={clearFilters}>Clear filters</Chip>
        </ChipRow>
      </section>

      {compareStrains.length >= 2 && (
        <section className="card" aria-label="Strain comparison">
          <h2 className="tool-title">Side by side</h2>
          <div className="result-box" style={{ overflowX: 'auto', padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 12 }}> </th>
                  {compareStrains.map((s) => (
                    <th key={s.id} style={{ textAlign: 'left', padding: 12 }}>
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: 12, fontWeight: 700 }}>Type</td>
                  {compareStrains.map((s) => (
                    <td key={s.id} style={{ padding: 12 }}>
                      {TYPE_LABELS[s.type]}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: 12, fontWeight: 700 }}>THC</td>
                  {compareStrains.map((s) => (
                    <td key={s.id} style={{ padding: 12 }}>
                      {s.thcMin}–{s.thcMax}%
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: 12, fontWeight: 700 }}>Top feelings</td>
                  {compareStrains.map((s) => (
                    <td key={s.id} style={{ padding: 12 }}>
                      {s.effects
                        .slice()
                        .sort((a, b) => b.level - a.level)
                        .slice(0, 3)
                        .map((e) => `${e.name} ${e.level}/5`)
                        .join(', ')}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: 12, fontWeight: 700 }}>Top terpenes</td>
                  {compareStrains.map((s) => (
                    <td key={s.id} style={{ padding: 12 }}>
                      {s.terpenes.map((t) => t.name).join(', ')}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: 12, marginBottom: 0 }}>
            <button className="btn ghost" onClick={() => setCompareIds([])}>
              Clear comparison
            </button>
          </p>
        </section>
      )}

      <p className="muted small">
        Showing {filtered.length} of {STRAINS.length} strains
        {compareIds.length > 0 && compareIds.length < 2
          ? ` · ${compareIds.length} picked to compare — pick ${2 - compareIds.length} more`
          : ''}
      </p>

      {filtered.length === 0 ? (
        <section className="card">
          <p style={{ marginBottom: 0 }}>
            Nothing matches that combo — try clearing a filter or two. 🌿
          </p>
        </section>
      ) : (
        filtered.map((strain) => (
          <StrainCard
            key={strain.id}
            strain={strain}
            isFav={favs.includes(strain.id)}
            onToggleFav={() => toggleFav(strain.id)}
            inCompare={compareIds.includes(strain.id)}
            compareDisabled={!compareIds.includes(strain.id) && compareIds.length >= 3}
            onToggleCompare={() => toggleCompare(strain.id)}
            onAskAbout={onAskAbout}
          />
        ))
      )}

      <p className="muted small">
        Heads up: how a strain feels depends on the batch, how much you take, and you — so take any
        description here as a rough guide, not a promise. 21+ only, and never drive high.
      </p>
    </main>
  );
}
