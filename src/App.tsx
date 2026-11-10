import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Brain,
  Camera,
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
  Play,
  Scale,
  Send,
  Settings,
  SkipBack,
  SkipForward,
  Timer,
  UserRound,
  Users,
  Volume2,
  Wind,
  X,
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
  shuffle,
} from './bude';
import type { ChatImage, ChatMessage, Method, Session, TriviaQuestion } from './bude';
import { setKeyboardTheme } from './lib/keyboard';
import StrainsTab from './StrainsTab';
import Community from './Community';
import MusicTab from './MusicTab';
import TonightTab from './TonightTab';
import SettingsTab from './SettingsTab';
import DrivingMode from './DrivingMode';
import { GuessTheStrain, MemoryMatch, WouldYouRather } from './Games';
import { tasteSummary } from './lib/taste';
import LockScreen from './LockScreen';
import {
  biometricStatus,
  clearLockSettings,
  hasPin,
  loadLockSettings,
  publishLockState,
  type AppLockSettings,
  type BiometricStatus,
} from './lib/applock';
import { AGE_GATE_KEY, THEME_KEY, isThemeId, loadTheme } from './theme';
import type { ThemeId } from './theme';
import JournalTab from './JournalTab';
import StashTab from './StashTab';
import BreakTab from './BreakTab';
import DoseTab from './DoseTab';
import { JOURNAL_KEY, journalSummary, newEntryId } from './journal';
import type { JournalEntry } from './journal';
import { STASH_KEY, isRunningLow, lowNote, stashSummary, withAmount } from './stash';
import type { StashItem } from './stash';
import AuthTab, { ResetPasswordView } from './AuthTab';
import { clearLocalSyncState, queueDeletion, uploadLocal, mergeLocalWithServer, DEFAULT_PERSONALIZATION, cleanPersonalization } from './lib/sync';
import type { SyncSettings, SyncedChatConversation, PremiumTier, Personalization } from './lib/sync';
import { deleteAccount, getSession, signOut } from './lib/auth-client';
import type { AuthUser } from './lib/auth-client';
import { DEFAULT_VOICE_SETTINGS, cleanVoiceSettings } from './voice';
import type { VoiceSettings } from './voice';
import { speakVoice, startRecording, stopVoice, transcribeVoice, unlockAudio } from './lib/voice-client';
import { executeDeviceAction, extractDeviceAction, getBubbleStatus, getLaunchInfo, isAppAction, isImageSearchAction, isNative, localIsoNow, parseAppAction, publishMusicState, publishStashSummary, publishStrainOfTheDay, publishWeather, publishWidgetStash, setBubbleEnabled } from './lib/device-actions';
import { strainOfTheDay } from './lib/daily';
import type { AppAction } from './lib/device-actions';
import type { ActiveRecording } from './lib/voice-client';
import { TIMER_ALERTS, buzz, planAlerts, type PlannedAlert, type TimerAlert, type TimerAlertId } from './lib/timer-alerts';
import { streamUrl } from './lib/audius';
import type { AudiusTrack, MusicPlaylist } from './lib/audius';
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

const TRANSCRIPT_KEY = 'bude-transcript-v1'; // legacy single transcript
const CHATS_KEY = 'bude-chats-v1';
const PLAYLISTS_KEY = 'bude-playlists-v1';
const MUSIC_STATE_KEY = 'bude-music-state-v1';
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

/** Base URL for every /api call. Same Capacitor/live logic as before.
 *  Only the real native app (Capacitor.isNativePlatform()) needs the live
 *  origin — the web build also loads the Capacitor bridge, but it must
 *  stay same-origin or the cross-origin /api/chat call fails. */
function apiBase(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (typeof envUrl === 'string' && envUrl.trim() !== '') {
    return `${envUrl.replace(/\/$/, '')}/api`;
  }
  const cap = typeof window !== 'undefined'
    ? (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    : undefined;
  const isNative = !!cap?.isNativePlatform?.();
  if (isNative) return `${LIVE_ORIGIN}/api`;
  return '/api';
}

function apiUrl(): string {
  return `${apiBase()}/chat`;
}

type Tab = 'tonight' | 'chat' | 'tools' | 'plan' | 'strains' | 'music' | 'journal' | 'stash' | 'break' | 'dose' | 'settings' | 'account';
type Source = 'live' | 'fallback' | null;

/** True when a string from the native side names a real tab. */
function isTab(value: string): value is Tab {
  return (
    value === 'tonight' || value === 'chat' || value === 'tools' || value === 'plan' ||
    value === 'strains' || value === 'music' || value === 'journal' || value === 'stash' ||
    value === 'break' || value === 'dose' || value === 'settings' || value === 'account'
  );
}

/** Which tool is open inside the Tools tab (Grok drill-in). Null = the tool grid.
 *  Log and Plan live here too now — they are full sections, not little helpers,
 *  but they open the same way, with "All tools" to go back. */
type ToolId = 'timer' | 'breathe' | 'munchies' | 'thoughts' | 'trivia' | 'journal' | 'plan' | 'would-you-rather' | 'guess-strain' | 'memory' | 'community';

/** Live state of the edible timer, lifted to App so the header pill can show it. */
interface TimerState {
  status: 'idle' | 'running' | 'paused' | 'done';
  remainingSec: number;
  totalSec: number;
}

const IDLE_TIMER: TimerState = { status: 'idle', remainingSec: 0, totalSec: 0 };

/** Bottom-nav destinations (6 slots: 5 tabs + More). Log and Plan live
 *  inside Tools now; every tab is still reachable. */
const NAV_ITEMS: { id: Tab; label: string; icon: typeof Moon }[] = [
  { id: 'tonight', label: 'Tonight', icon: Moon },
  { id: 'chat', label: 'Buddy', icon: MessageCircle },
  { id: 'stash', label: 'Stash', icon: Package },
  { id: 'tools', label: 'Tools', icon: LayoutGrid },
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

function newChatId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function autoTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user');
  if (!first) return 'New chat';
  const text = first.text.trim();
  if (text.length <= 40) return text;
  return text.slice(0, 37) + '…';
}

/** Strip attached photos from a chat list before it is synced. Photos
 *  never leave the phone — the account's cloud copy never sees them. */
function stripChatImages(chats: SyncedChatConversation[]): SyncedChatConversation[] {
  return chats.map((c) => ({
    ...c,
    messages: c.messages.map((m) => {
      if (!m.image) return m;
      const { image: _dropped, ...rest } = m;
      void _dropped;
      return rest;
    }),
  }));
}

/** Keep photos in local storage, but cap them: only the 5 most recent
 *  photos are kept, so a lot of photos can never fill up storage. */
const MAX_STORED_PHOTOS = 5;
function capChatImages(chats: SyncedChatConversation[]): SyncedChatConversation[] {
  const photoSpots: Array<{ ci: number; mi: number }> = [];
  chats.forEach((c, ci) => {
    c.messages.forEach((m, mi) => {
      if (m.image) photoSpots.push({ ci, mi });
    });
  });
  const keep = new Set(
    photoSpots.slice(-MAX_STORED_PHOTOS).map((s) => `${s.ci}:${s.mi}`),
  );
  return chats.map((c, ci) => ({
    ...c,
    messages: c.messages.map((m, mi) => {
      if (!m.image) return m;
      if (keep.has(`${ci}:${mi}`)) return m;
      const { image: _dropped, ...rest } = m;
      void _dropped;
      return rest;
    }),
  }));
}

/** Re-attach the photos this phone holds onto a chat list that came back
 *  from the server (the server copy has no photos — see stripChatImages).
 *  Without this, a photo would vanish from the chat the moment a sync
 *  round-trip landed. Matched by conversation, message position, and text.
 *
 *  It ALSO never drops a message the server hasn't seen yet. There is a
 *  race: the app auto-syncs 2s after a message is sent, and a photo answer
 *  can take longer than that to come back. If the sync upload (which only
 *  has the user's message) is still in flight when the reply lands, the
 *  server state that comes back is STALE — it has no reply — and returning
 *  it wholesale would wipe the reply the user just saw. So when the local
 *  copy is a strict superset of the server copy (same messages, plus more
 *  at the end), the local copy wins — it is newer. */
function mergeChatImages(
  local: SyncedChatConversation[],
  server: SyncedChatConversation[],
): SyncedChatConversation[] {
  const byId = new Map(local.map((c) => [c.id, c]));
  return server.map((sc) => {
    const lc = byId.get(sc.id);
    if (!lc) return sc;
    // Local is newer: it holds everything the server has, plus messages
    // that arrived after the upload started (e.g. a just-arrived reply).
    // Keep the whole local conversation so those messages are not wiped
    // by the stale server state. Photos ride along — they live on the
    // local messages already.
    if (
      lc.messages.length > sc.messages.length &&
      sc.messages.every(
        (m, i) =>
          lc.messages[i] && lc.messages[i].text === m.text && lc.messages[i].role === m.role,
      )
    ) {
      return lc;
    }
    return {
      ...sc,
      messages: sc.messages.map((m, i) => {
        const lm = lc.messages[i];
        if (lm && lm.image && lm.text === m.text && lm.role === m.role) {
          return { ...m, image: lm.image };
        }
        return m;
      }),
    };
  });
}

/** Shrink a picked photo to at most 1024px on the long edge and re-encode
 *  it as JPEG, so the upload stays small. Returns a data URL. */
async function downscalePhoto(file: File): Promise<string> {
  const original = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('not an image'));
    el.src = original;
  });
  const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

function loadChats(): SyncedChatConversation[] {
  try {
    const raw = localStorage.getItem(CHATS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as SyncedChatConversation[];
    }
    // Migrate legacy single transcript into the first conversation.
    const legacy = loadList<ChatMessage>(TRANSCRIPT_KEY);
    if (legacy.length > 0) {
      const migrated: SyncedChatConversation = {
        id: newChatId(),
        title: autoTitle(legacy),
        messages: legacy,
        updatedAt: new Date().toISOString(),
      };
      return [migrated];
    }
  } catch {
    // Fall through to empty.
  }
  return [];
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

// The music queue + the last track, so the app can resume after it was
// killed and the widget's play button has something to resume. A track
// only counts when it has the fields the player needs.
function loadMusicState(): { track: AudiusTrack | null; queue: AudiusTrack[] } {
  try {
    const raw = localStorage.getItem(MUSIC_STATE_KEY);
    if (!raw) return { track: null, queue: [] };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { track: null, queue: [] };
    const queueRaw = (parsed as { queue?: unknown }).queue;
    const queue = Array.isArray(queueRaw)
      ? (queueRaw as unknown[]).filter(
          (t): t is AudiusTrack =>
            typeof t === 'object' && t !== null &&
            typeof (t as { id?: unknown }).id === 'string' &&
            typeof (t as { title?: unknown }).title === 'string' &&
            typeof (t as { artist?: unknown }).artist === 'string',
        )
      : [];
    const currentId = (parsed as { currentId?: unknown }).currentId;
    const track = typeof currentId === 'string' ? queue.find((t) => t.id === currentId) ?? null : null;
    return { track, queue };
  } catch {
    return { track: null, queue: [] };
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
  // Password-reset landing: a reset link from email opens the app with
  // ?token= (or ?error=INVALID_TOKEN) in the URL. Read once on load; the
  // reset form renders instead of the tabs until it is done.
  const [resetToken, setResetToken] = useState<string | null>(() => {
    try {
      return new URLSearchParams(window.location.search).get('token');
    } catch {
      return null;
    }
  });
  const [resetInvalid, setResetInvalid] = useState<boolean>(() => {
    try {
      return new URLSearchParams(window.location.search).get('error') === 'INVALID_TOKEN';
    } catch {
      return false;
    }
  });
  const [session, setSession] = useState<Session>(() => load(SESSION_KEY, DEFAULT_SESSION));
  const [chats, setChats] = useState<SyncedChatConversation[]>(() => loadChats());
  const [currentChatId, setCurrentChatId] = useState<string | null>(() => {
    const loaded = loadChats();
    return loaded.length > 0 ? loaded[0].id : null;
  });
  const [showChatList, setShowChatList] = useState(false);
  // Hands-free driving mode overlay.
  const [drivingOpen, setDrivingOpen] = useState(false);
  const [vibe, setVibe] = useState<Vibe>(() => load(VIBE_KEY, DEFAULT_VIBE));
  const [voice, setVoice] = useState<VoiceSettings>(() => loadVoiceSettings());
  const [premiumTier, setPremiumTier] = useState<PremiumTier>(null);
  // App lock (PIN + fingerprint/face). locked starts true when a PIN is
  // set, so opening the app asks for it. bioStatus is the phone's
  // biometric availability, read once and refreshed when the app comes
  // back to the front.
  const [lockSettings, setLockSettings] = useState<AppLockSettings | null>(() =>
    loadLockSettings(),
  );
  const [locked, setLocked] = useState<boolean>(() => hasPin(loadLockSettings()));
  const [bioStatus, setBioStatus] = useState<BiometricStatus>({
    available: false,
    type: 'none',
    reason: 'web',
  });
  const backgroundedAt = useRef<number>(0);
  const [personalization, setPersonalization] = useState<Personalization>(() => {
    try {
      const raw = localStorage.getItem('bude-personalization-v1');
      return raw ? cleanPersonalization(JSON.parse(raw)) : { ...DEFAULT_PERSONALIZATION };
    } catch {
      return { ...DEFAULT_PERSONALIZATION };
    }
  });
  const [journal, setJournal] = useState<JournalEntry[]>(() => loadList(JOURNAL_KEY));
  const [stash, setStash] = useState<StashItem[]>(() => loadList(STASH_KEY));
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>(() => loadList(PLAYLISTS_KEY));
  // Fresh stash for chat actions: the launch-info effect runs with an old
  // closure (it fires on focus), so it reads the ref, not the render's stash.
  const stashRef = useRef(stash);
  useEffect(() => {
    stashRef.current = stash;
  }, [stash]);
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

  // In-app music (Audius) — the <audio> element and the queue live here so
  // the music keeps playing while the user moves around the app. The Music
  // tab is just the browser + now-playing controls. The queue + last track
  // are restored from the phone on launch, so the widget's play button can
  // resume after the app was killed — but restoring must not auto-play.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [initialMusic] = useState(() => loadMusicState());
  const [currentTrack, setCurrentTrack] = useState<AudiusTrack | null>(initialMusic.track);
  const [musicQueue, setMusicQueue] = useState<AudiusTrack[]>(initialMusic.queue);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  // Set on mount when a track was restored, before the track-change effect
  // below runs — it makes the restore load the audio silently, not play it.
  const restoringMusic = useRef(false);
  useEffect(() => {
    if (currentTrack) restoringMusic.current = true;
  }, []);

  // When the track changes, load it and play. (The play() call can be
  // refused if the browser still wants a tap — then the paused state shows
  // and the user just hits play.)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    audio.src = streamUrl(currentTrack.id);
    if (restoringMusic.current) {
      restoringMusic.current = false;
      return; // restored on launch — loaded, not playing
    }
    audio.play().catch(() => setIsPlaying(false));
  }, [currentTrack]);

  function playTrack(track: AudiusTrack, list: AudiusTrack[]): void {
    setMusicQueue(list);
    setCurrentTrack(track);
    setAudioError(null);
  }

  function togglePlay(): void {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (audio.paused) {
      void audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }

  function playNext(): void {
    if (!currentTrack) return;
    const i = musicQueue.findIndex((t) => t.id === currentTrack.id);
    if (i >= 0 && i < musicQueue.length - 1) setCurrentTrack(musicQueue[i + 1]);
    // At the end of the queue: stay on the last track.
  }

  function playPrev(): void {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const i = musicQueue.findIndex((t) => t.id === currentTrack.id);
    if (i > 0) setCurrentTrack(musicQueue[i - 1]);
  }

  function handleAudioEnded(): void {
    if (!currentTrack) return;
    const i = musicQueue.findIndex((t) => t.id === currentTrack.id);
    if (i >= 0 && i < musicQueue.length - 1) {
      setCurrentTrack(musicQueue[i + 1]);
    } else {
      // End of the queue — playback stopped.
      setIsPlaying(false);
    }
  }

  function stopPlayer(): void {
    const audio = audioRef.current;
    if (audio) audio.pause();
    setCurrentTrack(null);
    setMusicQueue([]);
    setIsPlaying(false);
  }

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

  // Phone extras: a home-screen shortcut, the widget, or a share from
  // another app can ask for a tab or hand over text. Runs on load and
  // whenever the app comes back to the front (a share can arrive while
  // the app is already open). Shared text lands in the chat box through
  // the same prefill the strain pages use. One-shot — the native side
  // clears it.
  // The launch-info poll below runs once (empty deps), so it would capture
  // stale music state — the music-action handler lives in a ref that is
  // refreshed every render, so it always sees the current track + queue.
  const applyMusicActionRef = useRef((_action: string) => {});
  useEffect(() => {
    applyMusicActionRef.current = (action: string) => {
      if (action === 'toggle') {
        if (currentTrack) togglePlay();
        else if (musicQueue.length > 0) playTrack(musicQueue[0], musicQueue);
        else setTab('music');
      } else if (action === 'next') playNext();
      else if (action === 'prev') playPrev();
    };
  });

  // Launch info from the native side (a shortcut's tab, text shared in
  // from another app, an app action the bubble or voice chat relayed in).
  // Read on load, when the window gains focus, AND every 2 seconds: the
  // relay can arrive while the app is already in the foreground behind
  // the bubble, and then no focus event fires at all — without the poll
  // the action would sit unread until the user left the app and came
  // back. Reading clears it, so it never fires twice.
  useEffect(() => {
    let cancelled = false;
    const applyLaunchInfo = async () => {
      if (!isNative()) return;
      const info = await getLaunchInfo();
      if (cancelled) return;
      if (info.sharedText !== '') {
        setPendingQuestion(info.sharedText);
        setTab('chat');
      } else if (isTab(info.tab)) {
        setTab(info.tab);
      }
      // An app action relayed in from the bubble or voice chat (stash
      // add/subtract, log a session). It applies the same way a chat
      // action does; the correction line has nowhere to go here — the
      // user is in the bubble/voice chat, which already showed Bud-E's
      // sentence — so it is dropped.
      if (info.appAction !== '') {
        const appAction = parseAppAction(info.appAction);
        if (appAction) void applyAppAction(appAction);
      }
      // A music action from the music widget (play/pause, next, previous).
      if (info.musicAction !== '') {
        applyMusicActionRef.current(info.musicAction);
      }
    };
    void applyLaunchInfo();
    window.addEventListener('focus', applyLaunchInfo);
    const id = window.setInterval(applyLaunchInfo, 2000);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', applyLaunchInfo);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Storage blocked — the theme still applies for this visit.
    }
    // Keep the native keyboard on the same theme.
    void setKeyboardTheme(theme);
  }, [theme]);

  useEffect(() => save(SESSION_KEY, session), [session]);
  // Photos stay on this phone (capped at the 5 most recent) — the sync
  // upload strips them, so they never reach the account's cloud copy.
  useEffect(() => save(CHATS_KEY, capChatImages(chats)), [chats]);
  // After successful migration, the old key can be cleared on next save, but we leave it for safety.
  useEffect(() => save(VIBE_KEY, vibe), [vibe]);
  useEffect(() => {
    try {
      localStorage.setItem('bude-personalization-v1', JSON.stringify(personalization));
    } catch {
      // Storage blocked — still works for this visit.
    }
    document.documentElement.setAttribute('data-text', personalization.textSize);
    document.documentElement.setAttribute('data-motion', personalization.reduceMotion ? 'reduce' : 'full');
    document.documentElement.setAttribute('data-accent', personalization.accent);
  }, [personalization]);
  useEffect(() => save(JOURNAL_KEY, journal), [journal]);
  useEffect(() => save(STASH_KEY, stash), [stash]);
  useEffect(() => save(PLAYLISTS_KEY, playlists), [playlists]);
  // Remember the queue + last track, so the app can resume after it was
  // killed and the music widget has something to show and resume.
  useEffect(() => {
    save(MUSIC_STATE_KEY, { queue: musicQueue, currentId: currentTrack?.id ?? null });
  }, [musicQueue, currentTrack]);
  // Music widget now-playing line (phone app only): the track, the
  // artist, whether it is playing. Only publishes when it changes.
  const lastMusicState = useRef('');
  useEffect(() => {
    if (!isNative()) return;
    const key = `${currentTrack?.id ?? ''}|${isPlaying ? '1' : '0'}`;
    if (key === lastMusicState.current) return;
    lastMusicState.current = key;
    void publishMusicState(
      currentTrack?.title ?? '',
      currentTrack?.artist ?? '',
      isPlaying,
      currentTrack !== null,
    );
  }, [currentTrack, isPlaying]);
  // Widget time + weather line (phone app only): the temperature comes
  // from Open-Meteo for San Antonio (free, no key) and is published to
  // the widget. Fetched when the app opens and every half hour while it
  // is open — the widget shows the last published temperature in
  // between, so it can go stale if the app is not opened for a while.
  useEffect(() => {
    if (!isNative()) return;
    // Today's strain pick for the home-screen widget (deterministic by
    // day-of-year, same pick the Tonight tab shows). Published on open so
    // the widget stays current; it keeps the last pick until the app is
    // opened again on a new day.
    const pick = strainOfTheDay();
    void publishStrainOfTheDay(`⭐ Today's pick: ${pick.strain.name}`);
    let cancelled = false;
    const fetchWeather = async () => {
      try {
        const res = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=29.4241&longitude=-98.4936&current=temperature_2m&temperature_unit=fahrenheit&timezone=America%2FChicago',
        );
        if (!res.ok) return;
        const data: unknown = await res.json();
        const temp = (data as { current?: { temperature_2m?: unknown } }).current?.temperature_2m;
        if (typeof temp !== 'number' || cancelled) return;
        await publishWeather(`${Math.round(temp)}°F`);
      } catch {
        // Offline or the weather service is down — the widget just
        // keeps the last temperature it had.
      }
    };
    void fetchWeather();
    const id = window.setInterval(fetchWeather, 30 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Home-screen widget stash line (phone app only): the totals, plus
  // the first jar running low — the warning is the line that matters,
  // so the widget shows it without opening the app. Only publishes
  // when the line actually changes.
  const lastWidgetStash = useRef('');
  useEffect(() => {
    if (!isNative()) return;
    const grams = stash
      .filter((i) => i.unit !== 'pieces')
      .reduce((sum, i) => sum + (i.unit === 'g' ? i.amount : i.amount / 1000), 0);
    const stashLine =
      stash.length === 0
        ? 'Stash: empty'
        : `Stash: ${Math.round(grams * 10) / 10}g · ${stash.length} jar${stash.length === 1 ? '' : 's'}`;
    const lowLine = stash.filter(isRunningLow).map(lowNote)[0] ?? '';
    const key = `${stashLine}|${lowLine}`;
    if (key === lastWidgetStash.current) return;
    lastWidgetStash.current = key;
    void publishWidgetStash(stashLine, lowLine);
    // The bubble and voice chats send this to the server so Bud-E knows
    // what jars exist when the user asks it to change the stash.
    void publishStashSummary(stashSummary(stash));
  }, [stash]);

  // Floating chat bubble: if it was left on, make sure its service is
  // running (a reboot or a killed app can drop it). Runs once on load.
  useEffect(() => {
    if (!isNative()) return;
    void getBubbleStatus().then((s) => {
      if (s.enabled && s.canDrawOverlays) void setBubbleEnabled(true);
    });
  }, []);

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
  }, [journal, stash, chats, playlists, session, vibe, voice, theme, user, isOnline]);

  // App lock: read the phone's biometric availability once, and refresh it
  // when the app comes back to the front (the user may have enrolled a
  // fingerprint while the app was in the background).
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void biometricStatus().then((s) => {
        if (!cancelled) setBioStatus(s);
      });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refresh);
    };
  }, []);

  // App lock: when the app goes to the background, note the time; when it
  // comes back, lock it if it was away longer than the grace period. A
  // grace of 0 locks right away.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        backgroundedAt.current = Date.now();
        return;
      }
      const settings = loadLockSettings();
      if (!hasPin(settings)) return;
      const awayMs = Date.now() - (backgroundedAt.current || Date.now());
      if (awayMs >= (settings.graceSec ?? 0) * 1000) {
        setLocked(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Tell the native side (bubble, voice session) whether the app is locked,
  // so those entry points stay shut while it is. If the PIN is removed,
  // there is nothing to lock, so unlock.
  useEffect(() => {
    void publishLockState(locked);
  }, [locked]);

  useEffect(() => {
    if (!hasPin(lockSettings)) setLocked(false);
  }, [lockSettings]);

  function deductFromStash(stashId: string, amount: number, unit: 'mg' | 'g'): void {
    setStash((items) =>
      items.map((i) =>
        i.id === stashId && i.unit === unit
          ? { ...i, amount: Math.max(0, Math.round((i.amount - amount) * 100) / 100) }
          : i,
      ),
    );
  }

  /** Find a stash jar by name (case-insensitive, trimmed). */
  function findJar(items: StashItem[], name: string): StashItem | undefined {
    const want = name.trim().toLowerCase();
    return items.find((i) => i.name.trim().toLowerCase() === want);
  }

  /** Convert an amount between g and mg; pieces never convert. */
  function toUnit(
    amount: number,
    from: 'g' | 'mg' | 'pieces',
    to: 'g' | 'mg' | 'pieces',
  ): number | null {
    if (from === to) return amount;
    if (from === 'pieces' || to === 'pieces') return null;
    return from === 'g' ? amount * 1000 : amount / 1000;
  }

  /**
   * Run one app action from a chat reply (or from the bubble/voice chat,
   * relayed through launch info) and return a plain-words correction
   * when Bud-E's sentence does not stand — a jar that was not found, or
   * one that ran out. Null means the sentence stands. Everything goes
   * through the normal setters, so Neon sync picks it up.
   */
  function applyAppAction(action: AppAction): string | null {
    const items = stashRef.current;
    switch (action.action) {
      case 'stash_add': {
        const jar = findJar(items, action.name);
        if (!jar) {
          // A new jar: flower by default, warn under nothing.
          const fresh: StashItem = {
            id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
            name: action.name.trim(),
            form: 'flower',
            amount: action.amount,
            unit: action.unit,
            thcPct: '',
            lowAt: 0,
            startedAt: action.amount,
          };
          setStash([...items, fresh]);
          return null;
        }
        const added = toUnit(action.amount, action.unit, jar.unit);
        if (added === null) {
          return `I couldn't add that — the ${jar.name} jar is counted in ${jar.unit}, not ${action.unit}.`;
        }
        const total = Math.round((jar.amount + added) * 100) / 100;
        setStash(items.map((i) => (i.id === jar.id ? withAmount(i, total) : i)));
        return null;
      }
      case 'stash_subtract': {
        const jar = findJar(items, action.name);
        if (!jar) {
          return `I couldn't find a jar called ${action.name} — check the name?`;
        }
        const taken = toUnit(action.amount, action.unit, jar.unit);
        if (taken === null) {
          return `I couldn't take that off — the ${jar.name} jar is counted in ${jar.unit}, not ${action.unit}.`;
        }
        const left = Math.max(0, Math.round((jar.amount - taken) * 100) / 100);
        setStash(items.map((i) => (i.id === jar.id ? { ...i, amount: left } : i)));
        if (left <= 0 && jar.amount > 0) {
          return `That used up the last of the ${jar.name} jar — it's out now.`;
        }
        return null;
      }
      case 'log_session': {
        const entry: JournalEntry = {
          id: newEntryId(),
          date: new Date().toISOString(),
          method: (action.method as Method | undefined) ?? 'flower',
          strain: action.strain.trim(),
          amount: String(action.amount),
          unit: action.unit,
          rating: 0,
          note: '',
          change: '',
        };
        setJournal((j) => [entry, ...j]);
        // Logging a session means it was used — take it off the matching
        // jar, the way the user asked (match by strain, convert g↔mg,
        // never below 0, 'pieces' jars untouched).
        if (entry.strain.trim() === '') return null;
        const jar = findJar(items, entry.strain);
        if (!jar) return null;
        const taken = toUnit(action.amount, action.unit, jar.unit);
        if (taken === null || taken <= 0) return null;
        const left = Math.max(0, Math.round((jar.amount - taken) * 100) / 100);
        setStash(items.map((i) => (i.id === jar.id ? { ...i, amount: left } : i)));
        if (left <= 0 && jar.amount > 0) {
          return `That used up the last of the ${jar.name} jar — it's out now.`;
        }
        return null;
      }
      case 'open_tab': {
        if (isTab(action.tab)) {
          setTab(action.tab);
          return null;
        }
        return `I don't have a part of the app called ${action.tab}.`;
      }
      default:
        return null;
    }
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
      premiumTier,
      personalization,
    };
  }

  function applyServerState(state: {
    journal: JournalEntry[];
    stash: StashItem[];
    chats: SyncedChatConversation[];
    playlists: MusicPlaylist[];
    settings: SyncSettings | null;
  }): void {
    applyingServerState.current = true;
    setJournal(state.journal);
    setStash(state.stash);
    // Keep the photos this phone holds — the server copy has none.
    setChats((local) => mergeChatImages(local, state.chats));
    // Playlists merge by updatedAt, so a playlist edit made on this phone
    // is never wiped by a server round-trip that started before the edit.
    // The ?? [] guards a stale deployment that returns no playlists yet.
    setPlaylists((local) => mergeLocalWithServer(local, state.playlists ?? []));
    if (state.chats.length > 0 && !currentChatId) {
      setCurrentChatId(state.chats[0].id);
    }
    if (state.settings) {
      if (state.settings.theme && isThemeId(state.settings.theme)) {
        setTheme(state.settings.theme);
      }
      if (state.settings.session) {
        setSession({ ...DEFAULT_SESSION, ...state.settings.session });
      }
      if (state.settings.vibe) setVibe(state.settings.vibe);
      if (state.settings.voice) setVoice(cleanVoiceSettings(state.settings.voice));
      if (state.settings.premiumTier !== undefined) {
        setPremiumTier(state.settings.premiumTier);
      }
      if (state.settings.personalization) {
        setPersonalization(cleanPersonalization(state.settings.personalization));
      }
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
      const state = await uploadLocal(
        { journal, stash, chats: stripChatImages(chats), playlists },
        currentSettings(),
      );
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
      localStorage.removeItem(CHATS_KEY);
      localStorage.removeItem(PLAYLISTS_KEY);
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(VIBE_KEY);
      localStorage.removeItem(BREAK_KEY);
    } catch {
      // Storage blocked — the state reset below still clears the screen.
    }
    setJournal([]);
    setStash([]);
    setChats([]);
    setPlaylists([]);
    setCurrentChatId(null);
    setSession(DEFAULT_SESSION);
    setVibe(DEFAULT_VIBE);
    setTab('tonight');
    setSyncMessage('Your account is deleted. This device is back to fresh, signed-out Bud-E.');
  }

  /**
   * Forgot-PIN reset (from the lock screen): the only way back in without
   * the PIN. Signs out and wipes this phone's copy of Bud-E — journal,
   * stash, chats, playlists, session, vibe, break, sync state, and the
   * lock itself. Nothing is deleted from the account: signing back in
   * brings the synced stuff back. The account is NOT deleted (unlike
   * handleAccountDeleted above).
   */
  async function handleForgotPin(): Promise<void> {
    try {
      await signOut();
    } catch {
      // The session may already be dead — the wipe below still runs.
    }
    setUser(null);
    clearLocalSyncState();
    clearLockSettings();
    try {
      localStorage.removeItem(JOURNAL_KEY);
      localStorage.removeItem(STASH_KEY);
      localStorage.removeItem(TRANSCRIPT_KEY);
      localStorage.removeItem(CHATS_KEY);
      localStorage.removeItem(PLAYLISTS_KEY);
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(VIBE_KEY);
      localStorage.removeItem(BREAK_KEY);
    } catch {
      // Storage blocked — the state reset below still clears the screen.
    }
    setLockSettings(null);
    setLocked(false);
    setJournal([]);
    setStash([]);
    setChats([]);
    setPlaylists([]);
    setCurrentChatId(null);
    setSession(DEFAULT_SESSION);
    setVibe(DEFAULT_VIBE);
    setTab('tonight');
    setSyncMessage('Lock reset — sign in to get your stuff back.');
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

  if (resetToken !== null || resetInvalid) {
    return (
      <div className="app-shell">
        <div className="app-frame">
          <ResetPasswordView
            token={resetToken}
            invalid={resetInvalid}
            onDone={() => {
              setResetToken(null);
              setResetInvalid(false);
              try {
                window.history.replaceState(null, '', window.location.pathname);
              } catch {
                // Old browsers — the token just stays in the address bar.
              }
              setTab('account');
            }}
          />
        </div>
      </div>
    );
  }

  if (!ageConfirmed) {
    return (
      <AgeGate
        declined={ageDeclined}
        onConfirm={confirmAge}
        onDecline={() => setAgeDeclined(true)}
      />
    );
  }

  const who = user ? user.name : 'Your account';
  const showTimer = timerState.status !== 'idle';
  const timerPct =
    timerState.totalSec > 0
      ? Math.min(100, Math.max(0, (1 - timerState.remainingSec / timerState.totalSec) * 100))
      : 0;
  const moreActive = MORE_TAB_IDS.includes(tab);

  // Log and Plan live inside Tools now, but they are also reachable directly
  // (device actions / launch info can still open them). Define the views
  // once and use them in both places.
  const logDetail =
    journal.length === 0
      ? 'Nothing logged yet'
      : `${journal.length} night${journal.length === 1 ? '' : 's'} logged`;
  const planDetail =
    session.amount.trim() === ''
      ? 'No session logged yet'
      : `${METHOD_LABELS[session.method]} — ${session.amount.trim()}${session.unit}`;
  const journalView = (
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
  );
  const planView = (
    <PlanTab
      session={session}
      vibe={vibe}
      setVibe={setVibe}
      timerStatus={timerStatus}
      onGoTonight={() => setTab('tonight')}
    />
  );

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
          journal={journal}
          onAddJournal={(e) => setJournal((j) => [e, ...j])}
          stash={stash}
          onStash={() => setTab('stash')}
        />
      )}
      {tab === 'chat' && (
        <ChatTab
          session={session}
          chats={chats}
          currentChatId={currentChatId}
          setChats={setChats}
          setCurrentChatId={setCurrentChatId}
          showChatList={showChatList}
          setShowChatList={setShowChatList}
          setSource={setSource}
          journalNote={[journalSummary(journal), tasteSummary(journal)].filter(Boolean).join(' ')}
          stashNote={stashSummary(stash)}
          onAppAction={applyAppAction}
          prefill={pendingQuestion}
          onPrefillUsed={() => setPendingQuestion(null)}
          onGoTonight={() => setTab('tonight')}
          voice={voice}
          onDeleteChat={(id) => queueDeletion('chat', id)}
          personalization={personalization}
          onOpenDriving={() => setDrivingOpen(true)}
        />
      )}
      {tab === 'tools' && (
        <ToolsTab
          session={session}
          user={user}
          timerStatus={timerStatus}
          setTimerStatus={setTimerStatus}
          onTimerState={setTimerState}
          onAlert={setTimerAlert}
          activeTool={activeTool}
          onToolChange={setActiveTool}
          journalView={journalView}
          planView={planView}
          logDetail={logDetail}
          planDetail={planDetail}
        />
      )}
      {tab === 'plan' && planView}
      {tab === 'strains' && <StrainsTab onAskAbout={askAboutStrain} journal={journal} />}
      {tab === 'music' && (
        <MusicTab
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          audioError={audioError}
          onPlayTrack={playTrack}
          onTogglePlay={togglePlay}
          onNext={playNext}
          onPrev={playPrev}
          playlists={playlists}
          onPlaylistsChange={setPlaylists}
          premiumTier={premiumTier}
          onGoPremium={() => setTab('settings')}
        />
      )}
      {tab === 'journal' && journalView}
      {tab === 'stash' && (
        <StashTab
          items={stash}
          onChange={setStash}
          onDelete={(id) => queueDeletion('stash', id)}
          journal={journal}
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
          premiumTier={premiumTier}
          personalization={personalization}
          onPersonalization={setPersonalization}
          onClearChats={() => { setChats([]); setCurrentChatId(null); }}
          onClearJournal={() => setJournal([])}
          journal={journal}
          chats={chats}
          lockSettings={lockSettings}
          onLockSettings={setLockSettings}
          biometric={bioStatus}
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
          {/* Mini player — shows while a track is loaded, above the nav, so
              the music keeps playing while the user moves around the app. */}
          {currentTrack && (
            <div className="mini-player" role="region" aria-label="Now playing">
              <button
                type="button"
                className="mini-player-info"
                onClick={() => setTab('music')}
                aria-label={`Open music — ${currentTrack.title} by ${currentTrack.artist}`}
              >
                {currentTrack.artwork ? (
                  <img src={currentTrack.artwork} alt="" />
                ) : (
                  <span className="mini-player-art-fallback" aria-hidden>
                    ♫
                  </span>
                )}
                <span className="mini-player-text">
                  <strong>{currentTrack.title}</strong>
                  <span className="muted">{currentTrack.artist}</span>
                </span>
              </button>
              <button type="button" className="mini-player-btn" onClick={playPrev} aria-label="Previous track">
                <SkipBack size={20} aria-hidden />
              </button>
              <button
                type="button"
                className="mini-player-btn"
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={20} aria-hidden /> : <Play size={20} aria-hidden />}
              </button>
              <button type="button" className="mini-player-btn" onClick={playNext} aria-label="Next track">
                <SkipForward size={20} aria-hidden />
              </button>
              <button type="button" className="mini-player-btn" onClick={stopPlayer} aria-label="Stop music">
                <X size={20} aria-hidden />
              </button>
            </div>
          )}
          {/* The player itself — hidden; the mini player + Music tab are the controls. */}
          <audio
            ref={audioRef}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => handleAudioEnded()}
            onError={() => setAudioError("That track wouldn't play — try another one.")}
            preload="metadata"
          />
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

      {/* App lock — a full-screen cover over the whole app (the app stays
          mounted underneath, so music keeps playing). */}
      {locked && lockSettings && (
        <LockScreen
          lockSettings={lockSettings}
          biometric={bioStatus}
          onUnlock={() => setLocked(false)}
          onForgotPin={handleForgotPin}
        />
      )}

      {/* Hands-free driving mode — full-screen overlay over the whole app. */}
      {drivingOpen && (
        <DrivingMode
          apiBase={apiBase()}
          persona={voice.persona}
          session={session}
          journalNote={[journalSummary(journal), tasteSummary(journal)].filter(Boolean).join(' ')}
          stashNote={stashSummary(stash)}
          personalization={personalization}
          onAppAction={applyAppAction}
          onClose={() => setDrivingOpen(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 21+ age gate — first open only. Birthdate entry, plain words, no lecture.
// The birthdate is checked once, on this phone, and never saved or sent
// anywhere — only the "yes, they are 21+" flag is stored (AGE_GATE_KEY).
// ---------------------------------------------------------------------------

/** Age in whole years from a birthdate, or null when the date is not real. */
function ageFromBirthdate(month: string, day: string, year: string): number | null {
  const m = Number(month);
  const d = Number(day);
  const y = Number(year);
  if (!Number.isInteger(m) || !Number.isInteger(d) || !Number.isInteger(y)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const now = new Date();
  if (y < 1900 || y > now.getFullYear()) return null;
  const date = new Date(y, m - 1, d);
  // A rolled-over date (Feb 30 -> Mar 2) will not match its parts.
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  if (date > now) return null;
  let age = now.getFullYear() - y;
  if (now < new Date(now.getFullYear(), m - 1, d)) age -= 1;
  return age;
}

function AgeGate({
  declined,
  onConfirm,
  onDecline,
}: {
  declined: boolean;
  onConfirm: () => void;
  onDecline: () => void;
}) {
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState('');
  const dayRef = useRef<HTMLInputElement | null>(null);
  const yearRef = useRef<HTMLInputElement | null>(null);
  const monthRef = useRef<HTMLInputElement | null>(null);

  /** Only digits, capped at the field's length; auto-advance when full. */
  function digitsOnly(value: string, maxLen: number): string {
    return value.replace(/\D/g, '').slice(0, maxLen);
  }

  function checkBirthdate(): void {
    if (month === '' || day === '' || year === '') {
      setError('Add your full birthdate — month, day, and year.');
      return;
    }
    if (year.length !== 4) {
      setError('The year needs 4 digits — like 1995.');
      return;
    }
    const age = ageFromBirthdate(month, day, year);
    if (age === null) {
      setError("That date doesn't look right — check the month, day, and year.");
      return;
    }
    if (age < 21) {
      setError('');
      onDecline();
      return;
    }
    setError('');
    onConfirm();
  }

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
          <section className="card" aria-label="Adults only">
            <p className="eyebrow">21+ only</p>
            <h2 style={{ marginTop: 8 }}>This one is for adults.</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              Bud-E is only for people 21 and over.
            </p>
          </section>
        ) : (
          <section className="card" aria-label="Enter your birthdate">
            <p className="eyebrow">First — how old are you?</p>
            <h2 style={{ marginTop: 8 }}>Enter your birthdate</h2>
            <p className="muted small" style={{ marginTop: 4 }}>
              Bud-E is 21+. We check it once, right here on your phone.
            </p>
            <div className="dob-row" role="group" aria-label="Birthdate">
              <div className="dob-field">
                <label htmlFor="dob-month">Month</label>
                <input
                  id="dob-month"
                  ref={monthRef}
                  className="dob-input"
                  inputMode="numeric"
                  autoComplete="bday-month"
                  placeholder="MM"
                  aria-label="Birth month"
                  value={month}
                  onChange={(e) => {
                    const next = digitsOnly(e.target.value, 2);
                    setMonth(next);
                    setError('');
                    if (next.length === 2) dayRef.current?.focus();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && month === '') yearRef.current?.focus();
                  }}
                />
              </div>
              <span className="dob-sep" aria-hidden>
                /
              </span>
              <div className="dob-field">
                <label htmlFor="dob-day">Day</label>
                <input
                  id="dob-day"
                  ref={dayRef}
                  className="dob-input"
                  inputMode="numeric"
                  autoComplete="bday-day"
                  placeholder="DD"
                  aria-label="Birth day"
                  value={day}
                  onChange={(e) => {
                    const next = digitsOnly(e.target.value, 2);
                    setDay(next);
                    setError('');
                    if (next.length === 2) yearRef.current?.focus();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && day === '') monthRef.current?.focus();
                  }}
                />
              </div>
              <span className="dob-sep" aria-hidden>
                /
              </span>
              <div className="dob-field dob-year">
                <label htmlFor="dob-year">Year</label>
                <input
                  id="dob-year"
                  ref={yearRef}
                  className="dob-input"
                  inputMode="numeric"
                  autoComplete="bday-year"
                  placeholder="YYYY"
                  aria-label="Birth year"
                  value={year}
                  onChange={(e) => {
                    const next = digitsOnly(e.target.value, 4);
                    setYear(next);
                    setError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && year === '') dayRef.current?.focus();
                    if (e.key === 'Enter') checkBirthdate();
                  }}
                />
              </div>
            </div>
            {error !== '' && (
              <p role="alert" style={{ marginTop: 12, marginBottom: 0 }}>
                {error}
              </p>
            )}
            <button
              className="btn btn-block"
              style={{ marginTop: 16 }}
              onClick={checkBirthdate}
            >
              Enter Bud-E →
            </button>
            <p className="muted small" style={{ marginTop: 12, marginBottom: 0 }}>
              Your birthdate is never saved or sent anywhere — only that you are 21+ is
              remembered, so you do not have to enter it again.
            </p>
            <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>
              Cannabis information for adults. Bud-E is not a doctor, not a shop, and not legal
              advice. Start low, go slow. Never drive high.
            </p>
          </section>
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
  chats,
  currentChatId,
  setChats,
  setCurrentChatId,
  showChatList,
  setShowChatList,
  setSource,
  journalNote,
  stashNote,
  onAppAction,
  prefill,
  onPrefillUsed,
  onGoTonight,
  voice,
  onDeleteChat,
  personalization,
  onOpenDriving,
}: {
  session: Session;
  chats: SyncedChatConversation[];
  currentChatId: string | null;
  setChats: (chats: SyncedChatConversation[]) => void;
  setCurrentChatId: (id: string | null) => void;
  showChatList: boolean;
  setShowChatList: (show: boolean) => void;
  setSource: (s: Source) => void;
  journalNote: string;
  stashNote: string;
  onAppAction: (action: AppAction) => string | null;
  prefill: string | null;
  onPrefillUsed: () => void;
  onGoTonight: () => void;
  voice: VoiceSettings;
  onDeleteChat: (id: string) => void;
  personalization: Personalization;
  /** Open hands-free driving mode. */
  onOpenDriving: () => void;
}) {
  const current = chats.find((c) => c.id === currentChatId) ?? null;
  const transcript = current?.messages ?? [];

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  // Photo attached to the next message (data URL, downscaled). Sent once
  // for analysis, then cleared — never saved (see ChatMessage.image).
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [photoNote, setPhotoNote] = useState('');
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
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
    // User gesture — unlock audio so the clip is allowed to play.
    unlockAudio();
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
    // User gesture — unlock audio so the reply can play out loud after.
    unlockAudio();
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

  /** Web image search (Openverse, called directly — no key needed).
   *  Direct, not through a /api proxy: the project is on Vercel's Hobby
   *  plan, which caps at 12 serverless functions per deploy, and the
   *  project already has 12 — a 13th function broke the deploy
   *  (exceeded_serverless_functions_per_deployment, 2026-11-09). Openverse
   *  answers CORS * so the app can call it from any origin. Empty list on
   *  any failure — the caller turns that into a plain-words note. */
  async function searchImages(query: string): Promise<ChatImage[]> {
    try {
      const res = await fetch(
        `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=8`,
      );
      if (!res.ok) return [];
      const data: unknown = await res.json();
      const results =
        data && typeof data === 'object' && 'results' in data
          ? (data as { results?: unknown }).results
          : undefined;
      if (!Array.isArray(results)) return [];
      return results
        .filter(
          (r): r is {
            title?: unknown;
            thumbnail?: unknown;
            url?: unknown;
            foreign_landing_url?: unknown;
            creator?: unknown;
          } =>
            !!r &&
            typeof r === 'object' &&
            (typeof (r as { thumbnail?: unknown }).thumbnail === 'string' ||
              typeof (r as { url?: unknown }).url === 'string') &&
            typeof (r as { foreign_landing_url?: unknown }).foreign_landing_url ===
              'string',
        )
        .map((r) => {
          const thumb =
            typeof r.thumbnail === 'string' && r.thumbnail !== ''
              ? r.thumbnail
              : typeof r.url === 'string'
                ? r.url
                : '';
          const url =
            typeof r.url === 'string' && r.url !== '' ? r.url : thumb;
          return {
            title:
              typeof r.title === 'string' && r.title.trim() !== ''
                ? r.title
                : query,
            thumb,
            url,
            page: r.foreign_landing_url as string,
            creator: typeof r.creator === 'string' ? r.creator : '',
          };
        })
        .filter((img) => img.thumb !== '' && img.page !== '')
        .slice(0, 8);
    } catch {
      return [];
    }
  }

  /** Pick a photo (camera or gallery on the phone) and shrink it for sending. */
  async function pickPhoto(file: File | undefined): Promise<void> {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoNote("That didn't look like a photo — try another file.");
      return;
    }
    try {
      const dataUrl = await downscalePhoto(file);
      setPendingPhoto(dataUrl);
      setPhotoNote('');
    } catch {
      setPhotoNote("Couldn't read that photo — try another one.");
    }
  }

  async function sendText(text: string, photo?: string | null): Promise<void> {
    const trimmed = text.trim();
    if ((!trimmed && !photo) || sending) return;
    unlockAudio();
    stopVoice();
    setSpeakingIdx(null);

    let chatId = currentChatId;
    let baseMessages = transcript;
    if (!chatId) {
      chatId = newChatId();
      baseMessages = [];
      setCurrentChatId(chatId);
    }

    // No question typed with a photo: ask what is in it.
    const userText = trimmed || "What's in this photo?";
    const next: ChatMessage[] = [
      ...baseMessages,
      photo
        ? { role: 'user', text: userText, image: photo }
        : { role: 'user', text: userText },
    ];
    const title = chats.find((c) => c.id === chatId)?.title || autoTitle(next);

    function updateChat(messages: ChatMessage[]) {
      setChats(
        chats
          .filter((c) => c.id !== chatId)
          .concat({
            id: chatId!,
            title: messages.some((m) => m.role === 'user') ? autoTitle(messages) : title,
            messages,
            updatedAt: new Date().toISOString(),
          }),
      );
    }

    updateChat(next);
    setInput('');
    setPendingPhoto(null);
    setSending(true);
    let serverSource: string | undefined;
    try {
      if (personalization.offlineOnly) {
        throw new Error('offline only is on');
      }
      const memory = personalization.aiMemory
        ? [
            personalization.memoryNotes.trim(),
            ...chats
              .slice()
              .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
              .slice(0, 4)
              .map((c) => {
                const last = c.messages.filter((m) => m.role === 'user').slice(-1)[0];
                return last ? `${c.title}: ${last.text.slice(0, 80)}` : c.title;
              }),
          ]
            .filter(Boolean)
            .join('\n')
        : '';
      const res = await fetch(apiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.slice(-12),
          session,
          persona: voice.persona,
          now: localIsoNow(),
          personalization: {
            buddyName: personalization.buddyName,
            userName: personalization.userName,
            replyLength: personalization.replyLength,
            chatStyle: personalization.chatStyle,
          },
          ...(memory ? { memory } : {}),
          ...(journalNote !== '' ? { journal: journalNote } : {}),
          ...(stashNote !== '' ? { stash: stashNote } : {}),
          ...(photo ? { image: photo } : {}),
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
      serverSource = typeof src === 'string' ? src : undefined;
      const sources =
        data && typeof data === 'object' && 'sources' in data
          ? (data as { sources?: unknown }).sources
          : undefined;
      if (typeof reply === 'string' && reply.trim() !== '') {
        // Actions: the server may end the reply with a JSON action block
        // (see api/chat.ts). Strip it, run it, and show the user only the
        // spoken sentence plus what actually happened. App actions (stash,
        // journal, navigation) run in the app itself; phone actions run
        // through the native plugin. Image search runs here too — it fetches
        // /api/images/search and the pictures ride on the reply.
        const { text: cleanText, action } = extractDeviceAction(reply);
        let finalText = cleanText;
        let foundImages: ChatImage[] = [];
        if (action) {
          if (isImageSearchAction(action)) {
            foundImages = await searchImages(action.query);
            if (foundImages.length === 0) {
              finalText = `${cleanText}\n\nCouldn't find pictures of that — try different words.`;
            }
          } else if (isAppAction(action)) {
            const note = onAppAction(action);
            if (note) finalText = `${cleanText}\n\n${note}`;
          } else if (isNative()) {
            const done = await executeDeviceAction(action);
            if (!done.ok) {
              finalText = `${cleanText}\n\nI couldn't do that one — ${done.message}`;
            }
          } else {
            finalText = `${cleanText}\n\nThat's a phone thing — ask me in the Bud-E app and I'll set it up.`;
          }
        }
        const budMsg: ChatMessage = { role: 'bud', text: finalText };
        if (foundImages.length > 0) budMsg.images = foundImages;
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
        updateChat([...next, budMsg]);
        setSource(src === 'live' ? 'live' : 'fallback');
        speakReply(finalText, next.length);
      } else {
        throw new Error(
          serverSource
            ? `server answered source=${serverSource} (no usable reply)`
            : 'no live reply',
        );
      }
    } catch (err) {
      const reason =
        err instanceof Error && err.message
          ? err.message
          : 'request failed';
      const fallbackText = photo
        ? "I couldn't look at that photo right now — I'm offline. Try sending it again when you're back online."
        : localReply(userText, session, next);
      const withReason = `${fallbackText}\n\n[offline: ${reason}]`;
      updateChat([...next, { role: 'bud', text: withReason }]);
      setSource('fallback');
      speakReply(fallbackText, next.length);
    } finally {
      setSending(false);
    }
  }

  function send(): void {
    void sendText(input, pendingPhoto);
  }

  const amount = session.amount.trim();
  const doseText = amount ? `${amount}${session.unit}` : '';

  return (
    <div className="chat-shell">
      {showChatList ? (
        <div className="chat-list-view">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1 className="page-title" style={{ margin: 0 }}>Chats</h1>
            <button type="button" className="btn" onClick={() => setShowChatList(false)}>
              Back
            </button>
          </div>
          <button
            type="button"
            className="btn btn-block"
            style={{ marginTop: 12 }}
            onClick={() => {
              const id = newChatId();
              setCurrentChatId(id);
              setChats([
                ...chats,
                { id, title: 'New chat', messages: [], updatedAt: new Date().toISOString() },
              ]);
              setShowChatList(false);
            }}
          >
            + New chat
          </button>
          <div style={{ marginTop: 16 }}>
            {chats.length === 0 && <p className="muted">No chats yet.</p>}
            {chats
              .slice()
              .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
              .map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: '1px solid var(--border, #333)',
                  }}
                >
                  {renamingId === c.id ? (
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => {
                        if (renameValue.trim()) {
                          setChats(
                            chats.map((x) =>
                              x.id === c.id
                                ? { ...x, title: renameValue.trim(), updatedAt: new Date().toISOString() }
                                : x,
                            ),
                          );
                        }
                        setRenamingId(null);
                      }}
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: 'inherit' }}
                      onClick={() => {
                        setCurrentChatId(c.id);
                        setShowChatList(false);
                      }}
                    >
                      <strong>{c.title || 'Untitled'}</strong>
                      <div className="muted" style={{ fontSize: 13 }}>
                        {c.messages.length} messages
                      </div>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingId(c.id);
                      setRenameValue(c.title);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="danger-text"
                    onClick={() => {
                      onDeleteChat(c.id);
                      setChats(chats.filter((x) => x.id !== c.id));
                      if (currentChatId === c.id) setCurrentChatId(null);
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
          </div>
        </div>
      ) : (
        <>
        <div className="chat-scroll" role="log" aria-live="polite">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 className="page-title">Buddy</h1>
              <p className="page-sub" style={{ marginBottom: 0 }}>
                Ask anything — Bud-E answers with your session in mind.
              </p>
            </div>
            <button type="button" className="btn" onClick={() => setShowChatList(true)}>
              Chats
            </button>
            <button type="button" className="btn secondary" onClick={onOpenDriving} style={{ marginLeft: 8 }}>
              🎙️ Hands Free
            </button>
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
            {m.image && (
              <img src={m.image} alt="Photo you sent" className="chat-photo" />
            )}
            {m.text}
            {m.role === 'bud' && m.images && m.images.length > 0 && (
              <span className="chat-images">
                {m.images.map((img, j) => (
                  <a
                    key={j}
                    href={img.page}
                    target="_blank"
                    rel="noreferrer"
                    title={`${img.title}${img.creator ? ` — ${img.creator}` : ''}`}
                  >
                    <img src={img.thumb} alt={img.title} loading="lazy" />
                  </a>
                ))}
              </span>
            )}
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
        {pendingPhoto && (
          <div className="chat-photo-preview">
            <img src={pendingPhoto} alt="Photo to send" />
            <span>Sent to Bud-E&apos;s AI to look at — kept on this phone only.</span>
            <button
              type="button"
              onClick={() => {
                setPendingPhoto(null);
                if (photoInputRef.current) photoInputRef.current.value = '';
              }}
              aria-label="Remove photo"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        )}
        {photoNote !== '' && (
          <p className="muted" role="alert" style={{ margin: '0 0 8px' }}>
            {photoNote}
          </p>
        )}
        <form
          className="chat-input-row"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              void pickPhoto(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="btn chat-mic"
            disabled={sending}
            onClick={() => photoInputRef.current?.click()}
            aria-label="Send a photo for Bud-E to look at"
          >
            <Camera size={18} aria-hidden />
          </button>
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
            disabled={sending || (input.trim() === '' && !pendingPhoto)}
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
                  if (currentChatId) {
                    onDeleteChat(currentChatId);
                    setChats(chats.filter((c) => c.id !== currentChatId));
                    setCurrentChatId(null);
                  }
                  setSource(null);
                  setConfirmClear(false);
                  setShowChatList(false);
                }}
              >
                Delete chat
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
        </>
      )}
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
  { id: 'journal', name: 'Log', detail: '', icon: <BookOpen size={20} aria-hidden /> },
  { id: 'plan', name: 'Plan', detail: '', icon: <ClipboardList size={20} aria-hidden /> },
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
    id: 'community',
    name: 'Group Sesh',
    detail: 'One board, every Bud-E user',
    icon: <Users size={20} aria-hidden />,
  },
  {
    id: 'trivia',
    name: 'Bud-E trivia',
    detail: '10 questions, easy to expert',
    icon: <Brain size={20} aria-hidden />,
  },
  {
    id: 'would-you-rather',
    name: 'Would you rather',
    detail: 'Pick one, no wrong answers',
    icon: <MessageCircle size={20} aria-hidden />,
  },
  {
    id: 'guess-strain',
    name: 'Guess the strain',
    detail: 'Read the vibe, name it',
    icon: <Leaf size={20} aria-hidden />,
  },
  {
    id: 'memory',
    name: 'Memory match',
    detail: 'Flip cards, match the pairs',
    icon: <LayoutGrid size={20} aria-hidden />,
  },
];

function ToolsTab({
  session,
  user,
  timerStatus,
  setTimerStatus,
  onTimerState,
  onAlert,
  activeTool,
  onToolChange,
  journalView,
  planView,
  logDetail,
  planDetail,
}: {
  session: Session;
  user: AuthUser | null;
  timerStatus: string;
  setTimerStatus: (s: string) => void;
  onTimerState: (s: TimerState) => void;
  onAlert: (a: TimerAlert | null) => void;
  activeTool: ToolId | null;
  onToolChange: (t: ToolId | null) => void;
  journalView: React.ReactNode;
  planView: React.ReactNode;
  logDetail: string;
  planDetail: string;
}) {
  // Log, Plan and the timer show a live detail, like the timer does.
  function tileDetail(tool: { id: ToolId; detail: string }): string {
    if (tool.id === 'timer') return timerStatus;
    if (tool.id === 'journal') return logDetail;
    if (tool.id === 'plan') return planDetail;
    return tool.detail;
  }

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
              <span className="tool-tile-detail">{tileDetail(tool)}</span>
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
      {activeTool === 'journal' && journalView}
      {activeTool === 'plan' && planView}
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
      {activeTool === 'community' && <Community user={user} />}
      {activeTool === 'would-you-rather' && <WouldYouRather />}
      {activeTool === 'guess-strain' && <GuessTheStrain />}
      {activeTool === 'memory' && <MemoryMatch />}
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

/** Pick one game's worth of trivia: 10 questions, mixed difficulty, shuffled. */
function pickTriviaGame(): TriviaQuestion[] {
  const byDifficulty = (d: TriviaQuestion['difficulty']) =>
    shuffle(TRIVIA.filter((q) => q.difficulty === d));
  const picked = [
    ...byDifficulty('Easy').slice(0, 3),
    ...byDifficulty('Medium').slice(0, 3),
    ...byDifficulty('Hard').slice(0, 2),
    ...byDifficulty('Expert').slice(0, 2),
  ];
  return shuffle(picked);
}

function TriviaGame() {
  const [questions, setQuestions] = useState<TriviaQuestion[]>(() => pickTriviaGame());
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const q = questions[index] as TriviaQuestion;

  function pick(i: number) {
    if (selected !== null) return;
    setSelected(i);
    if (i === q.answer) setScore((s) => s + 1);
  }

  function next() {
    if (index + 1 >= questions.length) {
      setDone(true);
    } else {
      setIndex((i) => i + 1);
      setSelected(null);
    }
  }

  function playAgain() {
    setQuestions(pickTriviaGame());
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
            {score} / {questions.length}
          </p>
          <p style={{ textAlign: 'center' }}>
            {score === questions.length
              ? 'Perfect score — certified Bud-E brain. 🌿'
              : score >= 7
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
            Question {index + 1} of {questions.length} · {q.difficulty} · Score: {score}
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
                {index + 1 >= questions.length ? 'See my score' : 'Next question →'}
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
  // 'main' is the menu. 'plan' is tonight's plan, 'vibe' is the vibe check.
  const [view, setView] = useState<'main' | 'plan' | 'vibe'>('main');
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

  const vibeLine = `${vibe.setting} · ${vibe.sound} · craving ${vibe.snack} · feeling ${vibe.energy}`;
  const planSub = amount === '' ? 'No session logged yet' : sessionLine;

  return (
    <main>
      {view === 'main' ? (
        <>
          <PageHead title="Plan" sub="Built from what you actually logged. Copy it for the group chat." />
          <section className="card" aria-label="Plan menu">
            <div className="legal-list">
              <button type="button" className="legal-row" onClick={() => setView('plan')}>
                <span>
                  <strong>Tonight&apos;s plan</strong>
                  <span className="muted">{planSub}</span>
                </span>
                <span aria-hidden>›</span>
              </button>
              <button type="button" className="legal-row" onClick={() => setView('vibe')}>
                <span>
                  <strong>Vibe check</strong>
                  <span className="muted">{vibeLine}</span>
                </span>
                <span aria-hidden>›</span>
              </button>
            </div>
          </section>
          <p className="muted small">
            21+ only. Bud-E is a buddy, not a doctor. Start low, go slow. Never drive high — wait until fully
            sober, and after edibles, until after a full night&apos;s sleep.
          </p>
        </>
      ) : (
        <>
          <button type="button" className="tool-back" onClick={() => setView('main')}>
            ← Back to Plan
          </button>
          <h1 className="page-title" style={{ marginTop: 8 }}>
            {view === 'plan' ? "Tonight's plan" : 'Vibe check'}
          </h1>

          {view === 'plan' && (
            <>
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
            </>
          )}

          {view === 'vibe' && <VibeEditor vibe={vibe} setVibe={setVibe} />}
        </>
      )}
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
