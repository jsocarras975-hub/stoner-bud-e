import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Brain,
  Check,
  ClipboardList,
  Cookie,
  Ellipsis,
  LayoutGrid,
  Leaf,
  MessageCircle,
  Mic,
  Moon,
  Music,
  Package,
  Pause,
  Scale,
  Send,
  Settings,
  Timer,
  UserRound,
  Volume2,
  Wind,
} from 'lucide-react';
import {
  DEFAULT_SESSION,
  HIGH_THOUGHTS,
  METHOD_LABELS,
  SNACK_COMBOS,
  TRIVIA,
  formatClock,
  localReply,
  minutesSinceTaken,
  parseClock,
  pickRandom,
} from './bude';
import type { ChatMessage, Session } from './bude';
import StrainsTab from './StrainsTab';
import MusicTab from './MusicTab';
import TonightTab from './TonightTab';
import SettingsTab from './SettingsTab';
import { AGE_GATE_KEY, THEME_KEY, isThemeId, loadTheme } from './theme';
import type { ThemeId } from './theme';
import JournalTab from './JournalTab';
import StashTab from './StashTab';
import BreakTab from './BreakTab';
import DoseTab from './DoseTab';
import { JOURNAL_KEY, journalSummary } from './journal';
import type { JournalEntry } from './journal';
import { STASH_KEY } from './stash';
import type { StashItem } from './stash';
import AuthTab from './AuthTab';
import { clearLocalSyncState, queueDeletion, uploadLocal } from './lib/sync';
import type { SyncSettings } from './lib/sync';
import { deleteAccount, getSession, signOut } from './lib/auth-client';
import type { AuthUser } from './lib/auth-client';
import { DEFAULT_VOICE_SETTINGS, cleanVoiceSettings } from './voice';
import type { VoiceSettings } from './voice';
import { speakVoice, startRecording, stopVoice, transcribeVoice } from './lib/voice-client';
import type { ActiveRecording } from './lib/voice-client';
import { TIMER_ALERTS, buzz, planAlerts, type PlannedAlert, type TimerAlert, type TimerAlertId } from './lib/timer-alerts';
import {
  cancelNativeAlerts,
  checkAlertPermission,
  isNativeApp,
  requestAlertPermission,
  scheduleNativeAlert,
  scheduleNativeAlerts,
  type AlertPermission,
} from './lib/timer-notifications';
import { Chip, ChipRow, Label, PageHead } from './bits';

const TRANSCRIPT_KEY = 'bude-transcript-v1';
const SESSION_KEY = 'bude-session-v1';
const VIBE_KEY = 'bude-vibe-v1';
const VOICE_KEY = 'bude-voice-v1';

/** Voice settings are a device preference (like the theme) — they also sync. */
function loadVoiceSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem(VOICE_KEY);
    if (!raw) return { ...DEFAULT_VOICE_SETTINGS };
    return cleanVoiceSettings(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_VOICE_SETTINGS };
  }
}

// Where live AI lives. On plain web the API is same-origin, so a relative
// path is right. Inside the Capacitor APK the app runs from a local origin
// (capacitor://localhost) with no server, so a relative path would go
// nowhere — point it at the live Vercel deployment instead. A build-time
// VITE_API_URL override wins over both.
const LIVE_ORIGIN = 'https://stoner-bud-e-toonzkorner-9149s-projects.vercel.app';

/** Base URL for every /api call. Same Capacitor/live logic as before. */
function apiBase(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (typeof envUrl === 'string' && envUrl.trim() !== '') {
    return `${envUrl.replace(/\/$/, '')}/api`;
  }
  const isCapacitor =
    typeof window !== 'undefined' &&
    (window as unknown as { Capacitor?: unknown }).Capacitor !== undefined;
  if (isCapacitor) return `${LIVE_ORIGIN}/api`;
  return '/api';
}

function apiUrl(): string {
  return `${apiBase()}/chat`;
}

type Tab = 'tonight' | 'chat' | 'tools' | 'plan' | 'strains' | 'music' | 'journal' | 'stash' | 'break' | 'dose' | 'settings' | 'account';
type Source = 'live' | 'fallback' | null;

/** Which tool is open inside the Tools tab (Grok drill-in). Null = the tool grid. */
type ToolId = 'timer' | 'breathe' | 'munchies' | 'thoughts' | 'trivia';

/** Live state of the edible timer, lifted to App so the header pill can show it. */
interface TimerState {
  status: 'idle' | 'running' | 'paused' | 'done';
  remainingSec: number;
  totalSec: number;
}

const IDLE_TIMER: TimerState = { status: 'idle', remainingSec: 0, totalSec: 0 };

/** Bottom-nav destinations (8 slots: 7 tabs + More). All 11 tabs stay reachable. */
const NAV_ITEMS: { id: Tab; label: string; icon: typeof Moon }[] = [
  { id: 'tonight', label: 'Tonight', icon: Moon },
  { id: 'chat', label: 'Buddy', icon: MessageCircle },
  { id: 'stash', label: 'Stash', icon: Package },
  { id: 'journal', label: 'Log', icon: BookOpen },
  { id: 'tools', label: 'Tools', icon: LayoutGrid },
  { id: 'plan', label: 'Plan', icon: ClipboardList },
  { id: 'account', label: 'You', icon: UserRound },
];

/** Destinations that live in the More sheet above the nav. */
const MORE_ITEMS: { id: Tab; label: string; icon: typeof Leaf }[] = [
  { id: 'music', label: 'Music', icon: Music },
  { id: 'strains', label: 'Strains', icon: Leaf },
  { id: 'break', label: 'Break', icon: Pause },
  { id: 'dose', label: 'Dose', icon: Scale },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const MORE_TAB_IDS: Tab[] = MORE_ITEMS.map((item) => item.id);

interface Vibe {
  setting: string;
  sound: string;
  snack: string;
  energy: string;
}

const DEFAULT_VIBE: Vibe = {
  setting: 'couch',
  sound: 'music',
  snack: 'something salty',
  energy: 'chill',
};

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) } as T;
  } catch {
    return fallback;
  }
}

function loadList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked — the app still works, it just won't remember.
  }
}

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('tonight');
  const [theme, setTheme] = useState<ThemeId>(() => loadTheme());
  const [ageConfirmed, setAgeConfirmed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AGE_GATE_KEY) === 'yes';
    } catch {
      return false;
    }
  });
  const [ageDeclined, setAgeDeclined] = useState(false);
  const [session, setSession] = useState<Session>(() => load(SESSION_KEY, DEFAULT_SESSION));
  const [transcript, setTranscript] = useState<ChatMessage[]>(() => loadList(TRANSCRIPT_KEY));
  const [vibe, setVibe] = useState<Vibe>(() => load(VIBE_KEY, DEFAULT_VIBE));
  const [voice, setVoice] = useState<VoiceSettings>(() => loadVoiceSettings());
  const [journal, setJournal] = useState<JournalEntry[]>(() => loadList(JOURNAL_KEY));
  const [stash, setStash] = useState<StashItem[]>(() => loadList(STASH_KEY));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [syncMessage, setSyncMessage] = useState('');
  // Guards the debounced sync effect while a server state is being applied,
  // so applying a download does not immediately trigger an upload of itself.
  const applyingServerState = useRef(false);
  const userRef = useRef<AuthUser | null>(null);
  userRef.current = user;
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [source, setSource] = useState<Source>(null);
  const [timerStatus, setTimerStatus] = useState('No timer running yet.');
  const [timerState, setTimerState] = useState<TimerState>(IDLE_TIMER);
  // The latest edible-timer milestone alert (kick-in / peak / wearing-off).
  // Lifted to App so the banner shows on every tab, not just Tools.
  const [timerAlert, setTimerAlert] = useState<TimerAlert | null>(null);
  // Which tool is open in the Tools tab (null = the grid). Lifted to App so
  // the header timer pill can open the timer tool directly (Grok behavior).
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Close the More menu on Escape, and whenever the tab changes.
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  useEffect(() => {
    setMoreOpen(false);
  }, [tab]);

  // Who is signed in? Runs once on load; signed-out is fine, not an error.
  useEffect(() => {
    let cancelled = false;
    void getSession().then((u) => {
      if (!cancelled) setUser(u);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Storage blocked — the theme still applies for this visit.
    }
  }, [theme]);

  useEffect(() => save(SESSION_KEY, session), [session]);
  useEffect(() => save(TRANSCRIPT_KEY, transcript), [transcript]);
  useEffect(() => save(VIBE_KEY, vibe), [vibe]);
  useEffect(() => save(VOICE_KEY, voice), [voice]);
  useEffect(() => save(JOURNAL_KEY, journal), [journal]);
  useEffect(() => save(STASH_KEY, stash), [stash]);

  // While signed in, push local changes up a couple of seconds after the user
  // stops editing. Skipped when offline, when signed out, and while a server
  // state is being applied (Step 4). "Sync now" in the Account tab covers the
  // impatient path; sign-in covers the returning-device path.
  useEffect(() => {
    if (!user || !isOnline || applyingServerState.current) return;
    const id = window.setTimeout(() => {
      void syncNow('change');
    }, 2000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journal, stash, session, vibe, voice, theme, user, isOnline]);

  function deductFromStash(stashId: string, amount: number, unit: 'mg' | 'g'): void {
    setStash((items) =>
      items.map((i) =>
        i.id === stashId && i.unit === unit
          ? { ...i, amount: Math.max(0, Math.round((i.amount - amount) * 100) / 100) }
          : i,
      ),
    );
  }

  const BREAK_KEY = 'bude-break-v1';

  function readBreak(): SyncSettings['break'] {
    try {
      const raw = localStorage.getItem(BREAK_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SyncSettings['break'];
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  function currentSettings(): SyncSettings {
    return {
      theme,
      experience: session.experience,
      session,
      vibe,
      voice,
      break: readBreak(),
    };
  }

  function applyServerState(state: {
    journal: JournalEntry[];
    stash: StashItem[];
    settings: SyncSettings | null;
  }): void {
    applyingServerState.current = true;
    setJournal(state.journal);
    setStash(state.stash);
    if (state.settings) {
      if (state.settings.theme && isThemeId(state.settings.theme)) {
        setTheme(state.settings.theme);
      }
      if (state.settings.session) {
        setSession({ ...DEFAULT_SESSION, ...state.settings.session });
      }
      if (state.settings.vibe) setVibe(state.settings.vibe);
      if (state.settings.voice) setVoice(cleanVoiceSettings(state.settings.voice));
      try {
        if (state.settings.break) {
          localStorage.setItem(BREAK_KEY, JSON.stringify(state.settings.break));
        } else {
          localStorage.removeItem(BREAK_KEY);
        }
      } catch {
        // Storage blocked — the break just won't carry over this time.
      }
    }
    // Let the state settle before the change-sync effect runs again.
    window.setTimeout(() => {
      applyingServerState.current = false;
    }, 500);
  }

  async function syncNow(reason: string): Promise<void> {
    const currentUser = userRef.current;
    if (!currentUser) return;
    setSyncMessage('Syncing…');
    try {
      const state = await uploadLocal({ journal, stash }, currentSettings());
      applyServerState(state);
      setSyncMessage(`Synced just now${reason === 'signin' ? ' — your stuff from this device is now on your account.' : '.'}`);
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : 'Sync did not work — try again.');
    }
  }

  function handleAuthChange(next: AuthUser | null): void {
    const wasSignedOut = user === null;
    setUser(next);
    if (next && wasSignedOut) {
      // First sync for this session: push this device's local lists up, then
      // take the merged server state as the source of truth.
      void syncNow('signin');
    }
    if (!next) {
      // Signed out: local data stays put as the offline cache. Nothing is wiped.
      setSyncMessage('Signed out. Your stuff is still saved on this device.');
    }
  }

  /**
   * Delete the signed-in account (Settings → Legal → Delete my account).
   * Server rows go first (api/account/delete); then the session cookie is
   * dropped, the user is cleared (which also cancels any pending sync
   * upload), and this device's account data is wiped — journal, stash,
   * chat transcript, session, vibe, break, and all sync state. Theme and
   * the age gate are device preferences, not account data, so they stay.
   * Throws when the server delete fails, so the Settings screen can show
   * the error and nothing is wiped.
   */
  async function handleAccountDeleted(): Promise<void> {
    await deleteAccount();
    try {
      await signOut();
    } catch {
      // The session row is already gone — the cookie is dead either way.
    }
    setUser(null);
    clearLocalSyncState();
    try {
      localStorage.removeItem(JOURNAL_KEY);
      localStorage.removeItem(STASH_KEY);
      localStorage.removeItem(TRANSCRIPT_KEY);
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(VIBE_KEY);
      localStorage.removeItem(BREAK_KEY);
    } catch {
      // Storage blocked — the state reset below still clears the screen.
    }
    setJournal([]);
    setStash([]);
    setTranscript([]);
    setSession(DEFAULT_SESSION);
    setVibe(DEFAULT_VIBE);
    setTab('tonight');
    setSyncMessage('Your account is deleted. This device is back to fresh, signed-out Bud-E.');
  }

  function askAboutStrain(name: string): void {
    setPendingQuestion(`Tell me about ${name} — what kind of high is it, and what should I know?`);
    setTab('chat');
  }

  function confirmAge(): void {
    try {
      localStorage.setItem(AGE_GATE_KEY, 'yes');
    } catch {
      // Storage blocked — still let them in for this visit.
    }
    setAgeDeclined(false);
    setAgeConfirmed(true);
  }

  if (!ageConfirmed) {
    return (
      <AgeGate declined={ageDeclined} onConfirm={confirmAge} onDecline={() => setAgeDeclined(true)} />
    );
  }

  const who = user ? user.name : 'Your account';
  const showTimer = timerState.status !== 'idle';
  const timerPct =
    timerState.totalSec > 0
      ? Math.min(100, Math.max(0, (1 - timerState.remainingSec / timerState.totalSec) * 100))
      : 0;
  const moreActive = MORE_TAB_IDS.includes(tab);

  return (
    <div className="app-shell">
      <div className="app-frame">
        <div className="garden-glow" aria-hidden />
        <header className="app-header">
          <button
            type="button"
            className="brand-btn"
            onClick={() => setTab('account')}
            aria-label={user ? `Your account, ${who}` : 'Your account'}
          >
            <span className="brand-avatar">
              <img src="/garden/leaf.jpg" alt="" />
            </span>
            <span className="brand-text">
              <span className="brand-word">Bud-E</span>
              <span className="brand-who">{who}</span>
            </span>
          </button>
          <div className="header-actions">
            {source === 'live' && <span className="badge live">● Live AI</span>}
            {source === 'fallback' && <span className="badge offline">● Offline buddy</span>}
            {source === null && <span className="badge">Say hey to get started</span>}
            <button
              type="button"
              className="icon-btn"
              aria-label="Settings"
              aria-pressed={tab === 'settings'}
              onClick={() => setTab('settings')}
            >
              <Settings size={18} aria-hidden />
            </button>
            <span className="age-pill">21+</span>
          </div>
        </header>

        {showTimer && (
          <button
            type="button"
            className="timer-pill"
            onClick={() => {
              setActiveTool('timer');
              setTab('tools');
            }}
            aria-label="Edible timer — open the timer tool"
          >
            <span className="timer-pill-row">
              <span className="timer-pill-label">
                <Timer size={16} aria-hidden />
                {timerState.status === 'done' ? "Wait's over" : 'Edible timer'}
              </span>
              <span className="timer-pill-time">{formatCountdown(timerState.remainingSec)}</span>
            </span>
            {timerState.status !== 'done' && (
              <span className="timer-pill-track" aria-hidden>
                <span className="timer-pill-fill" style={{ width: `${timerPct}%` }} />
              </span>
            )}
          </button>
        )}

        <div className={tab === 'chat' ? 'app-content chat-active' : 'app-content'}>
          {timerAlert && (
            <div className="alert-banner" role="status">
              <div className="alert-banner-text">
                <strong>{timerAlert.title}</strong>
                <span>{timerAlert.body}</span>
              </div>
              <div className="alert-banner-actions">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTool('timer');
                    setTab('tools');
                    setTimerAlert(null);
                  }}
                >
                  See timer
                </button>
                <button type="button" aria-label="Dismiss" onClick={() => setTimerAlert(null)}>
                  ✕
                </button>
              </div>
            </div>
          )}
          {!isOnline && (
            <p className="offline-banner" role="status">
              📶 You&apos;re offline — Bud-E&apos;s tools still work, but chat needs internet for
              live AI.
            </p>
          )}

      {tab === 'tonight' && (
        <TonightTab
          session={session}
          setSession={setSession}
          vibe={vibe}
          timerStatus={timerStatus}
          onChat={() => setTab('chat')}
          onTools={() => setTab('tools')}
        />
      )}
      {tab === 'chat' && (
        <ChatTab
          session={session}
          transcript={transcript}
          setTranscript={setTranscript}
          setSource={setSource}
          journalNote={journalSummary(journal)}
          prefill={pendingQuestion}
          onPrefillUsed={() => setPendingQuestion(null)}
          onGoTonight={() => setTab('tonight')}
          voice={voice}
        />
      )}
      {tab === 'tools' && (
        <ToolsTab
          session={session}
          timerStatus={timerStatus}
          setTimerStatus={setTimerStatus}
          onTimerState={setTimerState}
          onAlert={setTimerAlert}
          activeTool={activeTool}
          onToolChange={setActiveTool}
        />
      )}
      {tab === 'plan' && (
        <PlanTab
          session={session}
          vibe={vibe}
          setVibe={setVibe}
          timerStatus={timerStatus}
          onGoTonight={() => setTab('tonight')}
        />
      )}
      {tab === 'strains' && <StrainsTab onAskAbout={askAboutStrain} />}
      {tab === 'music' && <MusicTab />}
      {tab === 'journal' && (
        <JournalTab
          key={`${session.method}-${session.amount}-${session.timeTaken}`}
          entries={journal}
          onAdd={(e) => setJournal((j) => [e, ...j])}
          onDelete={(id) => {
            // Queue the tombstone first: the delete must sync even if the
            // user signs out or closes the app before the next upload.
            queueDeletion('journal', id);
            setJournal((j) => j.filter((e) => e.id !== id));
          }}
          session={session}
          stash={stash}
          onDeduct={deductFromStash}
        />
      )}
      {tab === 'stash' && (
        <StashTab
          items={stash}
          onChange={setStash}
          onDelete={(id) => queueDeletion('stash', id)}
        />
      )}
      {tab === 'break' && <BreakTab />}
      {tab === 'dose' && <DoseTab />}
      {tab === 'settings' && (
        <SettingsTab
          theme={theme}
          onTheme={setTheme}
          user={user}
          onDeleteAccount={handleAccountDeleted}
          voice={voice}
          onVoice={setVoice}
          apiBase={apiBase()}
        />
      )}
      {tab === 'account' && (
        <AuthTab
          user={user}
          onAuthChange={handleAuthChange}
          onSyncNow={() => void syncNow('manual')}
          syncMessage={syncMessage}
          nights={journal.length}
          stocked={stash.filter((i) => i.amount > 0).length}
          onGoSettings={() => setTab('settings')}
        />
      )}
        </div>

        {moreOpen && (
          <button
            type="button"
            className="more-backdrop"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
          />
        )}
        <div className="nav-wrap">
          {moreOpen && (
            <div className="more-sheet" role="menu" aria-label="More destinations">
              {MORE_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    className="more-item"
                    onClick={() => {
                      setTab(item.id);
                      setMoreOpen(false);
                    }}
                  >
                    <Icon size={22} aria-hidden />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
          <nav className="bottom-nav" aria-label="Main">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const on = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={on ? 'nav-item active' : 'nav-item'}
                  aria-current={on ? 'page' : undefined}
                  onClick={() => setTab(item.id)}
                >
                  <Icon size={28} aria-hidden />
                  <span>{item.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              className={moreActive ? 'nav-item active' : 'nav-item'}
              aria-current={moreActive ? 'page' : undefined}
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              onClick={() => setMoreOpen((open) => !open)}
            >
              <Ellipsis size={28} aria-hidden />
              <span>More</span>
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 21+ age gate — first open only. Plain words, no lecture.
// ---------------------------------------------------------------------------

function AgeGate({
  declined,
  onConfirm,
  onDecline,
}: {
  declined: boolean;
  onConfirm: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="age-gate">
      <div className="garden-glow" aria-hidden />
      <div>
        <div className="garden-hero">
          <img src="/garden/leaf.jpg" alt="Green leaves in a calm night garden" />
        </div>
        <p className="eyebrow">21+ session companion</p>
        <h1>Bud-E</h1>
        <p className="muted" style={{ marginTop: 12, fontSize: '1.15rem', lineHeight: 1.4 }}>
          A calm buddy for the night you already started. Timers, straight answers, no lecture.
        </p>
      </div>
      <div>
        {declined ? (
          <>
            <h2>This one is for adults.</h2>
            <p className="muted">
              Bud-E is only for people 21 and over. If that was a mis-tap, you can continue.
            </p>
            <button className="btn btn-block" onClick={onConfirm}>
              I am 21 or older
            </button>
          </>
        ) : (
          <>
            <p className="muted">
              Cannabis information for adults. Bud-E is not a doctor, not a shop, and not legal
              advice. Start low, go slow. Never drive high.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
              <button className="btn btn-block" onClick={onConfirm}>
                I&apos;m 21 or older
              </button>
              <button className="btn secondary btn-block" onClick={onDecline}>
                I&apos;m under 21
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat tab — Grok Buddy layout: title + session pill, scrolling messages,
// prompt chips + pinned composer. Session editing moved to Tonight.
// ---------------------------------------------------------------------------

const CHAT_PROMPTS = [
  'When will this hit?',
  'I feel too high',
  'Can I take more?',
  'What should I eat?',
  'Can I drive?',
  'What dose should I start with?',
];

function ChatTab({
  session,
  transcript,
  setTranscript,
  setSource,
  journalNote,
  prefill,
  onPrefillUsed,
  onGoTonight,
  voice,
}: {
  session: Session;
  transcript: ChatMessage[];
  setTranscript: (t: ChatMessage[]) => void;
  setSource: (s: Source) => void;
  journalNote: string;
  prefill: string | null;
  onPrefillUsed: () => void;
  onGoTonight: () => void;
  voice: VoiceSettings;
}) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Which Bud-E message is being read out loud right now (null = none).
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  // Tap-to-talk mic state.
  const [recording, setRecording] = useState(false);
  const [voiceNote, setVoiceNote] = useState('');
  const recordingRef = useRef<ActiveRecording | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const noteTimerRef = useRef<number | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [transcript, sending]);

  // Stop any playback and clear the mic timers when leaving the chat.
  useEffect(() => {
    return () => {
      stopVoice();
      if (recordTimerRef.current !== null) window.clearTimeout(recordTimerRef.current);
      if (noteTimerRef.current !== null) window.clearTimeout(noteTimerRef.current);
    };
  }, []);

  // "Ask Bud-E about this strain" drops the question into the chat box.
  useEffect(() => {
    if (prefill !== null) {
      setInput(prefill);
      onPrefillUsed();
    }
  }, [prefill, onPrefillUsed]);

  /** Read a Bud-E reply out loud when voice replies + auto-play are on. */
  function speakReply(text: string, index: number): void {
    if (!voice.voiceReplies || !voice.autoPlay) return;
    void (async () => {
      setSpeakingIdx(index);
      await speakVoice(apiBase(), text, voice.persona);
      setSpeakingIdx((cur) => (cur === index ? null : cur));
    })();
  }

  /** Tap the speaker on a Bud-E message: play it, or stop it if playing. */
  async function toggleSpeak(index: number, text: string): Promise<void> {
    if (speakingIdx === index) {
      stopVoice();
      setSpeakingIdx(null);
      return;
    }
    stopVoice();
    setSpeakingIdx(index);
    await speakVoice(apiBase(), text, voice.persona);
    setSpeakingIdx((cur) => (cur === index ? null : cur));
  }

  /** Short plain note in the chat foot; fades after a few seconds. */
  function showVoiceNote(note: string): void {
    setVoiceNote(note);
    if (noteTimerRef.current !== null) window.clearTimeout(noteTimerRef.current);
    noteTimerRef.current = window.setTimeout(() => setVoiceNote(''), 6000);
  }

  /** Stop a recording and send what was heard as a normal message. */
  async function stopAndSendRecording(): Promise<void> {
    if (recordTimerRef.current !== null) {
      window.clearTimeout(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    const rec = recordingRef.current;
    recordingRef.current = null;
    setRecording(false);
    if (!rec) return;
    const blob = await rec.stop();
    if (!blob || blob.size === 0) {
      showVoiceNote("Couldn't hear that — try typing it.");
      return;
    }
    const text = await transcribeVoice(apiBase(), blob);
    if (!text || text.trim() === '') {
      showVoiceNote("Couldn't hear that — try typing it.");
      return;
    }
    await sendText(text);
  }

  /** Tap the mic: start recording; tap again (or 60s) to stop and send. */
  async function toggleMic(): Promise<void> {
    if (recording) {
      await stopAndSendRecording();
      return;
    }
    if (sending) return;
    const rec = await startRecording();
    if (!rec) {
      showVoiceNote("Couldn't hear that — try typing it.");
      return;
    }
    recordingRef.current = rec;
    setRecording(true);
    recordTimerRef.current = window.setTimeout(() => {
      void stopAndSendRecording();
    }, 60000);
  }

  async function sendText(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    // A new message stops whatever Bud-E was reading out loud.
    stopVoice();
    setSpeakingIdx(null);
    const next: ChatMessage[] = [...transcript, { role: 'user', text: trimmed }];
    setTranscript(next);
    setInput('');
    setSending(true);
    try {
      const res = await fetch(apiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.slice(-12),
          session,
          persona: voice.persona,
          ...(journalNote !== '' ? { journal: journalNote } : {}),
        }),
      });
      const data: unknown = await res.json();
      const reply =
        data && typeof data === 'object' && 'reply' in data
          ? (data as { reply?: unknown }).reply
          : undefined;
      const src =
        data && typeof data === 'object' && 'source' in data
          ? (data as { source?: unknown }).source
          : undefined;
      const sources =
        data && typeof data === 'object' && 'sources' in data
          ? (data as { sources?: unknown }).sources
          : undefined;
      if (typeof reply === 'string' && reply.trim() !== '') {
        const budMsg: ChatMessage = { role: 'bud', text: reply };
        if (Array.isArray(sources)) {
          const clean = sources
            .filter(
              (s): s is { title: string; url: string } =>
                !!s && typeof s === 'object' && typeof (s as { url?: unknown }).url === 'string',
            )
            .map((s) => ({
              title:
                typeof s.title === 'string' && s.title.trim() !== '' ? s.title : s.url,
              url: s.url,
            }));
          if (clean.length > 0) budMsg.sources = clean;
        }
        setTranscript([...next, budMsg]);
        setSource(src === 'live' ? 'live' : 'fallback');
        speakReply(reply, next.length);
      } else {
        throw new Error('no live reply');
      }
    } catch {
      // No key, no network, server hiccup — the offline buddy always answers.
      const fallbackText = localReply(trimmed, session, next);
      setTranscript([...next, { role: 'bud', text: fallbackText }]);
      setSource('fallback');
      speakReply(fallbackText, next.length);
    } finally {
      setSending(false);
    }
  }

  function send(): void {
    void sendText(input);
  }

  const amount = session.amount.trim();
  const doseText = amount ? `${amount}${session.unit}` : '';

  return (
    <div className="chat-shell">
      <div className="chat-scroll" role="log" aria-live="polite">
        <div>
          <h1 className="page-title">Buddy</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            Ask anything — Bud-E answers with your session in mind.
          </p>
        </div>

        <button type="button" className="chat-session-pill" onClick={onGoTonight}>
          {amount !== '' ? (
            <>
              <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{doseText}</span>
              <span className="muted"> · {METHOD_LABELS[session.method]} · edit</span>
            </>
          ) : (
            <span className="muted">
              No dose logged — tap to add one so answers use your numbers.
            </span>
          )}
        </button>

        {transcript.length === 0 && !sending && (
          <div className="chat-empty-card">
            <p style={{ margin: 0 }}>
              Heyy! Tell me what you took tonight, or ask me anything — like “when will this edible
              kick in?”
            </p>
          </div>
        )}

        {transcript.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'msg user' : 'msg bud'}>
            <span className="who">{m.role === 'user' ? 'You' : 'Bud-E'}</span>
            {m.text}
            {m.role === 'bud' && m.sources && m.sources.length > 0 && (
              <span className="chat-sources">
                Sources:{' '}
                {m.sources.map((s, j) => (
                  <span key={j}>
                    {j > 0 ? ' · ' : ''}
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.title}
                    </a>
                  </span>
                ))}
              </span>
            )}
            {m.role === 'bud' && (
              <button
                type="button"
                className="msg-speak"
                onClick={() => void toggleSpeak(i, m.text)}
                aria-label={speakingIdx === i ? 'Stop reading out loud' : 'Hear this out loud'}
              >
                <Volume2 size={14} aria-hidden />
                {speakingIdx === i ? 'Stop' : 'Hear it'}
              </button>
            )}
          </div>
        ))}
        {sending && (
          <div className="msg bud">
            <span className="who">Bud-E</span>thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-composer">
        <div className="chat-prompts">
          {CHAT_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="chat-prompt"
              disabled={sending}
              onClick={() => void sendText(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
        <form
          className="chat-input-row"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            type="text"
            value={input}
            placeholder="Ask Bud-E anything…"
            aria-label="Message Bud-E"
            onChange={(e) => setInput(e.target.value)}
            disabled={sending}
          />
          <button
            type="button"
            className={recording ? 'btn chat-mic recording' : 'btn chat-mic'}
            disabled={sending}
            onClick={() => void toggleMic()}
            aria-label={recording ? 'Stop recording and send' : 'Talk instead of typing'}
            aria-pressed={recording}
          >
            <Mic size={18} aria-hidden />
          </button>
          <button
            type="submit"
            className="btn chat-send"
            disabled={sending || input.trim() === ''}
            aria-label="Send"
          >
            <Send size={18} aria-hidden />
          </button>
        </form>
        <div className="chat-foot">
          {voiceNote !== '' ? (
            <span role="status">{voiceNote}</span>
          ) : (
            <span>21+ · Not a doctor · Never drive high</span>
          )}
          {confirmClear ? (
            <span style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                className="danger-text"
                onClick={() => {
                  setTranscript([]);
                  setSource(null);
                  setConfirmClear(false);
                }}
              >
                Clear it
              </button>
              <button type="button" onClick={() => setConfirmClear(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              disabled={transcript.length === 0}
            >
              Clear chat
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tools tab
// ---------------------------------------------------------------------------
// Tools tab — Grok layout: a 2-col home grid of tiles; tapping one drills
// into that tool with an "All tools" back button. The vibe check moved to
// the Plan tab (Grok's VibeEditor).
// ---------------------------------------------------------------------------

const TOOL_DEFS: { id: ToolId; name: string; detail: string; icon: React.ReactNode }[] = [
  { id: 'timer', name: 'Wait it out', detail: '', icon: <Timer size={20} aria-hidden /> },
  {
    id: 'breathe',
    name: 'Breathing bubble',
    detail: '4 in · 4 hold · 4 out',
    icon: <Wind size={20} aria-hidden />,
  },
  {
    id: 'munchies',
    name: 'Munchies maker',
    detail: 'Snack combos, shuffled',
    icon: <Cookie size={20} aria-hidden />,
  },
  {
    id: 'thoughts',
    name: 'High-thought prompts',
    detail: 'Talk it out',
    icon: <Leaf size={20} aria-hidden />,
  },
  {
    id: 'trivia',
    name: 'Bud-E trivia',
    detail: '5 questions, no judgment',
    icon: <Brain size={20} aria-hidden />,
  },
];

function ToolsTab({
  session,
  timerStatus,
  setTimerStatus,
  onTimerState,
  onAlert,
  activeTool,
  onToolChange,
}: {
  session: Session;
  timerStatus: string;
  setTimerStatus: (s: string) => void;
  onTimerState: (s: TimerState) => void;
  onAlert: (a: TimerAlert | null) => void;
  activeTool: ToolId | null;
  onToolChange: (t: ToolId | null) => void;
}) {
  if (activeTool === null) {
    return (
      <main>
        <PageHead title="Tools" sub="Timer, breather, and other little helpers." />
        <div className="tool-home">
          {TOOL_DEFS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className="tool-tile"
              onClick={() => onToolChange(tool.id)}
            >
              {tool.icon}
              <span className="tool-tile-title">{tool.name}</span>
              <span className="tool-tile-detail">
                {tool.id === 'timer' ? timerStatus : tool.detail}
              </span>
            </button>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main>
      <button type="button" className="tool-back" onClick={() => onToolChange(null)}>
        <ArrowLeft size={16} aria-hidden /> All tools
      </button>
      {activeTool === 'timer' && (
        <EdibleTimer
          session={session}
          setTimerStatus={setTimerStatus}
          onTimerState={onTimerState}
          onAlert={onAlert}
        />
      )}
      {activeTool === 'breathe' && <BreathingBubble />}
      {activeTool === 'munchies' && <MunchiesMaker />}
      {activeTool === 'thoughts' && <HighThoughts />}
      {activeTool === 'trivia' && <TriviaGame />}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Edible timer — same countdown logic, Grok's SVG countdown ring on top.
// ---------------------------------------------------------------------------

function CountdownRing({
  remaining,
  totalSec,
  finished,
}: {
  remaining: number;
  totalSec: number;
  finished: boolean;
}) {
  const r = 86;
  const c = 2 * Math.PI * r;
  const progress = totalSec > 0 ? Math.min(1, (totalSec - remaining) / totalSec) : 0;
  const offset = c * (1 - progress);
  return (
    <div className={`countdown-ring-wrap${finished ? ' done' : ''}`} aria-hidden>
      <svg viewBox="0 0 224 224">
        <circle cx="112" cy="112" r={r} fill="none" strokeWidth="10" stroke="var(--line)" />
        <circle
          cx="112"
          cy="112"
          r={r}
          fill="none"
          strokeWidth="10"
          stroke="var(--accent)"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 112 112)"
        />
      </svg>
      <div className="countdown-ring-label">{formatCountdown(remaining)}</div>
    </div>
  );
}

function EdibleTimer({
  session,
  setTimerStatus,
  onTimerState,
  onAlert,
}: {
  session: Session;
  setTimerStatus: (s: string) => void;
  onTimerState: (s: TimerState) => void;
  onAlert: (a: TimerAlert | null) => void;
}) {
  const [minutesInput, setMinutesInput] = useState(120);
  const [remaining, setRemaining] = useState(0);
  const [totalSec, setTotalSec] = useState(0);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  // Notification permission, native app only. Null on the web — there is no
  // permission to ask for there; buzzes just work while the app is open.
  const [perm, setPerm] = useState<AlertPermission | null>(() =>
    isNativeApp() ? 'prompt' : null,
  );
  const [permBusy, setPermBusy] = useState(false);
  const permRef = useRef<AlertPermission | null>(perm);
  // The current run's alert plan + what has already fired. Refs, not state:
  // the tick reads them every second without re-rendering.
  const planRef = useRef<PlannedAlert[]>([]);
  const firedRef = useRef<Set<TimerAlertId>>(new Set());
  // Wall-clock timeout for the wearing-off alert, started when the timer
  // finishes (the countdown has stopped by then).
  const wearOffTimerRef = useRef<number | null>(null);

  // What the phone says about notifications — checked once, never prompted
  // on load. Only the "Turn on buzzes" button below ever asks.
  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;
    void checkAlertPermission().then((p) => {
      if (!cancelled) {
        permRef.current = p;
        setPerm(p);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Clear the wearing-off timeout when leaving the timer.
  useEffect(() => {
    return () => {
      if (wearOffTimerRef.current !== null) window.clearTimeout(wearOffTimerRef.current);
    };
  }, []);

  // Report the live timer state up to App on every change, so the header
  // pill can show the countdown and progress.
  useEffect(() => {
    const status: TimerState['status'] = finished
      ? 'done'
      : running
        ? 'running'
        : totalSec > 0 && remaining > 0
          ? 'paused'
          : 'idle';
    onTimerState({ status, remainingSec: remaining, totalSec });
  }, [finished, running, remaining, totalSec, onTimerState]);

  /** Show a milestone: banner on every tab + a phone buzz. */
  function fireAlert(id: TimerAlertId): void {
    if (firedRef.current.has(id)) return;
    firedRef.current.add(id);
    buzz();
    onAlert(TIMER_ALERTS[id]);
  }

  /**
   * (Re-)schedule the closed-app buzzes for what is still to come.
   * Takes the timer's numbers as arguments: beginRun calls this before the
   * new total/remaining state has landed, so the state values would be stale.
   */
  function scheduleBuzzes(total = totalSec, rem = remaining): void {
    if (permRef.current !== 'granted') return;
    const elapsed = total - rem;
    const planned = planRef.current
      .filter((a) => !firedRef.current.has(a.id))
      .map((a) => ({ ...a, delayMs: Math.max(0, (a.atElapsedSec - elapsed) * 1000) }));
    void scheduleNativeAlerts(planned);
  }

  /** Start a fresh run: plan the alerts, arm the buzzes, clear the banner. */
  function beginRun(seconds: number, elapsedAtStartSec: number): void {
    if (wearOffTimerRef.current !== null) {
      window.clearTimeout(wearOffTimerRef.current);
      wearOffTimerRef.current = null;
    }
    planRef.current = planAlerts(seconds, elapsedAtStartSec);
    firedRef.current = new Set();
    onAlert(null);
    setRemaining(seconds);
    setTotalSec(seconds);
    setFinished(false);
    setRunning(true);
    scheduleBuzzes(seconds, 0);
    // Already past kick-in (dose taken a while ago)? Say so right away.
    for (const a of planRef.current) {
      if (a.atElapsedSec === 0) fireAlert(a.id);
    }
  }

  /** Stop everything: the countdown, the buzzes, the banner. */
  function resetTimer(): void {
    if (wearOffTimerRef.current !== null) {
      window.clearTimeout(wearOffTimerRef.current);
      wearOffTimerRef.current = null;
    }
    void cancelNativeAlerts();
    planRef.current = [];
    firedRef.current = new Set();
    onAlert(null);
    setRunning(false);
    setRemaining(0);
    setTotalSec(0);
    setFinished(false);
    setTimerStatus('Edible timer reset.');
  }

  /** Pause freezes the countdown — and the buzzes with it. Resume re-arms them. */
  function togglePause(): void {
    if (running) {
      void cancelNativeAlerts();
      setRunning(false);
    } else {
      setRunning(true);
      scheduleBuzzes();
    }
  }

  /** Ask the phone for notification permission — only from the button tap. */
  async function turnOnBuzzes(): Promise<void> {
    setPermBusy(true);
    try {
      const p = await requestAlertPermission();
      permRef.current = p;
      setPerm(p);
      if (p === 'granted') scheduleBuzzes();
    } finally {
      setPermBusy(false);
    }
  }

  useEffect(() => {
    if (!running) return;
    // Fire any milestone whose moment has come.
    const elapsed = totalSec - remaining;
    for (const a of planRef.current) {
      if (!firedRef.current.has(a.id) && elapsed >= a.atElapsedSec) fireAlert(a.id);
    }
    if (remaining <= 0) {
      setRunning(false);
      setFinished(true);
      setTimerStatus('Edible timer finished — waited the full time.');
      // Peak already fired above. Wearing-off is 2 hours out: the countdown
      // has stopped, so arm it on a wall-clock timeout + a native buzz.
      if (!firedRef.current.has('wearing-off')) {
        const wearOff = planRef.current.find((a) => a.id === 'wearing-off');
        const delayMs = wearOff ? wearOff.delayMs - totalSec * 1000 : 2 * 60 * 60 * 1000;
        wearOffTimerRef.current = window.setTimeout(() => fireAlert('wearing-off'), delayMs);
        if (permRef.current === 'granted') {
          void scheduleNativeAlert('wearing-off', delayMs);
        }
      }
      return;
    }
    const id = window.setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => window.clearInterval(id);
  }, [running, remaining, setTimerStatus]);

  function startFromSession() {
    const since = minutesSinceTaken(session);
    const taken = parseClock(session.timeTaken);
    if (since === null || taken === null) {
      setMinutesInput(120);
      beginRun(120 * 60, 0);
      setTimerStatus('Edible timer running — 2 hours from now (no time taken set).');
    } else if (since >= 120) {
      setMinutesInput(0);
      setRemaining(0);
      setTotalSec(0);
      setFinished(true);
      setTimerStatus('Edible timer finished — already past the 2-hour mark.');
    } else {
      const left = 120 - since;
      setMinutesInput(left);
      beginRun(left * 60, since * 60);
      setTimerStatus(
        `Edible timer running — counting down to the 2-hour mark from ${formatClock(taken)}.`,
      );
    }
  }

  function startManual() {
    const mins = Math.max(1, Math.min(720, Math.floor(minutesInput) || 120));
    setMinutesInput(mins);
    beginRun(mins * 60, 0);
    setTimerStatus(`Edible timer running — ${mins} minutes.`);
  }

  const inhaled = session.method === 'flower' || session.method === 'vape' || session.method === 'dab';
  const title = inhaled ? 'Wait 15 minutes' : 'Wait the full 2 hours';

  return (
    <section className="card" aria-label="Edible timer">
      <h2 className="tool-title">{title}</h2>
      <p className="muted">
        Edibles take 45–90 minutes to kick in. The golden rule: wait a full 2 hours before even thinking
        about more.
      </p>
      <CountdownRing remaining={remaining} totalSec={totalSec} finished={finished} />
      <label htmlFor="waitMinutes" style={{ marginTop: 16 }}>
        Minutes to wait
      </label>
      <input
        id="waitMinutes"
        type="number"
        min="1"
        max="720"
        inputMode="numeric"
        value={minutesInput}
        onChange={(e) => setMinutesInput(Number(e.target.value))}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {!running && !finished && (
          <>
            <button className="btn btn-block" onClick={startManual}>
              ▶ Start timer
            </button>
            <button className="btn secondary btn-block" onClick={startFromSession}>
              🕐 From my session time
            </button>
          </>
        )}
        {(running || remaining > 0) && (
          <>
            <button className="btn secondary btn-block" onClick={togglePause}>
              {running ? '⏸ Pause' : '▶ Resume'}
            </button>
            <button className="btn ghost btn-block" onClick={resetTimer}>
              Reset
            </button>
          </>
        )}
      </div>
      {perm !== null ? (
        <div className="alert-permission">
          {perm === 'granted' ? (
            <p>
              🔔 Buzzes on — Bud-E will buzz you when it kicks in, at peak, and when it wears
              off, even with the app closed.
            </p>
          ) : perm === 'denied' ? (
            <p>
              🔔 Buzzes are off — notifications are turned off for Bud-E. The timer still works
              here, just without the buzzes. You can turn them back on in your phone settings.
            </p>
          ) : (
            <>
              <p>
                🔔 Want a buzz at each stage — kicking in, peak, wearing off — even with the app
                closed? Bud-E needs notification permission for that.
              </p>
              <button
                className="btn secondary btn-block"
                disabled={permBusy}
                onClick={() => void turnOnBuzzes()}
              >
                {permBusy ? 'Asking…' : 'Turn on buzzes'}
              </button>
            </>
          )}
        </div>
      ) : (
        <p className="muted small" style={{ marginTop: 12 }}>
          🔔 While the app is open, Bud-E shows a banner and buzzes at each stage. In the phone
          app, turn on notifications to get buzzed with the app closed.
        </p>
      )}
      {finished && (
        <p className="timer-done">
          ⏰ Time&apos;s up! Still feel nothing? Wait one more hour — do NOT redose yet. Edibles are sneaky
          and stack up late.
        </p>
      )}
    </section>
  );
}

function BreathingBubble() {
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const phaseIndex = Math.floor(seconds / 4) % 3;
  const phases = ['Breathe in…', 'Hold…', 'Breathe out…'];
  const scale = phaseIndex === 2 ? 0.8 : 1.25;

  return (
    <section className="card" aria-label="Breathing bubble" style={{ textAlign: 'center' }}>
      <h2 className="tool-title">Breathing bubble</h2>
      <p className="muted">Feeling a bit too high? Slow breaths help. 4 in, 4 hold, 4 out.</p>
      <div className="breath-wrap">
        <div
          className="breath-circle"
          style={{ transform: running ? `scale(${scale})` : 'scale(1)' }}
          aria-live="polite"
        >
          {running ? phases[phaseIndex] : '🌿'}
        </div>
        <div className="breath-phase">
          {running ? `4 seconds · ${phases[phaseIndex]}` : 'Tap start when ready'}
        </div>
        <button
          className="btn btn-block"
          onClick={() => {
            if (running) {
              setRunning(false);
            } else {
              setSeconds(0);
              setRunning(true);
            }
          }}
        >
          {running ? '⏸ Stop' : '▶ Start breathing'}
        </button>
      </div>
    </section>
  );
}

function MunchiesMaker() {
  const [snack, setSnack] = useState(SNACK_COMBOS[0]);
  return (
    <section className="card" aria-label="Munchies maker">
      <h2 className="tool-title">Munchies maker</h2>
      <p className="result-box">{snack}</p>
      <button className="btn btn-block" onClick={() => setSnack(pickRandom(SNACK_COMBOS))}>
        🔀 Shuffle a snack
      </button>
    </section>
  );
}

function HighThoughts() {
  const [thought, setThought] = useState(HIGH_THOUGHTS[0]);
  return (
    <section className="card" aria-label="High-thought prompts">
      <h2 className="tool-title">High-thought prompts</h2>
      <p className="result-box">{thought}</p>
      <button className="btn btn-block" onClick={() => setThought(pickRandom(HIGH_THOUGHTS))}>
        🔀 Next thought
      </button>
    </section>
  );
}

function TriviaGame() {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const q = TRIVIA[index];

  function pick(i: number) {
    if (selected !== null) return;
    setSelected(i);
    if (i === q.answer) setScore((s) => s + 1);
  }

  function next() {
    if (index + 1 >= TRIVIA.length) {
      setDone(true);
    } else {
      setIndex((i) => i + 1);
      setSelected(null);
    }
  }

  function playAgain() {
    setIndex(0);
    setSelected(null);
    setScore(0);
    setDone(false);
  }

  return (
    <section className="card" aria-label="Cannabis trivia">
      <h2 className="tool-title">Bud-E trivia</h2>
      {done ? (
        <>
          <p className="score-display">
            {score} / {TRIVIA.length}
          </p>
          <p style={{ textAlign: 'center' }}>
            {score === TRIVIA.length
              ? 'Perfect score — certified Bud-E brain. 🌿'
              : score >= 3
                ? 'Solid! You know your stuff.'
                : "Hey, that's what Bud-E is here for. Run it back!"}
          </p>
          <button className="btn btn-block" onClick={playAgain}>
            🔁 Play again
          </button>
        </>
      ) : (
        <>
          <p className="muted small">
            Question {index + 1} of {TRIVIA.length} · Score: {score}
          </p>
          <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>{q.question}</p>
          {q.options.map((opt, i) => (
            <button
              key={i}
              className={
                'trivia-option' +
                (selected !== null && i === q.answer ? ' correct' : '') +
                (selected === i && i !== q.answer ? ' wrong' : '')
              }
              onClick={() => pick(i)}
              disabled={selected !== null}
            >
              {opt}
            </button>
          ))}
          {selected !== null && (
            <>
              <p className="result-box">{q.fact}</p>
              <button className="btn btn-block" onClick={next}>
                {index + 1 >= TRIVIA.length ? 'See my score' : 'Next question →'}
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}

function buildPlanText(session: Session, vibe: Vibe, timerStatus: string): string {
  const lines: string[] = [];
  lines.push('🌿 MY BUD-E PLAN FOR TONIGHT');
  lines.push('');
  const amount = session.amount.trim();
  lines.push(
    `Session: ${METHOD_LABELS[session.method]}${amount ? ` — ${amount}${session.unit}` : ''}` +
      (session.timeTaken ? ` at ${formatClock(parseClock(session.timeTaken) ?? 0)}` : '') +
      ` (${session.experience === 'new' ? 'new' : session.experience === 'some' ? 'some experience' : 'experienced'}).`,
  );
  lines.push(`Vibe: ${vibe.setting}, ${vibe.sound} on, craving ${vibe.snack}, feeling ${vibe.energy}.`);
  lines.push(`Timer: ${timerStatus}`);
  lines.push('');
  if (session.method === 'edible' || session.method === 'drink') {
    lines.push('• Edibles: wait a full 2 hours before even thinking about more. Onset 45–90 min, peak 2–4 hrs, lasts 4–8 hrs.');
  } else {
    lines.push('• Start low, go slow — one or two small hits, wait 15 minutes, then decide.');
  }
  lines.push('• Drink water. Have a snack ready for the munchies.');
  lines.push('• If it feels like too much: lie down, sip water, breathe slow. It passes.');
  lines.push('');
  lines.push("21+ only. Never drive high — wait until fully sober, and after edibles, until after a full night's sleep.");
  lines.push('Bud-E is a buddy, not a doctor. If something feels seriously wrong, get real help right away.');
  return lines.join('\n');
}

function PlanTab({
  session,
  vibe,
  setVibe,
  timerStatus,
  onGoTonight,
}: {
  session: Session;
  vibe: Vibe;
  setVibe: (v: Vibe) => void;
  timerStatus: string;
  onGoTonight: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const planText = buildPlanText(session, vibe, timerStatus);
  const textRef = useRef<HTMLTextAreaElement>(null);

  async function copyPlan() {
    try {
      await navigator.clipboard.writeText(planText);
      setCopied(true);
    } catch {
      // Clipboard blocked — fall back to selecting the text so the user can copy it.
      textRef.current?.focus();
      textRef.current?.select();
      setCopied(false);
    }
    window.setTimeout(() => setCopied(false), 2500);
  }

  const amount = session.amount.trim();
  const sessionLine =
    `${METHOD_LABELS[session.method]}${amount ? ` — ${amount}${session.unit}` : ''}` +
    (session.timeTaken ? ` at ${formatClock(parseClock(session.timeTaken) ?? 0)}` : '') +
    ` (${session.experience === 'new' ? 'new' : session.experience === 'some' ? 'some experience' : 'experienced'})`;
  const tips =
    session.method === 'edible' || session.method === 'drink'
      ? [
          'Edibles: wait a full 2 hours before even thinking about more. Onset 45–90 min, peak 2–4 hrs, lasts 4–8 hrs.',
          'Drink water. Have a snack ready for the munchies.',
          'If it feels like too much: lie down, sip water, breathe slow. It passes.',
        ]
      : [
          'Start low, go slow — one or two small hits, wait 15 minutes, then decide.',
          'Drink water. Have a snack ready for the munchies.',
          'If it feels like too much: lie down, sip water, breathe slow. It passes.',
        ];

  return (
    <main>
      <PageHead title="Plan" sub="Built from what you actually logged. Copy it for the group chat." />

      {amount === '' ? (
        <section className="card" aria-label="No session logged">
          <p className="eyebrow">No session logged</p>
          <p style={{ margin: '8px 0 0' }}>
            Log tonight&apos;s dose on the Tonight tab and your plan will show up here — with the right
            timings and tips for it.
          </p>
          <button className="btn" style={{ marginTop: 16 }} onClick={onGoTonight}>
            Log tonight
          </button>
        </section>
      ) : (
        <section className="card" aria-label="For tonight">
          <p className="eyebrow">For tonight</p>
          <dl style={{ margin: '12px 0 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <dt className="muted small" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Session
              </dt>
              <dd style={{ margin: '4px 0 0', textTransform: 'capitalize' }}>{sessionLine}</dd>
            </div>
            <div>
              <dt className="muted small" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Vibe
              </dt>
              <dd style={{ margin: '4px 0 0', textTransform: 'capitalize' }}>
                {vibe.setting} · {vibe.sound} · craving {vibe.snack} · feeling {vibe.energy}
              </dd>
            </div>
            <div>
              <dt className="muted small" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Timer
              </dt>
              <dd style={{ margin: '4px 0 0' }}>{timerStatus}</dd>
            </div>
          </dl>
          <ul
            style={{
              margin: '16px 0 0',
              padding: '16px 0 0',
              borderTop: '1px solid var(--line)',
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {tips.map((tip) => (
              <li key={tip} style={{ display: 'flex', gap: 8 }}>
                <span aria-hidden>·</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
          <button className="btn btn-block" style={{ marginTop: 16 }} onClick={() => void copyPlan()}>
            {copied ? (
              <>
                <Check size={16} aria-hidden /> Copied!
              </>
            ) : (
              '📋 Copy my plan'
            )}
          </button>
          <textarea
            ref={textRef}
            readOnly
            value={planText}
            aria-label="Plan text (selectable fallback)"
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
            tabIndex={-1}
          />
        </section>
      )}

      <VibeEditor vibe={vibe} setVibe={setVibe} />

      <p className="muted small">
        21+ only. Bud-E is a buddy, not a doctor. Start low, go slow. Never drive high — wait until fully
        sober, and after edibles, until after a full night&apos;s sleep.
      </p>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Vibe editor — Grok's VibeEditor: chips for setting, sound, snack, energy.
// (Lives on the Plan tab; same options and values as the old select version.)
// ---------------------------------------------------------------------------

const VIBE_OPTIONS: { key: keyof Vibe; label: string; options: string[] }[] = [
  { key: 'setting', label: 'Setting', options: ['Home', 'Porch / yard', "Friend's spot", 'Outside'] },
  { key: 'sound', label: 'Sound', options: ['Music', 'TV / movie', 'Quiet', 'A podcast'] },
  { key: 'snack', label: 'Snack', options: ['Chips', 'Something sweet', 'Fruit', 'Cooking it up'] },
  { key: 'energy', label: 'Energy', options: ['Chill', 'Giggly', 'Chatty', 'Sleepy'] },
];

function VibeEditor({ vibe, setVibe }: { vibe: Vibe; setVibe: (v: Vibe) => void }) {
  return (
    <section className="card" aria-label="Vibe check">
      <h2>Vibe check</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {VIBE_OPTIONS.map((group) => (
          <div key={group.key}>
            <Label>{group.label}</Label>
            <ChipRow>
              {group.options.map((opt) => (
                <Chip
                  key={opt}
                  on={vibe[group.key] === opt}
                  onClick={() => setVibe({ ...vibe, [group.key]: opt })}
                >
                  {opt}
                </Chip>
              ))}
            </ChipRow>
          </div>
        ))}
      </div>
    </section>
  );
}
