// Shared PIN pad: dots for the digits entered, a 1-9 / 0 / backspace grid.
// Calls onComplete with the full PIN as soon as it is entered. The parent
// verifies it; passing error=true shakes the pad and clears the digits.
import { useEffect, useState } from 'react';

export default function PinPad({
  length = 4,
  onComplete,
  error = false,
  disabled = false,
}: {
  length?: number;
  onComplete: (pin: string) => void;
  error?: boolean;
  disabled?: boolean;
}) {
  const [digits, setDigits] = useState('');

  // A wrong PIN clears whatever was typed, so the next try starts clean.
  useEffect(() => {
    if (error) setDigits('');
  }, [error]);

  function press(d: string): void {
    if (disabled || error) return;
    const next = (digits + d).slice(0, length);
    setDigits(next);
    if (next.length === length) {
      const pin = next;
      setDigits('');
      onComplete(pin);
    }
  }

  function backspace(): void {
    if (disabled || error) return;
    setDigits(digits.slice(0, -1));
  }

  const shown = error ? '' : digits;

  return (
    <div className={error ? 'pin-pad shake' : 'pin-pad'}>
      <div className="pin-dots" aria-label={`${shown.length} of ${length} digits entered`}>
        {Array.from({ length }, (_, i) => (
          <span key={i} className={i < shown.length ? 'pin-dot filled' : 'pin-dot'} aria-hidden />
        ))}
      </div>
      <div className="pin-grid">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            type="button"
            className="pin-key"
            onClick={() => press(d)}
            disabled={disabled || error}
            aria-label={`Digit ${d}`}
          >
            {d}
          </button>
        ))}
        <span aria-hidden />
        <button
          type="button"
          className="pin-key"
          onClick={() => press('0')}
          disabled={disabled || error}
          aria-label="Digit 0"
        >
          0
        </button>
        <button
          type="button"
          className="pin-key pin-key-back"
          onClick={backspace}
          disabled={disabled || error || digits.length === 0}
          aria-label="Delete last digit"
        >
          ⌫
        </button>
      </div>
    </div>
  );
}
