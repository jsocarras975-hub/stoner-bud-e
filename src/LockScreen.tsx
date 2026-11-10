// Lock screen: shown instead of the app whenever the app lock is on and
// the app was just opened (or came back from the background after the
// grace period). Enter the 4-digit PIN, or use the phone's fingerprint /
// face when that is switched on. Five wrong PINs in a row locks the pad
// for 30 seconds.
//
// Forgot the PIN? The only way back in is to sign out and wipe this
// phone's copy of Bud-E — your stuff is saved on your account, so signing
// back in brings it back. Nobody can tap "forgot" to walk past the lock.
import { useEffect, useRef, useState } from 'react';
import { Fingerprint, ScanFace } from 'lucide-react';
import PinPad from './PinPad';
import {
  authenticateBiometric,
  verifyPin,
  PIN_LENGTH,
  type AppLockSettings,
  type BiometricStatus,
} from './lib/applock';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;

export default function LockScreen({
  lockSettings,
  biometric,
  onUnlock,
  onForgotPin,
}: {
  lockSettings: AppLockSettings;
  biometric: BiometricStatus;
  onUnlock: () => void;
  onForgotPin: () => Promise<void>;
}) {
  const [error, setError] = useState(false);
  const [note, setNote] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockedOutUntil, setLockedOutUntil] = useState(0);
  const [bioBusy, setBioBusy] = useState(false);
  const [confirmForgot, setConfirmForgot] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const autoPrompted = useRef(false);

  const lockedOut = lockedOutUntil > now;
  const bioOn = lockSettings.biometric && biometric.available;

  // Count the lockout down so the pad re-enables on its own.
  useEffect(() => {
    if (!lockedOut) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [lockedOut]);

  // Clear the wrong-PIN shake shortly after it shows.
  useEffect(() => {
    if (!error) return;
    const id = window.setTimeout(() => setError(false), 600);
    return () => window.clearTimeout(id);
  }, [error]);

  // Offer the fingerprint / face prompt as soon as the lock appears.
  useEffect(() => {
    if (!bioOn || autoPrompted.current) return;
    autoPrompted.current = true;
    const id = window.setTimeout(() => {
      void tryBiometric();
    }, 400);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bioOn]);

  async function tryBiometric(): Promise<void> {
    if (bioBusy) return;
    setBioBusy(true);
    setNote('');
    const ok = await authenticateBiometric();
    setBioBusy(false);
    if (ok) {
      onUnlock();
    } else {
      setNote('That didn\'t work — use your PIN.');
    }
  }

  async function submitPin(pin: string): Promise<void> {
    if (lockedOut || pin.length !== PIN_LENGTH) return;
    const ok = await verifyPin(pin, lockSettings);
    if (ok) {
      onUnlock();
      return;
    }
    const next = attempts + 1;
    setAttempts(next);
    setError(true);
    if (next >= MAX_ATTEMPTS) {
      setLockedOutUntil(Date.now() + LOCKOUT_MS);
      setAttempts(0);
      setNote('Too many wrong tries — the pad is locked for 30 seconds.');
    } else {
      setNote('Wrong PIN — try again.');
    }
  }

  async function doForgotPin(): Promise<void> {
    if (resetting) return;
    setResetting(true);
    await onForgotPin();
  }

  const lockoutSecs = lockedOut ? Math.ceil((lockedOutUntil - now) / 1000) : 0;

  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'var(--bg)',
        overflowY: 'auto',
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div aria-hidden style={{ fontSize: 44, lineHeight: 1 }}>
        🍃
      </div>
      <div>
        <h1 style={{ margin: '0 0 4px', fontSize: '1.5rem' }}>Bud-E is locked</h1>
        <p className="muted" style={{ margin: 0 }}>
          {lockedOut
            ? `Too many wrong tries — try again in ${lockoutSecs} second${lockoutSecs === 1 ? '' : 's'}.`
            : 'Enter your PIN to open the app.'}
        </p>
      </div>

      <PinPad
        length={PIN_LENGTH}
        onComplete={(pin) => {
          void submitPin(pin);
        }}
        error={error}
        disabled={lockedOut}
      />

      {note && (
        <p className="muted" role="alert" style={{ margin: 0 }}>
          {note}
        </p>
      )}

      {bioOn && !lockedOut && (
        <button
          type="button"
          className="btn"
          onClick={() => {
            void tryBiometric();
          }}
          disabled={bioBusy}
        >
          {biometric.type === 'face' ? (
            <ScanFace size={18} aria-hidden />
          ) : (
            <Fingerprint size={18} aria-hidden />
          )}
          {bioBusy
            ? 'Waiting for your phone…'
            : biometric.type === 'face'
              ? 'Unlock with your face'
              : 'Unlock with your fingerprint'}
        </button>
      )}

      {confirmForgot ? (
        <div className="card" style={{ textAlign: 'left', maxWidth: 360 }}>
          <p style={{ marginTop: 0 }}>
            <strong>Reset the lock?</strong>
          </p>
          <p className="muted">
            This signs you out and erases Bud-E&apos;s data from this phone. Your journal,
            stash, chats, and playlists are saved on your account — sign back in and they
            come back.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                void doForgotPin();
              }}
              disabled={resetting}
            >
              {resetting ? 'Resetting…' : 'Sign out and reset'}
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setConfirmForgot(false)}
              disabled={resetting}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn secondary"
          onClick={() => setConfirmForgot(true)}
        >
          Forgot PIN?
        </button>
      )}
    </main>
  );
}
