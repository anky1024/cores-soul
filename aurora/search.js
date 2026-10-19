// Aurora search engine — mirrors the Spotify web-search flow reconstructed with REA:
//  1. GET /search/:q page shell (SSR) + lazy chunks
//  2. POST /bootstrap-token (anonymous session token, like apresolve.spotify.com)
//  3. WSS /dealer protobuf-like RPC: searchV3 { query, types, limit, offset }
//  4. Telemetry batched to /gabo-receiver-service/public/v3/events
// Here we implement an in-process inverted index + ranked union over entity types.

const db = require('./db');

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'to', 'in', 'on', 'it', 's']);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(t => t && !STOP.has(t));
}

// ---------- inverted index built at startup ----------
const index = { track: new Map(), album: new Map(), artist: new Map(), playlist: new Map() };
const docs = { track: new Map(), album: new Map(), artist: new Map(), playlist: new Map() };

function addDoc(type, id, fields /* [{text, weight}] */) {
  const df = new Map(); // term -> max weight
  let len = 0;
  for (const { text, weight } of fields) {
    for (const tok of tokenize(text)) {
      df.set(tok, Math.max(df.get(tok) || 0, weight));
      len++;
      // prefix buckets: also index prefixes length>=2
      for (let p = 2; p <= tok.length; p++) {
        const pre = tok.slice(0, p);
        if (!index[type].has(pre)) index[type].set(pre, new Map());
        index[type].get(pre).set(id, Math.max(index[type].get(pre).get(id) || 0, df.get(tok)));
      }
    }
  }
  docs[type].set(id, { df, len: Math.max(len, 1) });
}

const artists = db.prepare('SELECT * FROM artists').all();
const albums = db.prepare(`SELECT a.*, ar.name artist_name FROM albums a JOIN artists ar ON ar.id=a.artist_id`).all();
const tracks = db.prepare(`SELECT t.*, a.name album_name, a.year album_year, ar.id artist_id, ar.name artist_name, ar.genres genres
  FROM tracks t JOIN albums a ON a.id=t.album_id JOIN artists ar ON ar.id=a.artist_id`).all();
const playlists = db.prepare('SELECT * FROM playlists').all();

for (const ar of artists) addDoc('artist', ar.id, [{ text: ar.name, weight: 8 }, { text: ar.genres, weight: 2 }]);
for (const al of albums) addDoc('album', al.id, [{ text: al.name, weight: 6 }, { text: al.artist_name, weight: 4 }, { text: String(al.kind), weight: 1 }]);
for (const t of tracks) addDoc('track', t.id, [{ text: t.name, weight: 7 }, { text: t.artist_name, weight: 5 }, { text: t.album_name, weight: 3 }, { text: t.genres, weight: 1.5 }]);
for (const p of playlists) addDoc('playlist', p.id, [{ text: p.name, weight: 5 }, { text: p.description, weight: 2 }, { text: p.owner, weight: 1 }]);

const byId = {
  artist: Object.fromEntries(artists.map(a => [a.id, a])),
  album: Object.fromEntries(albums.map(a => [a.id, a])),
  track: Object.fromEntries(tracks.map(t => [t.id, t])),
  playlist: Object.fromEntries(playlists.map(p => [p.id, p])),
};

// BM25-ish scoring with field weights and exact-name bonus
function scoreType(type, terms) {
  const N = docs[type].size || 1;
  const avgLen = [...docs[type].values()].reduce((s, d) => s + d.len, 0) / N;
  const scores = new Map();
  for (const term of terms) {
    const postings = index[type].get(term);
    if (!postings) continue;
    const dfCount = Math.max(postings.size, 1);
    const idf = Math.log(1 + (N - dfCount + 0.5) / dfCount);
    for (const [id, w] of postings) {
      const d = docs[type].get(id);
      // exact term boost: doc contains full term as standalone token
      const exact = d.df.has(term) ? 1.5 : 1.0;
      const tf = w;
      const k1 = 1.2, b = 0.75;
      const s = idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (d.len / avgLen))) * exact;
      scores.set(id, (scores.get(id) || 0) + s);
    }
  }
  return scores;
}

const TYPE_LIMITS = { top: 5, artist: 8, track: 10, album: 8, playlist: 8 };

function mapArtist(id, s) {
  const a = byId.artist[id];
  return { id, uri: `aurora:artist:${id}`, type: 'artist', name: a.name, genres: a.genres.split(', ').slice(0, 3), monthly_listeners: a.listeners, score: +s.toFixed(3) };
}
function mapAlbum(id, s) {
  const a = byId.album[id];
  return { id, uri: `aurora:album:${id}`, type: 'album', name: a.name, artists: [a.artist_name], year: a.year, kind: a.kind, score: +s.toFixed(3) };
}
function mapTrack(id, s) {
  const t = byId.track[id];
  return { id, uri: `aurora:track:${id}`, type: 'track', name: t.name, artists: [t.artist_name], album: t.album_name, duration_ms: t.duration_ms, popularity: t.popularity, explicit: !!t.explicit, isrc_like: `AUR${t.id.toUpperCase()}00001`, score: +s.toFixed(3) };
}
function mapPlaylist(id, s) {
  const p = byId.playlist[id];
  return { id, uri: `aurora:playlist:${id}`, type: 'playlist', name: p.name, description: p.description, owner: p.owner, score: +s.toFixed(3) };
}

function searchAll(query) {
  const terms = tokenize(query);
  if (!terms.length) return emptyResult(query);
  const out = {};
  for (const type of ['artist', 'album', 'track', 'playlist']) {
    const scores = scoreType(type, terms);
    const mapper = { artist: mapArtist, album: mapAlbum, track: mapTrack, playlist: mapPlaylist }[type];
    out[type] = [...scores.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, TYPE_LIMITS[type])
      .map(([id, s]) => mapper(id, s));
  }
  // Top results: best mixed entities weighted toward artists/tracks
  const top = [
    ...out.artist.slice(0, 2),
    ...out.track.slice(0, 3),
    ...out.album.slice(0, 1),
    ...out.playlist.slice(0, 1),
  ].sort((a, b) => b.score - a.score).slice(0, TYPE_LIMITS.top);
  return {
    query,
    all: { top, artists: wrap(out.artist, TYPE_LIMITS.artist), tracks: wrap(out.track, TYPE_LIMITS.track), albums: wrap(out.album, TYPE_LIMITS.album), playlists: wrap(out.playlist, TYPE_LIMITS.playlist) },
  };
}
function wrap(items, limit) { return { items, next: items.length >= limit ? `offset:${limit}` : null }; }
function emptyResult(q) {
  const z = { items: [], next: null };
  return { query: q, all: { top: [], artists: z, tracks: z, albums: z, playlists: z } };
}

module.exports = { searchAll, tokenize };
