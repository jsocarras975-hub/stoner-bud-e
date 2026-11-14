import { useCallback, useEffect, useState } from 'react';
import { getAnalyticsStats } from './lib/analytics';
import type { AnalyticsStats } from './lib/analytics';
import { CommunityError } from './lib/community';

/** Owner-only analytics dashboard. Only the owner's account can open it
 *  (the More menu only shows it to the owner, and the server answers 403
 *  to anyone else). Shows what's actually getting used: how many people
 *  open the app, which tabs and tools they use, how many chats they send.
 *  No message content, no journal text, no personal details — just counts. */

const TAB_LABELS: Record<string, string> = {
  tonight: 'Tonight',
  chat: 'Buddy',
  tools: 'Tools',
  plan: 'Plan',
  strains: 'Strains',
  music: 'Music',
  journal: 'Journal',
  stash: 'Stash',
  break: 'Break',
  dose: 'Dose',
  settings: 'Settings',
  account: 'You',
  secret: 'Secret',
  vault: 'Vault',
  fourtwenty: '420 Room',
  hi: 'Hi',
  chill: 'Chill',
  munchies: 'Munchies',
  go: 'Go',
  ownerdash: 'Owner Dash',
};

const TOOL_LABELS: Record<string, string> = {
  timer: 'Edible timer',
  breathe: 'Breathe',
  munchies: 'Munchies maker',
  thoughts: 'Thoughts',
  trivia: 'Trivia',
  journal: 'Log',
  plan: 'Plan',
  'would-you-rather': 'Would you rather',
  'guess-strain': 'Guess the strain',
  memory: 'Memory match',
  community: 'Group Sesh',
  laws: 'Cannabis laws',
};

function shortDay(day: string): string {
  // '2026-11-14' -> 'Nov 14'
  const parts = day.split('-');
  if (parts.length !== 3) return day;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = Number(parts[1]);
  return `${months[m - 1] ?? ''} ${Number(parts[2])}`;
}

export default function OwnerDash() {
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await getAnalyticsStats();
      setStats(s);
    } catch (e) {
      if (e instanceof CommunityError) setError(e.message);
      else setError('Could not load the numbers — try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const maxDay = Math.max(1, ...((stats?.eventsPerDay ?? []).map((d) => d.count)));

  return (
    <div>
      <h1 className="page-title">Owner Dash</h1>
      <p className="page-sub">
        What people actually use in Bud-E. Only you can see this.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      {error && (
        <section className="card" aria-label="Could not load">
          <p style={{ margin: 0 }}>{error}</p>
        </section>
      )}

      {!error && stats && (
        <>
          <section className="card" aria-label="Overview">
            <p className="eyebrow">Overview</p>
            <p style={{ margin: '6px 0' }}>
              👥 <strong>{stats.totalUsers}</strong> people have used the app
            </p>
            <p style={{ margin: '6px 0' }}>
              🚀 <strong>{stats.appOpens}</strong> app opens
            </p>
            <p style={{ margin: '6px 0' }}>
              💬 <strong>{stats.chatMessages}</strong> chat messages sent
            </p>
            <p style={{ margin: '6px 0' }}>
              📝 <strong>{stats.journalSaves}</strong> journal entries saved
            </p>
            <p style={{ margin: '6px 0' }}>
              🎵 <strong>{stats.musicPlays}</strong> songs played
            </p>
            <p style={{ margin: '6px 0' }}>
              🫙 <strong>{stats.stashAdds}</strong> stash adds
            </p>
            <p style={{ margin: '6px 0' }}>
              🍃 <strong>{stats.sessionLogs}</strong> sessions logged
            </p>
            <p style={{ margin: '6px 0' }}>
              📊 <strong>{stats.totalEvents}</strong> events tracked in total
            </p>
          </section>

          <section className="card" aria-label="Daily active users">
            <p className="eyebrow">People per day — last 14 days</p>
            {stats.dailyActive.length === 0 ? (
              <p className="muted">No activity yet.</p>
            ) : (
              stats.dailyActive.map((d) => (
                <p key={d.day} style={{ margin: '6px 0' }}>
                  {shortDay(d.day)} — <strong>{d.users}</strong> {d.users === 1 ? 'person' : 'people'}
                </p>
              ))
            )}
          </section>

          <section className="card" aria-label="Most used tabs">
            <p className="eyebrow">Most used tabs</p>
            {stats.topTabs.length === 0 ? (
              <p className="muted">No tab opens yet.</p>
            ) : (
              stats.topTabs.map((t) => (
                <p key={t.tab} style={{ margin: '6px 0' }}>
                  {TAB_LABELS[t.tab] ?? t.tab} — <strong>{t.count}</strong>
                </p>
              ))
            )}
          </section>

          <section className="card" aria-label="Most used tools">
            <p className="eyebrow">Most used tools</p>
            {stats.topTools.length === 0 ? (
              <p className="muted">No tools opened yet.</p>
            ) : (
              stats.topTools.map((t) => (
                <p key={t.tool} style={{ margin: '6px 0' }}>
                  {TOOL_LABELS[t.tool] ?? t.tool} — <strong>{t.count}</strong>
                </p>
              ))
            )}
          </section>

          <section className="card" aria-label="Events per day">
            <p className="eyebrow">Activity per day — last 14 days</p>
            {stats.eventsPerDay.length === 0 ? (
              <p className="muted">No activity yet.</p>
            ) : (
              stats.eventsPerDay.map((d) => (
                <div key={d.day} style={{ margin: '6px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{shortDay(d.day)}</span>
                    <strong>{d.count}</strong>
                  </div>
                  <div
                    aria-hidden
                    style={{
                      height: 8,
                      borderRadius: 4,
                      background: 'var(--accent, #a3e635)',
                      width: `${Math.max(2, Math.round((d.count / maxDay) * 100))}%`,
                      opacity: 0.8,
                      marginTop: 2,
                    }}
                  />
                </div>
              ))
            )}
          </section>

          <section className="card" aria-label="Privacy">
            <p className="eyebrow">What this counts</p>
            <p className="muted" style={{ margin: 0 }}>
              Only which features get used — app opens, tabs, tools, messages sent.
              No message text, no journal entries, no personal details. The
              numbers live in your own database and only your owner account
              can see them.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
