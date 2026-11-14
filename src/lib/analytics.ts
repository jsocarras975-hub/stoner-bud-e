import { communityCall } from './community';

/** Owner-only analytics (first-party, in our own database).
 *
 * The app records which features get used — app opened, tab opened, tool
 * opened, message sent — and nothing else. No message content, no journal
 * text, no personal details. Events are queued on-device and flushed to
 * /api/sync in small batches. Only the owner can read the numbers back
 * (see analytics_stats on the server). If you are not signed in, events
 * just sit in the queue until you sign in, then flush. */

export type AnalyticsEventName =
  | 'app_open'
  | 'tab_open'
  | 'tool_open'
  | 'chat_message'
  | 'journal_save'
  | 'music_play'
  | 'stash_add'
  | 'session_log';

export interface AnalyticsEvent {
  event: AnalyticsEventName;
  detail: string | null;
}

export interface AnalyticsStats {
  totalUsers: number;
  totalEvents: number;
  appOpens: number;
  chatMessages: number;
  journalSaves: number;
  musicPlays: number;
  stashAdds: number;
  sessionLogs: number;
  dailyActive: { day: string; users: number }[];
  eventsPerDay: { day: string; count: number }[];
  topTabs: { tab: string; count: number }[];
  topTools: { tool: string; count: number }[];
}

const QUEUE_KEY = 'bude-analytics-queue-v1';
const MAX_QUEUE = 200;
const FLUSH_AT = 50;

let flushing = false;

function loadQueue(): AnalyticsEvent[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is AnalyticsEvent =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as AnalyticsEvent).event === 'string',
    );
  } catch {
    return [];
  }
}

function saveQueue(queue: AnalyticsEvent[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
  } catch {
    // Storage full or unavailable — analytics is best-effort.
  }
}

/** Record one feature-use event. Cheap and silent; the flush sends it. */
export function trackEvent(event: AnalyticsEventName, detail: string | null = null): void {
  try {
    const queue = loadQueue();
    queue.push({ event, detail });
    saveQueue(queue);
    if (queue.length >= FLUSH_AT) void flushAnalytics();
  } catch {
    // Analytics never breaks the app.
  }
}

/** Send whatever is queued to the server. No-op when signed out or when
 *  the queue is empty. Safe to call often — it is a no-op while a flush
 *  is already running. */
export async function flushAnalytics(): Promise<void> {
  if (flushing) return;
  const queue = loadQueue();
  if (queue.length === 0) return;
  flushing = true;
  try {
    const batch = queue.slice(0, 100);
    await communityCall('analytics_track', { events: batch });
    saveQueue(queue.slice(batch.length));
  } catch {
    // Signed out, offline, or the server said no — keep the queue and
    // try again later. The queue is capped, so it cannot grow forever.
  } finally {
    flushing = false;
  }
}

/** Read the aggregated numbers. Owner-only — the server answers 403
 *  (not_owner) for anyone else. */
export async function getAnalyticsStats(): Promise<AnalyticsStats> {
  const body = await communityCall('analytics_stats');
  return {
    totalUsers: typeof body.totalUsers === 'number' ? body.totalUsers : 0,
    totalEvents: typeof body.totalEvents === 'number' ? body.totalEvents : 0,
    appOpens: typeof body.appOpens === 'number' ? body.appOpens : 0,
    chatMessages: typeof body.chatMessages === 'number' ? body.chatMessages : 0,
    journalSaves: typeof body.journalSaves === 'number' ? body.journalSaves : 0,
    musicPlays: typeof body.musicPlays === 'number' ? body.musicPlays : 0,
    stashAdds: typeof body.stashAdds === 'number' ? body.stashAdds : 0,
    sessionLogs: typeof body.sessionLogs === 'number' ? body.sessionLogs : 0,
    dailyActive: Array.isArray(body.dailyActive) ? (body.dailyActive as AnalyticsStats['dailyActive']) : [],
    eventsPerDay: Array.isArray(body.eventsPerDay) ? (body.eventsPerDay as AnalyticsStats['eventsPerDay']) : [],
    topTabs: Array.isArray(body.topTabs) ? (body.topTabs as AnalyticsStats['topTabs']) : [],
    topTools: Array.isArray(body.topTools) ? (body.topTools as AnalyticsStats['topTools']) : [],
  };
}
