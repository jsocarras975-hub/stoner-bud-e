-- Stoner Bud-E — delete tombstones (0003).
--
-- A row here means "this user deleted this journal entry / stash item".
-- Deletions sync as tombstones (see api/sync.ts): the client queues a
-- deletion in localStorage and sends it on the next sync; the server stores
-- the tombstone, deletes the matching row, and returns all tombstones so
-- every device drops the item locally. Never re-upload a tombstoned item.
--
-- Conflict rule (same on both sides): a tombstone wins when its deleted_at
-- is >= the item's updated_at; otherwise the newer update wins and the
-- tombstone is dropped. Tombstones are never pruned by the app — a device
-- offline for a long time must still learn about the delete when it returns.
-- Settings are key-values with nothing to delete, so they have no tombstones.
--
-- Primary key is (user_id, kind, item_id): one tombstone per deleted item
-- per user. `id` is a surrogate for convenience only.

create table if not exists deleted_items (
  id uuid not null primary key default gen_random_uuid(),
  user_id text not null references "user" ("id") on delete cascade,
  kind text not null check (kind in ('journal', 'stash')),
  item_id text not null,
  deleted_at timestamptz not null default CURRENT_TIMESTAMP,
  unique (user_id, kind, item_id)
);

create index if not exists deleted_items_user_id_idx on deleted_items (user_id);
