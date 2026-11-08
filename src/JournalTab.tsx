// Stoner Bud-E — Session Journal tab.
// Log tonight's session, see past entries, and optionally take the amount
// out of the stash. Plain words, 21+ tone, no medical claims.

import { useState } from 'react';
import { METHOD_LABELS } from './bude';
import type { Method, Session } from './bude';
import { newEntryId } from './journal';
import type { JournalEntry } from './journal';
import type { StashItem } from './stash';
import { Chip, ChipRow, Label } from './bits';

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function showDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function stars(rating: number): string {
  return '★'.repeat(rating) + '☆'.repeat(Math.max(0, 5 - rating));
}

interface JournalTabProps {
  entries: JournalEntry[];
  onAdd: (e: JournalEntry) => void;
  onDelete: (id: string) => void;
  session: Session;
  stash: StashItem[];
  onDeduct: (stashId: string, amount: number, unit: 'mg' | 'g') => void;
}

export default function JournalTab(props: JournalTabProps) {
  const { entries, onAdd, onDelete, session, stash, onDeduct } = props;

  const [method, setMethod] = useState<Method>(session.method);
  const [amount, setAmount] = useState(session.amount);
  const [unit, setUnit] = useState<'mg' | 'g'>(session.unit);
  const [strain, setStrain] = useState('');
  const [rating, setRating] = useState(3);
  const [note, setNote] = useState('');
  const [change, setChange] = useState('');
  const [dateVal, setDateVal] = useState(todayLocal());
  const [stashId, setStashId] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState('');
  // The form starts open when there is nothing logged yet (Grok Journal).
  const [formOpen, setFormOpen] = useState(entries.length === 0);

  // Only stash items measured the same way as this entry can be used.
  const matchingStash = stash.filter((s) => s.unit === unit);

  function saveEntry(): void {
    const amt = amount.trim();
    if (!amt || Number.isNaN(Number(amt)) || Number(amt) <= 0) {
      setError('Add an amount first — like 10mg or 0.5g.');
      return;
    }
    const entry: JournalEntry = {
      id: newEntryId(),
      date: new Date(`${dateVal}T12:00:00`).toISOString(),
      method,
      strain: strain.trim(),
      amount: amt,
      unit,
      rating,
      note: note.trim(),
      change: change.trim(),
    };
    onAdd(entry);
    if (stashId) onDeduct(stashId, Number(amt), unit);
    setStrain('');
    setNote('');
    setChange('');
    setStashId('');
    setRating(3);
    setDateVal(todayLocal());
    setError('');
  }

  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <main>
      <div className="log-hero">
        <img src="/garden/leaf.jpg" alt="" />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <h1 className="page-title">Log</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            What you took, what worked — just for you.
          </p>
        </div>
        <button type="button" className="btn ghost sm" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? 'Close' : 'Add'}
        </button>
      </div>

      {formOpen && (
        <section className="card" aria-label="Log tonight" style={{ marginTop: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <h2 style={{ marginBottom: 0 }}>Log tonight</h2>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => {
                setMethod(session.method);
                setAmount(session.amount);
                setUnit(session.unit);
              }}
            >
              Use tonight
            </button>
          </div>
          <p className="muted small" style={{ marginTop: 8 }}>
            Jot down what you took so you remember what worked. Just for you — it stays on this device.
          </p>

          <label htmlFor="journal-date">Date</label>
          <input
            id="journal-date"
            type="date"
            value={dateVal}
            onChange={(e) => setDateVal(e.target.value)}
          />

          <div style={{ marginTop: 20 }}>
            <Label>What kind</Label>
            <ChipRow>
              {(Object.keys(METHOD_LABELS) as Method[]).map((m) => (
                <Chip key={m} on={method === m} onClick={() => setMethod(m)}>
                  {METHOD_LABELS[m]}
                </Chip>
              ))}
            </ChipRow>
          </div>

          <label htmlFor="journal-strain">Strain or product</label>
          <input
            id="journal-strain"
            type="text"
            placeholder="e.g. Blue Dream"
            value={strain}
            onChange={(e) => setStrain(e.target.value)}
          />

          <div className="field-row" style={{ marginTop: 20 }}>
            <div className="grow-2">
              <label htmlFor="journal-amount">How much</label>
              <input
                id="journal-amount"
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
                    onClick={() => {
                      setUnit(u);
                      setStashId('');
                    }}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <Label>How was it?</Label>
            <ChipRow>
              {[1, 2, 3, 4, 5].map((n) => (
                <Chip key={n} on={rating === n} onClick={() => setRating(n)} ariaPressed={rating === n}>
                  {n} ★
                </Chip>
              ))}
            </ChipRow>
          </div>

          <label htmlFor="journal-note">How did it feel? (optional)</label>
          <textarea
            id="journal-note"
            placeholder="e.g. Perfect for movies, super chill"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <label htmlFor="journal-change">What would you do different next time? (optional)</label>
          <input
            id="journal-change"
            type="text"
            placeholder="e.g. Take it earlier in the evening"
            value={change}
            onChange={(e) => setChange(e.target.value)}
          />

          <label htmlFor="journal-stash">Took from stash (optional)</label>
          <select
            id="journal-stash"
            value={stashId}
            disabled={matchingStash.length === 0}
            onChange={(e) => setStashId(e.target.value)}
          >
            {matchingStash.length === 0 ? (
              <option value="">No stash in this unit yet.</option>
            ) : (
              <>
                <option value="">Not from stash</option>
                {matchingStash.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.amount}
                    {s.unit} left
                  </option>
                ))}
              </>
            )}
          </select>
          {stashId !== '' && (
            <p className="muted small">
              Saving will take {amount.trim() || '?'}
              {unit} out of that stash item.
            </p>
          )}

          {error !== '' && <p>{error}</p>}

          <p>
            <button type="button" className="btn btn-block" onClick={saveEntry}>
              Save entry
            </button>
          </p>
        </section>
      )}

      <section aria-label="Past sessions" style={{ marginTop: 16 }}>
        <h2 style={{ marginBottom: 12 }}>Past sessions</h2>
        {sorted.length === 0 ? (
          <p className="muted">Nothing logged yet. Your first entry will show up here.</p>
        ) : (
          sorted.map((e) => (
            <article key={e.id} className="card" aria-label={showDate(e.date)}>
              <div
                style={{ cursor: 'pointer' }}
                onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                title="Tap to see more"
              >
                <p className="eyebrow">{showDate(e.date)}</p>
                <p className="strain-name">{e.strain ? e.strain : METHOD_LABELS[e.method]}</p>
                <p style={{ margin: '4px 0 0' }}>
                  {e.amount}
                  {e.unit} · {METHOD_LABELS[e.method]}
                </p>
                <p style={{ margin: '8px 0 0' }}>
                  {stars(e.rating)} <span className="muted small">{e.rating}/5</span>
                </p>
                {e.note && <p className="muted">{e.note}</p>}
                {expandedId === e.id && (
                  <div>
                    {e.note && (
                      <p>
                        <strong>How it felt:</strong> {e.note}
                      </p>
                    )}
                    {e.change ? (
                      <p>
                        <strong>Next time:</strong> {e.change}
                      </p>
                    ) : (
                      <p className="muted small">Nothing noted for next time.</p>
                    )}
                  </div>
                )}
              </div>
              <div style={{ marginTop: 8 }}>
                {confirmDeleteId === e.id ? (
                  <div className="button-row">
                    <button type="button" className="btn danger sm" onClick={() => onDelete(e.id)}>
                      Delete entry
                    </button>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      Keep it
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => setConfirmDeleteId(e.id)}
                    aria-label={`Delete entry from ${showDate(e.date)}`}
                  >
                    🗑 Delete
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
