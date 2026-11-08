// Stoner Bud-E — Account tab (sign-in / sign-up / sign-out).
//
// Self-contained: App.tsx renders it as <AuthTab user={user}
// onAuthChange={...} /> and never has to know about Better Auth. Signing in
// is OPTIONAL — everything works logged-out on this device exactly as before;
// an account only syncs the journal, stash, theme, session, vibe, and
// tolerance break to the user's other devices. The chat transcript is never
// synced and never leaves the device.
//
// Layout follows the Grok app: signed-in is the ProfilePanel (avatar card
// + "On this phone" counts + Sync now + danger Sign out); signed-out is the
// AccountScreen (eyebrow, big italic title, form, toggle link below).
//
// Props:
//   user         — the signed-in user from getSession(), or null when signed out.
//   onAuthChange — called with the user after sign-in/sign-up, or null after
//                  sign-out, so App.tsx can run the sync-on-sign-in effect.
//   onSyncNow    — optional: when provided, a "Sync now" button is shown for
//                  signed-in users (App.tsx wires it to uploadLocal()).
//   syncMessage  — optional one-line status under the account area, e.g.
//                  "Synced just now" or "Sync did not work — try again."
//   nights       — journal entries on this phone (for the "On this phone" card).
//   stocked      — stash jars with something in them (same card).
//   onGoSettings — opens the Settings tab.

import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { signIn, signOut, signUp } from './lib/auth-client';
import type { AuthUser } from './lib/auth-client';

export interface AuthTabProps {
  user: AuthUser | null;
  onAuthChange: (user: AuthUser | null) => void;
  onSyncNow?: () => void;
  syncMessage?: string;
  nights?: number;
  stocked?: number;
  onGoSettings?: () => void;
}

function friendlySubmitError(message: string): string {
  return message;
}

export default function AuthTab({
  user,
  onAuthChange,
  onSyncNow,
  syncMessage,
  nights = 0,
  stocked = 0,
  onGoSettings,
}: AuthTabProps): ReactElement {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    if (email.trim() === '' || password === '') {
      setError('Add your email and password first.');
      return;
    }
    if (mode === 'signup' && password.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const next =
        mode === 'signup'
          ? await signUp(email, password, name)
          : await signIn(email, password);
      setPassword('');
      onAuthChange(next);
    } catch (err) {
      setError(friendlySubmitError(err instanceof Error ? err.message : 'Something went wrong — try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function doSignOut(): Promise<void> {
    if (signingOut) return;
    setSigningOut(true);
    setError('');
    try {
      await signOut();
      onAuthChange(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign out — try again.');
    } finally {
      setSigningOut(false);
    }
  }

  function switchMode(next: 'signin' | 'signup'): void {
    setMode(next);
    setError('');
  }

  // -- Signed in: Grok ProfilePanel ------------------------------------------
  if (user) {
    const displayName = user.name !== '' ? user.name : user.email;
    const initial = (displayName.charAt(0) || '?').toUpperCase();
    return (
      <main>
        <section className="card" aria-label="Profile">
          <div className="profile-row">
            <div className="profile-avatar" aria-hidden>
              {initial}
            </div>
            <div style={{ minWidth: 0 }}>
              <p className="profile-name">{displayName}</p>
              <p className="profile-email">{user.email}</p>
            </div>
          </div>
          {onGoSettings && (
            <button
              type="button"
              className="btn secondary btn-block"
              style={{ marginTop: 16 }}
              onClick={onGoSettings}
            >
              Settings
            </button>
          )}
        </section>

        <section className="card" aria-label="On this phone">
          <p className="eyebrow">On this phone</p>
          <p style={{ margin: '8px 0 0' }}>
            {nights} {nights === 1 ? 'night' : 'nights'} logged · {stocked}{' '}
            {stocked === 1 ? 'jar' : 'jars'} stocked
          </p>
          <p className="muted small">
            Your journal, stash, theme, and break sync to your other devices when you are online.
            Your chat always stays on this device only — it is never synced and never uploaded.
          </p>
        </section>

        {syncMessage !== undefined && syncMessage !== '' && (
          <p className="result-box" role="status">
            {syncMessage}
          </p>
        )}
        {onSyncNow && (
          <button type="button" className="btn btn-block" onClick={onSyncNow}>
            🔄 Sync now
          </button>
        )}
        <button
          type="button"
          className="btn danger btn-block"
          style={{ marginTop: 12 }}
          onClick={() => void doSignOut()}
          disabled={signingOut}
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
        {error !== '' && (
          <p className="muted" role="alert" style={{ color: '#ff9d9d' }}>
            {error}
          </p>
        )}
        <p className="muted small" style={{ marginTop: 16 }}>
          21+ only. Bud-E is a buddy, not a doctor. Start low, go slow. Never drive high.
        </p>
      </main>
    );
  }

  // -- Signed out: Grok AccountScreen ----------------------------------------
  return (
    <main>
      <div className="account-screen">
        <p className="eyebrow">Account</p>
        <h1>
          Your night,
          <br />
          your data.
        </h1>
        <p className="muted" style={{ marginTop: 12 }}>
          21+ only. Signing in is optional — Bud-E works fine without an account, saved on this
          device only. An account just syncs your journal, stash, theme, and break to your other
          devices.
        </p>

        <form onSubmit={(e) => void submit(e)}>
          {mode === 'signup' && (
            <label htmlFor="account-name">
              <span>What should Bud-E call you? (optional)</span>
              <input
                id="account-name"
                type="text"
                value={name}
                autoComplete="name"
                placeholder="Kartoon"
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
              />
            </label>
          )}
          <label htmlFor="account-email">
            <span>Email</span>
            <input
              id="account-email"
              type="email"
              value={email}
              autoComplete="email"
              placeholder="you@example.com"
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </label>
          <label htmlFor="account-password">
            <span>Password</span>
            <span className="password-wrap">
              <input
                id="account-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((s) => !s)}
                disabled={busy}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </span>
          </label>
          {error !== '' && (
            <p className="muted" role="alert" style={{ color: '#ff9d9d' }}>
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-block" disabled={busy}>
            {busy ? 'One sec…' : mode === 'signup' ? 'Create my account' : 'Sign in'}
          </button>
        </form>

        <p style={{ marginTop: 16 }}>
          {mode === 'signin' ? (
            <>
              New here?{' '}
              <button type="button" className="link" onClick={() => switchMode('signup')}>
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button type="button" className="link" onClick={() => switchMode('signin')}>
                Sign in
              </button>
            </>
          )}
        </p>
        <p className="muted small">
          Your password goes straight to Bud-E&apos;s own sign-in — it is never stored on this
          device and never shared. No email is ever sent.
        </p>
      </div>
    </main>
  );
}
