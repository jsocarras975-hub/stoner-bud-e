// Stoner Bud-E — Stash Tracker tab.
// Keep track of what you have on hand and get a heads-up when you're
// running low. Plain words, no selling, no sourcing talk.

import { useEffect, useState } from 'react';
import { newStashId } from './stash';
import type { StashForm, StashItem } from './stash';
import { Chip, ChipRow, Label, PageHead } from './bits';

const FORM_LABELS: Record<StashForm, string> = {
  flower: 'Flower',
  edible: 'Edible',
  vape: 'Vape',
  dab: 'Dab',
  drink: 'Drink',
  other: 'Other',
};

type StashUnit = 'g' | 'mg' | 'pieces';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Grok jar card: name + big amount on top, stepper row below, Save / Delete.
function StashRow(props: {
  item: StashItem;
  onUpdate: (item: StashItem) => void;
  onDelete: (id: string) => void;
}) {
  const { item, onUpdate, onDelete } = props;
  const [draft, setDraft] = useState(String(item.amount));
  const [confirmDelete, setConfirmDelete] = useState(false);

  // If the amount changes somewhere else (like a journal entry taking
  // some out), refresh what the input shows.
  useEffect(() => {
    setDraft(String(item.amount));
  }, [item.amount]);

  const step = item.unit === 'g' ? 0.5 : item.unit === 'mg' ? 5 : 1;

  function bump(delta: number): void {
    onUpdate({ ...item, amount: Math.max(0, round2(item.amount + delta)) });
  }

  function saveDraft(): void {
    const n = Number(draft);
    if (Number.isNaN(n) || n < 0) return;
    onUpdate({ ...item, amount: round2(n) });
  }

  const runningLow = item.amount <= item.lowAt;

  return (
    <article className="jar-card" aria-label={item.name}>
      <div className="jar-card-head">
        <div>
          <p className="jar-card-name">{item.name}</p>
          <p className="jar-card-sub">
            {FORM_LABELS[item.form]}
            {item.thcPct.trim() !== '' && ` · ${item.thcPct.trim()}% THC`}
            {item.lowAt > 0 && ` · warns under ${item.lowAt}${item.unit}`}
          </p>
        </div>
        <p className="jar-card-amount">
          {item.amount}
          {item.unit}
        </p>
      </div>
      {runningLow && <p style={{ margin: '8px 0 0' }}>⚠️ Running low!</p>}
      <div className="jar-stepper">
        <button
          type="button"
          className="jar-step-btn"
          aria-label={`Take ${step}${item.unit} out of ${item.name}`}
          onClick={() => bump(-step)}
          disabled={item.amount <= 0}
        >
          −
        </button>
        <input
          type="text"
          inputMode="decimal"
          aria-label={`Amount of ${item.name}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="button"
          className="jar-step-btn"
          aria-label={`Add ${step}${item.unit} to ${item.name}`}
          onClick={() => bump(step)}
        >
          +
        </button>
        <button
          type="button"
          className="jar-step-btn accent"
          aria-label={`Save amount of ${item.name}`}
          onClick={saveDraft}
        >
          ✓
        </button>
      </div>
      <div style={{ marginTop: 8 }}>
        {confirmDelete ? (
          <div className="button-row">
            <button type="button" className="btn danger sm" onClick={() => onDelete(item.id)}>
              Delete this jar
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
          </div>
        ) : (
          <button type="button" className="btn ghost sm" onClick={() => setConfirmDelete(true)}>
            Delete jar
          </button>
        )}
      </div>
    </article>
  );
}
export default function StashTab(props: {
  items: StashItem[];
  onChange: (items: StashItem[]) => void;
  /** Called when an item is deleted, so the delete can sync (tombstone). */
  onDelete?: (id: string) => void;
}) {
  const { items, onChange, onDelete } = props;

  const [name, setName] = useState('');
  const [form, setForm] = useState<StashForm>('flower');
  const [amountStr, setAmountStr] = useState('');
  const [unit, setUnit] = useState<StashUnit>('g');
  const [thcPct, setThcPct] = useState('');
  const [lowAtStr, setLowAtStr] = useState('');
  const [error, setError] = useState('');

  function addItem(): void {
    const amt = Number(amountStr);
    if (!name.trim()) {
      setError('Give it a name first — like the strain or product name.');
      return;
    }
    if (!amountStr.trim() || Number.isNaN(amt) || amt <= 0) {
      setError('Add how much you have.');
      return;
    }
    const low = Number(lowAtStr);
    const item: StashItem = {
      id: newStashId(),
      name: name.trim(),
      form,
      amount: round2(amt),
      unit,
      thcPct: thcPct.trim(),
      lowAt: lowAtStr.trim() === '' || Number.isNaN(low) || low < 0 ? 0 : round2(low),
    };
    onChange([...items, item]);
    setName('');
    setAmountStr('');
    setThcPct('');
    setLowAtStr('');
    setError('');
  }

  function updateItem(updated: StashItem): void {
    onChange(items.map((i) => (i.id === updated.id ? updated : i)));
  }

  function deleteItem(id: string): void {
    onDelete?.(id);
    onChange(items.filter((i) => i.id !== id));
  }

  return (
    <main>
      <PageHead title="Stash" sub="What's on hand. Just for you — it stays on this device." />
      <section className="card" aria-label="Add to stash">
        <h2>Add to stash</h2>

        <label htmlFor="stash-name">Name / strain</label>
        <input
          id="stash-name"
          type="text"
          placeholder="e.g. Blue Dream"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div style={{ marginTop: 20 }}>
          <Label>What kind</Label>
          <ChipRow>
            {(Object.keys(FORM_LABELS) as StashForm[]).map((f) => (
              <Chip key={f} on={form === f} onClick={() => setForm(f)}>
                {FORM_LABELS[f]}
              </Chip>
            ))}
          </ChipRow>
        </div>

        <div className="field-row" style={{ marginTop: 20 }}>
          <div className="grow-2">
            <label htmlFor="stash-amount">How much</label>
            <input
              id="stash-amount"
              type="text"
              inputMode="decimal"
              placeholder="7"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
            />
          </div>
          <div>
            <Label>Unit</Label>
            <div className="unit-toggle">
              {(['g', 'mg', 'pieces'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  aria-pressed={unit === u}
                  className={unit === u ? 'on' : ''}
                  onClick={() => setUnit(u)}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label htmlFor="stash-thc" style={{ marginTop: 20 }}>
          THC % (optional)
        </label>
        <input
          id="stash-thc"
          type="text"
          inputMode="decimal"
          placeholder="e.g. 22"
          value={thcPct}
          onChange={(e) => setThcPct(e.target.value)}
        />

        <label htmlFor="stash-low">Warn me when under… ({unit})</label>
        <input
          id="stash-low"
          type="text"
          inputMode="decimal"
          placeholder="e.g. 3.5"
          value={lowAtStr}
          onChange={(e) => setLowAtStr(e.target.value)}
        />

        {error !== '' && <p>{error}</p>}

        <p>
          <button type="button" className="btn btn-block" onClick={addItem}>
            Add to stash
          </button>
        </p>
      </section>

      <section aria-label="Your stash">
        <h2 style={{ marginBottom: 12 }}>Your stash</h2>
        {items.length === 0 ? (
          <p className="muted">Nothing in the stash yet. Add your first item above.</p>
        ) : (
          items.map((item) => (
            <StashRow key={item.id} item={item} onUpdate={updateItem} onDelete={deleteItem} />
          ))
        )}
      </section>
    </main>
  );
}
