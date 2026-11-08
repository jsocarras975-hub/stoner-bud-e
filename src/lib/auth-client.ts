// Stoner Bud-E — Better Auth client (browser side).
//
// Talks to this app's own Better Auth at /api/auth. Same-origin on the web;
// under Capacitor the app runs from capacitor://localhost with no server, so
// it points at the live Vercel origin instead — the same apiUrl() logic as
// App.tsx. Every request sends cookies (credentials: 'include'): the session
// cookie is SameSite=None + Secure server-side so the APK's WebView sends it
// cross-origin (see src/lib/auth-server.ts).
//
// Chat is NOT part of sign-in: the transcript stays on this device only.

import { createAuthClient } from 'better-auth/react';

export const LIVE_ORIGIN = 'https://stoner-bud-e-toonzkorner-9149s-projects.vercel.app';

/** Base origin for API calls: '' = same-origin (plain web), live origin under Capacitor. */
export function apiBase(): string {
  // import.meta.env exists under Vite; the optional chain keeps this module
  // importable outside Vite (tests, SSR) where it is undefined.
  const envUrl = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_API_URL;
  if (typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.replace(/\/$/, '');
  }
  const isCapacitor =
    typeof window !== 'undefined' &&
    (window as unknown as { Capacitor?: unknown }).Capacitor !== undefined;
  if (isCapacitor) return LIVE_ORIGIN;
  return '';
}

export const authClient = createAuthClient({
  baseURL: apiBase() === '' ? undefined : apiBase(),
  fetchOptions: { credentials: 'include' },
});

/** Re-exported so App.tsx can use the reactive session hook if it wants it. */
export const useSession = authClient.useSession;

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
}

type ClientUser = {
  id: string;
  name: string;
  email: string;
  emailVerified?: boolean | null;
};

function mapUser(user: ClientUser): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified ?? false,
  };
}

function friendlyError(
  error: { message?: string | null } | null | undefined,
  fallback: string,
): string {
  const message = error?.message ?? '';
  if (/already exists/i.test(message)) {
    return 'That email already has an account — try signing in instead.';
  }
  if (/password.*(short|8|least)|at least 8/i.test(message)) {
    return 'Use a password with at least 8 characters.';
  }
  if (/invalid email/i.test(message)) {
    return 'That email does not look right — check it and try again.';
  }
  if (/invalid (email or )?password|incorrect|user not found/i.test(message)) {
    return 'That email or password did not match. Check both and try again.';
  }
  return message !== '' ? message : fallback;
}

/** Current signed-in user, or null when signed out. Never throws. */
export async function getSession(): Promise<AuthUser | null> {
  try {
    const { data } = await authClient.getSession();
    return data?.user ? mapUser(data.user as ClientUser) : null;
  } catch {
    return null;
  }
}

/** Create an account with email + password. Throws a plain-words Error on failure. */
export async function signUp(email: string, password: string, name: string): Promise<AuthUser> {
  const { data, error } = await authClient.signUp.email({
    email: email.trim(),
    password,
    name: name.trim() === '' ? email.trim() : name.trim(),
  });
  if (error) {
    throw new Error(friendlyError(error, 'Could not create that account — try again.'));
  }
  if (!data?.user) {
    throw new Error('Could not create that account — try again.');
  }
  return mapUser(data.user as ClientUser);
}

/** Sign in with email + password. Throws a plain-words Error on failure. */
export async function signIn(email: string, password: string): Promise<AuthUser> {
  const { data, error } = await authClient.signIn.email({
    email: email.trim(),
    password,
  });
  if (error) {
    throw new Error(friendlyError(error, 'Could not sign in — try again.'));
  }
  if (!data?.user) {
    throw new Error('Could not sign in — try again.');
  }
  return mapUser(data.user as ClientUser);
}

/** Sign out. Throws a plain-words Error when the server does not confirm. */
export async function signOut(): Promise<void> {
  const { error } = await authClient.signOut();
  if (error) {
    throw new Error(friendlyError(error, 'Could not sign out — try again.'));
  }
}

/**
 * Delete the signed-in account and everything stored under it, server-side
 * (POST /api/account/delete). Throws a plain-words Error on failure. The
 * caller clears the device's local copy afterwards — this only talks to
 * the server.
 */
export async function deleteAccount(): Promise<void> {
  let res: Response;
  try {
    res = await authedFetch('/api/account/delete', { method: 'POST' });
  } catch {
    throw new Error('Could not reach Bud-E right now — check your connection and try again.');
  }
  if (res.ok) return;
  if (res.status === 401) {
    throw new Error('You are not signed in — sign in first, then delete your account.');
  }
  if (res.status === 503) {
    throw new Error('Account deletion is not available right now — try again in a bit.');
  }
  throw new Error('Could not delete the account — try again.');
}

/**
 * fetch() for this app's own API that always sends the session cookie and
 * defaults to JSON. `path` is like '/api/sync'. Under Capacitor it uses the
 * absolute live origin; on the web it is relative (same-origin).
 */
export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has('Content-Type') && init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${apiBase()}${path}`, { ...init, headers, credentials: 'include' });
}
