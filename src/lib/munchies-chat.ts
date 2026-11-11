// Munchies Room — a live chat just for sharing snack ideas. Opened by
// holding M + U together for 3 seconds on the Bud-E keyboard. Once found
// it stays in the app. Same 280-char cap and 10/hour limit as the Secret
// Room. The client polls for the live feel.

import { CommunityError, communityCall, getDisplayName } from './community';

export interface MunchiesMessage {
  id: string;
  userId: string;
  displayName: string;
  body: string;
  createdAt: string;
  mine: boolean;
}

const MUNCHIES_UNLOCK_KEY = 'bude-munchies-unlocked';

export function isMunchiesUnlocked(): boolean {
  try {
    return localStorage.getItem(MUNCHIES_UNLOCK_KEY) === 'yes';
  } catch {
    return false;
  }
}

export function markMunchiesUnlocked(): void {
  try {
    localStorage.setItem(MUNCHIES_UNLOCK_KEY, 'yes');
  } catch {
    // Storage blocked — the room just will not stick for this visit.
  }
}

// Tell the server this user figured out the M+U secret. The server
// enforces the unlock — the feed and posting both require it.
export async function unlockMunchiesServer(): Promise<void> {
  try {
    await communityCall('munchies_unlock');
  } catch {
    // Best-effort — the next open retries the server unlock.
  }
}

function isMessage(value: unknown): value is MunchiesMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string' &&
    typeof (value as { body?: unknown }).body === 'string' &&
    typeof (value as { displayName?: unknown }).displayName === 'string' &&
    typeof (value as { createdAt?: unknown }).createdAt === 'string'
  );
}

// If the server says the room is locked, the unlock was missed. Record the
// unlock and try once more, so a missed unlock self-heals instead of
// leaving Send dead. Only a lock rejection is retried — it means the post
// was refused, never stored, so retrying cannot double-post.
async function munchiesCall(action: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  try {
    return await communityCall(action, extra);
  } catch (e) {
    const code = e instanceof CommunityError ? e.code : '';
    if (code !== 'munchies_locked') throw e;
    await unlockMunchiesServer();
    return await communityCall(action, extra);
  }
}

export async function fetchMunchiesFeed(): Promise<MunchiesMessage[]> {
  const body = await munchiesCall('munchies_feed');
  const raw = (body as { messages?: unknown }).messages;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isMessage).reverse();
}

export async function postMunchiesMessage(text: string): Promise<MunchiesMessage> {
  const displayName = getDisplayName('Buddy');
  const body = await munchiesCall('munchies_post', { displayName, body: text.trim() });
  const message = (body as { message?: unknown }).message;
  if (!isMessage(message)) throw new Error('bad_munchies_message');
  return message;
}
