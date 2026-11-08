// Stoner Bud-E — DELETE /api/account/delete (Vercel Node serverless function).
//
// Deletes the signed-in user's account and EVERYTHING stored under it:
// user, session, account, journal_entries, stash_items, user_settings,
// deleted_items, and verification rows for their email. One transaction —
// either everything goes or nothing does. The client then clears the
// device's local copy (journal, stash, chat, sync state) and signs out.
//
// Authenticated only: a valid Better Auth session cookie is required, else
// 401 `sign_in_required`. Returns 503 `auth_not_configured` until
// DATABASE_URL is set. Same CORS pattern as api/sync.ts, plus credentials.
// Never logs or returns anything sensitive.

import { getPool, getSessionUser } from '../../src/lib/auth-server.ts';
import { isPreflight, setCorsHeaders } from '../../src/lib/cors.ts';
import type { ReqLike, ResLike } from '../../src/lib/cors.ts';

type Req = ReqLike & { on?: unknown };
type Res = ResLike & { headersSent?: boolean };

export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    res.setHeader('Content-Type', 'application/json');
    setCorsHeaders(req, res, 'POST, OPTIONS');
    if (isPreflight(req)) {
      res.status(200).json({ ok: true });
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'method_not_allowed' });
      return;
    }

    let user: { id: string; email: string } | null;
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
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // App tables first (explicit deletes — belt-and-braces on top of the
      // ON DELETE CASCADE foreign keys in migrations 0002/0003).
      await client.query('delete from deleted_items where user_id = $1', [user.id]);
      await client.query('delete from journal_entries where user_id = $1', [user.id]);
      await client.query('delete from stash_items where user_id = $1', [user.id]);
      await client.query('delete from user_settings where user_id = $1', [user.id]);
      // Auth tables: session + account cascade off the user row, but delete
      // them explicitly so nothing lingers if a cascade ever changes.
      await client.query('delete from "session" where "userId" = $1', [user.id]);
      await client.query('delete from "account" where "userId" = $1', [user.id]);
      // Verification rows are keyed by email, not user id.
      await client.query('delete from "verification" where "identifier" = $1', [user.email]);
      // If the user row is already gone (double-tap, or a parallel delete),
      // this deletes nothing and the answer is still success: there is
      // nothing left to delete.
      await client.query('delete from "user" where "id" = $1', [user.id]);
      await client.query('COMMIT');
      res.status(200).json({ ok: true });
    } catch {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Already gone — nothing left to roll back.
      }
      res.status(500).json({ ok: false, error: 'delete_failed' });
    } finally {
      client.release();
    }
  } catch {
    if (!res.headersSent) {
      try {
        res.status(500).json({ ok: false, error: 'delete_failed' });
      } catch {
        // Response already sent — nothing left to do.
      }
    }
  }
}
