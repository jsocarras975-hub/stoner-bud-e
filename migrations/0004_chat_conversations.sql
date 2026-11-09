-- Stoner Bud-E — chat conversations (0004).
--
-- One row per saved chat for a signed-in user. Mirrors journal/stash:
-- id is the client-generated conversation id, data holds { title, messages },
-- updated_at for conflict resolution (server only overwrites when incoming
-- is strictly newer). Deletions use the existing deleted_items table with
-- kind = 'chat'.
--
-- Caps (enforced in api/sync.ts): max 100 conversations per account,
-- max 200 messages per conversation (stored inside data).

create table if not exists chat_conversations (
  user_id text not null references "user" ("id") on delete cascade,
  id text not null,
  -- { title: string, messages: ChatMessage[] } — ChatMessage from src/bude.ts
  data jsonb not null,
  updated_at timestamptz not null default CURRENT_TIMESTAMP,
  primary key (user_id, id)
);

create index if not exists chat_conversations_user_id_idx on chat_conversations (user_id);
