// 420 Room — the deeper secret room. Needs BOTH unlocks: the J+S secret
// AND the 4+2 gesture. Same 280-char cap and 10/hour limit as the Secret
// Room. The client polls for the live feel.

import { CommunityError, communityCall, getDisplayName } from './community';
import { unlockSecretServer } from './secret-chat';

export interface FourTwentyMessage {
  id: string;
  userId: string;
  displayName: string;
  body: string;
  createdAt: string;
  mine: boolean;
}

const FOURTWENTY_UNLOCK_KEY = 'bude-fourtwenty-unlocked';

export function isFourTwentyUnlocked(): boolean {
  try {
    return localStorage.getItem(FOURTWENTY_UNLOCK_KEY) === 'yes';
  } catch {
    return false;
  }
}

export function markFourTwentyUnlocked(): void {
  try {
    localStorage.setItem(FOURTWENTY_UNLOCK_KEY, 'yes');
  } catch {
    // Storage blocked — the room just will not stick for this visit.
  }
}

// Tell the server this user figured out the 4+2 secret. The server
// enforces both unlocks — the feed and posting both require them.
export async function unlockFourTwentyServer(): Promise<void> {
  try {
    await communityCall('fourtwenty_unlock');
  } catch {
    // Best-effort — the next open retries the server unlock.
  }
}

function isMessage(value: unknown): value is FourTwentyMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string' &&
    typeof (value as { body?: unknown }).body === 'string' &&
    typeof (value as { displayName?: unknown }).displayName === 'string' &&
    typeof (value as { createdAt?: unknown }).createdAt === 'string'
  );
}

// If the server says a room is locked, the unlock was missed. Record both
// unlocks and try once more, so a missed unlock self-heals instead of
// leaving Send dead. Only a lock rejection is retried — it means the post
// was refused, never stored, so retrying cannot double-post.
async function fourtwentyCall(action: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  try {
    return await communityCall(action, extra);
  } catch (e) {
    const code = e instanceof CommunityError ? e.code : '';
    if (code !== 'secret_locked' && code !== 'fourtwenty_locked') throw e;
    await unlockSecretServer();
    await unlockFourTwentyServer();
    return await communityCall(action, extra);
  }
}

export async function fetchFourTwentyFeed(): Promise<FourTwentyMessage[]> {
  const body = await fourtwentyCall('fourtwenty_feed');
  const raw = (body as { messages?: unknown }).messages;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isMessage).reverse();
}

export async function postFourTwentyMessage(text: string): Promise<FourTwentyMessage> {
  const displayName = getDisplayName('Buddy');
  const body = await fourtwentyCall('fourtwenty_post', { displayName, body: text.trim() });
  const message = (body as { message?: unknown }).message;
  if (!isMessage(message)) throw new Error('bad_fourtwenty_message');
  return message;
}
