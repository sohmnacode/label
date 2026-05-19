// Sohmna Intelligence V4 integration
// Calls Spotify (Client Credentials) and Genius directly

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API       = 'https://api.spotify.com/v1';
const GENIUS_API        = 'https://api.genius.com';

let _spotifyToken    = null;
let _spotifyTokenExp = 0;

async function spotifyToken() {
  if (_spotifyToken && Date.now() < _spotifyTokenExp) return _spotifyToken;

  const id     = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  const secret = import.meta.env.VITE_SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Spotify credentials not configured (VITE_SPOTIFY_CLIENT_ID / VITE_SPOTIFY_CLIENT_SECRET)');

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${id}:${secret}`)}`,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error('Spotify auth failed');
  const data = await res.json();
  _spotifyToken    = data.access_token;
  _spotifyTokenExp = Date.now() + (data.expires_in - 60) * 1000;
  return _spotifyToken;
}

async function spotifyGet(path) {
  const token = await spotifyToken();
  const res = await fetch(`${SPOTIFY_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Spotify error ${res.status}`);
  return res.json();
}

export async function spotifySearchRelease(query) {
  const q = encodeURIComponent(query);
  const data = await spotifyGet(`/search?q=${q}&type=album&limit=6`);
  return (data.albums?.items || []).map(a => ({
    id:           a.id,
    title:        a.name,
    artist:       a.artists.map(x => x.name).join(', '),
    release_date: a.release_date,
    release_type: a.album_type, // 'album' | 'single' | 'ep'
    cover_url:    a.images?.[0]?.url || null,
    spotify_url:  a.external_urls?.spotify || null,
    total_tracks: a.total_tracks,
  }));
}

export async function spotifySearchTrack(query) {
  const q = encodeURIComponent(query);
  const data = await spotifyGet(`/search?q=${q}&type=track&limit=8`);
  return (data.tracks?.items || []).map(t => ({
    id:           t.id,
    title:        t.name,
    artist:       t.artists.map(x => x.name).join(', '),
    album:        t.album?.name,
    isrc:         t.external_ids?.isrc || null,
    duration_sec: Math.round(t.duration_ms / 1000),
    explicit:     t.explicit,
    preview_url:  t.preview_url,
    spotify_url:  t.external_urls?.spotify || null,
    track_number: t.track_number,
  }));
}

export async function spotifyGetAlbumTracks(albumId) {
  const data = await spotifyGet(`/albums/${albumId}/tracks?limit=50`);
  return (data.items || []).map(t => ({
    title:        t.name,
    isrc:         t.external_ids?.isrc || null,
    duration_sec: Math.round(t.duration_ms / 1000),
    explicit:     t.explicit,
    track_number: t.track_number,
    spotify_url:  t.external_urls?.spotify || null,
  }));
}

export async function geniusSampleSearch(artist, title) {
  const key = import.meta.env.VITE_GENIUS_API_KEY;
  if (!key) throw new Error('VITE_GENIUS_API_KEY not configured');

  const q = encodeURIComponent(`${artist} ${title}`);
  const res = await fetch(`${GENIUS_API}/search?q=${q}&per_page=5`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error('Genius search failed');
  const data = await res.json();
  const hits = (data.response?.hits || []).filter(h => h.type === 'song').slice(0, 3);

  const results = await Promise.all(hits.map(async hit => {
    try {
      const detail = await fetch(`${GENIUS_API}/songs/${hit.result.id}`, {
        headers: { Authorization: `Bearer ${key}` },
      }).then(r => r.json());
      const song = detail.response?.song;
      if (!song) return null;
      const rel = (type) => (song.song_relationships || [])
        .filter(r => r.relationship_type === type)
        .flatMap(r => r.songs || [])
        .map(s => ({ title: s.title, artist: s.primary_artist?.name, url: s.url }));
      return {
        title:       song.title,
        artist:      song.primary_artist?.name,
        geniusUrl:   song.url,
        sampledFrom: rel('samples'),
        sampledBy:   rel('sampled_in'),
      };
    } catch { return null; }
  }));
  return results.filter(Boolean);
}

export function isSpotifyConfigured() {
  return !!(import.meta.env.VITE_SPOTIFY_CLIENT_ID && import.meta.env.VITE_SPOTIFY_CLIENT_SECRET);
}

export function isGeniusConfigured() {
  return !!import.meta.env.VITE_GENIUS_API_KEY;
}
