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
import {
  changeEmail,
  changePassword,
  requestPasswordReset,
  resetPassword,
  signIn,
  signOut,
  signUp,
} from './lib/auth-client';
import type { AuthUser } from './lib/auth-client';
import { PageHead } from './bits';

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
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  // Change email / change password (signed-in settings below).
  const [newEmail, setNewEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [nextPasswordAgain, setNextPasswordAgain] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');
  // Signed-in menu: 'main' is the menu, the rest open one section.
  const [view, setView] = useState<'main' | 'profile' | 'email' | 'password'>('main');

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    if (mode === 'forgot') {
      await doForgot();
      return;
    }
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
    setNotice('');
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

  /** Forgot password: ask for a reset link. The reply never says whether
   *  the email has an account, so the message is the same either way. */
  async function doForgot(): Promise<void> {
    if (email.trim() === '') {
      setError('Add your email first.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await requestPasswordReset(email);
      setNotice(
        'If that email has a Bud-E account, a reset link is on its way — check your inbox (and spam). The link works for one hour.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that reset email — try again.');
    } finally {
      setBusy(false);
    }
  }

  /** Change the account email. It changes straight away — there is no
   *  confirmation link, because accounts never verify email. */
  async function doChangeEmail(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (emailBusy) return;
    if (newEmail.trim() === '') {
      setEmailErr('Add the new email first.');
      return;
    }
    if (newEmail.trim().toLowerCase() === user?.email.toLowerCase()) {
      setEmailErr('That is already your email — nothing to change.');
      return;
    }
    setEmailBusy(true);
    setEmailErr('');
    setEmailMsg('');
    try {
      const next = await changeEmail(newEmail);
      setNewEmail('');
      setEmailMsg(`Email changed to ${next.email} — use it next time you sign in.`);
      onAuthChange(next);
    } catch (err) {
      setEmailErr(err instanceof Error ? err.message : 'Could not change your email — try again.');
    } finally {
      setEmailBusy(false);
    }
  }

  /** Change the password. Needs the current one, and signs the user's
   *  other devices out. */
  async function doChangePassword(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (pwBusy) return;
    if (currentPassword === '' || nextPassword === '') {
      setPwErr('Add your current password and a new one.');
      return;
    }
    if (nextPassword.length < 8) {
      setPwErr('Use a new password with at least 8 characters.');
      return;
    }
    if (nextPassword !== nextPasswordAgain) {
      setPwErr('The two new passwords do not match — check them and try again.');
      return;
    }
    setPwBusy(true);
    setPwErr('');
    setPwMsg('');
    try {
      await changePassword(currentPassword, nextPassword);
      setCurrentPassword('');
      setNextPassword('');
      setNextPasswordAgain('');
      setPwMsg('Password changed — your other devices are signed out.');
    } catch (err) {
      setPwErr(err instanceof Error ? err.message : 'Could not change your password — try again.');
    } finally {
      setPwBusy(false);
    }
  }

  async function doSignOut(): Promise<void> {
    if (signingOut) return;
    setSigningOut(true);
    setError('');
    try {
      await signOut();
      setView('main');
      onAuthChange(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign out — try again.');
    } finally {
      setSigningOut(false);
    }
  }

  function switchMode(next: 'signin' | 'signup' | 'forgot'): void {
    setMode(next);
    setError('');
    setNotice('');
  }

  // -- Signed in: menu, then one section at a time ---------------------------
  if (user) {
    const displayName = user.name !== '' ? user.name : user.email;
    const initial = (displayName.charAt(0) || '?').toUpperCase();
    if (view === 'main') {
      return (
        <main>
          <PageHead title="Account" sub="Your profile and sign-in details." />
          <section className="card" aria-label="Account menu" style={{ marginTop: 16 }}>
            <div className="legal-list">
              <button type="button" className="legal-row" onClick={() => setView('profile')}>
                <span>
                  <strong>Profile</strong>
                  <span className="muted">{user.email}</span>
                </span>
                <span aria-hidden>›</span>
              </button>
              <button type="button" className="legal-row" onClick={() => setView('email')}>
                <span>
                  <strong>Change email</strong>
                  <span className="muted">Use a different email to sign in</span>
                </span>
                <span aria-hidden>›</span>
              </button>
              <button type="button" className="legal-row" onClick={() => setView('password')}>
                <span>
                  <strong>Change password</strong>
                  <span className="muted">Needs your current password</span>
                </span>
                <span aria-hidden>›</span>
              </button>
            </div>
          </section>
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
    return (
      <main>
        <button type="button" className="tool-back" onClick={() => setView('main')}>
          ← Back to Account
        </button>
        <h1 className="page-title" style={{ marginTop: 8 }}>
          {view === 'profile' ? 'Profile' : view === 'email' ? 'Change email' : 'Change password'}
        </h1>
        {view === 'profile' && (
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
        )}

        {view === 'profile' && (
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
        )}

        {view === 'profile' && syncMessage !== undefined && syncMessage !== '' && (
          <p className="result-box" role="status">
            {syncMessage}
          </p>
        )}
        {view === 'profile' && onSyncNow && (
          <button type="button" className="btn btn-block" onClick={onSyncNow}>
            🔄 Sync now
          </button>
        )}

        {view === 'email' && (
        <section className="card" aria-label="Change email" style={{ marginTop: 16 }}>
          <form onSubmit={(e) => void doChangeEmail(e)}>
            <label htmlFor="account-new-email">
              <span>Change your email</span>
              <input
                id="account-new-email"
                type="email"
                value={newEmail}
                autoComplete="email"
                placeholder={user.email}
                onChange={(e) => setNewEmail(e.target.value)}
                disabled={emailBusy}
              />
            </label>
            {emailErr !== '' && (
              <p className="muted" role="alert" style={{ color: '#ff9d9d' }}>
                {emailErr}
              </p>
            )}
            {emailMsg !== '' && (
              <p className="result-box" role="status">
                {emailMsg}
              </p>
            )}
            <button type="submit" className="btn secondary btn-block" disabled={emailBusy}>
              {emailBusy ? 'One sec…' : 'Change email'}
            </button>
          </form>
        </section>
        )}

        {view === 'password' && (
        <section className="card" aria-label="Change password" style={{ marginTop: 16 }}>
          <form onSubmit={(e) => void doChangePassword(e)}>
            <label htmlFor="account-current-password">
              <span>Current password</span>
              <input
                id="account-current-password"
                type="password"
                value={currentPassword}
                autoComplete="current-password"
                placeholder="Your current password"
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={pwBusy}
              />
            </label>
            <label htmlFor="account-new-password">
              <span>New password</span>
              <input
                id="account-new-password"
                type="password"
                value={nextPassword}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                onChange={(e) => setNextPassword(e.target.value)}
                disabled={pwBusy}
              />
            </label>
            <label htmlFor="account-new-password-again">
              <span>New password again</span>
              <input
                id="account-new-password-again"
                type="password"
                value={nextPasswordAgain}
                autoComplete="new-password"
                placeholder="Repeat the new password"
                onChange={(e) => setNextPasswordAgain(e.target.value)}
                disabled={pwBusy}
              />
            </label>
            {pwErr !== '' && (
              <p className="muted" role="alert" style={{ color: '#ff9d9d' }}>
                {pwErr}
              </p>
            )}
            {pwMsg !== '' && (
              <p className="result-box" role="status">
                {pwMsg}
              </p>
            )}
            <button type="submit" className="btn secondary btn-block" disabled={pwBusy}>
              {pwBusy ? 'One sec…' : 'Change password'}
            </button>
          </form>
          <p className="muted small" style={{ marginTop: 12 }}>
            Changing your password signs your other devices out.
          </p>
        </section>
        )}
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
          {mode !== 'forgot' && (
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
          )}
          {error !== '' && (
            <p className="muted" role="alert" style={{ color: '#ff9d9d' }}>
              {error}
            </p>
          )}
          {notice !== '' && (
            <p className="result-box" role="status">
              {notice}
            </p>
          )}
          <button type="submit" className="btn btn-block" disabled={busy}>
            {busy
              ? 'One sec…'
              : mode === 'signup'
                ? 'Create my account'
                : mode === 'forgot'
                  ? 'Send reset link'
                  : 'Sign in'}
          </button>
        </form>

        <p style={{ marginTop: 16 }}>
          {mode === 'signin' ? (
            <>
              New here?{' '}
              <button type="button" className="link" onClick={() => switchMode('signup')}>
                Create an account
              </button>
              {' · '}
              <button type="button" className="link" onClick={() => switchMode('forgot')}>
                Forgot your password?
              </button>
            </>
          ) : mode === 'forgot' ? (
            <>
              <button type="button" className="link" onClick={() => switchMode('signin')}>
                Back to sign in
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
          device and never shared. The only email Bud-E ever sends is a password-reset link, and
          only when you ask for one.
        </p>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Reset password — the landing screen for a reset link from email.
// App.tsx renders this instead of the tabs when the app opens with
// ?token= (or ?error=INVALID_TOKEN) in the URL. The token works once and
// expires after an hour. After a reset, onDone takes the user to sign-in.
// ---------------------------------------------------------------------------

export function ResetPasswordView({
  token,
  invalid,
  onDone,
}: {
  token: string | null;
  invalid: boolean;
  onDone: () => void;
}): ReactElement {
  const [newPassword, setNewPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (busy || token === null) return;
    if (newPassword.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }
    if (newPassword !== again) {
      setError('The two passwords do not match — check them and try again.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await resetPassword(newPassword, token);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset your password — ask for a new link.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <div className="account-screen">
        <p className="eyebrow">Account</p>
        <h1>
          Pick a new
          <br />
          password.
        </h1>
        {invalid ? (
          <>
            <p className="muted" style={{ marginTop: 12 }}>
              That reset link is expired or already used — ask for a new one from the sign-in
              screen.
            </p>
            <button type="button" className="btn btn-block" onClick={onDone}>
              Back to sign in
            </button>
          </>
        ) : done ? (
          <>
            <p className="muted" style={{ marginTop: 12 }}>
              Done — your password is changed. Sign in with the new one.
            </p>
            <button type="button" className="btn btn-block" onClick={onDone}>
              Sign in
            </button>
          </>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 12 }}>
              This link works once and expires after an hour.
            </p>
            <form onSubmit={(e) => void submit(e)}>
              <label htmlFor="reset-new-password">
                <span>New password</span>
                <input
                  id="reset-new-password"
                  type="password"
                  value={newPassword}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label htmlFor="reset-new-password-again">
                <span>New password again</span>
                <input
                  id="reset-new-password-again"
                  type="password"
                  value={again}
                  autoComplete="new-password"
                  placeholder="Repeat the new password"
                  onChange={(e) => setAgain(e.target.value)}
                  disabled={busy}
                />
              </label>
              {error !== '' && (
                <p className="muted" role="alert" style={{ color: '#ff9d9d' }}>
                  {error}
                </p>
              )}
              <button type="submit" className="btn btn-block" disabled={busy}>
                {busy ? 'One sec…' : 'Reset my password'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
