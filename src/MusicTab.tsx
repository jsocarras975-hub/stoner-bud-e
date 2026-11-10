// Music tab — in-app Audius player (free, no account, no key, no ads) plus
// the old external playlists below. The <audio> element and the queue live
// in App, so the music keeps playing while the user moves around the app;
// this tab is the browser + the now-playing controls. 21+ tone,
// night-garden look, same as the rest.
//
// Premium members (any paid tier, plus the owner) can also make their own
// playlists from Audius tracks: create, add a track from any row, play a
// whole playlist, rename, remove tracks, delete. Playlists sync to the
// account (src/lib/sync.ts + api/sync.ts), so they follow the member
// across devices. Free users see a small locked card pointing at Premium.
import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ListMusic,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  SkipBack,
  SkipForward,
  Trash2,
  X,
} from 'lucide-react';
import { MUSIC_SERVICES, PLAYLISTS } from './data/music';
import type { MusicService } from './data/music';
import {
  MUSIC_GENRES,
  formatDuration,
  newPlaylistId,
  searchTracks,
  trendingTracks,
  type AudiusTrack,
  type MusicPlaylist,
} from './lib/audius';
import { queueDeletion, type PremiumTier } from './lib/sync';
import { Chip, ChipRow, PageHead } from './bits';

type ServiceFilter = 'all' | MusicService;

const MAX_PLAYLISTS = 20;
const MAX_TRACKS_PER_PLAYLIST = 100;

export default function MusicTab({
  currentTrack,
  isPlaying,
  audioError,
  onPlayTrack,
  onTogglePlay,
  onNext,
  onPrev,
  playlists,
  onPlaylistsChange,
  premiumTier,
  onGoPremium,
}: {
  currentTrack: AudiusTrack | null;
  isPlaying: boolean;
  audioError: string | null;
  onPlayTrack: (track: AudiusTrack, list: AudiusTrack[]) => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  playlists: MusicPlaylist[];
  onPlaylistsChange: (next: MusicPlaylist[]) => void;
  premiumTier: PremiumTier;
  onGoPremium: () => void;
}) {
  const [genre, setGenre] = useState<string | null>('Hip-Hop/Rap');
  const [tracks, setTracks] = useState<AudiusTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<AudiusTrack[] | null>(null);
  const [service, setService] = useState<ServiceFilter>('all');

  // --- My playlists (premium) ---
  const isPremium = premiumTier !== null;
  const [openPlaylistId, setOpenPlaylistId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [addTarget, setAddTarget] = useState<AudiusTrack | null>(null);
  const [notice, setNotice] = useState('');
  const [renameName, setRenameName] = useState('');
  const [renaming, setRenaming] = useState(false);

  // The "Added to …" line clears itself after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(id);
  }, [notice]);

  const openPlaylist = playlists.find((p) => p.id === openPlaylistId) ?? null;

  function touch(pl: MusicPlaylist, patch: Partial<MusicPlaylist>): MusicPlaylist {
    return { ...pl, ...patch, updatedAt: new Date().toISOString() };
  }

  function createPlaylist(firstTrack?: AudiusTrack): void {
    const name = newName.trim() || 'My playlist';
    const pl: MusicPlaylist = {
      id: newPlaylistId(),
      name,
      tracks: firstTrack ? [firstTrack] : [],
      updatedAt: new Date().toISOString(),
    };
    onPlaylistsChange([...playlists, pl]);
    setNewName('');
    setShowNewForm(false);
    setAddTarget(null);
    setNotice(
      firstTrack ? `Made "${name}" with ${firstTrack.title}.` : `Made "${name}".`,
    );
  }

  function addToPlaylist(pl: MusicPlaylist, track: AudiusTrack): void {
    if (pl.tracks.some((t) => t.id === track.id)) return; // already in — the picker shows a check
    if (pl.tracks.length >= MAX_TRACKS_PER_PLAYLIST) {
      setNotice(`"${pl.name}" is full (100 tracks).`);
      return;
    }
    onPlaylistsChange(
      playlists.map((p) => (p.id === pl.id ? touch(p, { tracks: [...p.tracks, track] }) : p)),
    );
    setAddTarget(null);
    setNotice(`Added ${track.title} to "${pl.name}".`);
  }

  function removeFromPlaylist(pl: MusicPlaylist, trackId: string): void {
    onPlaylistsChange(
      playlists.map((p) =>
        p.id === pl.id ? touch(p, { tracks: p.tracks.filter((t) => t.id !== trackId) }) : p,
      ),
    );
  }

  function renamePlaylist(pl: MusicPlaylist): void {
    const name = renameName.trim();
    if (!name) return;
    onPlaylistsChange(playlists.map((p) => (p.id === pl.id ? touch(p, { name }) : p)));
    setRenaming(false);
    setNotice(`Renamed to "${name}".`);
  }

  function deletePlaylist(pl: MusicPlaylist): void {
    onPlaylistsChange(playlists.filter((p) => p.id !== pl.id));
    queueDeletion('playlist', pl.id);
    if (openPlaylistId === pl.id) setOpenPlaylistId(null);
    setNotice(`Deleted "${pl.name}".`);
  }

  function playPlaylist(pl: MusicPlaylist): void {
    if (pl.tracks.length === 0) return;
    onPlayTrack(pl.tracks[0], pl.tracks);
  }

  function playlistLength(pl: MusicPlaylist): string {
    const total = pl.tracks.reduce((sum, t) => sum + (t.durationSec || 0), 0);
    return total > 0 ? formatDuration(total) : '';
  }

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

  const externalPlaylists =
    service === 'all' ? PLAYLISTS : PLAYLISTS.filter((p) => p.service === service);

  // One track row: tap the song to play it, tap + to put it in a playlist.
  function trackRow(track: AudiusTrack, list: AudiusTrack[], action: 'add' | 'remove' | 'none', playlist?: MusicPlaylist) {
    const isCurrent = currentTrack?.id === track.id;
    return (
      <div key={track.id} className={isCurrent ? 'track-row playing' : 'track-row'}>
        <button
          type="button"
          className="track-row-main"
          onClick={() => {
            if (isCurrent) {
              onTogglePlay();
            } else {
              onPlayTrack(track, list);
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
        {action === 'add' && isPremium && (
          <button
            type="button"
            className="track-row-add"
            onClick={() => setAddTarget(track)}
            aria-label={`Add ${track.title} to a playlist`}
          >
            <Plus size={18} aria-hidden />
          </button>
        )}
        {action === 'remove' && playlist && (
          <button
            type="button"
            className="track-row-add"
            onClick={() => removeFromPlaylist(playlist, track.id)}
            aria-label={`Remove ${track.title} from ${playlist.name}`}
          >
            <X size={18} aria-hidden />
          </button>
        )}
      </div>
    );
  }

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

      {/* My playlists — premium members only */}
      <section aria-label="My playlists" style={{ marginTop: 20 }}>
        <h2 style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ListMusic size={20} aria-hidden /> My playlists
        </h2>
        {!isPremium ? (
          <article className="card">
            <p style={{ marginTop: 0 }}>
              <strong>Playlists are a premium perk.</strong>
            </p>
            <p className="muted">
              Lit and Cloud Nine members can make their own playlists from any Audius track —
              and the playlists sync to your account, so they follow you to any device.
            </p>
            <p style={{ marginBottom: 0 }}>
              <button type="button" className="btn btn-block" onClick={onGoPremium}>
                See premium
              </button>
            </p>
          </article>
        ) : openPlaylist ? (
          <>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setOpenPlaylistId(null);
                setRenaming(false);
              }}
              style={{ marginBottom: 12 }}
            >
              <ChevronLeft size={16} aria-hidden /> Back to playlists
            </button>
            {renaming ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  renamePlaylist(openPlaylist);
                }}
                style={{ display: 'flex', gap: 8, marginBottom: 12 }}
              >
                <input
                  type="text"
                  className="music-search"
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  placeholder="Playlist name"
                  aria-label="Playlist name"
                  autoFocus
                />
                <button type="submit" className="btn" disabled={renameName.trim() === ''}>
                  Save
                </button>
                <button type="button" className="btn secondary" onClick={() => setRenaming(false)}>
                  Cancel
                </button>
              </form>
            ) : (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>{openPlaylist.name}</h3>
                <span className="muted small">
                  {openPlaylist.tracks.length} track{openPlaylist.tracks.length === 1 ? '' : 's'}
                  {playlistLength(openPlaylist) ? ` · ${playlistLength(openPlaylist)}` : ''}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn"
                onClick={() => playPlaylist(openPlaylist)}
                disabled={openPlaylist.tracks.length === 0}
              >
                <Play size={16} aria-hidden /> Play all
              </button>
              {!renaming && (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    setRenameName(openPlaylist.name);
                    setRenaming(true);
                  }}
                >
                  <Pencil size={16} aria-hidden /> Rename
                </button>
              )}
              <button
                type="button"
                className="btn secondary"
                onClick={() => deletePlaylist(openPlaylist)}
              >
                <Trash2 size={16} aria-hidden /> Delete
              </button>
            </div>
            {openPlaylist.tracks.length === 0 ? (
              <p className="muted">
                Nothing in here yet — tap the <strong>+</strong> on any song below to add it.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {openPlaylist.tracks.map((t) =>
                  trackRow(t, openPlaylist.tracks, 'remove', openPlaylist),
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="muted small" style={{ marginTop: 0 }}>
              {playlists.length === 0
                ? 'Your own mixes, saved to your account.'
                : `${playlists.length} of ${MAX_PLAYLISTS} playlists`}
            </p>
            {playlists.map((pl) => (
              <article className="card" key={pl.id} aria-label={pl.name}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                  onClick={() => setOpenPlaylistId(pl.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setOpenPlaylistId(pl.id);
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: 'var(--surface)',
                      color: 'var(--accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <ListMusic size={20} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pl.name}
                    </strong>
                    <span className="muted small">
                      {pl.tracks.length} track{pl.tracks.length === 1 ? '' : 's'}
                      {playlistLength(pl) ? ` · ${playlistLength(pl)}` : ''}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn"
                    aria-label={`Play ${pl.name}`}
                    disabled={pl.tracks.length === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      playPlaylist(pl);
                    }}
                  >
                    <Play size={16} aria-hidden />
                  </button>
                </div>
              </article>
            ))}
            {playlists.length < MAX_PLAYLISTS &&
              (showNewForm ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createPlaylist();
                  }}
                  style={{ display: 'flex', gap: 8, marginTop: 8 }}
                >
                  <input
                    type="text"
                    className="music-search"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Playlist name"
                    aria-label="Playlist name"
                    autoFocus
                  />
                  <button type="submit" className="btn">
                    Create
                  </button>
                  <button type="button" className="btn secondary" onClick={() => setShowNewForm(false)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  className="btn btn-block"
                  onClick={() => setShowNewForm(true)}
                  style={{ marginTop: 8 }}
                >
                  <Plus size={16} aria-hidden /> New playlist
                </button>
              ))}
          </>
        )}
        {notice && (
          <p className="muted small" role="status" style={{ marginTop: 8 }}>
            {notice}
          </p>
        )}
      </section>

      {/* Add to playlist picker — a bottom sheet that floats over the
          track list, so it is always where the user is looking. (It used
          to render in the page flow above the search bar, so tapping +
          while scrolled down at the tracks looked like nothing happened.) */}
      {addTarget && isPremium && (
        <div
          className="sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Add to playlist"
          onClick={() => setAddTarget(null)}
        >
          <section className="card sheet-card" onClick={(e) => e.stopPropagation()}>
            <p style={{ marginTop: 0 }}>
              <strong>Add to a playlist</strong>
            </p>
            <p className="muted small" style={{ marginTop: 0 }}>
              {addTarget.title} — {addTarget.artist}
            </p>
            {playlists.length === 0 ? (
              <p className="muted">No playlists yet — make your first one below.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {playlists.map((pl) => {
                  const already = pl.tracks.some((t) => t.id === addTarget.id);
                  const full = pl.tracks.length >= MAX_TRACKS_PER_PLAYLIST;
                  return (
                    <button
                      key={pl.id}
                      type="button"
                      className="btn"
                      style={{ justifyContent: 'flex-start' }}
                      disabled={already || full}
                      onClick={() => addToPlaylist(pl, addTarget)}
                    >
                      {already ? '✓ ' : ''}{pl.name}
                      <span className="muted small" style={{ marginLeft: 'auto' }}>
                        {already ? 'Already in' : full ? 'Full' : `${pl.tracks.length} tracks`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {playlists.length < MAX_PLAYLISTS && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setNewName('');
                    createPlaylist(addTarget);
                  }}
                >
                  <Plus size={16} aria-hidden /> New playlist with this song
                </button>
              )}
              <button type="button" className="btn secondary" onClick={() => setAddTarget(null)}>
                Cancel
              </button>
            </div>
          </section>
        </div>
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
          {shown.map((track) => trackRow(track, shown, 'add'))}
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
        Showing {externalPlaylists.length} of {PLAYLISTS.length} playlists
      </p>

      {externalPlaylists.map((playlist) => (
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
