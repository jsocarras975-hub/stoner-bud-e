// Stoner Bud-E — /api/auth (bare path; sub-paths live in api/auth/[...auth].ts).
// Hands the request to Better Auth (sign-up, sign-in, sign-out, get-session).
// See src/lib/auth-server.ts handleAuthRequest for the CORS + fetch-handler
// plumbing. Returns 503 `auth_not_configured` until DATABASE_URL is set.

import { handleAuthRequest } from '../src/lib/auth-server.ts';
import type { ReqLike, ResLike } from '../src/lib/cors.ts';

type Req = ReqLike & { on?: unknown };
type Res = ResLike;

export default async function handler(req: Req, res: Res): Promise<void> {
  await handleAuthRequest(req, res);
}
