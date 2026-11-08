// Stoner Bud-E — GET /api/auth/get-session (explicit route, same handler as
// the [...auth].ts catch-all). Forwards to Better Auth — src/lib/auth-server.ts.
import { handleAuthRequest } from '../../src/lib/auth-server.ts';
import type { ReqLike, ResLike } from '../../src/lib/cors.ts';

type Req = ReqLike & { on?: unknown };
type Res = ResLike;

export default async function handler(req: Req, res: Res): Promise<void> {
  await handleAuthRequest(req, res);
}
