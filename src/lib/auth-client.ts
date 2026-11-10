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
  if (/current password/i.test(message)) {
    return 'That current password did not match — check it and try again.';
  }
  if (/reset password isn't enabled|not set up/i.test(message)) {
    return 'Password-reset emails are not set up yet — ask the app owner to switch them on.';
  }
  if (/verification email isn't enabled/i.test(message)) {
    return 'That change needs email set up — ask the app owner to switch it on.';
  }
  if (/email is the same/i.test(message)) {
    return 'That is already your email — nothing to change.';
  }
  if (/invalid token|expired/i.test(message)) {
    return 'That reset link is expired or already used — ask for a new one.';
  }
  return message !== '' ? message : fallback;
}

/** Where a reset link lands: the live site root, with ?token= on it. The
 *  app reads the token on load and shows the new-password form. Always the
 *  https site, never the Capacitor origin — the link is clicked in an
 *  email app, so it opens in the browser. */
export const RESET_ORIGIN = 'https://stoner-bud-e.vercel.app';

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
 * Change the signed-in user's password. Needs the current password, and
 * signs their other devices out. Throws a plain-words Error on failure.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const { error } = await authClient.changePassword({
    currentPassword,
    newPassword,
    revokeOtherSessions: true,
  });
  if (error) {
    throw new Error(friendlyError(error, 'Could not change your password — try again.'));
  }
}

/**
 * Change the signed-in user's email. It changes straight away — accounts
 * never verify email, so there is no confirmation link. Returns the user
 * with the new email. Throws a plain-words Error on failure.
 */
export async function changeEmail(newEmail: string): Promise<AuthUser> {
  const { error } = await authClient.changeEmail({
    newEmail: newEmail.trim(),
    callbackURL: RESET_ORIGIN,
  });
  if (error) {
    throw new Error(friendlyError(error, 'Could not change your email — try again.'));
  }
  // The endpoint answers only { status: true } — re-read the session for
  // the user with the new email.
  const next = await getSession();
  if (!next) {
    throw new Error('Could not change your email — try again.');
  }
  return next;
}

/**
 * Ask for a password-reset email. The reply is always the same whether
 * the email has an account or not, so it never leaks who is signed up.
 * Throws a plain-words Error only when the mailer itself is not set up.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await authClient.requestPasswordReset({
    email: email.trim(),
    redirectTo: `${RESET_ORIGIN}/`,
  });
  if (error) {
    throw new Error(friendlyError(error, 'Could not send that reset email — try again.'));
  }
}

/**
 * Set a new password with a reset token from the email link. The token
 * works once and expires after an hour. Throws a plain-words Error when
 * it is expired or already used.
 */
export async function resetPassword(newPassword: string, token: string): Promise<void> {
  const { error } = await authClient.resetPassword({ newPassword, token });
  if (error) {
    throw new Error(friendlyError(error, 'Could not reset your password — ask for a new link.'));
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
