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
import { APP_VERSION, COPYRIGHT, getLegalDoc } from './legal';
import type { LegalDoc } from './legal';
import type { AuthUser } from './lib/auth-client';
import { PERSONAS, personaById, isPremiumPersona } from './voice';
import type { VoiceSettings } from './voice';
import { speakVoice, stopVoice } from './lib/voice-client';
import { Chip, ChipRow, Label, PageHead } from './bits';
import type { Personalization } from './lib/sync';
import type { JournalEntry } from './journal';
import type { SyncedChatConversation } from './lib/sync';
import { getAssistantStatus, getBubbleStatus, getTalkNotification, isNative, openDefaultAppsSettings, openOverlaySettings, setBubbleEnabled, setTalkNotification } from './lib/device-actions';

// 'main' is the menu. The rest open one section. The '-doc' views are the
// legal documents, reached from the About & legal section.
type SettingsView =
  | 'main'
  | 'appearance'
  | 'phone'
  | 'personalization'
  | 'display'
  | 'voice'
  | 'premium'
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
  personalization: 'Personalization',
  display: 'Display',
  voice: 'Voice',
  premium: 'Premium',
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
  premiumTier?: 'lit' | 'cloudnine' | null;
  personalization: Personalization;
  onPersonalization: (p: Personalization) => void;
  onClearChats: () => void;
  onClearJournal: () => void;
  journal: JournalEntry[];
  chats: SyncedChatConversation[];
}) {
  const {
    theme, onTheme, user, onDeleteAccount, voice, onVoice, apiBase,
    premiumTier = null, personalization, onPersonalization,
    onClearChats, onClearJournal, journal, chats,
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
  const tierName = premiumTier === 'lit' ? 'Lit' : premiumTier === 'cloudnine' ? 'Cloud Nine' : null;

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
                {THEMES.map((item) => {
                  const locked = item.premium && !premiumTier;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="theme-swatch"
                      data-swatch={item.id}
                      aria-pressed={theme === item.id}
                      disabled={locked}
                      onClick={() => !locked && onTheme(item.id)}
                      title={locked ? 'Premium theme — unlock with Lit' : undefined}
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
                {PERSONAS.map((p) => {
                  const locked = isPremiumPersona(p.id) && !premiumTier;
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
              {premiumTier ? (
                <p>
                  I&apos;m on <strong>{premiumTier === 'lit' ? 'Lit' : 'Cloud Nine'}</strong>. Extra
                  voices, themes, and insights are unlocked.
                </p>
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
                  <p className="muted">
                    Checkout is switched off for now. Payments are not set up yet — cannabis-related
                    businesses may need special approval from the processor before this can go live.
                  </p>
                  <button type="button" className="btn" disabled>
                    Get Lit — $19 (coming soon)
                  </button>
                  <button type="button" className="btn secondary" style={{ marginLeft: 8 }} disabled>
                    Get Cloud Nine — $49 (coming soon)
                  </button>
                </>
              )}
            </section>
          )}

          {view === 'data' && (
            <section className="card" aria-label="Privacy">
              <p className="muted">These stay on this device until you clear them.</p>
              <button type="button" className="btn secondary btn-block" onClick={onClearChats}>
                Clear all chats
              </button>
              <button type="button" className="btn secondary btn-block" style={{ marginTop: 8 }} onClick={onClearJournal}>
                Clear journal
              </button>
              <button
                type="button"
                className="btn secondary btn-block"
                style={{ marginTop: 8 }}
                onClick={() => {
                  const blob = new Blob(
                    [JSON.stringify({ journal, chats, personalization }, null, 2)],
                    { type: 'application/json' },
                  );
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'bude-export.json';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Export my data
              </button>
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
