// Stoner Bud-E — Community board. One shared wall for every Bud-E user:
// short posts (high thoughts, strain shout-outs, munchie ideas), a leaf to
// like, a flag to report, and delete for your own posts (or any post if you
// are the owner). Sign-in required — the board is tied to accounts, not
// anonymous, so the owner can moderate. Posts show a display name the user
// picks, never an email address.
import { useCallback, useEffect, useState } from 'react';
import { PageHead } from './bits';
import {
  CommunityError,
  MAX_POST_CHARS,
  deleteCommunityPost,
  fetchCommunityFeed,
  getDisplayName,
  postToCommunity,
  reportCommunityPost,
  setDisplayName,
  toggleCommunityLike,
} from './lib/community';
import type { CommunityPost } from './lib/community';
import type { AuthUser } from './lib/auth-client';

function timeAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms) || ms < 0) return 'just now';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Community({ user }: { user: AuthUser | null }) {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(() => getDisplayName(user?.name ?? 'Bud-E friend'));
  const [nameSaved, setNameSaved] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const feed = await fetchCommunityFeed();
      setPosts(feed.posts);
      setIsOwner(feed.isOwner);
    } catch (e) {
      setError(
        e instanceof CommunityError
          ? e.message
          : 'The board did not load — check your connection and try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post() {
    const text = draft.trim();
    if (text === '' || posting || !user) return;
    setPosting(true);
    setError(null);
    try {
      const created = await postToCommunity(name.trim() || 'Bud-E friend', text);
      setPosts((prev) => [created, ...prev]);
      setDraft('');
    } catch (e) {
      setError(
        e instanceof CommunityError
          ? e.message
          : 'That did not post — try again.',
      );
    } finally {
      setPosting(false);
    }
  }

  async function like(post: CommunityPost) {
    try {
      const result = await toggleCommunityLike(post.id);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id ? { ...p, liked: result.liked, likeCount: result.likeCount } : p,
        ),
      );
    } catch {
      // A failed like is quiet — the count just stays where it was.
    }
  }

  async function report(post: CommunityPost) {
    if (reported.has(post.id)) return;
    try {
      await reportCommunityPost(post.id);
      setReported((prev) => new Set(prev).add(post.id));
    } catch {
      // Reporting is best-effort — the post stays up.
    }
  }

  async function remove(post: CommunityPost) {
    if (confirmDelete !== post.id) {
      setConfirmDelete(post.id);
      return;
    }
    setConfirmDelete(null);
    try {
      await deleteCommunityPost(post.id);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } catch (e) {
      setError(
        e instanceof CommunityError
          ? e.message
          : 'That did not delete — try again.',
      );
    }
  }

  function saveName() {
    const trimmed = name.trim().slice(0, 30);
    setName(trimmed === '' ? 'Bud-E friend' : trimmed);
    setDisplayName(trimmed === '' ? 'Bud-E friend' : trimmed);
    setNameSaved(true);
    window.setTimeout(() => setNameSaved(false), 2000);
  }

  if (!user) {
    return (
      <div>
        <PageHead title="Community" sub="One board, every Bud-E user." />
        <section className="card">
          <p style={{ fontWeight: 700 }}>Sign in to join the board.</p>
          <p className="muted">
            The community is tied to accounts, so posts have a name on them and the owner can
            keep it friendly. Sign in from the You tab, then come back here.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div>
      <PageHead title="Community" sub="One board, every Bud-E user. Be kind — it is shared." />
      <section className="card" aria-label="Posting as">
        <label className="small" htmlFor="community-name" style={{ display: 'block', marginBottom: 4 }}>
          Posting as
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="community-name"
            value={name}
            maxLength={30}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bud-E friend"
            style={{ flex: 1, minWidth: 0 }}
          />
          <button className="btn" onClick={saveName}>
            Save
          </button>
        </div>
        {nameSaved && <p className="small muted" style={{ margin: '6px 0 0' }}>Saved — that is your name on the board.</p>}
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          This is what other users see. It is never your email address.
        </p>
      </section>

      <section className="card" aria-label="Write a post">
        <label className="small" htmlFor="community-draft" style={{ display: 'block', marginBottom: 4 }}>
          Share something
        </label>
        <textarea
          id="community-draft"
          value={draft}
          maxLength={MAX_POST_CHARS}
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="A high thought, a strain shout-out, a munchie idea…"
          style={{ width: '100%', resize: 'vertical' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span className="small muted">
            {draft.length}/{MAX_POST_CHARS}
          </span>
          <button className="btn" onClick={post} disabled={draft.trim() === '' || posting}>
            {posting ? 'Posting…' : 'Post it'}
          </button>
        </div>
      </section>

      {error && (
        <p className="result-box" role="alert">
          {error}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button className="btn" onClick={() => void load()} disabled={loading}>
          🔄 Refresh
        </button>
      </div>

      {loading ? (
        <p className="muted">Loading the board…</p>
      ) : posts.length === 0 ? (
        <section className="card">
          <p style={{ fontWeight: 700 }}>Nothing here yet.</p>
          <p className="muted">Be the first to post — say hi to the garden. 🌿</p>
        </section>
      ) : (
        posts.map((post) => (
          <article key={post.id} className="card" aria-label={`Post by ${post.displayName}`}>
            <p style={{ margin: '0 0 4px' }}>
              <strong>{post.displayName}</strong>{' '}
              <span className="muted small">· {timeAgo(post.createdAt)}</span>
              {post.mine && <span className="muted small"> · you</span>}
            </p>
            <p style={{ margin: '0 0 10px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {post.body}
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className="btn"
                onClick={() => void like(post)}
                aria-label={post.liked ? 'Unlike this post' : 'Like this post'}
                style={post.liked ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
              >
                🍃 {post.likeCount}
              </button>
              <button
                className="btn"
                onClick={() => void report(post)}
                disabled={reported.has(post.id)}
                aria-label="Report this post"
              >
                {reported.has(post.id) ? '✓ Reported' : '🚩 Report'}
              </button>
              {(post.mine || isOwner) && (
                <button
                  className="btn"
                  onClick={() => void remove(post)}
                  aria-label="Delete this post"
                >
                  {confirmDelete === post.id ? 'Sure? Tap again' : '🗑️ Delete'}
                </button>
              )}
            </div>
          </article>
        ))
      )}
    </div>
  );
}
