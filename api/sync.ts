// Stoner Bud-E — /api/sync (Vercel Node serverless function).
//
// GET returns the signed-in user's server state; POST upserts the journal,
// stash, chats, playlists, and settings the client sends and returns the
// merged server state. Authenticated only: a valid Better Auth session
// cookie is required, else 401 `sign_in_required`. Returns 503
// `auth_not_configured` until DATABASE_URL is set. Same CORS pattern as
// api/chat.ts, plus credentials.
//
// Conflict rule (server-wins): a row is only overwritten when the incoming
// updated_at is NEWER than the stored one; otherwise the stored server copy
// is kept and returned. An item with no updated_at counts as new (stored
// with the server's current time).
//
// Deletions sync as tombstones (table `deleted_items`, migration 0003 +
// chat kind): the client sends `deleted: [{kind, id, deletedAt}]`; the
// server stores the tombstone, deletes the matching row when the tombstone
// wins, and returns all tombstones so every device drops the item locally.
// Tombstone rule: a tombstone wins when its deleted_at is >= the item's
// updated_at; otherwise the newer update wins and the tombstone is dropped.
// An upload is never allowed to resurrect a tombstoned item whose deleted_at
// is >= the incoming updated_at — that is what stops a stale offline device
// from bringing a deleted item back. Deletions are NEVER inferred from rows
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
  kind: 'journal' | 'stash' | 'chat' | 'playlist';
  id: string;
  deletedAt: string;
}

interface ApiServerState {
  journal: SyncedRecord[];
  stash: SyncedRecord[];
  chats: SyncedRecord[];
  playlists: SyncedRecord[];
  settings: (Record<string, unknown> & { updatedAt: string }) | null;
  deleted: Tombstone[];
}

const MAX_JOURNAL = 500;
const MAX_STASH = 200;
const MAX_CHATS = 100;
const MAX_MESSAGES_PER_CHAT = 200;
const MAX_PLAYLISTS = 20;
const MAX_TRACKS_PER_PLAYLIST = 100;
const MAX_DELETED = 500;

// The deleted_items DDL, kept identical to migrations/0003_deleted_items.sql
// (the single source of truth). ensureDeletedItemsTable runs it as
// CREATE TABLE IF NOT EXISTS on first use: migrations are normally applied
// via the Neon SQL Editor / scripts/setup-db.mjs, but sync must not 500
// when the table is not there yet — and once the migration is applied this
// is a no-op. Never logs or returns anything sensitive.
// Kind check is expanded in ensure to allow 'chat' (migration 0004) and
// 'playlist' (music playlists).
const DELETED_ITEMS_DDL = `create table if not exists deleted_items (
  id uuid not null primary key default gen_random_uuid(),
  user_id text not null references "user" ("id") on delete cascade,
  kind text not null check (kind in ('journal', 'stash', 'chat', 'playlist')),
  item_id text not null,
  deleted_at timestamptz not null default CURRENT_TIMESTAMP,
  unique (user_id, kind, item_id)
);
create index if not exists deleted_items_user_id_idx on deleted_items (user_id)`;

// Chat conversations table, kept identical to migrations/0004_chat_conversations.sql.
const CHAT_CONVERSATIONS_DDL = `create table if not exists chat_conversations (
  user_id text not null references "user" ("id") on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default CURRENT_TIMESTAMP,
  primary key (user_id, id)
);
create index if not exists chat_conversations_user_id_idx on chat_conversations (user_id)`;

// Music playlists table (premium members). Same shape as chat_conversations:
// one JSONB doc per playlist (id, name, ordered tracks), keyed by
// (user_id, id). No migration file yet — the ensure below creates it on
// first use, same as the chat table.
const USER_PLAYLISTS_DDL = `create table if not exists user_playlists (
  user_id text not null references "user" ("id") on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default CURRENT_TIMESTAMP,
  primary key (user_id, id)
);
create index if not exists user_playlists_user_id_idx on user_playlists (user_id)`;

// Community board + shared strain reviews. Same self-applying pattern as
// the chat/playlists tables: the DDL runs as CREATE TABLE IF NOT EXISTS on
// first use, so the feature works without a manual migration.
// - community_posts: one row per board post (shared by all users).
//   report_count >= 3 hides a post from the feed (moderation safety net).
// - community_likes / community_reports: one row per (post, user) — a user
//   can like or report a post only once, so counts cannot be gamed.
// - community_comments: one row per reply on a post. comment_count on the
//   post is kept in step by the add/delete actions (same as like_count).
// - strain_reviews: one row per (user, strain) — a user rates each strain
//   once and can change it later (upsert). The community average is
//   computed on read, so there is no counter to drift.
const COMMUNITY_POSTS_DDL = `create table if not exists community_posts (
  id uuid not null primary key default gen_random_uuid(),
  user_id text not null references "user" ("id") on delete cascade,
  display_name text not null,
  body text not null,
  like_count int not null default 0,
  report_count int not null default 0,
  comment_count int not null default 0,
  created_at timestamptz not null default CURRENT_TIMESTAMP
);
create index if not exists community_posts_created_at_idx on community_posts (created_at desc)`;

const COMMUNITY_LIKES_DDL = `create table if not exists community_likes (
  post_id uuid not null references community_posts (id) on delete cascade,
  user_id text not null references "user" ("id") on delete cascade,
  created_at timestamptz not null default CURRENT_TIMESTAMP,
  primary key (post_id, user_id)
)`;

const COMMUNITY_REPORTS_DDL = `create table if not exists community_reports (
  post_id uuid not null references community_posts (id) on delete cascade,
  user_id text not null references "user" ("id") on delete cascade,
  created_at timestamptz not null default CURRENT_TIMESTAMP,
  primary key (post_id, user_id)
)`;

const COMMUNITY_COMMENTS_DDL = `create table if not exists community_comments (
  id uuid not null primary key default gen_random_uuid(),
  post_id uuid not null references community_posts (id) on delete cascade,
  user_id text not null references "user" ("id") on delete cascade,
  display_name text not null,
  body text not null,
  like_count int not null default 0,
  created_at timestamptz not null default CURRENT_TIMESTAMP
);
create index if not exists community_comments_post_id_idx on community_comments (post_id, created_at)`;

// One row per (comment, user) — a user can like a comment only once, so
// counts cannot be gamed (same as post likes).
const COMMUNITY_COMMENT_LIKES_DDL = `create table if not exists community_comment_likes (
  comment_id uuid not null references community_comments (id) on delete cascade,
  user_id text not null references "user" ("id") on delete cascade,
  created_at timestamptz not null default CURRENT_TIMESTAMP,
  primary key (comment_id, user_id)
)`;

const STRAIN_REVIEWS_DDL = `create table if not exists strain_reviews (
  user_id text not null references "user" ("id") on delete cascade,
  strain_id text not null,
  rating int not null check (rating between 1 and 5),
  review text not null default '',
  updated_at timestamptz not null default CURRENT_TIMESTAMP,
  primary key (user_id, strain_id)
);
create index if not exists strain_reviews_strain_id_idx on strain_reviews (strain_id)`;

let deletedItemsEnsured = false;
let chatTableEnsured = false;
let playlistsTableEnsured = false;
let communityTablesEnsured = false;

/** Idempotent: create the tombstone table if the migration has not landed
 *  yet. Best-effort — a failure here leaves the flag unset, and the
 *  following queries will surface the real error as sync_failed. */
async function ensureDeletedItemsTable(pool: Pool): Promise<void> {
  if (deletedItemsEnsured) return;
  try {
    await pool.query(DELETED_ITEMS_DDL);
    // Best-effort: expand the kind check for existing tables that still
    // have the old 'journal','stash' (from 0003) or 'journal','stash','chat'
    // constraint — the current check also allows 'playlist'.
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'deleted_items_kind_check'
            AND conrelid = 'deleted_items'::regclass
        ) THEN
          ALTER TABLE deleted_items DROP CONSTRAINT deleted_items_kind_check;
          ALTER TABLE deleted_items ADD CONSTRAINT deleted_items_kind_check
            CHECK (kind in ('journal', 'stash', 'chat', 'playlist'));
        END IF;
      END $$;
    `).catch(() => {});
    deletedItemsEnsured = true;
  } catch {
    // Table may already exist (concurrent create) or the DB is down; the
    // caller's queries decide what happens next — do not fail the sync here.
  }
}

async function ensureChatConversationsTable(pool: Pool): Promise<void> {
  if (chatTableEnsured) return;
  try {
    await pool.query(CHAT_CONVERSATIONS_DDL);
    chatTableEnsured = true;
  } catch {
    // Same as above — best-effort.
  }
}

async function ensurePlaylistsTable(pool: Pool): Promise<void> {
  if (playlistsTableEnsured) return;
  try {
    await pool.query(USER_PLAYLISTS_DDL);
    playlistsTableEnsured = true;
  } catch {
    // Same as above — best-effort.
  }
}

async function ensureCommunityTables(pool: Pool): Promise<void> {
  if (communityTablesEnsured) return;
  try {
    await pool.query(COMMUNITY_POSTS_DDL);
    await pool.query(COMMUNITY_LIKES_DDL);
    await pool.query(COMMUNITY_REPORTS_DDL);
    await pool.query(COMMUNITY_COMMENTS_DDL);
    await pool.query(COMMUNITY_COMMENT_LIKES_DDL);
    await pool.query(STRAIN_REVIEWS_DDL);
    // The posts table predates comment_count (added with comments) — add
    // the column to tables created before it existed. No-op when present.
    await pool.query(
      `alter table community_posts
       add column if not exists comment_count int not null default 0`,
    ).catch(() => {});
    // The comments table predates like_count (added with comment likes).
    await pool.query(
      `alter table community_comments
       add column if not exists like_count int not null default 0`,
    ).catch(() => {});
    communityTablesEnsured = true;
  } catch {
    // Same as above — best-effort.
  }
}

/** The owner (premiumTier 'owner' in user_settings) can delete any board
 *  post. Everyone else can only delete their own. */
async function isOwner(pool: Pool, userId: string): Promise<boolean> {
  try {
    const r = await pool.query<{ data: Record<string, unknown> | null }>(
      'select data from user_settings where user_id = $1',
      [userId],
    );
    return r.rows[0]?.data?.premiumTier === 'owner';
  } catch {
    return false;
  }
}

const STRAIN_IDS = new Set([
  'granddaddy-purple',
  'blue-dream',
  'sour-diesel',
  'og-kush',
  'gsc',
  'northern-lights',
  'jack-herer',
  'pineapple-express',
  'wedding-cake',
  'zkittlez',
  'durban-poison',
  'gelato',
]);

const MAX_POST_CHARS = 280;
const MAX_COMMENT_CHARS = 200;
const MAX_DISPLAY_NAME_CHARS = 30;
const MAX_REVIEW_CHARS = 200;
const MAX_POSTS_PER_HOUR = 10;
const MAX_COMMENTS_PER_HOUR = 20;
const REPORT_HIDE_THRESHOLD = 3;
const FEED_LIMIT = 50;
const COMMENTS_LIMIT = 50;

/** One community action, dispatched from the POST handler below. The body
 *  carries `action` plus that action's fields; anything malformed answers
 *  400 `bad_community_body`, a post the caller may not delete answers 403
 *  `not_yours`, and a flood of posts answers 429 `too_many_posts`. */
async function handleCommunity(
  pool: Pool,
  user: { id: string },
  body: Record<string, unknown>,
  res: Res,
): Promise<void> {
  const action = body.action;
  if (typeof action !== 'string') {
    res.status(400).json({ ok: false, error: 'bad_community_body' });
    return;
  }

  if (action === 'community_feed') {
    const owner = await isOwner(pool, user.id);
    const rows = await pool.query<{
      id: string;
      user_id: string;
      display_name: string;
      body: string;
      like_count: number;
      comment_count: number;
      created_at: string;
      mine: boolean;
      liked: boolean;
    }>(
      `select p.id, p.user_id, p.display_name, p.body, p.like_count, p.comment_count, p.created_at,
              (p.user_id = $1) as mine,
              exists (select 1 from community_likes l where l.post_id = p.id and l.user_id = $1) as liked
       from community_posts p
       where p.report_count < $2
       order by p.created_at desc
       limit $3`,
      [user.id, REPORT_HIDE_THRESHOLD, FEED_LIMIT],
    );
    res.status(200).json({
      ok: true,
      isOwner: owner,
      posts: rows.rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        displayName: r.display_name,
        body: r.body,
        likeCount: r.like_count,
        commentCount: r.comment_count,
        createdAt: r.created_at,
        mine: r.mine,
        liked: r.liked,
      })),
    });
    return;
  }

  if (action === 'community_post') {
    const displayName =
      typeof body.displayName === 'string' ? body.displayName.trim().slice(0, MAX_DISPLAY_NAME_CHARS) : '';
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    if (displayName === '' || text === '' || text.length > MAX_POST_CHARS) {
      res.status(400).json({ ok: false, error: 'bad_community_body' });
      return;
    }
    const recent = await pool.query<{ n: string }>(
      `select count(*) as n from community_posts
       where user_id = $1 and created_at > now() - interval '1 hour'`,
      [user.id],
    );
    if (Number(recent.rows[0]?.n ?? 0) >= MAX_POSTS_PER_HOUR) {
      res.status(429).json({ ok: false, error: 'too_many_posts' });
      return;
    }
    const inserted = await pool.query<{
      id: string;
      created_at: string;
    }>(
      `insert into community_posts (user_id, display_name, body)
       values ($1, $2, $3) returning id, created_at`,
      [user.id, displayName, text],
    );
    const row = inserted.rows[0];
    if (!row) {
      res.status(500).json({ ok: false, error: 'sync_failed' });
      return;
    }
    res.status(200).json({
      ok: true,
      post: {
        id: row.id,
        userId: user.id,
        displayName,
        body: text,
        likeCount: 0,
        commentCount: 0,
        createdAt: row.created_at,
        mine: true,
        liked: false,
      },
    });
    return;
  }

  if (action === 'community_like') {
    const postId = typeof body.postId === 'string' ? body.postId : '';
    if (postId === '') {
      res.status(400).json({ ok: false, error: 'bad_community_body' });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        'select 1 from community_likes where post_id = $1 and user_id = $2',
        [postId, user.id],
      );
      let liked: boolean;
      if ((existing.rowCount ?? 0) > 0) {
        await client.query(
          'delete from community_likes where post_id = $1 and user_id = $2',
          [postId, user.id],
        );
        await client.query(
          'update community_posts set like_count = greatest(like_count - 1, 0) where id = $1',
          [postId],
        );
        liked = false;
      } else {
        await client.query(
          'insert into community_likes (post_id, user_id) values ($1, $2)',
          [postId, user.id],
        );
        await client.query(
          'update community_posts set like_count = like_count + 1 where id = $1',
          [postId],
        );
        liked = true;
      }
      const count = await client.query<{ like_count: number }>(
        'select like_count from community_posts where id = $1',
        [postId],
      );
      await client.query('COMMIT');
      res.status(200).json({ ok: true, liked, likeCount: count.rows[0]?.like_count ?? 0 });
    } catch {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Already gone.
      }
      res.status(500).json({ ok: false, error: 'sync_failed' });
    } finally {
      client.release();
    }
    return;
  }

  if (action === 'community_delete') {
    const postId = typeof body.postId === 'string' ? body.postId : '';
    if (postId === '') {
      res.status(400).json({ ok: false, error: 'bad_community_body' });
      return;
    }
    const found = await pool.query<{ user_id: string }>(
      'select user_id from community_posts where id = $1',
      [postId],
    );
    const row = found.rows[0];
    if (!row) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    const owner = row.user_id !== user.id ? await isOwner(pool, user.id) : true;
    if (row.user_id !== user.id && !owner) {
      res.status(403).json({ ok: false, error: 'not_yours' });
      return;
    }
    await pool.query('delete from community_posts where id = $1', [postId]);
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'community_report') {
    const postId = typeof body.postId === 'string' ? body.postId : '';
    if (postId === '') {
      res.status(400).json({ ok: false, error: 'bad_community_body' });
      return;
    }
    const inserted = await pool.query(
      `insert into community_reports (post_id, user_id) values ($1, $2)
       on conflict (post_id, user_id) do nothing returning post_id`,
      [postId, user.id],
    );
    if ((inserted.rowCount ?? 0) > 0) {
      await pool.query(
        'update community_posts set report_count = report_count + 1 where id = $1',
        [postId],
      );
    }
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'community_comments') {
    const postId = typeof body.postId === 'string' ? body.postId : '';
    if (postId === '') {
      res.status(400).json({ ok: false, error: 'bad_community_body' });
      return;
    }
    const rows = await pool.query<{
      id: string;
      user_id: string;
      display_name: string;
      body: string;
      like_count: number;
      created_at: string;
      liked: boolean;
    }>(
      `select c.id, c.user_id, c.display_name, c.body, c.like_count, c.created_at,
              exists (select 1 from community_comment_likes l where l.comment_id = c.id and l.user_id = $2) as liked
       from community_comments c
       where c.post_id = $1
       order by c.created_at asc
       limit $3`,
      [postId, user.id, COMMENTS_LIMIT],
    );
    res.status(200).json({
      ok: true,
      comments: rows.rows.map((r) => ({
        id: r.id,
        postId,
        userId: r.user_id,
        displayName: r.display_name,
        body: r.body,
        likeCount: r.like_count,
        createdAt: r.created_at,
        mine: r.user_id === user.id,
        liked: r.liked,
      })),
    });
    return;
  }

  if (action === 'community_comment') {
    const postId = typeof body.postId === 'string' ? body.postId : '';
    const displayName =
      typeof body.displayName === 'string' ? body.displayName.trim().slice(0, MAX_DISPLAY_NAME_CHARS) : '';
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    if (postId === '' || displayName === '' || text === '' || text.length > MAX_COMMENT_CHARS) {
      res.status(400).json({ ok: false, error: 'bad_community_body' });
      return;
    }
    const post = await pool.query('select 1 from community_posts where id = $1', [postId]);
    if (post.rowCount === 0) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    const recent = await pool.query<{ n: string }>(
      `select count(*) as n from community_comments
       where user_id = $1 and created_at > now() - interval '1 hour'`,
      [user.id],
    );
    if (Number(recent.rows[0]?.n ?? 0) >= MAX_COMMENTS_PER_HOUR) {
      res.status(429).json({ ok: false, error: 'too_many_posts' });
      return;
    }
    const inserted = await pool.query<{ id: string; created_at: string }>(
      `insert into community_comments (post_id, user_id, display_name, body)
       values ($1, $2, $3, $4) returning id, created_at`,
      [postId, user.id, displayName, text],
    );
    const row = inserted.rows[0];
    if (!row) {
      res.status(500).json({ ok: false, error: 'sync_failed' });
      return;
    }
    await pool.query(
      'update community_posts set comment_count = comment_count + 1 where id = $1',
      [postId],
    );
    res.status(200).json({
      ok: true,
      comment: {
        id: row.id,
        postId,
        userId: user.id,
        displayName,
        body: text,
        likeCount: 0,
        createdAt: row.created_at,
        mine: true,
        liked: false,
      },
    });
    return;
  }

  if (action === 'community_comment_like') {
    const commentId = typeof body.commentId === 'string' ? body.commentId : '';
    if (commentId === '') {
      res.status(400).json({ ok: false, error: 'bad_community_body' });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        'select 1 from community_comment_likes where comment_id = $1 and user_id = $2',
        [commentId, user.id],
      );
      let liked: boolean;
      if ((existing.rowCount ?? 0) > 0) {
        await client.query(
          'delete from community_comment_likes where comment_id = $1 and user_id = $2',
          [commentId, user.id],
        );
        await client.query(
          'update community_comments set like_count = greatest(like_count - 1, 0) where id = $1',
          [commentId],
        );
        liked = false;
      } else {
        await client.query(
          'insert into community_comment_likes (comment_id, user_id) values ($1, $2)',
          [commentId, user.id],
        );
        await client.query(
          'update community_comments set like_count = like_count + 1 where id = $1',
          [commentId],
        );
        liked = true;
      }
      const count = await client.query<{ like_count: number }>(
        'select like_count from community_comments where id = $1',
        [commentId],
      );
      await client.query('COMMIT');
      res.status(200).json({ ok: true, liked, likeCount: count.rows[0]?.like_count ?? 0 });
    } catch {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Already gone.
      }
      res.status(500).json({ ok: false, error: 'sync_failed' });
    } finally {
      client.release();
    }
    return;
  }

  if (action === 'community_comment_delete') {
    const commentId = typeof body.commentId === 'string' ? body.commentId : '';
    if (commentId === '') {
      res.status(400).json({ ok: false, error: 'bad_community_body' });
      return;
    }
    const found = await pool.query<{ user_id: string; post_id: string }>(
      'select user_id, post_id from community_comments where id = $1',
      [commentId],
    );
    const row = found.rows[0];
    if (!row) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    const owner = row.user_id !== user.id ? await isOwner(pool, user.id) : true;
    if (row.user_id !== user.id && !owner) {
      res.status(403).json({ ok: false, error: 'not_yours' });
      return;
    }
    await pool.query('delete from community_comments where id = $1', [commentId]);
    await pool.query(
      'update community_posts set comment_count = greatest(comment_count - 1, 0) where id = $1',
      [row.post_id],
    );
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'strain_ratings') {
    const agg = await pool.query<{ strain_id: string; avg: string; count: string }>(
      `select strain_id, round(avg(rating)::numeric, 1) as avg, count(*) as count
       from strain_reviews group by strain_id`,
    );
    const mine = await pool.query<{ strain_id: string; rating: number; review: string }>(
      'select strain_id, rating, review from strain_reviews where user_id = $1',
      [user.id],
    );
    const ratings: Record<string, { avg: number; count: number }> = {};
    for (const r of agg.rows) ratings[r.strain_id] = { avg: Number(r.avg), count: Number(r.count) };
    const myReviews: Record<string, { rating: number; review: string }> = {};
    for (const r of mine.rows) myReviews[r.strain_id] = { rating: r.rating, review: r.review };
    res.status(200).json({ ok: true, ratings, myReviews });
    return;
  }

  if (action === 'strain_review') {
    const strainId = typeof body.strainId === 'string' ? body.strainId : '';
    const rating = typeof body.rating === 'number' ? body.rating : 0;
    const review =
      typeof body.review === 'string' ? body.review.trim().slice(0, MAX_REVIEW_CHARS) : '';
    if (!STRAIN_IDS.has(strainId) || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      res.status(400).json({ ok: false, error: 'bad_community_body' });
      return;
    }
    await pool.query(
      `insert into strain_reviews (user_id, strain_id, rating, review)
       values ($1, $2, $3, $4)
       on conflict (user_id, strain_id) do update
         set rating = excluded.rating, review = excluded.review, updated_at = now()`,
      [user.id, strainId, rating, review],
    );
    const agg = await pool.query<{ avg: string; count: string }>(
      `select round(avg(rating)::numeric, 1) as avg, count(*) as count
       from strain_reviews where strain_id = $1`,
      [strainId],
    );
    res.status(200).json({
      ok: true,
      strainId,
      rating: { avg: Number(agg.rows[0]?.avg ?? 0), count: Number(agg.rows[0]?.count ?? 0) },
    });
    return;
  }

  res.status(400).json({ ok: false, error: 'bad_community_body' });
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
  chats?: unknown;
  playlists?: unknown;
  settings?: unknown;
  deleted?: unknown;
  /** Community / strain-review actions (see handleCommunity). When set,
   *  the body is a community request, not a sync upload. */
  action?: unknown;
  displayName?: unknown;
  body?: unknown;
  postId?: unknown;
  commentId?: unknown;
  strainId?: unknown;
  rating?: unknown;
  review?: unknown;
}

interface IncomingTombstone {
  kind: 'journal' | 'stash' | 'chat' | 'playlist';
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

/** Validate one uploaded chat list. Returns null when malformed.
 *  Caps messages at MAX_MESSAGES_PER_CHAT (truncates, does not reject). */
function cleanChats(raw: unknown): IncomingItem[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_CHATS) return null;
  const items: IncomingItem[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) return null;
    const { updatedAt: _dropped, ...data } = entry;
    void _dropped;
    if (typeof data.id !== 'string' || data.id === '' || data.id.length > 128) return null;
    if (typeof data.title !== 'string') data.title = 'Chat';
    if (!Array.isArray(data.messages)) data.messages = [];
    const msgs = data.messages as unknown[];
    if (msgs.length > MAX_MESSAGES_PER_CHAT) {
      data.messages = msgs.slice(-MAX_MESSAGES_PER_CHAT);
    }
    items.push({ id: data.id, updatedAt: parseUpdatedAt(entry.updatedAt), data });
  }
  return items;
}

/** Validate one uploaded playlist list. Returns null when malformed.
 *  A playlist is { id, name, tracks: AudiusTrack[] }. Tracks are kept
 *  only when they carry the fields the player needs (id, title, artist,
 *  a numeric duration); a malformed track is dropped, not fatal. Caps
 *  playlists at MAX_PLAYLISTS and tracks at MAX_TRACKS_PER_PLAYLIST
 *  (truncates, does not reject). */
function cleanPlaylists(raw: unknown): IncomingItem[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_PLAYLISTS) return null;
  const items: IncomingItem[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) return null;
    const { updatedAt: _dropped, ...data } = entry;
    void _dropped;
    if (typeof data.id !== 'string' || data.id === '' || data.id.length > 128) return null;
    if (typeof data.name !== 'string' || data.name.trim() === '') data.name = 'Playlist';
    data.name = String(data.name).slice(0, 100);
    const rawTracks = Array.isArray(data.tracks) ? (data.tracks as unknown[]) : [];
    const tracks: Record<string, unknown>[] = [];
    for (const t of rawTracks) {
      if (!isRecord(t)) continue;
      if (typeof t.id !== 'string' || t.id === '') continue;
      if (typeof t.title !== 'string' || t.title === '') continue;
      if (typeof t.artist !== 'string') continue;
      if (typeof t.durationSec !== 'number' || !Number.isFinite(t.durationSec)) continue;
      tracks.push({
        id: t.id,
        title: t.title,
        artist: t.artist,
        handle: typeof t.handle === 'string' ? t.handle : '',
        durationSec: t.durationSec,
        genre: typeof t.genre === 'string' ? t.genre : '',
        artwork: typeof t.artwork === 'string' ? t.artwork : '',
        permalink: typeof t.permalink === 'string' ? t.permalink : '',
      });
      if (tracks.length >= MAX_TRACKS_PER_PLAYLIST) break;
    }
    data.tracks = tracks;
    items.push({ id: data.id, updatedAt: parseUpdatedAt(entry.updatedAt), data });
  }
  return items;
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

const THEMES = new Set(['night', 'day', 'ember', 'moon', 'forest', 'sunset', 'kartoon']);
const EXPERIENCES = new Set(['new', 'some', 'experienced']);

/** Validate an uploaded tombstone list. Returns null when malformed. */
function cleanDeleted(raw: unknown): IncomingTombstone[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_DELETED) return null;
  const tombstones: IncomingTombstone[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) return null;
    const kind = entry.kind;
    if (kind !== 'journal' && kind !== 'stash' && kind !== 'chat' && kind !== 'playlist') return null;
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
  // Premium fields are server-only and are NEVER taken from a sync
  // payload: a signed-in client could otherwise grant itself a paid tier
  // (or a custom persona/theme) just by sending it. They are set only by
  // a verified payment/webhook handler. The upsert below carries whatever
  // is already stored forward, so stripping them here cannot wipe a paid
  // tier either.
  if (isRecord(rest.personalization)) data.personalization = rest.personalization;
  if (Array.isArray(rest.savedPlans)) data.savedPlans = rest.savedPlans;
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
  const chatsRes = await client.query<Row>(
    'select id, data, updated_at from chat_conversations where user_id = $1 order by updated_at desc',
    [userId],
  );
  const playlistsRes = await client.query<Row>(
    'select id, data, updated_at from user_playlists where user_id = $1 order by updated_at desc',
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
  const chats: SyncedRecord[] = chatsRes.rows.map(
    (r) => ({ ...(r.data as object), updatedAt: toIso(r.updated_at) }) as SyncedRecord,
  );
  const playlists: SyncedRecord[] = playlistsRes.rows.map(
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
    kind: r.kind as 'journal' | 'stash' | 'chat' | 'playlist',
    id: String(r.item_id),
    deletedAt: toIso(r.deleted_at as Date | string),
  }));
  return { journal, stash, chats, playlists, settings, deleted };
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
      await ensureChatConversationsTable(pool);
      await ensurePlaylistsTable(pool);
      const state = await readState(pool, user.id);
      res.status(200).json({ ok: true, ...state });
      return;
    }

    // POST — validate first, then upsert in one transaction.
    const body = await readJsonBody<SyncBody>(req);

    // Community board + shared strain reviews live in this same function
    // (the Vercel Hobby plan caps at 12 serverless functions and this
    // project already has 12). A body with an `action` is a community
    // request, not a sync upload — route it and return.
    if (typeof body.action === 'string') {
      await ensureCommunityTables(pool);
      await handleCommunity(pool, user, body as Record<string, unknown>, res);
      return;
    }

    const journal = cleanItems(body.journal, MAX_JOURNAL);
    const stash = cleanItems(body.stash, MAX_STASH);
    const chats = cleanChats(body.chats);
    const playlists = cleanPlaylists(body.playlists);
    const settings = cleanSettings(body.settings);
    const deleted = cleanDeleted(body.deleted);
    if (journal === null || stash === null || chats === null || playlists === null || settings === null || deleted === null) {
      res.status(400).json({ ok: false, error: 'bad_sync_body' });
      return;
    }

    await ensureDeletedItemsTable(pool);
    await ensureChatConversationsTable(pool);
    await ensurePlaylistsTable(pool);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Tombstones first, so the upserts below cannot resurrect them.
      // Rule: a tombstone wins when deleted_at >= the item's updated_at;
      // otherwise the newer update wins and the tombstone is dropped.
      for (const tomb of deleted) {
        const deletedAt = tomb.deletedAt ?? new Date();
        const table =
          tomb.kind === 'journal'
            ? 'journal_entries'
            : tomb.kind === 'stash'
              ? 'stash_items'
              : tomb.kind === 'chat'
                ? 'chat_conversations'
                : 'user_playlists';
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
      for (const item of chats) {
        const updatedAt = item.updatedAt ?? new Date();
        await client.query(
          `insert into chat_conversations (user_id, id, data, updated_at)
           select $1, $2, $3, $4
           where not exists (
             select 1 from deleted_items
             where user_id = $1 and kind = 'chat' and item_id = $2
               and deleted_at >= $4
           )
           on conflict (user_id, id) do update
             set data = excluded.data, updated_at = excluded.updated_at
             where chat_conversations.updated_at < excluded.updated_at`,
          [user.id, item.id, item.data, updatedAt],
        );
      }
      for (const item of playlists) {
        const updatedAt = item.updatedAt ?? new Date();
        await client.query(
          `insert into user_playlists (user_id, id, data, updated_at)
           select $1, $2, $3, $4
           where not exists (
             select 1 from deleted_items
             where user_id = $1 and kind = 'playlist' and item_id = $2
               and deleted_at >= $4
           )
           on conflict (user_id, id) do update
             set data = excluded.data, updated_at = excluded.updated_at
             where user_playlists.updated_at < excluded.updated_at`,
          [user.id, item.id, item.data, updatedAt],
        );
      }
      if (settings !== undefined) {
        // Premium fields are server-only (see cleanSettings): carry
        // whatever is already stored forward, so a sync can neither
        // grant a paid tier nor wipe one — and the same for a custom
        // persona or theme.
        const existing = await client.query<Row>(
          'select data from user_settings where user_id = $1',
          [user.id],
        );
        const stored = existing.rows[0]?.data;
        if (stored?.premiumTier === 'lit' || stored?.premiumTier === 'cloudnine' || stored?.premiumTier === 'owner') {
          settings.data.premiumTier = stored.premiumTier;
        }
        if (stored?.customPersona === null || isRecord(stored?.customPersona)) {
          settings.data.customPersona = stored.customPersona;
        }
        if (stored?.customTheme === null || isRecord(stored?.customTheme)) {
          settings.data.customTheme = stored.customTheme;
        }
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
