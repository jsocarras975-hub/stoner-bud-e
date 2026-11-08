import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Chip, ChipRow, Label, PageHead } from './bits';

// Tolerance Break Tracker — everything stays on this device in localStorage.
// Plain words, 21+, harm reduction. No medical advice, no diagnosis.

const STORAGE_KEY = 'bude-break-v1';

const LENGTH_CHOICES = [7, 14, 21, 30] as const;

const MOODS = ['Great', 'Okay', 'Rough', 'Craving hard'] as const;

type BreakStatus = 'active' | 'done' | 'ended';

interface Checkin {
  date: string; // ISO date, "YYYY-MM-DD"
  mood: string;
  cravings: number; // 1–5
  note: string;
}

interface BreakRecord {
  startDate: string; // ISO date, "YYYY-MM-DD"
  lengthDays: number;
  checkins: Checkin[];
  status: BreakStatus;
}

/** Today's date as a local "YYYY-MM-DD" string (not UTC, so the day matches the user's clock). */
function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse a "YYYY-MM-DD" string as a local midnight date. */
function parseISODate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Whole calendar days between two ISO dates (end - start). */
function daysBetween(startISO: string, endISO: string): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((parseISODate(endISO).getTime() - parseISODate(startISO).getTime()) / msPerDay);
}

/** ISO date N days after a given ISO date. */
function addDaysISO(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** "Nov 8, 2026" style date for display. */
function prettyDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function loadBreak(): BreakRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Partial<BreakRecord>;
    if (typeof record.startDate !== 'string' || typeof record.lengthDays !== 'number') return null;
    return {
      startDate: record.startDate,
      lengthDays: record.lengthDays,
      checkins: Array.isArray(record.checkins) ? (record.checkins as Checkin[]) : [],
      status: record.status === 'done' || record.status === 'ended' ? record.status : 'active',
    };
  } catch {
    return null;
  }
}

function ComingBackAdvice(): ReactElement {
  return (
    <div className="result-box">
      <h3>Coming back? Go slow.</h3>
      <p>
        Your tolerance dropped during the break, so your first session back will hit harder than
        you remember. Start at <strong>half your usual dose</strong> — if you normally take
        10&nbsp;mg, start at 5&nbsp;mg.
      </p>
      <p>
        Wait the full time before taking more (2 hours for edibles and drinks, 15 minutes for
        flower, vape, and dabs). You can always take more later — you can&apos;t take less.
      </p>
      <p className="muted small">
        Pick a chill setting for that first session back, have water nearby, and don&apos;t drive.
      </p>
    </div>
  );
}

export default function BreakTab(): ReactElement {
  const [breakRecord, setBreakRecord] = useState<BreakRecord | null>(() => loadBreak());
  const [lengthDays, setLengthDays] = useState<number>(14);
  const [customDays, setCustomDays] = useState<string>('');
  const [mood, setMood] = useState<string>('Okay');
  const [cravings, setCravings] = useState<number>(3);
  const [note, setNote] = useState<string>('');
  const [savedMessage, setSavedMessage] = useState<string>('');

  // Keep the stored break in sync whenever it changes.
  useEffect(() => {
    try {
      if (breakRecord === null) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(breakRecord));
      }
    } catch {
      // Storage full or blocked — the break still works for this session.
    }
  }, [breakRecord]);

  const today = todayISO();
  const todaysCheckin =
    breakRecord?.checkins.find((c) => c.date === today) ?? null;

  // When the break changes (or a new day rolls around), prefill the
  // check-in form from today's saved check-in, or reset it to a blank one.
  useEffect(() => {
    if (todaysCheckin) {
      setMood(todaysCheckin.mood);
      setCravings(todaysCheckin.cravings);
      setNote(todaysCheckin.note);
    } else {
      setMood('Okay');
      setCravings(3);
      setNote('');
    }
    setSavedMessage('');
    // Only re-run when the break or the day changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakRecord, today]);

  const elapsed = breakRecord ? daysBetween(breakRecord.startDate, today) : 0;
  const daysRemaining =
    breakRecord && breakRecord.status === 'active'
      ? Math.max(0, breakRecord.lengthDays - elapsed)
      : 0;
  const dayNumber = breakRecord ? Math.min(elapsed + 1, breakRecord.lengthDays) : 0;
  const isComplete =
    breakRecord !== null && breakRecord.status === 'active' && daysRemaining <= 0;
  const isActive = breakRecord !== null && breakRecord.status === 'active' && !isComplete;

  function startBreak(): void {
    const days = customDays.trim() !== '' ? Number(customDays) : lengthDays;
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      window.alert('Pick a break length between 1 and 90 days.');
      return;
    }
    if (breakRecord !== null && breakRecord.status === 'active') {
      const ok = window.confirm(
        'You already have a break going. Starting a new one will replace it and its check-ins. Sure?',
      );
      if (!ok) return;
    }
    setBreakRecord({
      startDate: today,
      lengthDays: days,
      checkins: [],
      status: 'active',
    });
    setCustomDays('');
  }

  function saveCheckin(): void {
    if (!breakRecord) return;
    const entry: Checkin = { date: today, mood, cravings, note: note.trim() };
    const others = breakRecord.checkins.filter((c) => c.date !== today);
    setBreakRecord({ ...breakRecord, checkins: [...others, entry] });
    setSavedMessage(
      todaysCheckin ? 'Updated your check-in for today.' : 'Check-in saved. Nice work.',
    );
  }

  function endBreakEarly(): void {
    if (!breakRecord) return;
    const ok = window.confirm(
      'End your break early? That is totally fine — any break helps. You will see the coming-back tips next.',
    );
    if (!ok) return;
    setBreakRecord({ ...breakRecord, status: 'ended' });
  }

  function clearBreak(): void {
    setBreakRecord(null);
    setCustomDays('');
  }

  function markDone(): void {
    if (!breakRecord) return;
    setBreakRecord({ ...breakRecord, status: 'done' });
  }

  const pastCheckins = [...(breakRecord?.checkins ?? [])].sort((a, b) =>
    b.date.localeCompare(a.date),
  );

  // -- Finished or ended break -------------------------------------------------
  if (breakRecord !== null && (breakRecord.status === 'done' || breakRecord.status === 'ended')) {
    return (
      <main>
        <PageHead
          title="Break"
          sub="A few days off helps a little — a week or two resets things a lot more."
        />
        <div className="card">
          <h2>{breakRecord.status === 'done' ? 'Break complete!' : 'Break ended'}</h2>
          <p>
            {breakRecord.status === 'done'
              ? `You did all ${breakRecord.lengthDays} days — from ${prettyDate(breakRecord.startDate)}. That takes real willpower.`
              : `You made it ${Math.max(0, elapsed)} day${Math.max(0, elapsed) === 1 ? '' : 's'} of ${breakRecord.lengthDays}. Any break helps — that still counts.`}
          </p>
          <p className="muted small">
            {breakRecord.checkins.length} check-in
            {breakRecord.checkins.length === 1 ? '' : 's'} saved on this break.
          </p>
        </div>
        <div className="card">
          <ComingBackAdvice />
        </div>
        <button type="button" className="btn btn-block" onClick={clearBreak}>
          Start a new break
        </button>
      </main>
    );
  }

  // -- Break just hit day zero (still marked active) ---------------------------
  if (isComplete && breakRecord !== null) {
    return (
      <main>
        <PageHead
          title="Break"
          sub="A few days off helps a little — a week or two resets things a lot more."
        />
        <div className="card">
          <h2>Break complete!</h2>
          <p className="score-big">
            {breakRecord.lengthDays} / {breakRecord.lengthDays} days
          </p>
          <p>
            You did all {breakRecord.lengthDays} days — from {prettyDate(breakRecord.startDate)}{' '}
            to {prettyDate(today)}. That takes real willpower.
          </p>
        </div>
        <div className="card">
          <ComingBackAdvice />
        </div>
        <button type="button" className="btn btn-block" onClick={markDone}>
          Done — clear this break
        </button>
      </main>
    );
  }

  // -- Active break ------------------------------------------------------------
  if (isActive && breakRecord !== null) {
    return (
      <main>
        <PageHead
          title="Break"
          sub="A few days off helps a little — a week or two resets things a lot more."
        />
        <div className="card">
          <h2>Your break</h2>
          <p className="timer-big">
            {daysRemaining} day{daysRemaining === 1 ? '' : 's'} to go
          </p>
          <p className="plan-sentence">
            Day {dayNumber} of {breakRecord.lengthDays} — {daysRemaining} to go
          </p>
          <p className="muted small">
            Started {prettyDate(breakRecord.startDate)} · ends{' '}
            {prettyDate(addDaysISO(breakRecord.startDate, breakRecord.lengthDays))}
          </p>
          <p className="muted small">
            Cravings come in waves and pass. Drink some water, go for a walk, or text a friend —
            you&apos;ve already made it this far.
          </p>
        </div>

        <div className="card">
          <h2>Today&apos;s check-in</h2>
          {todaysCheckin && (
            <p className="muted small">
              You already checked in today — you can change anything below and save again.
            </p>
          )}
          <Label>How are you feeling today?</Label>
          <ChipRow>
            {MOODS.map((m) => (
              <Chip key={m} on={mood === m} onClick={() => setMood(m)}>
                {m}
              </Chip>
            ))}
          </ChipRow>

          <Label>Cravings (1 = barely there, 5 = really strong)</Label>
          <ChipRow>
            {[1, 2, 3, 4, 5].map((n) => (
              <Chip key={n} on={cravings === n} onClick={() => setCravings(n)}>
                {n}
              </Chip>
            ))}
          </ChipRow>

          <label htmlFor="break-note">Note (optional)</label>
          <textarea
            id="break-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything on your mind? What helped today?"
          />

          <div>
            <button type="button" className="btn btn-block" onClick={saveCheckin}>
              {todaysCheckin ? 'Update check-in' : 'Save check-in'}
            </button>
          </div>
          {savedMessage !== '' && <p className="muted small">{savedMessage}</p>}
        </div>

        {pastCheckins.length > 0 && (
          <div className="card">
            <h2>Past check-ins</h2>
            {pastCheckins.map((c) => (
              <div key={c.date} className="result-box">
                <p>
                  <strong>{prettyDate(c.date)}</strong>
                  {c.date === today ? ' (today)' : ''} — {c.mood} · Cravings {c.cravings}/5
                </p>
                {c.note !== '' && <p className="muted small">{c.note}</p>}
              </div>
            ))}
          </div>
        )}

        <button type="button" className="btn danger btn-block" onClick={endBreakEarly}>
          End break early
        </button>
        <p className="muted small">
          Ending early is fine — any break helps. You&apos;ll still get the coming-back tips.
        </p>
      </main>
    );
  }

  // -- No break yet: start one -------------------------------------------------
  return (
    <main>
      <PageHead
        title="Break"
        sub="A few days off helps a little — a week or two resets things a lot more."
      />
      <div className="card">
        <h2>Take a tolerance break</h2>
        <p>
          Same amount, less magic? That&apos;s tolerance. Even a few days off helps a little — a
          week or two resets things a lot more. Pick a length and Bud-E will keep count for you.
        </p>
        <p className="muted small">
          Everything is saved only on this device. No account, no sharing.
        </p>
        <Label>How long?</Label>
        <ChipRow>
          {LENGTH_CHOICES.map((days) => (
            <Chip
              key={days}
              on={lengthDays === days && customDays.trim() === ''}
              onClick={() => {
                setLengthDays(days);
                setCustomDays('');
              }}
            >
              {days} days
            </Chip>
          ))}
        </ChipRow>
        <label htmlFor="break-custom">Or a custom number of days (1–90)</label>
        <div className="field-row">
          <input
            id="break-custom"
            type="number"
            min={1}
            max={90}
            inputMode="numeric"
            value={customDays}
            onChange={(e) => setCustomDays(e.target.value)}
            placeholder="e.g. 10"
          />
        </div>
        <div>
          <button type="button" className="btn btn-block" onClick={startBreak}>
            Start my break
          </button>
        </div>
      </div>
      <div className="card">
        <h2>What to expect</h2>
        <p>
          The first few days are usually the hardest — cravings, restless sleep, and feeling a
          bit off are all normal and they pass. By the end of a week most people feel clearer,
          and their tolerance has dropped a lot.
        </p>
        <p className="muted small">
          If you feel really unwell, that&apos;s a sign to talk to a real doctor — Bud-E
          can&apos;t diagnose anything.
        </p>
      </div>
    </main>
  );
}
