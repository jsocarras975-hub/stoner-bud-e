// Munchies Room — a live chat just for sharing snack ideas. Opened by
// holding M + U together for 3 seconds on the Bud-E keyboard. Once found
// it stays in the app. Live: polls for new messages every 3 seconds while
// open. Same display name as Group Sesh.

import { useCallback, useEffect, useRef, useState } from 'react';
import { CommunityError, getDisplayName, MAX_POST_CHARS, setDisplayName } from './lib/community';
import { fetchMunchiesFeed, postMunchiesMessage, type MunchiesMessage } from './lib/munchies-chat';

export default function MunchiesChat({ user }: { user: { name: string } | null }) {
  const [messages, setMessages] = useState<MunchiesMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(() => getDisplayName(user?.name ?? 'Bud-E friend'));
  const [nameSaved, setNameSaved] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const load = useCallback(async (quiet: boolean) => {
    try {
      const feed = await fetchMunchiesFeed();
      setMessages(feed);
      setError(null);
    } catch (e) {
      if (!quiet) setError(e instanceof CommunityError ? e.message : 'Could not load the room — try again.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
    const id = window.setInterval(() => void load(true), 3000);
    return () => window.clearInterval(id);
  }, [load]);

  // Stay pinned to the newest message while the user is at the bottom.
  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function onScroll(): void {
    const el = listRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function handlePost(text: string): Promise<void> {
    const trimmed = text.trim();
    if (trimmed === '' || posting) return;
    setPosting(true);
    setError(null);
    try {
      const created = await postMunchiesMessage(trimmed);
      setMessages((prev) => [...prev, created]);
      setDraft('');
      stickToBottom.current = true;
    } catch (e) {
      setError(e instanceof CommunityError ? e.message : 'That did not go through — try again.');
    } finally {
      setPosting(false);
    }
  }

  function saveName(): void {
    setDisplayName(name.trim() || 'Bud-E friend');
    setNameSaved(true);
    window.setTimeout(() => setNameSaved(false), 2000);
  }

  return (
    <section>
      <p className="eyebrow">🍕 Munchies · live</p>
      <h1>The Munchies Room</h1>
      <p className="muted">
        The room for snack ideas. What are you craving? Only people who
        figured out the M+U hold are in here.
      </p>
      <label htmlFor="munchies-name">Your name in here</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          id="munchies-name"
          value={name}
          maxLength={30}
          onChange={(e) => setName(e.target.value)}
          placeholder="Bud-E friend"
          style={{ flex: 1, minWidth: 0 }}
        />
        <button type="button" className="btn secondary" onClick={saveName}>
          {nameSaved ? 'Saved ✓' : 'Save'}
        </button>
      </div>
      {loading ? (
        <p className="muted">Opening the room…</p>
      ) : error ? (
        <p className="danger-text">{error}</p>
      ) : messages.length === 0 ? (
        <p className="muted">No one has shared a craving yet. You go first. 🍕</p>
      ) : (
        <div
          ref={listRef}
          onScroll={onScroll}
          style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          {messages.map((m) => (
            <div key={m.id} className="card" style={{ marginBottom: 0 }}>
              <p style={{ margin: 0 }}>
                <strong>{m.displayName}</strong>{' '}
                <span className="muted" style={{ fontSize: '0.8rem' }}>
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
              </p>
              <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.body}</p>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          value={draft}
          maxLength={MAX_POST_CHARS}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handlePost(draft);
            }
          }}
          placeholder="What are you craving?..."
          aria-label="Share a munchie idea"
          style={{ flex: 1, minWidth: 0 }}
        />
        <button type="button" className="btn" onClick={() => void handlePost(draft)} disabled={posting || draft.trim() === ''}>
          Send
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          className="btn secondary"
          onClick={() => void handlePost(`👋 ${getDisplayName('Buddy')} waved at the room`)}
          disabled={posting}
        >
          👋 Wave
        </button>
        <button
          type="button"
          className="btn secondary"
          onClick={() => void handlePost(`✋ ${getDisplayName('Buddy')} high-fived the room`)}
          disabled={posting}
        >
          ✋ High five
        </button>
      </div>
    </section>
  );
}
