// Aero Land multiplayer server: serves the built client and relays world state over WebSockets.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const DIST = path.resolve(__dirname, '../dist');
const DATA_DIR = path.resolve(__dirname, 'data');
const WORLD_FILE = path.join(DATA_DIR, 'world.json');
const MAX_BLOCKS = 60000;
const MAX_PLAYERS = 48;
const WORLD_LIMIT = 260; // half-size of the buildable area
const GAMES = ['racing', 'darts', 'bubbles', 'fishing', 'memory'];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
};

// ---- persistent world state ----
const blocks = new Map(); // "x,y,z" -> type id
const leaderboards = Object.fromEntries(GAMES.map((g) => [g, []]));

function loadWorld() {
  try {
    const raw = JSON.parse(fs.readFileSync(WORLD_FILE, 'utf8'));
    for (const [k, t] of raw.blocks || []) blocks.set(k, t);
    for (const g of GAMES) if (Array.isArray(raw.leaderboards?.[g])) leaderboards[g] = raw.leaderboards[g];
    console.log(`Loaded ${blocks.size} blocks`);
  } catch { /* fresh world */ }
}
let dirty = false;
function saveWorld() {
  if (!dirty) return;
  dirty = false;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = WORLD_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ blocks: [...blocks], leaderboards }));
  fs.renameSync(tmp, WORLD_FILE);
}
loadWorld();
setInterval(saveWorld, 15000);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { saveWorld(); process.exit(0); });

// ---- static file server ----
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/health') { res.end('ok'); return; }
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const file = path.resolve(DIST, '.' + urlPath);
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) {
      if (!fs.existsSync(DIST)) {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('Aero Land server is running. Run "npm run build" to serve the game from here, or use "npm run dev".');
        return;
      }
      res.writeHead(404); res.end('Not found'); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---- realtime ----
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
const players = new Map(); // id -> { ws, name, look, state }
let nextId = 1;

const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const num = (v, lim = 1e5) => (Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0);

function sanitizeLook(l = {}) {
  const hex = (c, d) => (/^#[0-9a-f]{6}$/i.test(c) ? c : d);
  return {
    top: hex(l.top, '#6fd6ff'), bottom: hex(l.bottom, '#7dff5a'),
    eyes: clean(l.eyes, 16) || 'tall', hat: clean(l.hat, 16) || 'none',
    hatColor: hex(l.hatColor, '#ffffff'), size: Math.max(0.8, Math.min(1.25, Number(l.size) || 1)),
  };
}

function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(msg, except) {
  const s = JSON.stringify(msg);
  for (const [id, p] of players) if (id !== except && p.ws.readyState === 1) p.ws.send(s);
}

function submitScore(game, name, value) {
  const lb = leaderboards[game];
  if (!lb) return;
  // racing: lower is better (seconds). everything else: higher is better
  const lower = game === 'racing';
  const existing = lb.find((e) => e.name === name);
  if (existing) {
    if (lower ? value >= existing.value : value <= existing.value) return;
    existing.value = value;
  } else lb.push({ name, value });
  lb.sort((a, b) => (lower ? a.value - b.value : b.value - a.value));
  lb.length = Math.min(lb.length, 10);
  dirty = true;
  broadcast({ t: 'leaderboard', game, list: lb });
}

wss.on('connection', (ws) => {
  if (players.size >= MAX_PLAYERS) { send(ws, { t: 'full' }); ws.close(); return; }
  const id = nextId++;
  let joined = false;
  let lastChat = 0;
  let editBudget = 40; // simple rate limit for block edits
  const refill = setInterval(() => { editBudget = Math.min(40, editBudget + 10); }, 1000);

  ws.on('message', (buf) => {
    let m;
    try { m = JSON.parse(buf); } catch { return; }
    if (!m || typeof m !== 'object') return;
    const p = players.get(id);

    if (m.t === 'hello' && !joined) {
      joined = true;
      const player = { ws, name: clean(m.name, 16) || `Bubble${id}`, look: sanitizeLook(m.look), state: null };
      players.set(id, player);
      send(ws, {
        t: 'welcome', id,
        players: [...players].filter(([pid]) => pid !== id).map(([pid, o]) => ({ id: pid, name: o.name, look: o.look, state: o.state })),
        blocks: [...blocks], leaderboards,
      });
      broadcast({ t: 'join', id, name: player.name, look: player.look }, id);
      return;
    }
    if (!p) return;

    switch (m.t) {
      case 'state': {
        const s = m.s || {};
        p.state = {
          x: num(s.x, 2000), y: num(s.y, 2000), z: num(s.z, 2000), r: num(s.r, 100),
          a: clean(s.a, 8), v: clean(s.v, 8), sp: num(s.sp, 100),
        };
        broadcast({ t: 'state', id, s: p.state }, id);
        break;
      }
      case 'look':
        p.look = sanitizeLook(m.look);
        if (m.name) p.name = clean(m.name, 16) || p.name;
        broadcast({ t: 'look', id, look: p.look, name: p.name }, id);
        break;
      case 'chat': {
        const now = Date.now();
        if (now - lastChat < 600) return;
        lastChat = now;
        const text = clean(m.text, 140);
        if (text) broadcast({ t: 'chat', id, name: p.name, text });
        break;
      }
      case 'block': {
        if (editBudget-- <= 0) return;
        const x = Math.round(num(m.x)), y = Math.round(num(m.y)), z = Math.round(num(m.z));
        if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT || y < -20 || y > 120) return;
        const type = Math.max(0, Math.min(32, Math.round(num(m.b))));
        const key = `${x},${y},${z}`;
        if (type === 0) blocks.delete(key);
        else if (blocks.size < MAX_BLOCKS || blocks.has(key)) blocks.set(key, type);
        else return;
        dirty = true;
        broadcast({ t: 'block', x, y, z, b: type }, id);
        break;
      }
      case 'score': {
        const v = Number(m.value);
        if (!GAMES.includes(m.game) || !Number.isFinite(v) || v < 0 || v > 1e7) return;
        submitScore(m.game, p.name, Math.round(v * 100) / 100);
        break;
      }
      case 'emote':
        broadcast({ t: 'emote', id, e: clean(m.e, 8) }, id);
        break;
    }
  });

  ws.on('close', () => {
    clearInterval(refill);
    if (players.delete(id)) broadcast({ t: 'leave', id });
  });
});

server.listen(PORT, () => console.log(`🫧 Aero Land server on http://localhost:${PORT}`));
