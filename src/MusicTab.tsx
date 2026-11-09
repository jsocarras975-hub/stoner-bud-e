// Music tab — chill playlists for the night, on the apps the user already
// has. Every card is a link that OPENS IN THAT APP (Spotify, Apple Music,
// YouTube Music). No playback inside Bud-E, no sign-in, no account needed —
// that is a later follow-up. 21+ tone, night-garden look, same as the rest.
import { useMemo, useState } from 'react';
import { MUSIC_SERVICES, PLAYLISTS } from './data/music';
import type { MusicService } from './data/music';
import { Chip, ChipRow, PageHead } from './bits';

type ServiceFilter = 'all' | MusicService;

export default function MusicTab() {
  const [service, setService] = useState<ServiceFilter>('all');

  const shown = useMemo(
    () => (service === 'all' ? PLAYLISTS : PLAYLISTS.filter((p) => p.service === service)),
    [service],
  );

  return (
    <main>
      <PageHead
        title="Music"
        sub="Chill playlists for the night — tap one and it opens in that app."
      />

      <section className="card" aria-label="About the music section">
        <p style={{ marginTop: 0, marginBottom: 0 }}>
          Lofi, reggae, and ambient — picked for the vibe. These open in Spotify, Apple Music, or
          YouTube Music, so they work with whatever you already have. No sign-in inside Bud-E.
        </p>
      </section>

      <ChipRow style={{ marginTop: 16, marginBottom: 16 }}>
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
        Showing {shown.length} of {PLAYLISTS.length} playlists
      </p>

      {shown.map((playlist) => (
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
        Playing music right inside Bud-E is coming later — it needs the listener&apos;s Premium and
        account on that service. For now, the playlists open where they live. 21+ only, and never
        drive high.
      </p>
    </main>
  );
}
