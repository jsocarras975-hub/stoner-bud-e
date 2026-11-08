// Stoner Bud-E — Tonight tab: tonight's session at a glance, Grok layout.
// Session editing lives here now (Grok's Logger): method / amount / when /
// experience chips in a card. The Chat tab shows a compact pill instead.

import { useEffect, useState } from 'react';
import { METHOD_LABELS, formatClock, minutesSinceTaken, parseClock } from './bude';
import type { Method, Session } from './bude';
import { Chip, ChipRow, Label, PageHead } from './bits';

const EXPERIENCE_LABELS: Record<Session['experience'], string> = {
  new: 'New — just starting out',
  some: 'Some experience',
  experienced: 'Experienced — I know my dose',
};

const EXPERIENCE_SHORT: Record<Session['experience'], string> = {
  new: 'New',
  some: 'Some',
  experienced: 'Experienced',
};

function timeline(session: Session): { label: string; detail: string }[] {
  const inhaled = session.method === 'flower' || session.method === 'vape' || session.method === 'dab';
  if (inhaled) {
    return [
      { label: 'Lands', detail: 'Flower and vapes usually land in 5–15 minutes.' },
      { label: 'Peak', detail: 'Strongest around 30 minutes in.' },
      { label: 'Eases off', detail: 'Usually lasts 1–3 hours.' },
    ];
  }
  return [
    { label: 'Onset', detail: 'Edibles are quiet at first. Most people feel them around 45–90 minutes.' },
    { label: 'Peak', detail: 'Strongest 2–4 hours after taking it.' },
    { label: 'Eases off', detail: 'Usually lasts 4–8 hours, sometimes up to 12.' },
  ];
}

function activePhase(session: Session, since: number | null): number | null {
  if (since === null) return null;
  const inhaled = session.method === 'flower' || session.method === 'vape' || session.method === 'dab';
  if (inhaled) return since < 15 ? 0 : since < 60 ? 1 : 2;
  return since < 90 ? 0 : since < 240 ? 1 : 2;
}

/** Current clock as "HH:MM" for the "Just now" time chip. */
function clockNow(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function TonightTab(props: {
  session: Session;
  setSession: (s: Session) => void;
  vibe: Vibe;
  timerStatus: string;
  onChat: () => void;
  onTools: () => void;
}) {
  const { session, setSession, vibe, timerStatus, onChat, onTools } = props;
  const [, setNow] = useState(Date.now());
  // Open on the logger when no dose is logged yet (Grok: editing when no session).
  const [editing, setEditing] = useState(session.amount.trim() === '');

  // Refresh the "how long ago" line every minute.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const since = minutesSinceTaken(session);
  const taken = parseClock(session.timeTaken);
  const amount = session.amount.trim();
  const phases = timeline(session);
  const active = activePhase(session, since);

  const agoText =
    since === null || taken === null
      ? 'No time logged yet'
      : since === 0
        ? `${formatClock(taken)} · just now`
        : `${formatClock(taken)} · ${since < 60 ? `${since} min ago` : `${Math.floor(since / 60)}h ${since % 60}m ago`}`;

  const status =
    since === null
      ? 'Add the time you took it and Bud-E will mark where you are.'
      : session.method === 'edible' || session.method === 'drink'
        ? since < 90
          ? 'Still early — edibles are quiet at first. Give it the full 2 hours before even thinking about more.'
          : since < 240
            ? 'Right in the peak window. Sip some water and ride it out.'
            : "Past the peak and on the way down. Feeling mellow or sleepy for a while longer is normal."
        : since < 15
          ? 'Just landed or about to — one or two small hits, then wait 15 minutes.'
          : 'You are in it now. Drink some water, settle in.';

  const inhaled = session.method === 'flower' || session.method === 'vape' || session.method === 'dab';
  const waitLabel = inhaled ? 'Wait 15 minutes between hits' : 'Wait the full 2 hours';
  const waitMinutes = inhaled ? 15 : 120;

  return (
    <main>
      <PageHead title="Tonight" sub="Log the real dose. Bud-E will time it and stop guessing." />

      {editing ? (
        <Logger
          initial={session}
          onDone={() => setEditing(false)}
          onCancel={amount !== '' ? () => setEditing(false) : undefined}
          onSave={setSession}
        />
      ) : (
        <section className="card" aria-label="Tonight's session at a glance">
          <p className="eyebrow">{METHOD_LABELS[session.method]}</p>
          <p className="tonight-big">
            {amount ? `${amount}${session.unit}` : 'No dose logged yet'}
          </p>
          <p className="muted">{EXPERIENCE_LABELS[session.experience]}</p>
          <p>{agoText}</p>
          <p className="muted">{status}</p>
          <div className="button-row" style={{ marginTop: 12 }}>
            <button className="btn sm secondary" onClick={() => setEditing(true)}>
              ✏️ Edit
            </button>
            <button className="btn sm" onClick={onChat}>
              💬 Ask Bud-E
            </button>
            <button className="btn sm secondary" onClick={onTools}>
              ⏱️ Open the timer
            </button>
          </div>
        </section>
      )}

      <section className="card" aria-label="How this usually goes">
        <h2>How this usually goes</h2>
        <ol className="timeline">
          {phases.map((phase, i) => (
            <li key={phase.label} className={i === active ? 'active' : ''}>
              <span className="dot" aria-hidden />
              <span>
                <span className="phase-label" style={{ fontWeight: 700 }}>
                  {phase.label}
                </span>
                <span className="muted" style={{ display: 'block' }}>
                  {phase.detail}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <button className="btn btn-block" onClick={onTools}>
        {waitLabel} · {waitMinutes} min
      </button>

      <ul style={{ marginTop: 16, listStyle: 'none', padding: 0 }} className="muted small">
        <li>Start low, go slow.</li>
        <li>Never drive high.</li>
        <li>If a pet eats an edible, call a vet.</li>
      </ul>

      <p className="muted small" style={{ marginTop: 12 }}>
        Tonight: {vibe.setting} vibes, {vibe.sound} on, craving {vibe.snack}, feeling {vibe.energy}. · ⏱️{' '}
        {timerStatus}
      </p>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Session logger (Grok's Logger) — chips for every field, same fields as the
// old session panel: method, amount, unit, time taken, experience.
// ---------------------------------------------------------------------------

function Logger({
  initial,
  onDone,
  onCancel,
  onSave,
}: {
  initial: Session;
  onDone: () => void;
  onCancel?: () => void;
  onSave: (s: Session) => void;
}) {
  const [method, setMethod] = useState<Method>(initial.method);
  const [amount, setAmount] = useState(initial.amount);
  const [unit, setUnit] = useState<Session['unit']>(initial.unit);
  const [timeMode, setTimeMode] = useState<'now' | 'pick' | 'unsure'>(
    initial.timeTaken ? 'pick' : 'unsure',
  );
  const [timeTaken, setTimeTaken] = useState(initial.timeTaken || clockNow());
  const [experience, setExperience] = useState<Session['experience']>(initial.experience);

  function chooseMethod(next: Method): void {
    setMethod(next);
    setUnit(next === 'flower' ? 'g' : 'mg');
  }

  function save(): void {
    onSave({
      method,
      amount: amount.trim(),
      unit,
      timeTaken: timeMode === 'unsure' ? '' : timeMode === 'now' ? clockNow() : timeTaken,
      experience,
    });
    onDone();
  }

  const presets =
    unit === 'g'
      ? ['0.25', '0.5', '1']
      : method === 'flower' || method === 'vape' || method === 'dab'
        ? ['1', '2', '3']
        : ['2.5', '5', '10'];

  return (
    <section className="card" aria-label="Log tonight's session">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <Label>What did you take?</Label>
          <ChipRow>
            {(Object.keys(METHOD_LABELS) as Method[]).map((id) => (
              <Chip key={id} on={method === id} onClick={() => chooseMethod(id)}>
                {METHOD_LABELS[id]}
              </Chip>
            ))}
          </ChipRow>
        </div>

        <div>
          <Label>How much?</Label>
          <ChipRow>
            {presets.map((p) => (
              <Chip key={p} on={amount === p} onClick={() => setAmount(p)}>
                {p}
                {unit}
              </Chip>
            ))}
          </ChipRow>
          <div className="field-row" style={{ marginTop: 12 }}>
            <input
              aria-label="Amount"
              inputMode="decimal"
              value={amount}
              placeholder={unit === 'g' ? '0.5' : '5'}
              onChange={(e) => setAmount(e.target.value)}
            />
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

        <div>
          <Label>When?</Label>
          <ChipRow>
            <Chip on={timeMode === 'now'} onClick={() => setTimeMode('now')}>
              Just now
            </Chip>
            <Chip on={timeMode === 'pick'} onClick={() => setTimeMode('pick')}>
              Pick a time
            </Chip>
            <Chip on={timeMode === 'unsure'} onClick={() => setTimeMode('unsure')}>
              Not sure
            </Chip>
          </ChipRow>
          {timeMode === 'pick' && (
            <input
              aria-label="Time taken"
              type="time"
              value={timeTaken}
              onChange={(e) => setTimeTaken(e.target.value)}
              style={{ marginTop: 12 }}
            />
          )}
        </div>

        <div>
          <Label>Experience</Label>
          <ChipRow>
            {(Object.keys(EXPERIENCE_SHORT) as Session['experience'][]).map((id) => (
              <Chip key={id} on={experience === id} onClick={() => setExperience(id)}>
                {EXPERIENCE_SHORT[id]}
              </Chip>
            ))}
          </ChipRow>
        </div>

        <div className="button-row">
          <button className="btn" onClick={save} style={{ flex: 1 }}>
            Log this
          </button>
          {onCancel && (
            <button className="btn secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

interface Vibe {
  setting: string;
  sound: string;
  snack: string;
  energy: string;
}
