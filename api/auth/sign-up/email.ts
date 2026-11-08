// Stoner Bud-E — POST /api/auth/sign-up/email (explicit route).
// The [...auth].ts catch-all only matches one path segment on this Vite
// project, so the two-segment Better Auth email routes need explicit files.
// Forwards to Better Auth — see src/lib/auth-server.ts handleAuthRequest.
import { handleAuthRequest } from '../../../src/lib/auth-server.ts';
import type { ReqLike, ResLike } from '../../../src/lib/cors.ts';

type Req = ReqLike & { on?: unknown };
type Res = ResLike;

export default async function handler(req: Req, res: Res): Promise<void> {
  await handleAuthRequest(req, res);
}
