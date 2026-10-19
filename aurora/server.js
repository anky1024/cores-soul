// Aurora — Spotify-like music app reconstructed with REA (morluto/rea v6.7.0).
// Architecture mirrors evidence in /workspace/evidence/spotify-search-capture.json:
//   * SSR page shell at GET /search/:q  (evidence: document request https://open.spotify.com/search/daft%20punk)
//   * Lazy JS chunks                    (evidence: xpui-routes-search.*.js on open.spotifycdn.com)
//   * Anonymous token bootstrap         (evidence: POST https://apresolve.spotify.com/)
//   * WebSocket "dealer" RPC channel    (evidence: wss gae2-spclient.spotify.com, protobuf messages)
//   * Batched telemetry events          (evidence: https://gae2-spclient.spotify.com/gabo-receiver-service/public/v3/events x18)

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const { WebSocketServer } = require('ws');
const { searchAll } = require('./search');
const db = require('./db');

const app = express();
app.use(express.json());

// ---------- static UI (the "chunks") ----------
app.use('/cdn/build/app', express.static(path.join(__dirname, 'public')));

// ---------- 1) anonymous bootstrap token endpoint (mirrors apresolve) ----------
app.post('/bootstrap-token', (req, res) => {
  const token = crypto.randomBytes(24).toString('base64url');
  res.json({ access_token: token, token_type: 'Bearer', expires_in: 3600, context: 'aurora-web' });
});

// ---------- 2) REST fallback for search (same contract as the WS RPC result) ----------
app.get('/api/search/:q', (req, res) => {
  res.json(searchAll(decodeURIComponent(req.params.q)));
});

// ---------- 3) telemetry batch endpoint (mirrors gabo-receiver-service) ----------
app.post('/gabo-receiver-service/public/v3/events', (req, res) => {
  const evs = Array.isArray(req.body) ? req.body : [req.body];
  const ins = db.prepare('INSERT INTO events VALUES (?,?,?)');
  db.transaction(() => evs.forEach(e => ins.run(Date.now(), e.type || 'unknown', JSON.stringify(e.payload || {}))))();
  res.status(202).json({ accepted: evs.length });
});

// ---------- 4) SSR shell routes ----------
const shell = (title, active) => `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Aurora</title><link rel="stylesheet" href="/cdn/build/app/app.css"></head>
<body data-active="${active}">
<div id="root"></div>
<script src="/cdn/build/app/chunks/core.js"></script>
<script src="/cdn/build/app/chunks/xpui-routes-search.js"></script>
<script src="/cdn/build/app/chunks/dwp-now-playing-bar.js"></script>
<script src="/cdn/build/app/boot.js"></script>
</body></html>`;

app.get('/', (req, res) => res.send(shell('Home', 'home')));
app.get('/search', (req, res) => res.send(shell('Search', 'search')));
app.get('/search/:q', (req, res) => res.send(shell(`Search ${req.params.q || ''}`.trim(), 'search')));
app.get('/library', (req, res) => res.send(shell('Your Library', 'library')));

// ---------- server + dealer websocket ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/dealer' });

// Lightweight length-prefixed RPC framing that stands in for Spotify's protobuf-over-WS "dealer".
// Frame: 1B type | 2BE uint16 seq | payload (JSON utf8)
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.sendFrame = (type, payload) => {
    const p = Buffer.from(JSON.stringify(payload), 'utf8');
    const head = Buffer.alloc(3);
    head.writeUInt8(type, 0);
    head.writeUInt16BE((Math.random() * 65535) | 0, 1);
    ws.send(Buffer.concat([head, p]));
  };

  // greeting event, like dealer hello + pubsub subscription acks
  ws.sendFrame(0x01, { event: 'product.state', state: { country: 'US', premium: false, offline: false } });

  ws.on('message', (data) => {
    try {
      // accept both plain JSON text frames and binary RPC frames
      let msg;
      if (Buffer.isBuffer(data) && data.length > 3 && !(data[0] === 0x7b /* { */)) {
        msg = JSON.parse(data.subarray(3).toString('utf8'));
      } else {
        msg = JSON.parse(data.toString('utf8'));
      }
      handleRpc(ws, msg);
    } catch {
      ws.sendFrame(0xff, { error: 'bad_frame' });
    }
  });
});

function handleRpc(ws, msg) {
  const { method, args = {}, requestId } = msg;
  const reply = (result) => ws.sendFrame(0x02, { requestId, result });
  switch (method) {
    case 'searchV3': {
      const r = searchAll(args.query || '');
      const types = (args.types || []).filter(Boolean);
      if (!types.length) return reply(r.all); // client expects the full multi-section payload
      const key = { artist: 'artists', track: 'tracks', album: 'albums', playlist: 'playlists', top: 'top' }[types[0]];
      reply({ query: r.query, section: types[0], data: key ? r.all[key] : [] });
      break;
    }
    case 'recentsForUser':
      reply(db.prepare('SELECT * FROM tracks ORDER BY popularity DESC LIMIT 12').all());
      break;
    case 'playlistGet':
      reply(db.prepare(`SELECT t.* FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE pt.playlist_id=?`).all(args.id));
      break;
    default:
      ws.sendFrame(0xff, { requestId, error: `unknown_method:${method}` });
  }
}

// ping loop to prune dead dealers (like client keepalive)
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

const PORT = process.env.PORT || 4100;
server.listen(PORT, () => console.log(`Aurora listening on http://localhost:${PORT} (dealer ws on /dealer)`));
