import { useState } from 'react';
import type { ReactElement } from 'react';
import { Chip, ChipRow, Label, PageHead } from './bits';

// Dose Helper — a plain-words starting-dose calculator. No storage, no
// network, no medical advice. Hard caps: never suggest more than 10 mg as
// a starting edible/drink dose. Start low, go slow.

type Experience = 'new' | 'some' | 'experienced';
type Product = 'edible' | 'flower' | 'vape' | 'dab' | 'drink';

const EXPERIENCE_LABELS: Record<Experience, string> = {
  new: 'New',
  some: 'Some',
  experienced: 'Experienced',
};

const PRODUCT_LABELS: Record<Product, string> = {
  edible: 'Edible',
  flower: 'Flower',
  vape: 'Vape',
  dab: 'Dab',
  drink: 'Drink',
};

/** Suggested starting range (mg) for edibles and drinks, by experience. */
function edibleRange(experience: Experience): { low: number; high: number } {
  if (experience === 'new') return { low: 2.5, high: 5 };
  if (experience === 'some') return { low: 5, high: 10 };
  return { low: 5, high: 10 };
}

function formatMg(value: number): string {
  return Number.isInteger(value) ? `${value}` : `${value}`;
}

export default function DoseTab(): ReactElement {
  const [experience, setExperience] = useState<Experience>('new');
  const [product, setProduct] = useState<Product>('edible');
  const [amount, setAmount] = useState<string>('');

  const typedAmount = Number(amount);
  const hasAmount = amount.trim() !== '' && !Number.isNaN(typedAmount) && typedAmount > 0;

  const amountLabel =
    product === 'edible' || product === 'drink'
      ? 'Amount (mg)'
      : product === 'flower'
        ? 'Amount (grams)'
        : product === 'vape'
          ? 'Amount (hits)'
          : 'Amount';

  const amountPlaceholder =
    product === 'edible' || product === 'drink'
      ? 'e.g. 10'
      : product === 'flower'
        ? 'e.g. 0.5'
        : product === 'vape'
          ? 'e.g. 3'
          : '';

  // -- Plain-words suggestion, computed live from the inputs -------------------
  let suggestion = '';
  let waitRule = '';
  let duration = '';
  let tooMuch = false;
  let warning = '';

  if (product === 'edible' || product === 'drink') {
    const range = edibleRange(experience);
    const label = product === 'edible' ? 'edible' : 'drink';
    suggestion =
      `Start with ${formatMg(range.low)}–${formatMg(range.high)} mg of this ${label}. ` +
      `Never start a session with more than 10 mg — even if you have done this before.`;
    waitRule = 'Wait at least 2 hours before judging it. Do not take more before 2 hours — it stacks up sneaky.';
    duration = 'How long will it last? Usually 4–8 hours (sometimes up to 12).';
    if (hasAmount && typedAmount > range.high) {
      tooMuch = true;
      warning = `That's a lot for your experience — ${formatMg(typedAmount)} mg is above the ${formatMg(range.low)}–${formatMg(range.high)} mg starting range for you. Consider starting lower.`;
    }
  } else if (product === 'flower') {
    suggestion =
      'Take 1–2 small hits, then stop and see how you feel. Small hits, not big rips.';
    waitRule = 'Wait 15 minutes before taking more.';
    duration = 'How long will it last? Usually 1–3 hours.';
    if (hasAmount && typedAmount > 1) {
      tooMuch = true;
      warning =
        'That is a lot of flower for one session start — consider starting with just a pinch (well under a gram) and 1–2 small hits instead.';
    }
  } else if (product === 'vape') {
    suggestion = 'Take 1–2 small puffs, then stop and see how you feel.';
    waitRule = 'Wait 15 minutes before taking more.';
    duration = 'How long will it last? Usually 1–3 hours.';
    if (hasAmount && typedAmount > 5) {
      tooMuch = true;
      warning =
        'That is a lot of puffs for one session start — consider starting with just 1–2 small puffs instead.';
    }
  } else {
    // Dab.
    duration = 'How long will it last? Usually 1–3 hours, and stronger than flower.';
    if (experience === 'experienced') {
      suggestion =
        'Dabs are strong stuff. Start with a tiny rice-grain amount — no bigger than a grain of rice.';
      waitRule = 'Wait 15 minutes before taking more.';
    } else {
      suggestion =
        'Dabs are too strong to start with — try flower or a low-dose edible instead.';
      waitRule = 'When you are more experienced, come back and we will walk through it.';
    }
  }

  return (
    <main>
      <PageHead
        title="Dose helper"
        sub="Pick what you've got and how experienced you are — Bud-E suggests a safe place to start."
      />
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Golden rule: start low, go slow — you can always take more, you can&apos;t take less.
        </p>

        <Label>How experienced are you?</Label>
        <ChipRow>
          {(Object.keys(EXPERIENCE_LABELS) as Experience[]).map((key) => (
            <Chip key={key} on={experience === key} onClick={() => setExperience(key)}>
              {EXPERIENCE_LABELS[key]}
            </Chip>
          ))}
        </ChipRow>

        <Label>What are you taking?</Label>
        <ChipRow>
          {(Object.keys(PRODUCT_LABELS) as Product[]).map((key) => (
            <Chip key={key} on={product === key} onClick={() => setProduct(key)}>
              {PRODUCT_LABELS[key]}
            </Chip>
          ))}
        </ChipRow>

        {product !== 'dab' && (
          <>
            <label htmlFor="dose-amount">{amountLabel}</label>
            <input
              id="dose-amount"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={amountPlaceholder}
            />
            <p className="muted small">
              This is optional — the suggestion below works even if you leave it blank.
            </p>
          </>
        )}
        {product === 'dab' && (
          <p className="muted small">
            No amount to type in for dabs — the amount is &quot;a tiny rice-grain bit&quot;, and
            that&apos;s the whole point.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Your starting dose</h2>
        <div className="result-box">
          <p>
            <strong>{PRODUCT_LABELS[product]}</strong> · {EXPERIENCE_LABELS[experience]}
          </p>
          <p>{suggestion}</p>
          <p>{waitRule}</p>
          <p className="muted">{duration}</p>
        </div>

        {tooMuch && (
          <div className="result-box">
            <p>
              <strong>⚠️ Heads up:</strong> {warning}
            </p>
          </div>
        )}

        <div className="plan-sentence">
          Redose rule: edibles and drinks — wait a full 2 hours before even thinking about more.
          Flower, vape, and dabs — wait 15 minutes between hits. Start low, go slow.
        </div>
        <p className="muted small">
          These are general starting points, not medical advice. If you feel really unwell,
          talk to a real doctor. And never drive while high.
        </p>
      </div>
    </main>
  );
}
