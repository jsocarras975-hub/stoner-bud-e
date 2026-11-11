// Stoner Bud-E — Settings tab: a clean menu, one section at a time.
// The menu lists every area (Appearance, Phone, Personalization, Display,
// Voice, Premium, Privacy & data, About & legal); tapping one opens just
// that section, with a way back. Nothing else loads on the menu page.
// Legal documents and Delete account are their own screens off the
// About & legal section, the way they were before.
//
// The theme choice is stored in localStorage (bude-theme-v1) and applied
// via html[data-theme], exactly like the Grok night-garden app.

import { useEffect, useState } from 'react';
import { THEMES } from './theme';
import type { ThemeId } from './theme';
import { isVaultUnlocked } from './lib/vault';
import { isFourTwentyUnlocked } from './lib/fourtwenty-chat';
import { isLitModeUnlocked } from './lib/lit-mode';
import { APP_VERSION, COPYRIGHT, getLegalDoc } from './legal';
import type { LegalDoc } from './legal';
import type { AuthUser } from './lib/auth-client';
import { PERSONAS, personaById, isPremiumPersona, isOwnerPersona } from './voice';
import type { VoiceSettings } from './voice';
import { speakVoice, stopVoice } from './lib/voice-client';
import { getKeyboardStatus, openKeyboardSettings, showKeyboardPicker } from './lib/keyboard';
import type { KeyboardStatus } from './lib/keyboard';
import { CommunityError, generatePremiumCodes, redeemPremiumCode } from './lib/community';
import { exportDataJson } from './lib/export-data';
import { checkCryptoCharge, createCryptoCheckout, getPendingChargeId } from './lib/crypto-checkout';
import {
  CASHAPP_TAG,
  CASHAPP_URL,
  claimCashAppPayment,
  confirmCashAppPayment,
  declineCashAppPayment,
  fetchMyCashAppPayments,
  fetchPendingCashAppPayments,
} from './lib/cashapp';
import type { CashAppPayment } from './lib/cashapp';
import { Chip, ChipRow, Label, PageHead } from './bits';
import type { Personalization, PremiumTier } from './lib/sync';
import type { JournalEntry } from './journal';
import type { SyncedChatConversation } from './lib/sync';
import { getAssistantStatus, getBubbleStatus, getTalkNotification, isNative, openDefaultAppsSettings, openOverlaySettings, setBubbleEnabled, setTalkNotification } from './lib/device-actions';
import PinPad from './PinPad';
import {
  generateSalt,
  hashPin,
  saveLockSettings,
  verifyPin,
  PIN_LENGTH,
  type AppLockSettings,
  type BiometricStatus,
} from './lib/applock';

// 'main' is the menu. The rest open one section. The '-doc' views are the
// legal documents, reached from the About & legal section.
type SettingsView =
  | 'main'
  | 'appearance'
  | 'phone'
  | 'keyboard'
  | 'personalization'
  | 'display'
  | 'voice'
  | 'premium'
  | 'lock'
  | 'data'
  | 'about'
  | 'about-doc'
  | 'privacy-doc'
  | 'terms-doc'
  | 'delete';

const SECTION_TITLES: Record<
  Exclude<SettingsView, 'main' | 'about-doc' | 'privacy-doc' | 'terms-doc' | 'delete'>,
  string
> = {
  appearance: 'Appearance',
  phone: 'Phone',
  keyboard: 'Keyboard',
  personalization: 'Personalization',
  display: 'Display',
  voice: 'Voice',
  premium: 'Premium',
  lock: 'App lock',
  data: 'Privacy & data',
  about: 'About & legal',
};

export default function SettingsTab(props: {
  theme: ThemeId;
  onTheme: (theme: ThemeId) => void;
  user: AuthUser | null;
  onDeleteAccount: () => Promise<void>;
  voice: VoiceSettings;
  onVoice: (voice: VoiceSettings) => void;
  apiBase: string;
  premiumTier?: PremiumTier;
  personalization: Personalization;
  onPersonalization: (p: Personalization) => void;
  onClearChats: () => void;
  onClearJournal: () => void;
  journal: JournalEntry[];
  chats: SyncedChatConversation[];
  lockSettings: AppLockSettings | null;
  onLockSettings: (next: AppLockSettings | null) => void;
  biometric: BiometricStatus;
  /** Pull the latest server state (used after a redeem unlocks a tier). */
  onSyncNow: () => void;
  /** Lit Mode (the glowing look) — the owner and anyone who found it can toggle it here. */
  litMode: boolean;
  onLitMode: (on: boolean) => void;
}) {
  const {
    theme, onTheme, user, onDeleteAccount, voice, onVoice, apiBase,
    premiumTier = null, personalization, onPersonalization,
    onClearChats, onClearJournal, journal, chats,
    lockSettings, onLockSettings, biometric, onSyncNow,
    litMode, onLitMode,
  } = props;
  const [view, setView] = useState<SettingsView>('main');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [trying, setTrying] = useState(false);
  // Persistent Talk notification (phone app only; on by default).
  const [talkNotif, setTalkNotif] = useState<boolean | null>(null);
  // Default-assistant status (phone app only).
  const [isAssistant, setIsAssistant] = useState<boolean | null>(null);
  // Floating chat bubble (phone app only).
  const [bubble, setBubble] = useState<boolean | null>(null);
  const [bubbleNote, setBubbleNote] = useState<string | null>(null);
  // Bud-E Keyboard (phone app only): whether it is enabled and whether it
  // is the keyboard currently in use. Refreshed when the section opens.
  const [keyboardStatus, setKeyboardStatus] = useState<KeyboardStatus | null>(null);
  // Premium redeem codes (Stripe won't take this app, so premium is sold
  // as codes): the buyer types one in below; the owner mints them here.
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemNote, setRedeemNote] = useState('');
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [genTier, setGenTier] = useState<'lit' | 'cloudnine'>('lit');
  const [genCount, setGenCount] = useState(5);
  const [genCodes, setGenCodes] = useState<string[]>([]);
  const [genNote, setGenNote] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  // Crypto checkout (Coinbase Commerce): the buyer pays on Coinbase's page
  // and the tier unlocks when Coinbase confirms it. The pending charge id
  // is remembered so the check button works after coming back to the app.
  const [cryptoNote, setCryptoNote] = useState('');
  const [cryptoBusy, setCryptoBusy] = useState(false);
  const [pendingChargeId, setPendingChargeId] = useState<string | null>(() => getPendingChargeId());

  async function submitCrypto(tier: 'lit' | 'cloudnine'): Promise<void> {
    if (cryptoBusy) return;
    setCryptoBusy(true);
    setCryptoNote('');
    try {
      const { hostedUrl, chargeId } = await createCryptoCheckout(tier);
      setPendingChargeId(chargeId);
      setCryptoNote(
        'Pay on the Coinbase page that just opened. When it is done, come back here and tap “I’ve paid — check”.',
      );
      window.open(hostedUrl, '_blank');
    } catch (e) {
      setCryptoNote(e instanceof Error ? e.message : 'Could not start crypto checkout.');
    } finally {
      setCryptoBusy(false);
    }
  }

  async function submitCryptoCheck(): Promise<void> {
    const chargeId = pendingChargeId ?? getPendingChargeId();
    if (!chargeId || cryptoBusy) return;
    setCryptoBusy(true);
    setCryptoNote('');
    try {
      const { confirmed } = await checkCryptoCharge(chargeId);
      if (confirmed) {
        setCryptoNote('✅ Payment confirmed — your tier is unlocked.');
        setPendingChargeId(null);
        onSyncNow();
      } else {
        setCryptoNote('Not confirmed yet — give the payment a minute, then check again.');
      }
    } catch {
      setCryptoNote('That did not go through — check your connection and try again.');
    } finally {
      setCryptoBusy(false);
    }
  }

  // Cash App payments (owner verifies himself): the buyer sends the money
  // to $kartoon93 and taps "I paid"; the owner confirms it here.
  const [cashNote, setCashNote] = useState('');
  const [cashMsg, setCashMsg] = useState('');
  const [cashBusy, setCashBusy] = useState(false);
  const [myCashPayments, setMyCashPayments] = useState<CashAppPayment[]>([]);
  const [pendingCash, setPendingCash] = useState<CashAppPayment[]>([]);

  async function refreshCashPayments(): Promise<void> {
    try {
      const mine = await fetchMyCashAppPayments();
      setMyCashPayments(mine);
    } catch {
      // Best effort — the list just stays as it was.
    }
    if (premiumTier === 'owner') {
      try {
        setPendingCash(await fetchPendingCashAppPayments());
      } catch {
        // Best effort.
      }
    }
  }

  useEffect(() => {
    if (view !== 'premium') return;
    void refreshCashPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  async function submitCashClaim(tier: 'lit' | 'cloudnine'): Promise<void> {
    if (cashBusy) return;
    setCashBusy(true);
    setCashMsg('');
    try {
      await claimCashAppPayment(tier, cashNote);
      setCashMsg(
        'Got it — send the money to $kartoon93 if you haven’t yet, then sit tight. The owner checks Cash App and confirms it, and your tier unlocks.',
      );
      await refreshCashPayments();
    } catch (e) {
      setCashMsg(
        e instanceof CommunityError
          ? e.message
          : 'That did not go through — check your connection and try again.',
      );
    } finally {
      setCashBusy(false);
    }
  }

  async function submitCashConfirm(payment: CashAppPayment): Promise<void> {
    if (cashBusy) return;
    setCashBusy(true);
    setCashMsg('');
    try {
      const { tier } = await confirmCashAppPayment(payment.id);
      setCashMsg(
        `Confirmed — ${payment.name ?? payment.email ?? 'that buyer'} is now on ${tier === 'cloudnine' ? 'Cloud Nine' : 'Lit'}.`,
      );
      await refreshCashPayments();
    } catch (e) {
      setCashMsg(
        e instanceof CommunityError
          ? e.message
          : 'That did not go through — check your connection and try again.',
      );
    } finally {
      setCashBusy(false);
    }
  }

  async function submitCashDecline(payment: CashAppPayment): Promise<void> {
    if (cashBusy) return;
    setCashBusy(true);
    try {
      await declineCashAppPayment(payment.id);
      await refreshCashPayments();
    } catch {
      setCashMsg('That did not go through — try again.');
    } finally {
      setCashBusy(false);
    }
  }

  async function submitRedeem(): Promise<void> {
    const code = redeemCode.trim();
    if (!code || redeemBusy) return;
    setRedeemBusy(true);
    setRedeemNote('');
    try {
      const { tier } = await redeemPremiumCode(code);
      setRedeemNote(
        tier === 'cloudnine'
          ? '☁️ Cloud Nine unlocked — welcome to the top shelf.'
          : '🌿 Lit unlocked — extra voices, themes, and insights are yours.',
      );
      setRedeemCode('');
      onSyncNow();
    } catch (e) {
      setRedeemNote(
        e instanceof CommunityError
          ? e.message
          : 'That did not go through — check your connection and try again.',
      );
    } finally {
      setRedeemBusy(false);
    }
  }

  async function submitGenerate(): Promise<void> {
    if (genBusy) return;
    setGenBusy(true);
    setGenNote('');
    try {
      const { codes } = await generatePremiumCodes(genTier, genCount);
      setGenCodes(codes);
      setGenNote(
        codes.length === 0
          ? 'No codes came back — try again.'
          : `${codes.length} ${genTier === 'lit' ? 'Lit' : 'Cloud Nine'} code${codes.length === 1 ? '' : 's'} ready. Tap one to copy it.`,
      );
    } catch (e) {
      setGenNote(
        e instanceof CommunityError
          ? e.message
          : 'That did not go through — check your connection and try again.',
      );
    } finally {
      setGenBusy(false);
    }
  }

  function copyCode(code: string): void {
    try {
      void navigator.clipboard?.writeText(code);
      setGenNote(`Copied ${code} — paste it where you sell it.`);
    } catch {
      setGenNote(`Copy did not work — the code is ${code}.`);
    }
  }

  useEffect(() => {
    if (view !== 'keyboard') return;
    let cancelled = false;
    void getKeyboardStatus().then((status) => {
      if (!cancelled) setKeyboardStatus(status);
    });
    return () => {
      cancelled = true;
    };
  }, [view]);
  // App lock (PIN + fingerprint/face). lockFlow drives the PIN pad steps:
  // set → confirm, change → verify → new → confirm, remove → verify.
  const [lockFlow, setLockFlow] = useState<
    null | 'set' | 'set-confirm' | 'change-verify' | 'change-new' | 'change-confirm' | 'remove-verify'
  >(null);
  const [pendingPin, setPendingPin] = useState('');
  const [lockNote, setLockNote] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [clearNote, setClearNote] = useState<string | null>(null);
  const [lockError, setLockError] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);

  // Clear the wrong-PIN shake shortly after it shows.
  useEffect(() => {
    if (!lockError) return;
    const id = window.setTimeout(() => setLockError(false), 600);
    return () => window.clearTimeout(id);
  }, [lockError]);

  function cancelLockFlow(): void {
    setLockFlow(null);
    setPendingPin('');
    setLockNote('');
    setLockError(false);
  }

  async function submitLockPin(pin: string): Promise<void> {
    if (lockBusy || !lockFlow) return;
    setLockBusy(true);
    try {
      if (lockFlow === 'set') {
        setPendingPin(pin);
        setLockFlow('set-confirm');
        setLockNote('Enter it again to confirm.');
      } else if (lockFlow === 'set-confirm') {
        if (pin !== pendingPin) {
          setLockError(true);
          setPendingPin('');
          setLockFlow('set');
          setLockNote("They didn't match — pick a PIN again.");
          return;
        }
        const salt = generateSalt();
        const pinHash = await hashPin(pin, salt);
        const next: AppLockSettings = {
          pinHash,
          salt,
          biometric: false,
          graceSec: lockSettings?.graceSec ?? 0,
        };
        saveLockSettings(next);
        onLockSettings(next);
        setLockFlow(null);
        setPendingPin('');
        setLockNote('PIN set — the app locks when you open it.');
      } else if (lockFlow === 'change-verify' || lockFlow === 'remove-verify') {
        if (!lockSettings) return;
        const ok = await verifyPin(pin, lockSettings);
        if (!ok) {
          setLockError(true);
          setLockNote('Wrong PIN — try again.');
          return;
        }
        if (lockFlow === 'remove-verify') {
          onLockSettings(null);
          setLockFlow(null);
          setLockNote('Lock removed.');
        } else {
          setLockFlow('change-new');
          setLockNote('Pick a new 4-digit PIN.');
        }
      } else if (lockFlow === 'change-new') {
        setPendingPin(pin);
        setLockFlow('change-confirm');
        setLockNote('Enter the new PIN again.');
      } else if (lockFlow === 'change-confirm') {
        if (!lockSettings) return;
        if (pin !== pendingPin) {
          setLockError(true);
          setPendingPin('');
          setLockFlow('change-new');
          setLockNote("They didn't match — pick a new PIN again.");
          return;
        }
        const salt = generateSalt();
        const pinHash = await hashPin(pin, salt);
        const next: AppLockSettings = { ...lockSettings, pinHash, salt };
        saveLockSettings(next);
        onLockSettings(next);
        setLockFlow(null);
        setPendingPin('');
        setLockNote('PIN changed.');
      }
    } finally {
      setLockBusy(false);
    }
  }

  function setBiometric(on: boolean): void {
    if (!lockSettings) return;
    const next: AppLockSettings = { ...lockSettings, biometric: on };
    saveLockSettings(next);
    onLockSettings(next);
  }

  function setGraceSec(sec: number): void {
    if (!lockSettings) return;
    const next: AppLockSettings = { ...lockSettings, graceSec: sec };
    saveLockSettings(next);
    onLockSettings(next);
  }

  // Stop a voice preview when leaving Settings.
  useEffect(() => () => stopVoice(), []);

  // Load the Talk notification switch + assistant status + bubble switch
  // (phone app only). The status is re-read whenever the app comes back
  // to the front, so answering the phone's assistant popup updates it
  // with no extra tap.
  useEffect(() => {
    let cancelled = false;
    if (isNative()) {
      void getTalkNotification().then((on) => {
        if (!cancelled) setTalkNotif(on);
      });
      void getBubbleStatus().then((s) => {
        if (!cancelled) setBubble(s.enabled);
      });
      const refreshAssistant = () => {
        void getAssistantStatus().then((on) => {
          if (!cancelled) {
            setIsAssistant(on);
          }
        });
      };
      refreshAssistant();
      window.addEventListener('focus', refreshAssistant);
      return () => {
        cancelled = true;
        window.removeEventListener('focus', refreshAssistant);
      };
    }
    return () => {
      cancelled = true;
    };
  }, []);

  /** Read one short line out loud in the current voice. Tap again to stop. */
  async function tryVoice(): Promise<void> {
    if (trying) {
      stopVoice();
      setTrying(false);
      return;
    }
    setTrying(true);
    await speakVoice(
      apiBase,
      "Heyy, it's Bud-E — your buddy for the night. How's it going?",
      voice.persona,
    );
    setTrying(false);
  }

  async function confirmDelete(): Promise<void> {
    if (deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      // App.tsx wipes the device's local copy and signs out on success —
      // this tab unmounts when it switches back to Tonight.
      await onDeleteAccount();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'Could not delete the account — try again.',
      );
      setDeleting(false);
    }
  }

  // -- One legal document, with a way back to About & legal ---------------
  if (view === 'about-doc' || view === 'privacy-doc' || view === 'terms-doc') {
    const doc = getLegalDoc(view.replace('-doc', '') as LegalDoc['id']);
    return (
      <main>
        <button type="button" className="tool-back" onClick={() => setView('about')}>
          ← Back to About & legal
        </button>
        <h1 className="page-title" style={{ marginTop: 8 }}>
          {doc.title}
        </h1>
        <section className="card legal-doc" aria-label={doc.title}>
          <p>{doc.intro}</p>
          {doc.sections.map((section) => (
            <div key={section.heading}>
              <p className="eyebrow" style={{ marginTop: 20 }}>
                {section.heading}
              </p>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 24)}>{paragraph}</p>
              ))}
            </div>
          ))}
          {doc.id === 'about' && (
            <p className="muted" style={{ marginTop: 20 }}>
              {COPYRIGHT} · Version {APP_VERSION}
            </p>
          )}
        </section>
      </main>
    );
  }

  // -- Delete account: confirm step, then the button does the work ---------
  if (view === 'delete') {
    return (
      <main>
        <button type="button" className="tool-back" onClick={() => setView('about')}>
          ← Back to About & legal
        </button>
        <h1 className="page-title" style={{ marginTop: 8 }}>
          Delete my account
        </h1>
        <section className="card" aria-label="Delete my account">
          <p>
            This deletes your account <strong>{user ? user.email : ''}</strong> and
            everything stored under it — your journal, stash, settings, and sessions —
            from Bud-E&apos;s database. It also clears your journal, stash, and chat from
            this device.
          </p>
          <p>
            <strong>There is no undo.</strong> If you just want to stop syncing for a
            while, sign out instead — your stuff stays on this device and your account
            stays as it is.
          </p>
          {deleteError !== '' && (
            <p className="muted" role="alert" style={{ color: '#ff9d9d' }}>
              {deleteError}
            </p>
          )}
          <div className="button-row">
            <button
              type="button"
              className="btn danger btn-block"
              onClick={() => void confirmDelete()}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Yes, delete everything'}
            </button>
          </div>
          <div className="button-row">
            <button
              type="button"
              className="btn secondary btn-block"
              onClick={() => setView('about')}
              disabled={deleting}
            >
              Keep my account
            </button>
          </div>
        </section>
      </main>
    );
  }

  // -- Menu, or one section at a time --------------------------------------
  const themeName = THEMES.find((t) => t.id === theme)?.name ?? theme;
  const personaName = personaById(voice.persona).name;
  const tierName =
    premiumTier === 'lit'
      ? 'Lit'
      : premiumTier === 'cloudnine'
        ? 'Cloud Nine'
        : premiumTier === 'owner'
          ? 'Owner 👑'
          : null;

  return (
    <main>
      {view === 'main' ? (
        <>
          <PageHead title="Settings" sub="Pick something to change." />
          <section className="card" aria-label="Settings menu">
            <div className="legal-list">
              <button type="button" className="legal-row" onClick={() => setView('appearance')}>
                <span>
                  <strong>Appearance</strong>
                  <span className="muted">{themeName}</span>
                </span>
                <span aria-hidden>›</span>
              </button>
              {isNative() && (
                <button type="button" className="legal-row" onClick={() => setView('phone')}>
                  <span>
                    <strong>Phone</strong>
                    <span className="muted">Notifications, bubble, assistant</span>
                  </span>
                  <span aria-hidden>›</span>
                </button>
              )}
              {isNative() && (
                <button type="button" className="legal-row" onClick={() => setView('keyboard')}>
                  <span>
                    <strong>Keyboard</strong>
                    <span className="muted">Bud-E keyboard, stickers included</span>
                  </span>
                  <span aria-hidden>›</span>
                </button>
              )}
              <button type="button" className="legal-row" onClick={() => setView('personalization')}>
                <span>
                  <strong>Personalization</strong>
                  <span className="muted">What the AI is called, how it talks</span>
                </span>
                <span aria-hidden>›</span>
              </button>
              <button type="button" className="legal-row" onClick={() => setView('display')}>
                <span>
                  <strong>Display</strong>
                  <span className="muted">Text size, accent, motion</span>
                </span>
                <span aria-hidden>›</span>
              </button>
              <button type="button" className="legal-row" onClick={() => setView('voice')}>
                <span>
                  <strong>Voice</strong>
                  <span className="muted">{personaName}</span>
                </span>
                <span aria-hidden>›</span>
              </button>
              <button type="button" className="legal-row" onClick={() => setView('premium')}>
                <span>
                  <strong>Premium</strong>
                  <span className="muted">{tierName ?? 'Not unlocked'}</span>
                </span>
                <span aria-hidden>›</span>
              </button>
              <button type="button" className="legal-row" onClick={() => setView('lock')}>
                <span>
                  <strong>App lock</strong>
                  <span className="muted">
                    {lockSettings ? 'PIN on · tap to change' : 'PIN or fingerprint — off'}
                  </span>
                </span>
                <span aria-hidden>›</span>
              </button>
              <button type="button" className="legal-row" onClick={() => setView('data')}>
                <span>
                  <strong>Privacy & data</strong>
                  <span className="muted">Clear chats and journal, export</span>
                </span>
                <span aria-hidden>›</span>
              </button>
              <button type="button" className="legal-row" onClick={() => setView('about')}>
                <span>
                  <strong>About & legal</strong>
                  <span className="muted">What Bud-E is, the fine print</span>
                </span>
                <span aria-hidden>›</span>
              </button>
            </div>
          </section>
          <p className="footer" style={{ marginTop: 16, paddingTop: 0 }}>
            {COPYRIGHT} · Stoner Bud-E v{APP_VERSION}
          </p>
        </>
      ) : (
        <>
          <button type="button" className="tool-back" onClick={() => setView('main')}>
            ← Back to Settings
          </button>
          <h1 className="page-title" style={{ marginTop: 8 }}>
            {SECTION_TITLES[view as keyof typeof SECTION_TITLES]}
          </h1>

          {view === 'appearance' && (
            <section className="card" aria-label="Appearance">
              <p className="muted">Swap the whole garden. It stays on this phone.</p>
              <div className="theme-grid">
                {THEMES.filter((item) => !item.secret || premiumTier === 'owner' || (item.secret === 'vault' && isVaultUnlocked())).map((item) => {
                  const locked =
                    (item.premium && !premiumTier) ||
                    (item.ownerOnly && premiumTier !== 'owner');
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="theme-swatch"
                      data-swatch={item.id}
                      aria-pressed={theme === item.id}
                      disabled={locked}
                      onClick={() => !locked && onTheme(item.id)}
                      title={
                        item.ownerOnly
                          ? 'Owner theme — only for Kartoon'
                          : locked
                            ? 'Premium theme — unlock with Lit'
                            : undefined
                      }
                    >
                      <span>
                        <span className="swatch-dot" aria-hidden />
                        <strong>{item.name}{locked ? ' 🔒' : ''}</strong>
                      </span>
                      <span className="swatch-bar" aria-hidden />
                      <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>{item.detail}</span>
                    </button>
                  );
                })}
              </div>
              {(premiumTier === 'owner' || isLitModeUnlocked()) && (
                <div style={{ marginTop: 16 }}>
                  <Label>Lit Mode</Label>
                  <div className="unit-toggle">
                    <button
                      type="button"
                      aria-pressed={litMode}
                      className={litMode ? 'on' : ''}
                      onClick={() => onLitMode(true)}
                    >
                      On
                    </button>
                    <button
                      type="button"
                      aria-pressed={!litMode}
                      className={!litMode ? 'on' : ''}
                      onClick={() => onLitMode(false)}
                    >
                      Off
                    </button>
                  </div>
                  <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
                    The glowing look. You can also switch it with the keyboard.
                  </p>
                </div>
              )}
            </section>
          )}

          {view === 'phone' && isNative() && (
            <section className="card" aria-label="Phone">
              <p className="muted">Bud-E on your home screen and in your notifications.</p>
              <Label>Talk notification</Label>
              <div className="unit-toggle">
                <button
                  type="button"
                  aria-pressed={talkNotif === true}
                  className={talkNotif === true ? 'on' : ''}
                  disabled={talkNotif === null}
                  onClick={() => {
                    void setTalkNotification(true).then(() => setTalkNotif(true));
                  }}
                >
                  On
                </button>
                <button
                  type="button"
                  aria-pressed={talkNotif === false}
                  className={talkNotif === false ? 'on' : ''}
                  disabled={talkNotif === null}
                  onClick={() => {
                    void setTalkNotification(false).then(() => setTalkNotif(false));
                  }}
                >
                  Off
                </button>
              </div>
              <p className="muted" style={{ marginTop: 6 }}>
                When on, Bud-E sits in your notifications with a Talk button — one tap to ask
                anything. It needs notifications allowed for Bud-E; if it never shows, allow
                notifications for the app. Long-press the app icon for shortcuts, and add the
                Bud-E widget from your home screen.
              </p>
              <div style={{ marginTop: 12 }}>
                <Label>Floating chat bubble</Label>
                <div className="unit-toggle">
                  <button
                    type="button"
                    aria-pressed={bubble === true}
                    className={bubble === true ? 'on' : ''}
                    disabled={bubble === null}
                    onClick={() => {
                      setBubbleNote(null);
                      void getBubbleStatus().then((s) => {
                        if (!s.canDrawOverlays) {
                          setBubbleNote("The phone has to allow Bud-E to draw over other apps first — opening that page now. Allow it, come back here, and turn the bubble on.");
                          void openOverlaySettings();
                          return;
                        }
                        void setBubbleEnabled(true).then((on) => setBubble(on));
                      });
                    }}
                  >
                    On
                  </button>
                  <button
                    type="button"
                    aria-pressed={bubble === false}
                    className={bubble === false ? 'on' : ''}
                    disabled={bubble === null}
                    onClick={() => {
                      setBubbleNote(null);
                      void setBubbleEnabled(false).then(() => setBubble(false));
                    }}
                  >
                    Off
                  </button>
                </div>
                <p className="muted" style={{ marginTop: 6 }}>
                  A little Bud-E bubble that floats over your other apps. Drag it anywhere,
                  tap it to open the chat, long-press it to hide it. It comes back after a
                  restart if you left it on.
                </p>
                {bubbleNote !== null && (
                  <p className="muted" style={{ marginTop: 6 }}>{bubbleNote}</p>
                )}
              </div>
              <div style={{ marginTop: 12 }}>
                <Label>Default assistant</Label>
                <p className="muted" style={{ marginTop: 6 }}>
                  {isAssistant === null
                    ? 'Checking…'
                    : isAssistant
                      ? 'Bud-E is your assistant — Talk opens Bud-E straight away.'
                      : "Bud-E is not your assistant yet — Talk opens the app instead of the voice session."}
                </p>
                {isAssistant === false && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      void openDefaultAppsSettings();
                    }}
                  >
                    Open default assistant settings
                  </button>
                )}
                <p className="muted" style={{ marginTop: 6 }}>
                  A fresh install can drop Bud-E from the phone's assistant list. Pick Bud-E on
                  that settings page — that is the switch that sticks. If Bud-E doesn't show
                  there, restart the phone once and look again.
                </p>
              </div>
            </section>
          )}

          {view === 'keyboard' && isNative() && (
            <section className="card" aria-label="Keyboard">
              <p className="muted">
                Type with Bud-E anywhere on your phone — letters, symbols, and your 20
                stickers. The leaf key jumps into the app.
              </p>
              <p className="muted" style={{ marginTop: 6 }}>
                {keyboardStatus === null
                  ? 'Checking…'
                  : keyboardStatus.active
                    ? 'Bud-E Keyboard is on and it is your current keyboard. 🌿'
                    : keyboardStatus.enabled
                      ? 'Bud-E Keyboard is enabled — switch to it below.'
                      : 'Bud-E Keyboard is not enabled yet.'}
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    void openKeyboardSettings().then(() => {
                      // Refresh when the user comes back — the status may
                      // have changed while they were in Settings.
                      window.setTimeout(() => {
                        void getKeyboardStatus().then(setKeyboardStatus);
                      }, 1500);
                    });
                  }}
                >
                  Enable Bud-E Keyboard
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={keyboardStatus?.enabled !== true}
                  onClick={() => {
                    void showKeyboardPicker().then(() => {
                      window.setTimeout(() => {
                        void getKeyboardStatus().then(setKeyboardStatus);
                      }, 1500);
                    });
                  }}
                >
                  Switch to Bud-E Keyboard
                </button>
              </div>
              <p className="muted" style={{ marginTop: 12 }}>
                Android makes you turn it on yourself: tap Enable, switch on Bud-E Keyboard in
                the list (Android will warn you — keyboards can see what you type, and this
                one is yours), then come back and tap Switch. Stickers send as images, so
                they land in messaging apps; an app that does not take images will say so.
                No autocorrect yet — that comes later.
              </p>
            </section>
          )}

          {view === 'personalization' && (
            <section className="card" aria-label="Personalization">
              <p className="muted">What the AI is called, what it calls you, and how it talks.</p>
              <Label>Buddy name</Label>
              <input
                className="input"
                value={personalization.buddyName}
                maxLength={24}
                onChange={(e) => onPersonalization({ ...personalization, buddyName: e.target.value })}
                placeholder="Bud-E"
              />
              <div style={{ marginTop: 12 }}>
                <Label>What it calls you</Label>
                <input
                  className="input"
                  value={personalization.userName}
                  maxLength={24}
                  onChange={(e) => onPersonalization({ ...personalization, userName: e.target.value })}
                  placeholder="Leave blank for just “you”"
                />
              </div>
              <div style={{ marginTop: 12 }}>
                <Label>Reply length</Label>
                <ChipRow>
                  {(['short', 'normal', 'detailed'] as const).map((len) => (
                    <Chip key={len} on={personalization.replyLength === len} onClick={() => onPersonalization({ ...personalization, replyLength: len })}>
                      {len[0].toUpperCase() + len.slice(1)}
                    </Chip>
                  ))}
                </ChipRow>
              </div>
              <div style={{ marginTop: 12 }}>
                <Label>Chat style</Label>
                <ChipRow>
                  <Chip on={personalization.chatStyle === 'friendly'} onClick={() => onPersonalization({ ...personalization, chatStyle: 'friendly' })}>Friendly</Chip>
                  <Chip on={personalization.chatStyle === 'plain'} onClick={() => onPersonalization({ ...personalization, chatStyle: 'plain' })}>Plain</Chip>
                </ChipRow>
              </div>
              <div style={{ marginTop: 12 }}>
                <Label>AI memory</Label>
                <div className="unit-toggle">
                  <button type="button" aria-pressed={personalization.aiMemory} className={personalization.aiMemory ? 'on' : ''} onClick={() => onPersonalization({ ...personalization, aiMemory: true })}>On</button>
                  <button type="button" aria-pressed={!personalization.aiMemory} className={!personalization.aiMemory ? 'on' : ''} onClick={() => onPersonalization({ ...personalization, aiMemory: false })}>Off</button>
                </div>
                <p className="muted" style={{ marginTop: 6 }}>When on, Bud-E sees recent chat titles and the notes below.</p>
              </div>
              {personalization.aiMemory && (
                <div style={{ marginTop: 12 }}>
                  <Label>Things to remember</Label>
                  <textarea
                    className="input"
                    rows={3}
                    maxLength={500}
                    value={personalization.memoryNotes}
                    onChange={(e) => onPersonalization({ ...personalization, memoryNotes: e.target.value })}
                    placeholder="e.g. prefers flower, usually starts at 5mg, calls the dog Biscuit"
                  />
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                <Label>Offline only</Label>
                <div className="unit-toggle">
                  <button type="button" aria-pressed={personalization.offlineOnly} className={personalization.offlineOnly ? 'on' : ''} onClick={() => onPersonalization({ ...personalization, offlineOnly: true })}>On</button>
                  <button type="button" aria-pressed={!personalization.offlineOnly} className={!personalization.offlineOnly ? 'on' : ''} onClick={() => onPersonalization({ ...personalization, offlineOnly: false })}>Off</button>
                </div>
              </div>
            </section>
          )}

          {view === 'display' && (
            <section className="card" aria-label="Display">
              <Label>Text size</Label>
              <ChipRow>
                {(['small', 'normal', 'large'] as const).map((size) => (
                  <Chip key={size} on={personalization.textSize === size} onClick={() => onPersonalization({ ...personalization, textSize: size })}>
                    {size[0].toUpperCase() + size.slice(1)}
                  </Chip>
                ))}
              </ChipRow>
              <div style={{ marginTop: 12 }}>
                <Label>Accent</Label>
                <ChipRow>
                  {(['default', 'lime', 'amber', 'rose', 'sky'] as const).map((a) => (
                    <Chip key={a} on={personalization.accent === a} onClick={() => onPersonalization({ ...personalization, accent: a })}>
                      {a[0].toUpperCase() + a.slice(1)}
                    </Chip>
                  ))}
                </ChipRow>
              </div>
              <div style={{ marginTop: 12 }}>
                <Label>Reduce motion</Label>
                <div className="unit-toggle">
                  <button type="button" aria-pressed={personalization.reduceMotion} className={personalization.reduceMotion ? 'on' : ''} onClick={() => onPersonalization({ ...personalization, reduceMotion: true })}>On</button>
                  <button type="button" aria-pressed={!personalization.reduceMotion} className={!personalization.reduceMotion ? 'on' : ''} onClick={() => onPersonalization({ ...personalization, reduceMotion: false })}>Off</button>
                </div>
              </div>
            </section>
          )}

          {view === 'voice' && (
            <section className="card" aria-label="Voice">
              <p className="muted">Pick how Bud-E sounds, and whether it talks back out loud.</p>
              <Label>Buddy voice</Label>
              <ChipRow>
                {PERSONAS.filter((p) => !p.secret || premiumTier === 'owner' || (p.secret === 'fourtwenty' && isFourTwentyUnlocked())).map((p) => {
                  // Secret personas (DJ) are gated by the secret, not by
                  // premium — finding the 420 Room is what unlocks them.
                  const locked =
                    (!p.secret && isPremiumPersona(p.id) && !premiumTier) ||
                    (isOwnerPersona(p.id) && premiumTier !== 'owner');
                  return (
                    <Chip
                      key={p.id}
                      on={voice.persona === p.id}
                      onClick={() => !locked && onVoice({ ...voice, persona: p.id })}
                      disabled={locked}
                    >
                      {p.name}{locked ? ' 🔒' : ''}
                    </Chip>
                  );
                })}
              </ChipRow>
              <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
                {personaById(voice.persona).tagline}
              </p>
              <div style={{ marginTop: 16 }}>
                <Label>Hear Bud-E&apos;s replies</Label>
                <div className="unit-toggle">
                  <button
                    type="button"
                    aria-pressed={voice.voiceReplies}
                    className={voice.voiceReplies ? 'on' : ''}
                    onClick={() => onVoice({ ...voice, voiceReplies: true })}
                  >
                    On
                  </button>
                  <button
                    type="button"
                    aria-pressed={!voice.voiceReplies}
                    className={!voice.voiceReplies ? 'on' : ''}
                    onClick={() => onVoice({ ...voice, voiceReplies: false })}
                  >
                    Off
                  </button>
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <Label>Play replies automatically</Label>
                <div className="unit-toggle">
                  <button
                    type="button"
                    aria-pressed={voice.autoPlay}
                    className={voice.autoPlay ? 'on' : ''}
                    onClick={() => onVoice({ ...voice, autoPlay: true })}
                  >
                    On
                  </button>
                  <button
                    type="button"
                    aria-pressed={!voice.autoPlay}
                    className={!voice.autoPlay ? 'on' : ''}
                    onClick={() => onVoice({ ...voice, autoPlay: false })}
                  >
                    Off
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="btn secondary"
                style={{ marginTop: 16 }}
                onClick={() => void tryVoice()}
              >
                {trying ? 'Stop the preview' : 'Try this voice'}
              </button>
            </section>
          )}

          {view === 'premium' && (
            <section className="card" aria-label="Premium">
              {premiumTier === 'owner' ? (
                <>
                  <p>
                    👑 I&apos;m the <strong>Owner</strong>. Everything is unlocked — every voice,
                    every theme, every feature, forever.
                  </p>
                  <ul style={{ margin: '8px 0', paddingLeft: 18 }}>
                    <li>
                      <strong>Kartoon theme</strong> — the owner cut: deep purple night, lime
                      accent. Nobody else can pick it.
                    </li>
                    <li>
                      <strong>Kartoon voice</strong> — Bud-E talks like the owner himself.
                    </li>
                    <li>
                      <strong>Everything in Lit and Cloud Nine</strong> — extra voices, extra
                      themes, session insights, unlimited saved plans, in-app music when it
                      lands, all future premium free.
                    </li>
                    <li>
                      <strong>Your custom persona and custom theme</strong> — the Kartoon ones
                      above, made for you.
                    </li>
                  </ul>
                  <p className="muted">
                    This tier is not for sale and never shows up for anyone else. It lives on
                    your account only.
                  </p>
                  <h3 style={{ marginTop: 16 }}>Mint redeem codes</h3>
                  <p className="muted" style={{ marginTop: 0 }}>
                    Premium is sold as codes (Stripe won&apos;t take this app). Mint a batch,
                    sell them however you get paid, and the buyer types the code in below to
                    unlock. A code works once, for one person.
                  </p>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                      value={genTier}
                      onChange={(e) => setGenTier(e.target.value === 'cloudnine' ? 'cloudnine' : 'lit')}
                      aria-label="Tier"
                    >
                      <option value="lit">Lit — $19</option>
                      <option value="cloudnine">Cloud Nine — $49</option>
                    </select>
                    <select
                      value={genCount}
                      onChange={(e) => setGenCount(Number(e.target.value) || 5)}
                      aria-label="How many"
                    >
                      {[1, 5, 10, 20, 50].map((n) => (
                        <option key={n} value={n}>{n} code{n === 1 ? '' : 's'}</option>
                      ))}
                    </select>
                    <button type="button" className="btn" onClick={() => void submitGenerate()} disabled={genBusy}>
                      {genBusy ? 'Minting…' : 'Mint codes'}
                    </button>
                  </div>
                  {genNote && <p style={{ marginBottom: 0 }}>{genNote}</p>}
                  {genCodes.length > 0 && (
                    <ul style={{ margin: '8px 0 0', paddingLeft: 0, listStyle: 'none' }}>
                      {genCodes.map((code) => (
                        <li key={code} style={{ marginBottom: 6 }}>
                          <button
                            type="button"
                            className="btn secondary"
                            onClick={() => copyCode(code)}
                            style={{ fontFamily: 'monospace' }}
                          >
                            {code} — tap to copy
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <h3 style={{ marginTop: 16 }}>Cash App payments to verify</h3>
                  <p className="muted" style={{ marginTop: 0 }}>
                    Buyers send the money to <strong>{CASHAPP_TAG}</strong> and tap “I paid”.
                    Check Cash App, and when the money is there, tap Confirm — their tier
                    unlocks straight away. Decline takes it off the list when nothing arrived.
                  </p>
                  {pendingCash.length === 0 ? (
                    <p className="muted">Nothing waiting right now.</p>
                  ) : (
                    <ul style={{ margin: '8px 0 0', paddingLeft: 0, listStyle: 'none' }}>
                      {pendingCash.map((p) => (
                        <li key={p.id} className="card" style={{ marginBottom: 8 }}>
                          <div>
                            <strong>{p.tier === 'cloudnine' ? 'Cloud Nine — $49' : 'Lit — $19'}</strong>
                            {' · '}
                            {p.name ?? p.email ?? 'a buyer'}
                            {p.note ? ` · Cash App: ${p.note}` : ''}
                          </div>
                          <div className="muted" style={{ fontSize: 13 }}>
                            {new Date(p.createdAt).toLocaleString()}
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button type="button" className="btn" onClick={() => void submitCashConfirm(p)} disabled={cashBusy}>
                              Confirm — money arrived
                            </button>
                            <button type="button" className="btn secondary" onClick={() => void submitCashDecline(p)} disabled={cashBusy}>
                              Decline
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {cashMsg && <p style={{ marginBottom: 0 }}>{cashMsg}</p>}
                </>
              ) : premiumTier ? (
                <>
                  <p>
                    I&apos;m on <strong>{premiumTier === 'lit' ? 'Lit' : 'Cloud Nine'}</strong>. Extra
                    voices, themes, and insights are unlocked.
                  </p>
                  {premiumTier === 'lit' && (
                    <p className="muted">
                      Got a Cloud Nine code? Redeem it below and it upgrades you — a Lit code
                      can&apos;t take Cloud Nine away, and a code that doesn&apos;t apply stays good
                      for someone else.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p>Unlock more with a one-time purchase. Nothing existing gets paywalled.</p>
                  <ul style={{ margin: '8px 0', paddingLeft: 18 }}>
                    <li>
                      <strong>Lit — $19</strong>: extra voice personas, extra themes + custom colors,
                      session insights, unlimited saved plans, early access.
                    </li>
                    <li>
                      <strong>Cloud Nine — $49</strong>: everything in Lit, plus in-app music when it
                      lands, all future premium free, plus a custom persona and custom theme made for
                      you.
                    </li>
                  </ul>
                </>
              )}
              {premiumTier !== 'owner' && (
                <>
                  <h3 style={{ marginTop: 16 }}>Redeem a code</h3>
                  <p className="muted" style={{ marginTop: 0 }}>
                    Bought a code? Type it in — it unlocks right away. Codes look like
                    BUDE-XXXX-XXXX.
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      value={redeemCode}
                      onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void submitRedeem();
                      }}
                      placeholder="BUDE-XXXX-XXXX"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      style={{ flex: '1 1 160px', fontFamily: 'monospace' }}
                      aria-label="Redeem code"
                    />
                    <button type="button" className="btn" onClick={() => void submitRedeem()} disabled={redeemBusy || redeemCode.trim() === ''}>
                      {redeemBusy ? 'Checking…' : 'Redeem'}
                    </button>
                  </div>
                  {redeemNote && <p style={{ marginBottom: 0 }}>{redeemNote}</p>}
                  <h3 style={{ marginTop: 16 }}>Pay with crypto</h3>
                  <p className="muted" style={{ marginTop: 0 }}>
                    No card needed — pay with any crypto on Coinbase&apos;s checkout page and
                    the tier unlocks when the payment confirms. Same prices, one-time.
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {premiumTier !== 'lit' && premiumTier !== 'cloudnine' && (
                      <button type="button" className="btn" onClick={() => void submitCrypto('lit')} disabled={cryptoBusy}>
                        Pay crypto — Lit $19
                      </button>
                    )}
                    <button type="button" className="btn secondary" onClick={() => void submitCrypto('cloudnine')} disabled={cryptoBusy}>
                      Pay crypto — Cloud Nine $49
                    </button>
                    {(pendingChargeId ?? getPendingChargeId()) && (
                      <button type="button" className="btn secondary" onClick={() => void submitCryptoCheck()} disabled={cryptoBusy}>
                        I’ve paid — check
                      </button>
                    )}
                  </div>
                  {cryptoNote && <p style={{ marginBottom: 0 }}>{cryptoNote}</p>}
                  <h3 style={{ marginTop: 16 }}>Pay with Cash App</h3>
                  <p className="muted" style={{ marginTop: 0 }}>
                    Send it to <strong>{CASHAPP_TAG}</strong> in Cash App, then tap “I paid”
                    below. The owner checks Cash App and confirms it, and your tier unlocks.
                    Same prices, one-time.
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <a className="btn secondary" href={CASHAPP_URL} target="_blank" rel="noreferrer">
                      Open Cash App — {CASHAPP_TAG}
                    </a>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => {
                        try {
                          void navigator.clipboard?.writeText(CASHAPP_TAG);
                          setCashMsg(`Copied ${CASHAPP_TAG}.`);
                        } catch {
                          setCashMsg(`Copy did not work — the tag is ${CASHAPP_TAG}.`);
                        }
                      }}
                    >
                      Copy tag
                    </button>
                  </div>
                  <input
                    value={cashNote}
                    onChange={(e) => setCashNote(e.target.value)}
                    placeholder="Your Cash App name (so he knows it’s you)"
                    autoCorrect="off"
                    spellCheck={false}
                    style={{ marginTop: 8, width: '100%' }}
                    aria-label="Your Cash App name"
                  />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    {premiumTier !== 'lit' && premiumTier !== 'cloudnine' && (
                      <button type="button" className="btn" onClick={() => void submitCashClaim('lit')} disabled={cashBusy}>
                        I paid $19 — Lit
                      </button>
                    )}
                    <button type="button" className="btn secondary" onClick={() => void submitCashClaim('cloudnine')} disabled={cashBusy}>
                      I paid $49 — Cloud Nine
                    </button>
                    <button type="button" className="btn secondary" onClick={() => void refreshCashPayments()} disabled={cashBusy}>
                      Check my payment
                    </button>
                  </div>
                  {cashMsg && <p style={{ marginBottom: 0 }}>{cashMsg}</p>}
                  {myCashPayments.length > 0 && (
                    <ul style={{ margin: '8px 0 0', paddingLeft: 0, listStyle: 'none' }}>
                      {myCashPayments.map((p) => (
                        <li key={p.id} className="muted" style={{ marginBottom: 4 }}>
                          {p.tier === 'cloudnine' ? 'Cloud Nine' : 'Lit'} —{' '}
                          {p.status === 'confirmed'
                            ? '✅ Confirmed, tier unlocked.'
                            : p.status === 'declined'
                              ? 'Declined — no payment was found. Send it and tap “I paid” again.'
                              : '⏳ Waiting for the owner to confirm.'}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>
          )}

          {view === 'lock' && (
            <section className="card" aria-label="App lock">
              <p className="muted" style={{ marginTop: 0 }}>
                Lock Bud-E on this phone, so nobody opening the app sees your stuff.
                The PIN never leaves this phone. Forgot it? The lock screen can sign
                you out and wipe this phone&apos;s copy — your stuff is saved on your
                account, so signing back in brings it back.
              </p>
              {lockFlow ? (
                <>
                  <p style={{ marginTop: 0 }}>
                    <strong>
                      {lockFlow === 'set' && 'Pick a 4-digit PIN.'}
                      {lockFlow === 'set-confirm' && 'Enter it again to confirm.'}
                      {lockFlow === 'change-verify' && 'Enter your current PIN first.'}
                      {lockFlow === 'change-new' && 'Pick a new 4-digit PIN.'}
                      {lockFlow === 'change-confirm' && 'Enter the new PIN again.'}
                      {lockFlow === 'remove-verify' && 'Enter your PIN to remove the lock.'}
                    </strong>
                  </p>
                  <PinPad
                    length={PIN_LENGTH}
                    onComplete={(pin) => {
                      void submitLockPin(pin);
                    }}
                    error={lockError}
                    disabled={lockBusy}
                  />
                  <div style={{ marginTop: 12 }}>
                    <button type="button" className="btn secondary" onClick={cancelLockFlow}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : lockSettings ? (
                <>
                  <p style={{ marginTop: 0 }}>
                    <strong>PIN is on.</strong>{' '}
                    <span className="muted">The app asks for it when you open it.</span>
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => {
                        setLockFlow('change-verify');
                        setLockNote('');
                      }}
                    >
                      Change PIN
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => {
                        setLockFlow('remove-verify');
                        setLockNote('');
                      }}
                    >
                      Remove lock
                    </button>
                  </div>
                  <h3 style={{ marginTop: 20, marginBottom: 8 }}>Fingerprint / face</h3>
                  {!isNative() ? (
                    <p className="muted">
                      Biometrics need the Bud-E phone app — on the web, the PIN is the lock.
                    </p>
                  ) : !biometric.available ? (
                    <p className="muted">
                      {biometric.reason === 'none_enrolled'
                        ? 'No fingerprint or face is set up on this phone yet — set one up in the phone’s Settings, then come back here.'
                        : biometric.reason === 'no_hardware'
                          ? 'This phone has no fingerprint or face sensor.'
                          : 'Fingerprint / face isn’t available on this phone right now.'}
                    </p>
                  ) : (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="checkbox"
                        checked={lockSettings.biometric}
                        onChange={(e) => setBiometric(e.target.checked)}
                      />
                      <span>
                        Unlock with {biometric.type === 'face' ? 'your face' : 'your fingerprint'}
                      </span>
                    </label>
                  )}
                  <h3 style={{ marginTop: 20, marginBottom: 8 }}>Lock when I leave the app</h3>
                  <ChipRow>
                    {[
                      { sec: 0, label: 'Right away' },
                      { sec: 60, label: 'After 1 minute' },
                      { sec: 300, label: 'After 5 minutes' },
                    ].map((opt) => (
                      <Chip
                        key={opt.sec}
                        on={lockSettings.graceSec === opt.sec}
                        onClick={() => setGraceSec(opt.sec)}
                        ariaPressed={lockSettings.graceSec === opt.sec}
                      >
                        {opt.label}
                      </Chip>
                    ))}
                  </ChipRow>
                </>
              ) : (
                <>
                  <p style={{ marginTop: 0 }}>
                    <strong>No lock right now.</strong>{' '}
                    <span className="muted">Anyone opening the app sees Bud-E.</span>
                  </p>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setLockFlow('set');
                      setLockNote('');
                    }}
                  >
                    Set a PIN
                  </button>
                </>
              )}
              {lockNote && (
                <p className="muted" role="status" style={{ marginTop: 12, marginBottom: 0 }}>
                  {lockNote}
                </p>
              )}
            </section>
          )}

          {view === 'data' && (
            <section className="card" aria-label="Privacy">
              <p className="muted">These stay on this device until you clear them.</p>
              <button
                type="button"
                className="btn secondary btn-block"
                onClick={() => {
                  onClearChats();
                  setClearNote('All chats cleared.');
                }}
              >
                Clear all chats
              </button>
              <button
                type="button"
                className="btn secondary btn-block"
                style={{ marginTop: 8 }}
                onClick={() => {
                  onClearJournal();
                  setClearNote('Journal cleared.');
                }}
              >
                Clear journal
              </button>
              {clearNote && (
                <p className="muted" role="status" style={{ marginTop: 12, marginBottom: 0 }}>
                  {clearNote}
                </p>
              )}
              <button
                type="button"
                className="btn secondary btn-block"
                style={{ marginTop: 8 }}
                disabled={exporting}
                onClick={() => {
                  setExporting(true);
                  setExportNote(null);
                  exportDataJson({ journal, chats, personalization })
                    .then(() => setExportNote('Done — pick where to save or send it.'))
                    .catch(() => setExportNote('Export did not go through — try again.'))
                    .finally(() => setExporting(false));
                }}
              >
                {exporting ? 'Exporting…' : 'Export my data'}
              </button>
              {exportNote && (
                <p className="muted" role="status" style={{ marginTop: 12, marginBottom: 0 }}>
                  {exportNote}
                </p>
              )}
            </section>
          )}

          {view === 'about' && (
            <>
              <section className="card" aria-label="About Bud-E">
                <p style={{ marginTop: 8 }}>
                  Bud-E is a 21+ companion. Not a doctor, not a shop, and not legal advice. Start low, go
                  slow. Never drive high.
                </p>
                <p className="muted" style={{ marginBottom: 0 }}>
                  Your chat always stays on this device. When you are signed in, your journal, stash, and
                  settings sync to your account so they follow you — nothing else leaves this phone.
                </p>
                <p className="muted" style={{ marginBottom: 0 }}>
                  Built by N3xUs Konc3pt&apos;z. Some things in here are only found, never told.
                </p>
              </section>
              <section className="card" aria-label="Legal">
                <div className="legal-list">
                  <button type="button" className="legal-row" onClick={() => setView('about-doc')}>
                    <span>
                      <strong>About Bud-E</strong>
                      <span className="muted">What it is, who makes it</span>
                    </span>
                    <span aria-hidden>›</span>
                  </button>
                  <button type="button" className="legal-row" onClick={() => setView('privacy-doc')}>
                    <span>
                      <strong>Privacy Policy</strong>
                      <span className="muted">What we keep, what we never do</span>
                    </span>
                    <span aria-hidden>›</span>
                  </button>
                  <button type="button" className="legal-row" onClick={() => setView('terms-doc')}>
                    <span>
                      <strong>Terms of Service</strong>
                      <span className="muted">21+, safety, and the rules</span>
                    </span>
                    <span aria-hidden>›</span>
                  </button>
                  {user && (
                    <button
                      type="button"
                      className="legal-row danger-row"
                      onClick={() => setView('delete')}
                    >
                      <span>
                        <strong>Delete my account</strong>
                        <span className="muted">Wipes your account and everything in it</span>
                      </span>
                      <span aria-hidden>›</span>
                    </button>
                  )}
                </div>
                {!user && (
                  <p className="muted" style={{ marginBottom: 0 }}>
                    Sign in to see the delete-account option here.
                  </p>
                )}
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
