// Stoner Bud-E — shared layout bits, mirroring the Grok app's bits.tsx.
// Layout only: Chip / ChipRow / Label / PageHead. No behavior lives here.

import type { CSSProperties, ReactNode } from 'react';

export function Chip({
  on,
  children,
  onClick,
  disabled,
  ariaPressed,
}: {
  on?: boolean;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  ariaPressed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={ariaPressed ?? on}
      onClick={onClick}
      disabled={disabled}
      className={on ? 'chip on' : 'chip'}
    >
      {children}
    </button>
  );
}

export function ChipRow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="chip-row" style={style}>
      {children}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <p className="field-label">{children}</p>;
}

/** Grok page head: big display title + small muted subtitle. */
export function PageHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <>
      <h1 className="page-title">{title}</h1>
      {sub !== undefined && sub !== '' && <p className="page-sub">{sub}</p>}
    </>
  );
}
