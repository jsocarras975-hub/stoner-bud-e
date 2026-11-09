// Stoner Bud-E — sync helpers (browser side).
//
// Pure merge logic + the upload/download calls for /api/sync. Journal,
// stash, settings, and chat conversations all sync. Signed-out chats
// stay local-only, exactly like journal/stash.
//
// How conflict resolution works (both sides agree on this):
// - Every synced item carries `updatedAt` (ISO string). The server only
//   overwrites a row when the incoming updatedAt is NEWER than the stored
//   one; otherwise the server copy wins (see api/sync.ts).
// - Local edits must bump updatedAt — uploadLocal() does that for you: it
//   keeps a snapshot of the last server state in localStorage, and any local
//   item whose content differs from the snapshot (or is brand new) gets a
//   fresh updatedAt at upload time. So App.tsx does NOT have to stamp edits
//   itself; it just passes the current local lists in.
// - mergeLocalWithServer() (for display/merge before an upload): union by id,
//   later updatedAt wins, a tie goes to the server copy, and an item with no
//   updatedAt at all (legacy local data from before sign-in existed) counts
//   as the oldest — uploadLocal stamps those on first sync.
// - After a successful upload or download, the server state is the source of
//   truth: App.tsx replaces its local lists with what the server returned.
//
// Deletions sync as tombstones (table `deleted_items`, migration 0003 +
// chat kind in 0004):
// - When the user deletes a journal entry, stash item, or chat, App.tsx
//   calls queueDeletion() — the deletion is stored in localStorage
//   (`bude-deleted-queue-v1`) so it survives restarts and signed-out use,
//   and uploadLocal() sends the whole queue on the next sync. The server
//   stores the tombstones, deletes the matching rows, and returns every
//   tombstone; the queue entries the server confirms are then cleared.
// - Incoming tombstones are applied locally too: filterTombstoned() drops
//   any local item a tombstone covers, so a tombstoned item is never
//   re-uploaded. A local tombstone cache (`bude-sync-tombstones-v1`) keeps
//   the last server tombstone list between syncs.
// - Tombstone rule (same on both sides): a tombstone wins when its
//   deletedAt is >= the item's updatedAt; otherwise the newer update wins.
//   An item with no updatedAt counts as the oldest, so the tombstone wins.

import { authedFetch } from './auth-client.ts';
import type { JournalEntry } from '../journal.ts';
import type { StashItem } from '../stash.ts';
import type { ChatMessage, Experience, Session } from '../bude.ts';
import type { ThemeId } from '../theme.ts';
import type { VoiceSettings } from '../voice.ts';

export type Synced<T> = T & { updatedAt?: string };

export type SyncedJournalEntry = Synced<JournalEntry>;
export type SyncedStashItem = Synced<StashItem>;

/** One saved chat. Messages match ChatMessage from bude.ts. */
export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt?: string;
}

export type SyncedChatConversation = Synced<ChatConversation>;

export interface VibeState {
  setting: string;
  sound: string;
  snack: string;
  energy: string;
}

export interface BreakCheckin {
  date: string; // "YYYY-MM-DD"
  mood: string;
  cravings: number; // 1–5
  note: string;
}

export interface BreakState {
  startDate: string; // "YYYY-MM-DD"
  lengthDays: number;
  checkins: BreakCheckin[];
  status: 'active' | 'done' | 'ended';
}

export type PremiumTier = 'lit' | 'cloudnine' | null;

export interface SyncSettings {
  theme?: ThemeId;
  experience?: Experience;
  session?: Session;
  vibe?: VibeState;
  break?: BreakState | null;
  voice?: VoiceSettings;
  premiumTier?: PremiumTier;
  customPersona?: { id: string; name: string; direction: string; tone: string } | null;
  customTheme?: { id: string; name: string; colors: Record<string, string> } | null;
  savedPlans?: { id: string; text: string; updatedAt?: string }[];
  updatedAt?: string;
}

export interface Tombstone {
  kind: 'journal' | 'stash' | 'chat';
  id: string;
  deletedAt: string;
}

export interface ServerState {
  journal: SyncedJournalEntry[];
  stash: SyncedStashItem[];
  chats: SyncedChatConversation[];
  settings: SyncSettings | null;
  deleted: Tombstone[];
}

export interface LocalState {
  journal: SyncedJournalEntry[];
  stash: SyncedStashItem[];
  chats: SyncedChatConversation[];
}

const SNAPSHOT_KEY = 'bude-sync-snapshot-v1';

/** Stable JSON for content comparison (keys sorted, updatedAt excluded). */
function contentKey(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(contentKey).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => k !== 'updatedAt')
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${contentKey(obj[k])}`).join(',')}}`;
}

interface Snapshot {
  journal: Record<string, string>;
  stash: Record<string, string>;
  chats: Record<string, string>;
  settings: string | null;
}

function loadSnapshot(): Snapshot {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return { journal: {}, stash: {}, chats: {}, settings: null };
    const parsed = JSON.parse(raw) as Partial<Snapshot>;
    return {
      journal: parsed.journal ?? {},
      stash: parsed.stash ?? {},
      chats: parsed.chats ?? {},
      settings: parsed.settings ?? null,
    };
  } catch {
    return { journal: {}, stash: {}, chats: {}, settings: null };
  }
}

function saveSnapshot(state: ServerState): void {
  try {
    const snapshot: Snapshot = {
      journal: Object.fromEntries(state.journal.map((e) => [e.id, contentKey(e)])),
      stash: Object.fromEntries(state.stash.map((i) => [i.id, contentKey(i)])),
      chats: Object.fromEntries(state.chats.map((c) => [c.id, contentKey(c)])),
      settings: state.settings ? contentKey(state.settings) : null,
    };
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage blocked — sync still works, it just re-stamps on next upload.
  }
}

// --- Delete queue + tombstone cache (localStorage, survives restarts) ---

const DELETE_QUEUE_KEY = 'bude-deleted-queue-v1';
const TOMBSTONE_CACHE_KEY = 'bude-sync-tombstones-v1';

/**
 * Wipe everything sync keeps on this device: the upload snapshot, the
 * pending delete queue, and the tombstone cache. Used when an account is
 * deleted, so a fresh account on this device never inherits the old one's
 * sync state. Theme and age-gate are device preferences, not account data —
 * they are left alone.
 */
export function clearLocalSyncState(): void {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
    localStorage.removeItem(DELETE_QUEUE_KEY);
    localStorage.removeItem(TOMBSTONE_CACHE_KEY);
  } catch {
    // Storage blocked — the keys just stay, harmlessly empty of meaning
    // once the account is gone.
  }
}

function loadDeleteQueue(): Tombstone[] {
  try {
    const raw = localStorage.getItem(DELETE_QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is Tombstone =>
        !!t &&
        typeof t === 'object' &&
        ((t as Tombstone).kind === 'journal' ||
          (t as Tombstone).kind === 'stash' ||
          (t as Tombstone).kind === 'chat') &&
        typeof (t as Tombstone).id === 'string' &&
        typeof (t as Tombstone).deletedAt === 'string',
    );
  } catch {
    return [];
  }
}

function saveDeleteQueue(queue: Tombstone[]): void {
  try {
    localStorage.setItem(DELETE_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage blocked — the delete just won't sync this time.
  }
}

/**
 * Remember a deletion for the next sync. Call this whenever the user deletes
 * a journal entry or stash item — signed in or not. Queued deletions are
 * sent on the first sync after sign-in, so a delete made while signed out
 * cannot resurrect from the server. A repeat delete keeps the FIRST time.
 */
export function queueDeletion(kind: 'journal' | 'stash' | 'chat', id: string): void {
  const queue = loadDeleteQueue();
  if (queue.some((t) => t.kind === kind && t.id === id)) return;
  queue.push({ kind, id, deletedAt: new Date().toISOString() });
  saveDeleteQueue(queue);
}

/** Drop queue entries the server has confirmed (they are in its tombstones). */
function clearConfirmedDeletions(serverDeleted: Tombstone[]): void {
  const queue = loadDeleteQueue();
  if (queue.length === 0) return;
  const confirmed = new Set(serverDeleted.map((t) => `${t.kind}:${t.id}`));
  const remaining = queue.filter((t) => !confirmed.has(`${t.kind}:${t.id}`));
  if (remaining.length !== queue.length) saveDeleteQueue(remaining);
}

function loadTombstoneCache(): Tombstone[] {
  try {
    const raw = localStorage.getItem(TOMBSTONE_CACHE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is Tombstone =>
        !!t &&
        typeof t === 'object' &&
        ((t as Tombstone).kind === 'journal' ||
          (t as Tombstone).kind === 'stash' ||
          (t as Tombstone).kind === 'chat') &&
        typeof (t as Tombstone).id === 'string' &&
        typeof (t as Tombstone).deletedAt === 'string',
    );
  } catch {
    return [];
  }
}

function saveTombstoneCache(tombstones: Tombstone[]): void {
  try {
    const byKey = new Map<string, Tombstone>();
    for (const t of [...loadTombstoneCache(), ...tombstones]) {
      const key = `${t.kind}:${t.id}`;
      const existing = byKey.get(key);
      // Keep the earliest delete time when the same item is tombstoned twice.
      if (!existing || Date.parse(t.deletedAt) < Date.parse(existing.deletedAt)) {
        byKey.set(key, t);
      }
    }
    localStorage.setItem(TOMBSTONE_CACHE_KEY, JSON.stringify([...byKey.values()]));
  } catch {
    // Storage blocked — the server still enforces tombstones on its side.
  }
}

/**
 * Drop local items a tombstone covers. A tombstone wins when its deletedAt
 * is >= the item's updatedAt; an item with no updatedAt counts as oldest,
 * so the tombstone wins. Returns the filtered list (same order).
 */
export function filterTombstoned<T extends { id: string; updatedAt?: string }>(
  items: T[],
  kind: 'journal' | 'stash' | 'chat',
  tombstones: Tombstone[],
): T[] {
  const byId = new Map(
    tombstones.filter((t) => t.kind === kind).map((t) => [t.id, Date.parse(t.deletedAt)]),
  );
  if (byId.size === 0) return items;
  return items.filter((item) => {
    const deletedAt = byId.get(item.id);
    if (deletedAt === undefined || Number.isNaN(deletedAt)) return true;
    const updatedAt = item.updatedAt ? Date.parse(item.updatedAt) : 0;
    return !Number.isNaN(updatedAt) && updatedAt > deletedAt;
  });
}

function stampIfChanged<T extends { id: string; updatedAt?: string }>(
  items: T[],
  snapshot: Record<string, string>,
  now: string,
): T[] {
  return items.map((item) => {
    const prev = snapshot[item.id];
    if (prev !== undefined && prev === contentKey(item) && item.updatedAt !== undefined) {
      return item; // unchanged since last sync — keep the old stamp
    }
    return { ...item, updatedAt: now };
  });
}

/**
 * Merge a local list with the server list, by id. Later updatedAt wins; a
 * tie goes to the server copy; a local item with no updatedAt counts as
 * oldest. Items only on one side are always kept.
 */
export function mergeLocalWithServer<T extends { id: string; updatedAt?: string }>(
  local: T[],
  server: T[],
): T[] {
  const byId = new Map<string, T>();
  for (const item of server) byId.set(item.id, item);
  for (const item of local) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      continue;
    }
    const localTime = item.updatedAt ? Date.parse(item.updatedAt) : 0;
    const serverTime = existing.updatedAt ? Date.parse(existing.updatedAt) : 0;
    // Strictly newer local wins; tie or older local loses to the server copy.
    if (!Number.isNaN(localTime) && !Number.isNaN(serverTime) && localTime > serverTime) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()];
}

function syncErrorMessage(status: number, body: unknown): string {
  const code =
    body && typeof body === 'object' && 'error' in body
      ? String((body as { error?: unknown }).error ?? '')
      : '';
  if (status === 401 || code === 'sign_in_required') {
    return 'You are signed out — sign in to sync.';
  }
  if (status === 503 || code === 'auth_not_configured') {
    return 'Sync is not set up yet — the database is still being connected.';
  }
  return 'Sync did not work — check your connection and try again.';
}

async function readState(res: Response): Promise<ServerState> {
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(syncErrorMessage(res.status, body));
  const state = body as Partial<ServerState>;
  const journal = Array.isArray(state.journal) ? state.journal : [];
  const stash = Array.isArray(state.stash) ? state.stash : [];
  const chats = Array.isArray(state.chats) ? state.chats : [];
  const settings =
    state.settings && typeof state.settings === 'object' ? state.settings : null;
  const deleted = Array.isArray(state.deleted)
    ? (state.deleted as unknown[]).filter(
        (t): t is Tombstone =>
          !!t &&
          typeof t === 'object' &&
          ((t as Tombstone).kind === 'journal' ||
            (t as Tombstone).kind === 'stash' ||
            (t as Tombstone).kind === 'chat') &&
          typeof (t as Tombstone).id === 'string' &&
          typeof (t as Tombstone).deletedAt === 'string',
      )
    : [];
  const merged: ServerState = { journal, stash, chats, settings, deleted };
  saveSnapshot(merged);
  saveTombstoneCache(deleted);
  clearConfirmedDeletions(deleted);
  return merged;
}

/**
 * Upload the local journal/stash/settings, then return the merged server
 * state (the source of truth — App.tsx should replace its local lists with
 * this). Items changed since the last sync get a fresh updatedAt; unchanged
 * items keep theirs, so an older device cannot clobber a newer server row.
 * Queued deletions go up with the upload, and any local item a known
 * tombstone covers is left out — a tombstoned item is never re-uploaded.
 */
export async function uploadLocal(
  local: LocalState,
  settings: SyncSettings | null,
): Promise<ServerState> {
  const now = new Date().toISOString();
  const snapshot = loadSnapshot();
  const tombstones = loadTombstoneCache();
  const journal = stampIfChanged(
    filterTombstoned(local.journal, 'journal', tombstones),
    snapshot.journal,
    now,
  );
  const stash = stampIfChanged(
    filterTombstoned(local.stash, 'stash', tombstones),
    snapshot.stash,
    now,
  );
  const chats = stampIfChanged(
    filterTombstoned(local.chats, 'chat', tombstones),
    snapshot.chats,
    now,
  );
  const stampedSettings =
    settings === null
      ? null
      : snapshot.settings !== null &&
          snapshot.settings === contentKey(settings) &&
          settings.updatedAt !== undefined
        ? settings
        : { ...settings, updatedAt: now };
  const res = await authedFetch('/api/sync', {
    method: 'POST',
    body: JSON.stringify({
      journal,
      stash,
      chats,
      settings: stampedSettings,
      deleted: loadDeleteQueue(),
    }),
  });
  return readState(res);
}

/** Download the server state (source of truth). Throws a plain-words Error. */
export async function downloadServer(): Promise<ServerState> {
  const res = await authedFetch('/api/sync', { method: 'GET' });
  return readState(res);
}
