// Stoner Bud-E — GET /api/auth/callback/twitter (explicit route).
// The X OAuth callback: X redirects the user here after they approve the
// sign-in. See api/auth/sign-in/email.ts: the [...auth].ts catch-all does not
// route two-segment auth paths on this project, so the callback needs an
// explicit file. Forwards to Better Auth — src/lib/auth-server.ts.
import { handleAuthRequest } from '../../../src/lib/auth-server.ts';
import type { ReqLike, ResLike } from '../../../src/lib/cors.ts';

type Req = ReqLike & { on?: unknown };
type Res = ResLike;

export default async function handler(req: Req, res: Res): Promise<void> {
  await handleAuthRequest(req, res);
}
