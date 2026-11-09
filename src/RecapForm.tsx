// Stoner Bud-E — save a recap of tonight's session.
// A recap is a journal entry with a `feel` (how the dose landed), so it
// saves and syncs exactly like a Log entry — same list, same sync, no new
// table. Pre-filled from tonight's session; the strain field offers
// "your usuals" (strains from past recaps) first.

import { useState } from 'react';
import { METHOD_LABELS } from './bude';
import type { Method, Session } from './bude';
import { FEEL_LABELS, newEntryId } from './journal';
import type { JournalEntry, RecapFeel } from './journal';
import { Chip, ChipRow, Label } from './bits';

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const FEEL_ORDER: RecapFeel[] = ['too-little', 'just-right', 'too-much'];

/**
 * The 1–5 rating the Log keeps is derived from the feel, so a recap still
 * shows stars like any other entry: just right is a great night, too
 * little or too much is a middling one. The real signal lives in `feel`.
 */
function ratingForFeel(feel: RecapFeel): number {
  if (feel === 'just-right') return 5;
  if (feel === 'too-little') return 3;
  return 2;
}

export default function RecapForm(props: {
  session: Session;
  usualStrains: string[];
  onSave: (entry: JournalEntry) => void;
  onCancel: () => void;
}) {
  const { session, usualStrains, onSave, onCancel } = props;

  const [method, setMethod] = useState<Method>(session.method);
  const [amount, setAmount] = useState(session.amount);
  const [unit, setUnit] = useState<'mg' | 'g'>(session.unit);
  const [strain, setStrain] = useState('');
  const [feel, setFeel] = useState<RecapFeel>('just-right');
  const [worked, setWorked] = useState('');
  const [dateVal, setDateVal] = useState(todayLocal());
  const [error, setError] = useState('');

  function save(): void {
    const amt = amount.trim();
    if (!amt || Number.isNaN(Number(amt)) || Number(amt) <= 0) {
      setError('Add an amount first — like 10mg or 0.5g.');
      return;
    }
    onSave({
      id: newEntryId(),
      date: new Date(`${dateVal}T12:00:00`).toISOString(),
      method,
      strain: strain.trim(),
      amount: amt,
      unit,
      rating: ratingForFeel(feel),
      note: worked.trim(),
      change: '',
      feel,
    });
  }

  return (
    <section className="card" aria-label="Save a recap">
      <h2 style={{ marginBottom: 0 }}>Save a recap</h2>
      <p className="muted small" style={{ marginTop: 8 }}>
        What you took, how it felt, what worked. Bud-E remembers the usuals,
        so next time it can fill the dose in for you.
      </p>

      <label htmlFor="recap-date">Date</label>
      <input
        id="recap-date"
        type="date"
        value={dateVal}
        onChange={(e) => setDateVal(e.target.value)}
      />

      <div style={{ marginTop: 20 }}>
        <Label>What did you take?</Label>
        <ChipRow>
          {(Object.keys(METHOD_LABELS) as Method[]).map((m) => (
            <Chip key={m} on={method === m} onClick={() => setMethod(m)}>
              {METHOD_LABELS[m]}
            </Chip>
          ))}
        </ChipRow>
      </div>

      <div className="field-row" style={{ marginTop: 20 }}>
        <div className="grow-2">
          <label htmlFor="recap-amount">How much</label>
          <input
            id="recap-amount"
            type="text"
            inputMode="decimal"
            placeholder="10"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <Label>Unit</Label>
          <div className="unit-toggle">
            {(['mg', 'g'] as const).map((u) => (
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

      <div style={{ marginTop: 20 }}>
        <label htmlFor="recap-strain">Strain or product</label>
        <input
          id="recap-strain"
          type="text"
          placeholder="e.g. Blue Dream"
          value={strain}
          onChange={(e) => setStrain(e.target.value)}
        />
        {usualStrains.length > 0 && (
          <>
            <p className="muted small" style={{ margin: '8px 0 4px' }}>
              Your usuals:
            </p>
            <ChipRow>
              {usualStrains.map((s) => (
                <Chip key={s} on={strain === s} onClick={() => setStrain(s)}>
                  {s}
                </Chip>
              ))}
            </ChipRow>
          </>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <Label>How did it feel?</Label>
        <ChipRow>
          {FEEL_ORDER.map((f) => (
            <Chip key={f} on={feel === f} onClick={() => setFeel(f)}>
              {FEEL_LABELS[f]}
            </Chip>
          ))}
        </ChipRow>
      </div>

      <label htmlFor="recap-worked">What worked? (a few words, optional)</label>
      <textarea
        id="recap-worked"
        placeholder="e.g. Perfect for movies, super chill"
        value={worked}
        onChange={(e) => setWorked(e.target.value)}
      />

      {error !== '' && <p>{error}</p>}

      <div className="button-row">
        <button type="button" className="btn" onClick={save} style={{ flex: 1 }}>
          Save recap
        </button>
        <button type="button" className="btn secondary" onClick={onCancel}>
          Not now
        </button>
      </div>
    </section>
  );
}
