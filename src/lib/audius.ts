// Audius — free, no key, no account, no ads. Full songs, indie + hip-hop
// heavy. Public API at https://api.audius.co. The stream URL is
// /v1/tracks/{id}/stream — it 302-redirects to the audio file, and an
// <audio> element follows the redirect fine.
// Only streamable tracks are shown: some uploads have is_streamable false
// and would fail to play if tapped, so they are filtered out here.

export interface AudiusTrack {
  id: string;
  title: string;
  artist: string;
  handle: string;
  durationSec: number;
  genre: string;
  artwork: string; // 480x480 cover art, '' when the track has none
  permalink: string;
}

/** A premium member's playlist: a named, ordered list of Audius tracks.
 *  Synced to the account (see src/lib/sync.ts + api/sync.ts) so it follows
 *  the member across devices. updatedAt drives the sync merge. */
export interface MusicPlaylist {
  id: string;
  name: string;
  tracks: AudiusTrack[];
  updatedAt?: string;
}

/** A fresh playlist id (random, URL-safe). */
export function newPlaylistId(): string {
  try {
    const bytes = new Uint8Array(9);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(36)).join('').slice(0, 12) || `pl-${Date.now()}`;
  } catch {
    return `pl-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

const API = 'https://api.audius.co';

export function streamUrl(id: string): string {
  return `${API}/v1/tracks/${encodeURIComponent(id)}/stream`;
}

export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function toTrack(raw: unknown): AudiusTrack | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  // Not streamable = tapping it would fail to play. Leave it out.
  if (t.is_streamable === false) return null;
  const id = typeof t.id === 'string' ? t.id : '';
  const title = typeof t.title === 'string' ? t.title : '';
  if (!id || !title) return null;
  const user = (t.user ?? {}) as Record<string, unknown>;
  const artwork = (t.artwork ?? {}) as Record<string, unknown>;
  const art =
    typeof artwork['480x480'] === 'string'
      ? (artwork['480x480'] as string)
      : typeof artwork['150x150'] === 'string'
        ? (artwork['150x150'] as string)
        : '';
  return {
    id,
    title,
    artist:
      typeof user.name === 'string' && user.name ? user.name : 'Unknown artist',
    handle: typeof user.handle === 'string' ? user.handle : '',
    durationSec: typeof t.duration === 'number' ? t.duration : 0,
    genre: typeof t.genre === 'string' ? t.genre : '',
    artwork: art,
    permalink: typeof t.permalink === 'string' ? t.permalink : '',
  };
}

async function fetchTracks(url: string): Promise<AudiusTrack[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Audius answered ${res.status}`);
  const data: unknown = await res.json();
  const list =
    data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)
      ? ((data as { data: unknown[] }).data as unknown[])
      : [];
  return list.map(toTrack).filter((t): t is AudiusTrack => t !== null);
}

/** This week's trending tracks, optionally for one genre. Pass null for all genres. */
export async function trendingTracks(genre: string | null, limit = 20): Promise<AudiusTrack[]> {
  const params = new URLSearchParams({ time: 'week', limit: String(limit) });
  if (genre) params.set('genre', genre);
  return fetchTracks(`${API}/v1/tracks/trending?${params.toString()}`);
}

/** Search tracks by song or artist name. */
export async function searchTracks(query: string, limit = 20): Promise<AudiusTrack[]> {
  const params = new URLSearchParams({ query, limit: String(limit) });
  return fetchTracks(`${API}/v1/tracks/search?${params.toString()}`);
}

/** Genre chips for the Music tab — the ones that fit a night in. */
export const MUSIC_GENRES: string[] = [
  'Hip-Hop/Rap',
  'Lo-Fi',
  'Reggae',
  'R&B/Soul',
  'Electronic',
  'Trap',
  'Ambient',
  'House',
];
