// Stoner Bud-E — community board + shared strain reviews (client half).
//
// Talks to /api/sync with an `action` field (the community endpoints live
// in that same function — the Vercel Hobby plan caps at 12 serverless
// functions and this project already has 12). Authenticated only: a valid
// Better Auth session cookie is required, else the server answers 401
// `sign_in_required` and these helpers throw CommunityError('sign_in').
//
// Display name: what a post shows. The user picks it in the Community
// screen; it lives in localStorage ('bude-display-name') and is sent with
// each post. Default is the account name, else 'Bud-E friend'. It is never
// the email address.

import { authedFetch } from './auth-client.ts';

export interface CommunityPost {
  id: string;
  userId: string;
  displayName: string;
  body: string;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  mine: boolean;
  liked: boolean;
}

export interface CommunityComment {
  id: string;
  postId: string;
  userId: string;
  displayName: string;
  body: string;
  likeCount: number;
  createdAt: string;
  mine: boolean;
  liked: boolean;
}

export interface StrainRating {
  avg: number;
  count: number;
}

export interface MyStrainReview {
  rating: number;
  review: string;
}

export class CommunityError extends Error {
  code:
    | 'sign_in'
    | 'too_many_posts'
    | 'not_yours'
    | 'network'
    | 'invalid_code'
    | 'already_used'
    | 'already_premium'
    | 'not_owner'
    | 'other';
  constructor(code: CommunityError['code'], message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

const DISPLAY_NAME_KEY = 'bude-display-name';
export const MAX_POST_CHARS = 280;
export const MAX_COMMENT_CHARS = 200;
export const MAX_REVIEW_CHARS = 200;

export function getDisplayName(fallback: string): string {
  try {
    const raw = localStorage.getItem(DISPLAY_NAME_KEY);
    if (raw && raw.trim() !== '') return raw.trim().slice(0, 30);
  } catch {
    // Storage blocked — fall through to the default.
  }
  return fallback;
}

export function setDisplayName(name: string): void {
  try {
    localStorage.setItem(DISPLAY_NAME_KEY, name.trim().slice(0, 30));
  } catch {
    // Storage blocked — the name just will not stick.
  }
}

function communityError(status: number, body: unknown): CommunityError {
  const code =
    body && typeof body === 'object' && 'error' in body
      ? String((body as { error?: unknown }).error ?? '')
      : '';
  if (status === 401 || code === 'sign_in_required') {
    return new CommunityError('sign_in', 'Sign in to join the community.');
  }
  if (status === 429 || code === 'too_many_posts') {
    return new CommunityError('too_many_posts', 'Easy — take a breather before posting again.');
  }
  if (status === 403 || code === 'not_yours') {
    return new CommunityError('not_yours', 'That post is not yours to delete.');
  }
  if (code === 'invalid_code') {
    return new CommunityError('invalid_code', 'That code does not exist — check it and try again.');
  }
  if (code === 'already_used') {
    return new CommunityError('already_used', 'That code was already used.');
  }
  if (code === 'already_premium') {
    return new CommunityError('already_premium', 'You already have that tier or better — the code stays good for someone else.');
  }
  if (code === 'not_owner') {
    return new CommunityError('not_owner', 'Only the owner can do that.');
  }
  return new CommunityError('other', 'That did not go through — try again.');
}

export async function communityCall(action: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await authedFetch('/api/sync', {
      method: 'POST',
      body: JSON.stringify({ action, ...extra }),
    });
  } catch {
    throw new CommunityError('network', 'Check your connection and try again.');
  }
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw communityError(res.status, body);
  return body as Record<string, unknown>;
}

function isPost(value: unknown): value is CommunityPost {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as CommunityPost).id === 'string' &&
    typeof (value as CommunityPost).displayName === 'string' &&
    typeof (value as CommunityPost).body === 'string' &&
    typeof (value as CommunityPost).likeCount === 'number' &&
    typeof (value as CommunityPost).commentCount === 'number' &&
    typeof (value as CommunityPost).createdAt === 'string'
  );
}

function isComment(value: unknown): value is CommunityComment {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as CommunityComment).id === 'string' &&
    typeof (value as CommunityComment).postId === 'string' &&
    typeof (value as CommunityComment).displayName === 'string' &&
    typeof (value as CommunityComment).body === 'string' &&
    typeof (value as CommunityComment).likeCount === 'number' &&
    typeof (value as CommunityComment).createdAt === 'string'
  );
}

/** The board: the latest posts (newest first), plus whether you are the owner. */
export async function fetchCommunityFeed(): Promise<{ posts: CommunityPost[]; isOwner: boolean }> {
  const body = await communityCall('community_feed');
  const posts = Array.isArray(body.posts)
    ? (body.posts as unknown[]).filter(isPost)
    : [];
  return { posts, isOwner: body.isOwner === true };
}

/** Post to the board. Returns the new post (with its server id + time). */
export async function postToCommunity(displayName: string, text: string): Promise<CommunityPost> {
  const body = await communityCall('community_post', { displayName, body: text });
  if (!isPost(body.post)) throw new CommunityError('other', 'That did not go through — try again.');
  return body.post;
}

/** Tap the leaf: like a post, or unlike it if you already did. */
export async function toggleCommunityLike(postId: string): Promise<{ liked: boolean; likeCount: number }> {
  const body = await communityCall('community_like', { postId });
  return {
    liked: body.liked === true,
    likeCount: typeof body.likeCount === 'number' ? body.likeCount : 0,
  };
}

/** Delete a post — yours, or any post if you are the owner. */
export async function deleteCommunityPost(postId: string): Promise<void> {
  await communityCall('community_delete', { postId });
}

/** Flag a post for the owner. One report per person per post. */
export async function reportCommunityPost(postId: string): Promise<void> {
  await communityCall('community_report', { postId });
}

/** The replies on one post, oldest first (so a conversation reads top to bottom). */
export async function fetchComments(postId: string): Promise<CommunityComment[]> {
  const body = await communityCall('community_comments', { postId });
  return Array.isArray(body.comments)
    ? (body.comments as unknown[]).filter(isComment)
    : [];
}

/** Reply to a post. Returns the new comment (with its server id + time). */
export async function addComment(
  postId: string,
  displayName: string,
  text: string,
): Promise<CommunityComment> {
  const body = await communityCall('community_comment', { postId, displayName, body: text });
  if (!isComment(body.comment)) throw new CommunityError('other', 'That did not post — try again.');
  return body.comment;
}

/** Delete a comment — yours, or any comment if you are the owner. */
export async function deleteComment(commentId: string): Promise<void> {
  await communityCall('community_comment_delete', { commentId });
}

/** Tap the leaf on a comment: like it, or unlike it if you already did. */
export async function toggleCommentLike(commentId: string): Promise<{ liked: boolean; likeCount: number }> {
  const body = await communityCall('community_comment_like', { commentId });
  return {
    liked: body.liked === true,
    likeCount: typeof body.likeCount === 'number' ? body.likeCount : 0,
  };
}

/** Community averages per strain + your own reviews. */
export async function fetchStrainRatings(): Promise<{
  ratings: Record<string, StrainRating>;
  myReviews: Record<string, MyStrainReview>;
}> {
  const body = await communityCall('strain_ratings');
  const ratings: Record<string, StrainRating> = {};
  if (body.ratings && typeof body.ratings === 'object') {
    for (const [key, value] of Object.entries(body.ratings as Record<string, unknown>)) {
      if (value && typeof value === 'object') {
        const v = value as { avg?: unknown; count?: unknown };
        if (typeof v.avg === 'number' && typeof v.count === 'number') {
          ratings[key] = { avg: v.avg, count: v.count };
        }
      }
    }
  }
  const myReviews: Record<string, MyStrainReview> = {};
  if (body.myReviews && typeof body.myReviews === 'object') {
    for (const [key, value] of Object.entries(body.myReviews as Record<string, unknown>)) {
      if (value && typeof value === 'object') {
        const v = value as { rating?: unknown; review?: unknown };
        if (typeof v.rating === 'number') {
          myReviews[key] = { rating: v.rating, review: typeof v.review === 'string' ? v.review : '' };
        }
      }
    }
  }
  return { ratings, myReviews };
}

/** Rate a strain (1–5 stars) with an optional short note. One review per
 *  person per strain — calling it again updates your review. Returns the
 *  strain's fresh community average + count. */
export async function submitStrainReview(
  strainId: string,
  rating: number,
  review: string,
): Promise<StrainRating> {
  const body = await communityCall('strain_review', { strainId, rating, review });
  const r = body.rating as { avg?: unknown; count?: unknown } | undefined;
  return {
    avg: typeof r?.avg === 'number' ? r.avg : 0,
    count: typeof r?.count === 'number' ? r.count : 0,
  };
}

/** Redeem a premium code (BUDE-XXXX-XXXX) to unlock Lit or Cloud Nine.
 *  Throws CommunityError('invalid_code' | 'already_used' |
 *  'already_premium' | 'sign_in' | 'network'). The server never downgrades
 *  a tier, and a code that cannot apply stays unburned. */
export async function redeemPremiumCode(code: string): Promise<{ tier: string }> {
  const body = await communityCall('premium_redeem', { code });
  const tier = typeof body.tier === 'string' ? body.tier : '';
  if (tier !== 'lit' && tier !== 'cloudnine') {
    throw new CommunityError('other', 'That did not go through — try again.');
  }
  return { tier };
}

/** Owner only: mint redeem codes to sell (tier + how many, max 50). */
export async function generatePremiumCodes(
  tier: 'lit' | 'cloudnine',
  count: number,
): Promise<{ tier: string; codes: string[] }> {
  const body = await communityCall('premium_codes_create', { tier, count });
  const codes = Array.isArray(body.codes)
    ? (body.codes as unknown[]).filter((c): c is string => typeof c === 'string')
    : [];
  return { tier: typeof body.tier === 'string' ? body.tier : tier, codes };
}
