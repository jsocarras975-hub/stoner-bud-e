// Music tab — in-app Audius player (free, no account, no key, no ads) plus
// the old external playlists below. The <audio> element and the queue live
// in App, so the music keeps playing while the user moves around the app;
// this tab is the browser + the now-playing controls. 21+ tone,
// night-garden look, same as the rest.
import { useEffect, useState } from 'react';
import { Pause, Play, Search, SkipBack, SkipForward, X } from 'lucide-react';
import { MUSIC_SERVICES, PLAYLISTS } from './data/music';
import type { MusicService } from './data/music';
import {
  MUSIC_GENRES,
  formatDuration,
  searchTracks,
  trendingTracks,
  type AudiusTrack,
} from './lib/audius';
import { Chip, ChipRow, PageHead } from './bits';

type ServiceFilter = 'all' | MusicService;

export default function MusicTab({
  currentTrack,
  isPlaying,
  audioError,
  onPlayTrack,
  onTogglePlay,
  onNext,
  onPrev,
}: {
  currentTrack: AudiusTrack | null;
  isPlaying: boolean;
  audioError: string | null;
  onPlayTrack: (track: AudiusTrack, list: AudiusTrack[]) => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const [genre, setGenre] = useState<string | null>('Hip-Hop/Rap');
  const [tracks, setTracks] = useState<AudiusTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<AudiusTrack[] | null>(null);
  const [service, setService] = useState<ServiceFilter>('all');

  // Trending for the picked genre. Clears an old search when the genre changes.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(null);
    setSearchResults(null);
    trendingTracks(genre, 20)
      .then((list) => {
        if (!alive) return;
        setTracks(list);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setLoadError("Couldn't load the music right now — check your connection and try again.");
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [genre]);

  async function runSearch(): Promise<void> {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setLoadError(null);
    try {
      const list = await searchTracks(q, 20);
      setSearchResults(list);
      if (list.length === 0) {
        setLoadError(`Nothing found for "${q}" — try a song, an artist, or different words.`);
      }
    } catch {
      setLoadError("Search didn't work — check your connection and try again.");
    } finally {
      setSearching(false);
    }
  }

  function clearSearch(): void {
    setQuery('');
    setSearchResults(null);
    setLoadError(null);
  }

  const shown = searchResults ?? tracks;
  const showingSearch = searchResults !== null;

  const playlists = service === 'all' ? PLAYLISTS : PLAYLISTS.filter((p) => p.service === service);

  return (
    <main>
      <PageHead title="Music" sub="Free music, playing right inside Bud-E — no account, no ads." />

      {/* Now playing */}
      {currentTrack && (
        <section className="card" aria-label="Now playing" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {currentTrack.artwork ? (
            <img
              src={currentTrack.artwork}
              alt=""
              style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}
            />
          ) : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="muted small" style={{ margin: '0 0 2px' }}>
              {isPlaying ? 'Now playing' : 'Paused'}
            </p>
            <p style={{ margin: 0, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentTrack.title}
            </p>
            <p className="muted" style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentTrack.artist}
              {currentTrack.durationSec > 0 ? ` · ${formatDuration(currentTrack.durationSec)}` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button type="button" className="btn" onClick={onPrev} aria-label="Previous track">
              <SkipBack size={18} aria-hidden />
            </button>
            <button type="button" className="btn" onClick={onTogglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden />}
            </button>
            <button type="button" className="btn" onClick={onNext} aria-label="Next track">
              <SkipForward size={18} aria-hidden />
            </button>
          </div>
        </section>
      )}

      {audioError && (
        <p className="muted" role="alert" style={{ marginTop: 12 }}>
          {audioError}
        </p>
      )}

      {/* Search */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch();
        }}
        style={{ display: 'flex', gap: 8, marginTop: 16 }}
      >
        <input
          type="search"
          className="music-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a song or artist…"
          aria-label="Search music"
        />
        <button type="submit" className="btn" disabled={searching || query.trim() === ''} aria-label="Search">
          <Search size={18} aria-hidden />
        </button>
        {showingSearch && (
          <button type="button" className="btn" onClick={clearSearch} aria-label="Clear search">
            <X size={18} aria-hidden />
          </button>
        )}
      </form>

      {/* Genre chips */}
      {!showingSearch && (
        <ChipRow style={{ marginTop: 16, marginBottom: 16 }}>
          <Chip on={genre === null} onClick={() => setGenre(null)} ariaPressed={genre === null}>
            All
          </Chip>
          {MUSIC_GENRES.map((g) => (
            <Chip key={g} on={genre === g} onClick={() => setGenre(g)} ariaPressed={genre === g}>
              {g}
            </Chip>
          ))}
        </ChipRow>
      )}

      <p className="muted small">
        {showingSearch
          ? `Search results — ${shown.length} track${shown.length === 1 ? '' : 's'}`
          : loading
            ? 'Loading…'
            : `Trending this week${genre ? ` · ${genre}` : ''} — ${shown.length} track${shown.length === 1 ? '' : 's'}`}
      </p>

      {loadError && (
        <p className="muted" role="alert">
          {loadError}
        </p>
      )}

      {loading && shown.length === 0 ? null : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map((track) => {
            const isCurrent = currentTrack?.id === track.id;
            return (
              <button
                key={track.id}
                type="button"
                className={isCurrent ? 'track-row playing' : 'track-row'}
                onClick={() => {
                  if (isCurrent) {
                    onTogglePlay();
                  } else {
                    onPlayTrack(track, shown);
                  }
                }}
                aria-label={`${isCurrent && isPlaying ? 'Pause' : 'Play'} ${track.title} by ${track.artist}`}
              >
                {track.artwork ? (
                  <img src={track.artwork} alt="" loading="lazy" />
                ) : (
                  <span className="track-row-art-fallback" aria-hidden>
                    ♫
                  </span>
                )}
                <span className="track-row-text">
                  <strong>{track.title}</strong>
                  <span className="muted">
                    {track.artist}
                    {track.durationSec > 0 ? ` · ${formatDuration(track.durationSec)}` : ''}
                  </span>
                </span>
                {isCurrent && isPlaying ? (
                  <Pause size={18} aria-hidden />
                ) : (
                  <Play size={18} aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* External playlists — kept from before, for the apps the user already has. */}
      <h2 style={{ marginTop: 28 }}>Or open in another app</h2>
      <p className="muted">
        Lofi, reggae, and ambient — picked for the vibe. These open in Spotify, Apple Music, or
        YouTube Music, so they work with whatever you already have.
      </p>

      <ChipRow style={{ marginTop: 12, marginBottom: 16 }}>
        <Chip
          on={service === 'all'}
          onClick={() => setService('all')}
          ariaPressed={service === 'all'}
        >
          All
        </Chip>
        {MUSIC_SERVICES.map((s) => (
          <Chip
            key={s}
            on={service === s}
            onClick={() => setService(s)}
            ariaPressed={service === s}
          >
            {s}
          </Chip>
        ))}
      </ChipRow>

      <p className="muted small">
        Showing {playlists.length} of {PLAYLISTS.length} playlists
      </p>

      {playlists.map((playlist) => (
        <article className="card" key={playlist.id} aria-label={playlist.title}>
          <p className="muted small" style={{ marginTop: 0, marginBottom: 6 }}>
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{playlist.service}</span>
          </p>
          <h2 style={{ marginTop: 0 }}>{playlist.title}</h2>
          <p className="muted">{playlist.blurb}</p>
          <p style={{ marginBottom: 0 }}>
            <a
              className="btn btn-block"
              href={playlist.url}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'flex', justifyContent: 'center', textDecoration: 'none' }}
            >
              ▶ Open in {playlist.service}
            </a>
          </p>
        </article>
      ))}

      <p className="muted small">
        The music above is from Audius — free, full songs, no account and no ads. 21+ only, and
        never drive high.
      </p>
    </main>
  );
}
