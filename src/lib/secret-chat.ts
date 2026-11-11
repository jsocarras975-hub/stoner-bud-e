// Secret live chat room — the hidden room only users who figured out the
// J + S gesture (hold both for 3 seconds on the Bud-E keyboard) ever see.
// Once unlocked it stays in their app (localStorage flag). Same 280-char
// cap and 10/hour limit as board posts. The client polls for the live feel.

import { CommunityError, communityCall, getDisplayName } from './community';

export interface SecretMessage {
  id: string;
  userId: string;
  displayName: string;
  body: string;
  createdAt: string;
  mine: boolean;
}

const SECRET_UNLOCK_KEY = 'bude-secret-unlocked';

export function isSecretUnlocked(): boolean {
  try {
    return localStorage.getItem(SECRET_UNLOCK_KEY) === 'yes';
  } catch {
    return false;
  }
}

export function markSecretUnlocked(): void {
  try {
    localStorage.setItem(SECRET_UNLOCK_KEY, 'yes');
  } catch {
    // Storage blocked — the room just will not stick for this visit.
  }
}

// Tell the server this user figured out the secret, so the room is served
// to them from then on. The server enforces the secret — the feed and
// posting both require this unlock.
export async function unlockSecretServer(): Promise<void> {
  try {
    await communityCall('secret_unlock');
  } catch {
    // Best-effort — the room still opens from the local flag, and the next
    // open retries the server unlock.
  }
}

function isMessage(value: unknown): value is SecretMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string' &&
    typeof (value as { body?: unknown }).body === 'string' &&
    typeof (value as { displayName?: unknown }).displayName === 'string' &&
    typeof (value as { createdAt?: unknown }).createdAt === 'string'
  );
}

// If the server says the room is locked, the unlock was missed (an old
// build, or the unlock call failed). Record the unlock and try once more,
// so a missed unlock self-heals instead of leaving Send dead. Only the
// secret_locked rejection is retried — it means the post was refused, never
// stored, so retrying cannot double-post.
async function secretCall(action: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  try {
    return await communityCall(action, extra);
  } catch (e) {
    const code =
      e instanceof CommunityError ? e.code : '';
    if (code !== 'secret_locked') throw e;
    await unlockSecretServer();
    return await communityCall(action, extra);
  }
}

export async function fetchSecretFeed(): Promise<SecretMessage[]> {
  const body = await secretCall('secret_feed');
  const raw = (body as { messages?: unknown }).messages;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isMessage).reverse();
}

export async function postSecretMessage(text: string): Promise<SecretMessage> {
  const displayName = getDisplayName('Buddy');
  const body = await secretCall('secret_post', { displayName, body: text.trim() });
  const message = (body as { message?: unknown }).message;
  if (!isMessage(message)) throw new Error('bad_secret_message');
  return message;
}
