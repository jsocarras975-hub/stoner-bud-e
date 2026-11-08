# Stoner Bud-E — sign-in + sync integration guide

Everything below is built and typechecked. This file is the wiring guide for
`src/App.tsx` (which the auth work deliberately did not touch). Copy the
snippets in order; nothing else in the app needs to change.

## What already exists (do not rebuild)

| Piece | File | Notes |
|---|---|---|
| Auth server | `src/lib/auth-server.ts` | Better Auth, email + password, `pg` Pool (`max: 1`), `SameSite=None` + `Secure` cookies so the Capacitor APK sends the session cookie cross-origin. Server-only — **never import from App.tsx or any tab**. |
| Auth routes | `api/auth.ts`, `api/auth/[...auth].ts` | Catch-all for `/api/auth/*` (sign-up, sign-in, sign-out, get-session). CORS mirrors `api/chat.ts` plus `Allow-Credentials`. Returns `503 auth_not_configured` until `DATABASE_URL` is set. |
| Sync API | `api/sync.ts` | `GET /api/sync` returns the user's server state; `POST /api/sync` upserts `{ journal, stash, settings }` and returns the merged server state. `401 sign_in_required` when signed out. |
| Auth client | `src/lib/auth-client.ts` | `getSession()`, `signUp()`, `signIn()`, `signOut()`, `authedFetch()`, `useSession`. Same-origin on web, absolute live origin under Capacitor — same logic as `apiUrl()` in App.tsx. |
| Sync client | `src/lib/sync.ts` | `mergeLocalWithServer()`, `uploadLocal()`, `downloadServer()`. See "How sync works" below. |
| Account tab | `src/AuthTab.tsx` | Self-contained sign-in / sign-up screen. Props: `{ user, onAuthChange, onSyncNow?, syncMessage? }`. |
| Migrations | `migrations/0001_auth.sql` (Better Auth tables), `migrations/0002_bude_sync.sql` (journal / stash / settings) | Apply with `npm run db:setup` (reads `DATABASE_URL` from the environment, prints only `applied`). |
| Shared CORS | `src/lib/cors.ts` | Allow-list used by both API routes. |

**Prerequisite before this goes live:** `DATABASE_URL` is not set yet.
Create the Neon project, set `DATABASE_URL` in Vercel (Production + Preview),
run `DATABASE_URL=... npm run db:setup` once, then redeploy. `BETTER_AUTH_SECRET`
and `BETTER_AUTH_URL` are already set in Vercel — do not touch them.
Until then every auth/sync call answers `503 auth_not_configured` and the app
keeps working logged-out exactly as before.

**Never synced:** the chat transcript (`bude-transcript-v1`) stays on the
device only, by design. Nothing in this guide uploads it.

## How sync works (the contract both sides follow)

- Every synced item carries `updatedAt`. The server only overwrites a row
  when the incoming `updatedAt` is **newer** than the stored one — otherwise
  the server copy wins and is returned. A row with no `updatedAt` counts as new.
- `uploadLocal()` stamps changed items for you: it keeps a snapshot of the
  last server state in localStorage (`bude-sync-snapshot-v1`) and gives a
  fresh `updatedAt` to any item whose content differs from the snapshot (or
  is brand new). App.tsx does **not** have to stamp edits itself.
- After a successful upload or download, **the server state is the source of
  truth**: replace the local lists with what the server returned.
- localStorage stays the offline cache. Offline edits sync on the next upload
  (sign-in, "Sync now", or the debounced change effect below).
- **Deletions sync as tombstones** (table `deleted_items`, migration 0003).
  When the user deletes a journal entry or stash item, App.tsx calls
  `queueDeletion()` — the delete is stored in localStorage
  (`bude-deleted-queue-v1`) and sent on the next sync, signed in or not
  (queued while signed out, sent on the first sync after sign-in). The
  server stores the tombstone, deletes the matching row when the tombstone
  wins, and returns all tombstones so every device drops the item. Rule: a
  tombstone wins when `deleted_at >= updated_at`; otherwise the newer update
  wins and the tombstone is dropped. An upload never resurrects a tombstoned
  item. Do NOT "fix" deletes by deleting server rows missing from an upload
  — a new device's empty first upload would wipe the account.

## Step 1 — imports

Add to the import block in `src/App.tsx` (after the existing `stash` import):

```tsx
import AuthTab from './AuthTab';
import { downloadServer, uploadLocal } from './lib/sync';
import type { SyncSettings } from './lib/sync';
import { getSession } from './lib/auth-client';
import type { AuthUser } from './lib/auth-client';
```

## Step 2 — Account tab + user state

Extend the `Tab` union:

```tsx
type Tab = 'tonight' | 'chat' | 'tools' | 'plan' | 'strains' | 'journal' | 'stash' | 'break' | 'dose' | 'settings' | 'account';
```

Add state next to the other `useState` lines (after `const [stash, ...]`):

```tsx
const [user, setUser] = useState<AuthUser | null>(null);
const [syncMessage, setSyncMessage] = useState('');
// Guards the debounced sync effect while a server state is being applied,
// so applying a download does not immediately trigger an upload of itself.
const applyingServerState = useRef(false);
const userRef = useRef<AuthUser | null>(null);
userRef.current = user;
```

## Step 3 — session check on load

Add after the online/offline `useEffect`:

```tsx
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
```

## Step 4 — build / apply the settings object

Add these two helpers inside `App()` (near `deductFromStash`). The break
lives in localStorage under `bude-break-v1` and is owned by `BreakTab` —
App.tsx only reads/writes that key at sync time, it does not hold break state.

```tsx
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
```

Note: `BreakTab` reads its break from localStorage only when the tab mounts,
so a synced break appears the next time the Break tab is opened — that is
expected, not a bug.

## Step 5 — sync on sign-in, "Sync now", and sign-out

Add after `applyServerState`:

```tsx
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
```

`uploadLocal` uses the `journal` / `stash` values from the render where it is
called. If the linter complains about stale closures, call it from the
effect/handler with the state values in scope (as above) — do not read
localStorage directly here; App.tsx state is the source for journal/stash.

## Step 6 — debounced sync while signed in

Add after the other save effects (`useEffect(() => save(...))`):

```tsx
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
}, [journal, stash, session, vibe, theme, user, isOnline]);
```

## Step 7 — render the Account tab

Add the button to the `<nav className="tabs">` block, after Settings:

```tsx
<button className={tab === 'account' ? 'tab active' : 'tab'} onClick={() => setTab('account')}>
  👤 Account
</button>
```

Add the render block after the settings line:

```tsx
{tab === 'account' && (
  <AuthTab
    user={user}
    onAuthChange={handleAuthChange}
    onSyncNow={() => void syncNow('manual')}
    syncMessage={syncMessage}
  />
)}
```

## Step 8 — nothing else changes

- Logged-out mode is byte-for-byte the old behavior: localStorage only, no
  prompts, no forced login. The age gate, chat, and all tabs are untouched.
- The PWA already treats `/api/*` as `NetworkOnly` (`vite.config.ts`), so
  auth/sync calls are never served from the offline cache. No config change.
- Do not import `src/lib/auth-server.ts` from client code — it pulls in `pg`.
  App.tsx only needs `auth-client`, `sync`, and `AuthTab`.

## Verify after wiring (needs DATABASE_URL + `npm run db:setup` first)

1. `npm run build` passes; open the app, Account tab shows "Sign in".
2. Create an account (email + password, 8+ chars) → the tab shows the email
   and "Sync now". Add a journal entry, tap "Sync now" → "Synced just now".
3. Sign out, sign in again → the journal entry is still there (it came back
   from the server, not just localStorage — confirm by clearing site data
   first on a second browser/device if you can).
4. Same on the Android APK: sign in, sync, and confirm it sticks. The
   session cookie is `SameSite=None` + `Secure`, and the client sends
   `credentials: 'include'` — if the APK signs in but sync answers `401`,
   the WebView is dropping the cookie and that needs a device-side look.
5. Negative checks: signed out, `GET /api/sync` → `401 { ok: false,
   error: 'sign_in_required' }`. Before `DATABASE_URL` lands, any auth/sync
   call → `503 { ok: false, error: 'auth_not_configured' }`.

## Routes (for reference)

| Route | Method | Auth | Body / returns |
|---|---|---|---|
| `/api/auth/sign-up/email` | POST | — | `{ email, password, name }` → Better Auth session (cookie) |
| `/api/auth/sign-in/email` | POST | — | `{ email, password }` → session (cookie) |
| `/api/auth/sign-out` | POST | session | clears the session cookie |
| `/api/auth/get-session` | GET | session | `{ user, session }` or `null` |
| `/api/sync` | GET | session | `{ ok, journal, stash, settings }` |
| `/api/sync` | POST | session | `{ journal, stash, settings }` → merged `{ ok, journal, stash, settings }` |
