-- Stoner Bud-E — music playlists (0005).
--
-- One row per premium member's playlist. Mirrors chat_conversations:
-- id is the client-generated playlist id, data holds
-- { id, name, tracks: AudiusTrack[] }, updated_at for conflict resolution
-- (server only overwrites when incoming is strictly newer). Deletions use
-- the existing deleted_items table with kind = 'playlist'.
--
-- Caps (enforced in api/sync.ts): max 20 playlists per account,
-- max 100 tracks per playlist (stored inside data).
--
-- The deleted_items kind check also gains 'playlist' (see
-- api/sync.ts ensureDeletedItemsTable, which expands the check on
-- existing tables). This DDL is the single source of truth for the
-- playlist table; api/sync.ts self-applies it on first use, so a
-- manual run is belt-and-braces.

create table if not exists user_playlists (
  user_id text not null references "user" ("id") on delete cascade,
  id text not null,
  -- { id, name, tracks: AudiusTrack[] } — AudiusTrack from src/lib/audius.ts
  data jsonb not null,
  updated_at timestamptz not null default CURRENT_TIMESTAMP,
  primary key (user_id, id)
);

create index if not exists user_playlists_user_id_idx on user_playlists (user_id);
