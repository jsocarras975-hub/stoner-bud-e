// Stoner Bud-E — Music section playlist list.
// Every URL below is a REAL public playlist, verified live before it was
// added: Spotify links come from the connected Spotify account (oEmbed
// confirms each title); Apple Music links return the matching playlist page;
// YouTube Music links resolve to real playlists with lofi/chill tracks.
// SoundCloud is NOT here — no verifiable SoundCloud playlist link turned up,
// and guessing a link is worse than leaving the service out.
// Tapping a playlist opens it in that app. No playback inside Bud-E (yet),
// no sign-in, no account needed.

export type MusicService = 'Spotify' | 'Apple Music' | 'YouTube Music';

export interface Playlist {
  id: string;
  service: MusicService;
  title: string;
  blurb: string;
  url: string;
}

export const MUSIC_SERVICES: MusicService[] = ['Spotify', 'Apple Music', 'YouTube Music'];

export const PLAYLISTS: Playlist[] = [
  {
    id: 'spotify-lofi-beats',
    service: 'Spotify',
    title: 'lofi beats',
    blurb: 'Chill beats, lofi vibes — new tracks every week.',
    url: 'https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn',
  },
  {
    id: 'spotify-chilled-reggae',
    service: 'Spotify',
    title: 'Chilled Reggae',
    blurb: 'Old and new reggae, simmered down.',
    url: 'https://open.spotify.com/playlist/37i9dQZF1DWYtKpmml7moA',
  },
  {
    id: 'spotify-good-vibes-reggae',
    service: 'Spotify',
    title: 'Good Vibes 🌴 Reggae & Chill',
    blurb: 'Easy island energy for the night.',
    url: 'https://open.spotify.com/playlist/18SOfItVZWHoRB7Gm14u6g',
  },
  {
    id: 'spotify-ambient-chill',
    service: 'Spotify',
    title: 'Ambient Chill Mix',
    blurb: 'Soft ambient drift for winding down.',
    url: 'https://open.spotify.com/playlist/37i9dQZF1EIgtQhtrTnEvk',
  },
  {
    id: 'apple-ice-cold',
    service: 'Apple Music',
    title: 'Ice Cold',
    blurb: 'Chilled, meditative lo-fi to clear your head.',
    url: 'https://music.apple.com/us/playlist/ice-cold/pl.e45c56fea6dc414ba717cde12fc076f8',
  },
  {
    id: 'apple-chillhop-radio',
    service: 'Apple Music',
    title: 'Chillhop Radio',
    blurb: 'Jazz and lofi hip hop beats — 300 songs deep.',
    url: 'https://music.apple.com/us/playlist/chillhop-radio-jazz-lofi-hip-hop-beats-to-study-relax-to/pl.0b8321c00f68421f8081e5913de51118',
  },
  {
    id: 'apple-lofi-breeze',
    service: 'Apple Music',
    title: 'Lo-Fi Breeze',
    blurb: 'Easy lo-fi — 200 songs, 7+ hours.',
    url: 'https://music.apple.com/us/playlist/lo-fi-breeze/pl.7197f862319747fcbb944c7baec9c2b6',
  },
  {
    id: 'apple-lofi-girl',
    service: 'Apple Music',
    title: 'Lofi Girl',
    blurb: 'Beats to relax and study to — the classic.',
    url: 'https://music.apple.com/us/playlist/lofi-girl-beats-to-relax-study-to/pl.bf7a3cbca49644d8a33f09c1285aef5c',
  },
  {
    id: 'ytm-para-concentrarme',
    service: 'YouTube Music',
    title: 'Para concentrarme',
    blurb: 'Chill lofi tracks for focus — 33 songs.',
    url: 'https://music.youtube.com/playlist?list=PLP-HGJpQQKOM',
  },
  {
    id: 'ytm-rainy-nights',
    service: 'YouTube Music',
    title: 'Sad & Chill Songs for Rainy Nights',
    blurb: 'Mellow songs for a slow, rainy night.',
    url: 'https://music.youtube.com/playlist?list=PLBmniMrvDafs',
  },
];
