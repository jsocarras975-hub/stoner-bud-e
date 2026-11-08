// Stoner Bud-E — /api/auth/* catch-all (sign-up/email, sign-in/email,
// sign-out, get-session, ...). Vercel routes every sub-path under /api/auth
// to this file; the bare /api/auth path is handled by api/auth.ts.
// Hands the request to Better Auth — see src/lib/auth-server.ts
// handleAuthRequest for the CORS + fetch-handler plumbing. Returns 503
// `auth_not_configured` until DATABASE_URL is set.

import { handleAuthRequest } from '../../src/lib/auth-server.ts';
import type { ReqLike, ResLike } from '../../src/lib/cors.ts';

type Req = ReqLike & { on?: unknown };
type Res = ResLike;

export default async function handler(req: Req, res: Res): Promise<void> {
  await handleAuthRequest(req, res);
}
