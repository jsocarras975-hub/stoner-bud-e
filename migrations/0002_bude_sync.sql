-- Stoner Bud-E — synced user data (0002).
--
-- Rows for a signed-in user's journal, stash, and settings, so they follow
-- the user across devices. Everything is keyed by the Better Auth user id
-- ("user"."id", TEXT). The chat transcript (bude-transcript-v1) is NEVER
-- stored here — it stays on the device only.
--
-- Shape: each row keeps the whole client object in `data` (jsonb) plus a
-- server `updated_at` used for conflict resolution (see api/sync.ts):
-- on upload, a row is only overwritten when the incoming updated_at is
-- newer than the stored one — otherwise the server copy wins. Keeping the
-- client object whole means new fields sync without a schema change.
--
-- Primary keys are composite (user_id, id): entry ids only need to be unique
-- per user (the client generates them), and an upsert can never touch
-- another user's row.

create table if not exists journal_entries (
  user_id text not null references "user" ("id") on delete cascade,
  id text not null,
  -- One src/journal.ts JournalEntry as JSON, e.g.
  -- {"id","date","method","strain","amount","unit","rating","note","change"}.
  data jsonb not null,
  updated_at timestamptz not null default CURRENT_TIMESTAMP,
  primary key (user_id, id)
);

create table if not exists stash_items (
  user_id text not null references "user" ("id") on delete cascade,
  id text not null,
  -- One src/stash.ts StashItem as JSON, e.g.
  -- {"id","name","form","amount","unit","thcPct","lowAt"}.
  data jsonb not null,
  updated_at timestamptz not null default CURRENT_TIMESTAMP,
  primary key (user_id, id)
);

create table if not exists user_settings (
  user_id text not null primary key references "user" ("id") on delete cascade,
  -- One src/lib/sync.ts SyncSettings as JSON, e.g.
  -- {"theme","experience","session","vibe","break"} — theme is a ThemeId
  -- (night/day/ember/moon), session is a src/bude.ts Session, vibe is
  -- {setting,sound,snack,energy}, break is a tolerance-break record
  -- {startDate,lengthDays,checkins,status} or null when no break is running.
  data jsonb not null,
  updated_at timestamptz not null default CURRENT_TIMESTAMP
);

create index if not exists journal_entries_user_id_idx on journal_entries (user_id);
create index if not exists stash_items_user_id_idx on stash_items (user_id);
