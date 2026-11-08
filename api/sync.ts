// Stoner Bud-E — /api/sync (Vercel Node serverless function).
//
// GET returns the signed-in user's server state; POST upserts the journal,
// stash, and settings the client sends and returns the merged server state.
// Authenticated only: a valid Better Auth session cookie is required, else
// 401 `sign_in_required`. Returns 503 `auth_not_configured` until
// DATABASE_URL is set. Same CORS pattern as api/chat.ts, plus credentials.
//
// Conflict rule (server-wins): a row is only overwritten when the incoming
// updated_at is NEWER than the stored one; otherwise the stored server copy
// is kept and returned. An item with no updated_at counts as new (stored
// with the server's current time). Chat is never synced — the transcript
// stays on the device only.
//
// Deletions sync as tombstones (table `deleted_items`, migration 0003): the
// client sends `deleted: [{kind, id, deletedAt}]`; the server stores the
// tombstone, deletes the matching row when the tombstone wins, and returns
// all tombstones so every device drops the item locally. Tombstone rule: a
// tombstone wins when its deleted_at is >= the item's updated_at; otherwise
// the newer update wins and the tombstone is dropped. An upload is never
// allowed to resurrect a tombstoned item whose deleted_at is >= the
// incoming updated_at — that is what stops a stale offline device from
// bringing a deleted item back. Deletions are NEVER inferred from rows
// missing in an upload: a new device's empty first upload must not wipe
// the account (see INTEGRATION.md).

import { getPool, getSessionUser } from '../src/lib/auth-server.ts';
import { isPreflight, readJsonBody, setCorsHeaders } from '../src/lib/cors.ts';
import type { ReqLike, ResLike } from '../src/lib/cors.ts';
import { isPersonaId } from '../src/voice.ts';
import type { Pool, PoolClient } from 'pg';

// NOTE: the wire types below deliberately mirror src/lib/sync.ts (the client
// half of this contract) instead of importing it. Importing it would pull
// src/journal.ts and src/lib/auth-client.ts into the node tsconfig, whose
// lib has no DOM — so `window` / `import.meta.env` in the client-only files
// would fail typecheck. The JSON shape is identical on both sides; keep them
// in step if either changes.
type SyncedRecord = Record<string, unknown> & { updatedAt: string };

interface Tombstone {
  kind: 'journal' | 'stash';
  id: string;
  deletedAt: string;
}

interface ApiServerState {
  journal: SyncedRecord[];
  stash: SyncedRecord[];
  settings: (Record<string, unknown> & { updatedAt: string }) | null;
  deleted: Tombstone[];
}

const MAX_JOURNAL = 500;
const MAX_STASH = 200;
const MAX_DELETED = 500;

// The deleted_items DDL, kept identical to migrations/0003_deleted_items.sql
// (the single source of truth). ensureDeletedItemsTable runs it as
// CREATE TABLE IF NOT EXISTS on first use: migrations are normally applied
// via the Neon SQL Editor / scripts/setup-db.mjs, but sync must not 500
// when the table is not there yet — and once the migration is applied this
// is a no-op. Never logs or returns anything sensitive.
const DELETED_ITEMS_DDL = `create table if not exists deleted_items (
  id uuid not null primary key default gen_random_uuid(),
  user_id text not null references "user" ("id") on delete cascade,
  kind text not null check (kind in ('journal', 'stash')),
  item_id text not null,
  deleted_at timestamptz not null default CURRENT_TIMESTAMP,
  unique (user_id, kind, item_id)
);
create index if not exists deleted_items_user_id_idx on deleted_items (user_id)`;

let deletedItemsEnsured = false;

/** Idempotent: create the tombstone table if the migration has not landed
 *  yet. Best-effort — a failure here leaves the flag unset, and the
 *  following queries will surface the real error as sync_failed. */
async function ensureDeletedItemsTable(pool: Pool): Promise<void> {
  if (deletedItemsEnsured) return;
  try {
    await pool.query(DELETED_ITEMS_DDL);
    deletedItemsEnsured = true;
  } catch {
    // Table may already exist (concurrent create) or the DB is down; the
    // caller's queries decide what happens next — do not fail the sync here.
  }
}

type Req = ReqLike & { on?: unknown };
type Res = ResLike & { headersSent?: boolean };

interface IncomingItem {
  id: string;
  updatedAt: Date | null;
  data: Record<string, unknown>;
}

interface SyncBody {
  journal?: unknown;
  stash?: unknown;
  settings?: unknown;
  deleted?: unknown;
}

interface IncomingTombstone {
  kind: 'journal' | 'stash';
  id: string;
  deletedAt: Date | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseUpdatedAt(value: unknown): Date | null {
  if (typeof value !== 'string' || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Validate one uploaded list. Returns null when the list is malformed. */
function cleanItems(raw: unknown, limit: number): IncomingItem[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > limit) return null;
  const items: IncomingItem[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) return null;
    const { updatedAt: _dropped, ...data } = entry;
    void _dropped;
    if (typeof data.id !== 'string' || data.id === '' || data.id.length > 128) return null;
    items.push({ id: data.id, updatedAt: parseUpdatedAt(entry.updatedAt), data });
  }
  return items;
}

const THEMES = new Set(['night', 'day', 'ember', 'moon']);
const EXPERIENCES = new Set(['new', 'some', 'experienced']);

/** Validate an uploaded tombstone list. Returns null when malformed. */
function cleanDeleted(raw: unknown): IncomingTombstone[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_DELETED) return null;
  const tombstones: IncomingTombstone[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) return null;
    const kind = entry.kind;
    if (kind !== 'journal' && kind !== 'stash') return null;
    if (typeof entry.id !== 'string' || entry.id === '' || entry.id.length > 128) return null;
    tombstones.push({ kind, id: entry.id, deletedAt: parseUpdatedAt(entry.deletedAt) });
  }
  return tombstones;
}

/** Validate settings: only known keys are kept, everything else is dropped.
 *  Returns undefined when nothing was sent (skip the upsert), null when the
 *  value is malformed (the caller answers 400). */
function cleanSettings(
  raw: unknown,
): { data: Record<string, unknown>; updatedAt: Date | null } | undefined | null {
  if (raw === undefined || raw === null) return undefined;
  if (!isRecord(raw)) return null;
  const { updatedAt: _dropped, ...rest } = raw;
  void _dropped;
  const data: Record<string, unknown> = {};
  if (typeof rest.theme === 'string' && THEMES.has(rest.theme)) data.theme = rest.theme;
  if (typeof rest.experience === 'string' && EXPERIENCES.has(rest.experience)) {
    data.experience = rest.experience;
  }
  if (isRecord(rest.session)) data.session = rest.session;
  if (isRecord(rest.vibe)) data.vibe = rest.vibe;
  if (rest.break === null || isRecord(rest.break)) data.break = rest.break;
  if (isRecord(rest.voice)) {
    const v = rest.voice;
    if (
      isPersonaId(v.persona) &&
      typeof v.voiceReplies === 'boolean' &&
      typeof v.autoPlay === 'boolean'
    ) {
      data.voice = { persona: v.persona, voiceReplies: v.voiceReplies, autoPlay: v.autoPlay };
    }
  }
  return { data, updatedAt: parseUpdatedAt(raw.updatedAt) };
}

interface Row {
  // Index signature so Row satisfies pg's QueryResultRow constraint.
  [key: string]: unknown;
  id?: string;
  data: Record<string, unknown>;
  updated_at: Date | string;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function readState(client: Pool | PoolClient, userId: string): Promise<ApiServerState> {
  const journalRes = await client.query<Row>(
    'select id, data, updated_at from journal_entries where user_id = $1 order by updated_at desc',
    [userId],
  );
  const stashRes = await client.query<Row>(
    'select id, data, updated_at from stash_items where user_id = $1 order by updated_at desc',
    [userId],
  );
  const settingsRes = await client.query<Row>(
    'select data, updated_at from user_settings where user_id = $1',
    [userId],
  );
  const deletedRes = await client.query<Row>(
    'select kind, item_id, deleted_at from deleted_items where user_id = $1 order by deleted_at asc',
    [userId],
  );
  const journal: SyncedRecord[] = journalRes.rows.map(
    (r) => ({ ...(r.data as object), updatedAt: toIso(r.updated_at) }) as SyncedRecord,
  );
  const stash: SyncedRecord[] = stashRes.rows.map(
    (r) => ({ ...(r.data as object), updatedAt: toIso(r.updated_at) }) as SyncedRecord,
  );
  const settingsRow = settingsRes.rows[0];
  const settings: ApiServerState['settings'] = settingsRow
    ? ({
        ...(settingsRow.data as object),
        updatedAt: toIso(settingsRow.updated_at),
      } as ApiServerState['settings'])
    : null;
  const deleted: Tombstone[] = deletedRes.rows.map((r) => ({
    kind: r.kind as 'journal' | 'stash',
    id: String(r.item_id),
    deletedAt: toIso(r.deleted_at as Date | string),
  }));
  return { journal, stash, settings, deleted };
}

export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    res.setHeader('Content-Type', 'application/json');
    setCorsHeaders(req, res, 'GET, POST, OPTIONS');
    if (isPreflight(req)) {
      res.status(200).json({ ok: true });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'method_not_allowed' });
      return;
    }

    let user: { id: string } | null;
    try {
      user = await getSessionUser(req);
    } catch {
      res.status(503).json({ ok: false, error: 'auth_not_configured' });
      return;
    }
    if (!user) {
      res.status(401).json({ ok: false, error: 'sign_in_required' });
      return;
    }

    const pool = getPool();
    if (req.method === 'GET') {
      await ensureDeletedItemsTable(pool);
      const state = await readState(pool, user.id);
  res.status(200).json({ ok: true, ...state });
      return;
    }

    // POST — validate first, then upsert in one transaction.
    const body = await readJsonBody<SyncBody>(req);
    const journal = cleanItems(body.journal, MAX_JOURNAL);
    const stash = cleanItems(body.stash, MAX_STASH);
    const settings = cleanSettings(body.settings);
    const deleted = cleanDeleted(body.deleted);
    if (journal === null || stash === null || settings === null || deleted === null) {
      res.status(400).json({ ok: false, error: 'bad_sync_body' });
      return;
    }

    await ensureDeletedItemsTable(pool);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Tombstones first, so the upserts below cannot resurrect them.
      // Rule: a tombstone wins when deleted_at >= the item's updated_at;
      // otherwise the newer update wins and the tombstone is dropped.
      for (const tomb of deleted) {
        const deletedAt = tomb.deletedAt ?? new Date();
        const table = tomb.kind === 'journal' ? 'journal_entries' : 'stash_items';
        // Keep the FIRST delete time when the tombstone already exists.
        await client.query(
          `insert into deleted_items (user_id, kind, item_id, deleted_at)
           values ($1, $2, $3, $4)
           on conflict (user_id, kind, item_id) do nothing`,
          [user.id, tomb.kind, tomb.id, deletedAt],
        );
        // Tombstone wins: drop the row when it is not newer than the delete.
        await client.query(
          `delete from ${table} where user_id = $1 and id = $2 and updated_at <= $3`,
          [user.id, tomb.id, deletedAt],
        );
        // Newer update wins: the row survived, so the tombstone is stale.
        await client.query(
          `delete from deleted_items
           where user_id = $1 and kind = $2 and item_id = $3
             and exists (
               select 1 from ${table}
               where user_id = $1 and id = $3 and updated_at > $4
             )`,
          [user.id, tomb.kind, tomb.id, deletedAt],
        );
      }
      for (const item of journal) {
        const updatedAt = item.updatedAt ?? new Date();
        // Server-wins: only overwrite when the incoming copy is strictly newer.
        // The tombstone guard stops a stale offline device re-uploading an
        // item another device already deleted (deleted_at >= updated_at).
        await client.query(
          `insert into journal_entries (user_id, id, data, updated_at)
           select $1, $2, $3, $4
           where not exists (
             select 1 from deleted_items
             where user_id = $1 and kind = 'journal' and item_id = $2
               and deleted_at >= $4
           )
           on conflict (user_id, id) do update
             set data = excluded.data, updated_at = excluded.updated_at
             where journal_entries.updated_at < excluded.updated_at`,
          [user.id, item.id, item.data, updatedAt],
        );
      }
      for (const item of stash) {
        const updatedAt = item.updatedAt ?? new Date();
        await client.query(
          `insert into stash_items (user_id, id, data, updated_at)
           select $1, $2, $3, $4
           where not exists (
             select 1 from deleted_items
             where user_id = $1 and kind = 'stash' and item_id = $2
               and deleted_at >= $4
           )
           on conflict (user_id, id) do update
             set data = excluded.data, updated_at = excluded.updated_at
             where stash_items.updated_at < excluded.updated_at`,
          [user.id, item.id, item.data, updatedAt],
        );
      }
      if (settings !== undefined) {
        await client.query(
          `insert into user_settings (user_id, data, updated_at)
           values ($1, $2, $3)
           on conflict (user_id) do update
             set data = excluded.data, updated_at = excluded.updated_at
             where user_settings.updated_at < excluded.updated_at`,
          [user.id, settings.data, settings.updatedAt ?? new Date()],
        );
      }
      const state = await readState(client, user.id);
      await client.query('COMMIT');
      res.status(200).json({ ok: true, ...state });
    } catch {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Already gone — nothing left to roll back.
      }
      res.status(500).json({ ok: false, error: 'sync_failed' });
    } finally {
      client.release();
    }
  } catch {
    if (!res.headersSent) {
      try {
        res.status(500).json({ ok: false, error: 'sync_failed' });
      } catch {
        // Response already sent — nothing left to do.
      }
    }
  }
}
