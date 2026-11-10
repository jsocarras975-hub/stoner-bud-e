// Stoner Bud-E — Group Sesh board. One shared wall for every Bud-E user:
// short posts (high thoughts, strain shout-outs, munchie ideas), a leaf to
// like, a flag to report, and delete for your own posts (or any post if you
// are the owner). Sign-in required — the board is tied to accounts, not
// anonymous, so the owner can moderate. Posts show a display name the user
// picks, never an email address.
import { useCallback, useEffect, useState } from 'react';
import { PageHead } from './bits';
import {
  CommunityError,
  MAX_COMMENT_CHARS,
  MAX_POST_CHARS,
  addComment,
  deleteComment,
  deleteCommunityPost,
  fetchComments,
  fetchCommunityFeed,
  getDisplayName,
  postToCommunity,
  reportCommunityPost,
  setDisplayName,
  toggleCommentLike,
  toggleCommunityLike,
} from './lib/community';
import type { CommunityComment, CommunityPost } from './lib/community';
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
        <PageHead title="Group Sesh" sub="One board, every Bud-E user." />
        <section className="card">
          <p style={{ fontWeight: 700 }}>Sign in to join the Group Sesh.</p>
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
      <PageHead title="Group Sesh" sub="One board, every Bud-E user. Be kind — it is shared." />
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
          <PostCard
            key={post.id}
            post={post}
            isOwner={isOwner}
            displayName={name.trim() || 'Bud-E friend'}
            onLike={() => void like(post)}
            onReport={() => void report(post)}
            reported={reported.has(post.id)}
            onDelete={() => void remove(post)}
            confirmDelete={confirmDelete === post.id}
            onCommentCountChange={(delta) =>
              setPosts((prev) =>
                prev.map((p) =>
                  p.id === post.id
                    ? { ...p, commentCount: Math.max(0, p.commentCount + delta) }
                    : p,
                ),
              )
            }
          />
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One post + its comment thread. The thread loads only when opened, so the
// feed stays light. Replies read oldest-first, like a conversation.
// ---------------------------------------------------------------------------

function PostCard({
  post,
  isOwner,
  displayName,
  onLike,
  onReport,
  reported,
  onDelete,
  confirmDelete,
  onCommentCountChange,
}: {
  post: CommunityPost;
  isOwner: boolean;
  displayName: string;
  onLike: () => void;
  onReport: () => void;
  reported: boolean;
  onDelete: () => void;
  confirmDelete: boolean;
  onCommentCountChange: (delta: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<CommunityComment[] | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCommentDelete, setConfirmCommentDelete] = useState<string | null>(null);

  async function toggleOpen() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (comments !== null) return;
    setLoadingComments(true);
    try {
      setComments(await fetchComments(post.id));
    } catch {
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  }

  async function reply() {
    const text = draft.trim();
    if (text === '' || posting) return;
    setPosting(true);
    setError(null);
    try {
      const created = await addComment(post.id, displayName, text);
      setComments((prev) => [...(prev ?? []), created]);
      setDraft('');
      onCommentCountChange(1);
    } catch (e) {
      setError(
        e instanceof CommunityError ? e.message : 'That did not post — try again.',
      );
    } finally {
      setPosting(false);
    }
  }

  async function removeComment(comment: CommunityComment) {
    if (confirmCommentDelete !== comment.id) {
      setConfirmCommentDelete(comment.id);
      return;
    }
    setConfirmCommentDelete(null);
    try {
      await deleteComment(comment.id);
      setComments((prev) => (prev ?? []).filter((c) => c.id !== comment.id));
      onCommentCountChange(-1);
    } catch {
      // A failed delete is quiet — the comment stays.
    }
  }

  async function likeComment(comment: CommunityComment) {
    try {
      const result = await toggleCommentLike(comment.id);
      setComments((prev) =>
        (prev ?? []).map((c) =>
          c.id === comment.id ? { ...c, liked: result.liked, likeCount: result.likeCount } : c,
        ),
      );
    } catch {
      // A failed like is quiet — the count just stays where it was.
    }
  }

  return (
    <article className="card" aria-label={`Post by ${post.displayName}`}>
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
          onClick={onLike}
          aria-label={post.liked ? 'Unlike this post' : 'Like this post'}
          style={post.liked ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
        >
          🍃 {post.likeCount}
        </button>
        <button className="btn" onClick={() => void toggleOpen()} aria-label="Show comments">
          💬 {post.commentCount}
        </button>
        <button
          className="btn"
          onClick={onReport}
          disabled={reported}
          aria-label="Report this post"
        >
          {reported ? '✓ Reported' : '🚩 Report'}
        </button>
        {(post.mine || isOwner) && (
          <button className="btn" onClick={onDelete} aria-label="Delete this post">
            {confirmDelete ? 'Sure? Tap again' : '🗑️ Delete'}
          </button>
        )}
      </div>
      {open && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          {loadingComments ? (
            <p className="muted small">Loading replies…</p>
          ) : (comments ?? []).length === 0 ? (
            <p className="muted small">No replies yet — start the thread.</p>
          ) : (
            (comments ?? []).map((comment) => (
              <div key={comment.id} style={{ marginBottom: 10 }}>
                <p style={{ margin: '0 0 2px' }}>
                  <strong>{comment.displayName}</strong>{' '}
                  <span className="muted small">· {timeAgo(comment.createdAt)}</span>
                  {comment.mine && <span className="muted small"> · you</span>}
                </p>
                <p style={{ margin: '0 0 4px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {comment.body}
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    className="btn"
                    onClick={() => void likeComment(comment)}
                    aria-label={comment.liked ? 'Unlike this reply' : 'Like this reply'}
                    style={{
                      padding: '2px 8px',
                      fontSize: '0.85rem',
                      ...(comment.liked
                        ? { borderColor: 'var(--accent)', color: 'var(--accent)' }
                        : {}),
                    }}
                  >
                    🍃 {comment.likeCount}
                  </button>
                  {(comment.mine || isOwner) && (
                    <button
                      className="btn"
                      onClick={() => void removeComment(comment)}
                      aria-label="Delete this reply"
                      style={{ padding: '2px 8px', fontSize: '0.85rem' }}
                    >
                      {confirmCommentDelete === comment.id ? 'Sure? Tap again' : '🗑️ Delete'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input
              value={draft}
              maxLength={MAX_COMMENT_CHARS}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void reply();
              }}
              placeholder="Reply…"
              aria-label="Write a reply"
              style={{ flex: 1, minWidth: 0 }}
            />
            <button className="btn" onClick={() => void reply()} disabled={draft.trim() === '' || posting}>
              {posting ? '…' : 'Reply'}
            </button>
          </div>
          {error && (
            <p className="small" role="alert" style={{ margin: '6px 0 0' }}>
              {error}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
