'use strict';
/* =====================================================================
   CONQUISTA ESTELAR — RPG 2D retrô de conquista e defesa de planetas
   Canvas em baixa resolução (480x270) ampliado com pixels nítidos.
   ===================================================================== */

const W = 480, H = 270;
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const wrap = document.getElementById('wrap');
const panelEl = document.getElementById('panel');
const barEl = document.getElementById('bar');
ctx.imageSmoothingEnabled = false;

/* ------------------------------ util ------------------------------ */
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const randi = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const fmt = n => Math.floor(n).toLocaleString('pt-BR');
const plain = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------ áudio 8-bit ------------------------------ */
const Sfx = {
  ac: null, on: true, lastShot: 0,
  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ac = null; }
  },
  tone(f, d, type = 'square', v = 0.05, slide = 0, delay = 0) {
    if (!this.on || !this.ac) return;
    const t = this.ac.currentTime + delay, o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.linearRampToValueAtTime(Math.max(20, f + slide), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(this.ac.destination); o.start(t); o.stop(t + d + 0.02);
  },
  noise(d, v = 0.08) {
    if (!this.on || !this.ac) return;
    const n = Math.floor(this.ac.sampleRate * d), buf = this.ac.createBuffer(1, n, this.ac.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ac.createBufferSource(), g = this.ac.createGain();
    s.buffer = buf; g.gain.value = v; s.connect(g).connect(this.ac.destination); s.start();
  },
  shoot() { const now = performance.now(); if (now - this.lastShot < 75) return; this.lastShot = now; this.tone(990, 0.06, 'square', 0.022, -500); },
  hit() { this.tone(180, 0.12, 'sawtooth', 0.06, -120); this.noise(0.08, 0.05); },
  boom(big) { this.noise(big ? 0.6 : 0.22, big ? 0.16 : 0.07); this.tone(big ? 90 : 150, big ? 0.5 : 0.18, 'triangle', 0.08, -60); },
  coin() { this.tone(1320, 0.05, 'square', 0.025); this.tone(1760, 0.07, 'square', 0.025, 0, 0.05); },
  buy() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.08, 'square', 0.04, 0, i * 0.06)); },
  alarm() { for (let i = 0; i < 3; i++) { this.tone(660, 0.12, 'square', 0.05, 0, i * 0.3); this.tone(440, 0.12, 'square', 0.05, 0, i * 0.3 + 0.14); } },
  level() { [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.1, 'square', 0.045, 0, i * 0.07)); },
  bad() { [400, 300, 200].forEach((f, i) => this.tone(f, 0.18, 'square', 0.05, 0, i * 0.15)); },
  click() { this.tone(660, 0.04, 'square', 0.03); },
};

/* ------------------------------ sprites em pixel art ------------------------------ */
const PAL = {
  w: '#ffffff', c: '#55ffff', b: '#2a6fdb', d: '#1b3a7a', g: '#9a9aa8', k: '#454555',
  r: '#e43b44', R: '#a22633', o: '#f77622', y: '#feae34', p: '#b55088', P: '#68386c',
  G: '#63c74d', D: '#265c42', s: '#c0cbdc',
};
function makeSprite(rows) {
  const c = document.createElement('canvas');
  c.width = rows[0].length; c.height = rows.length;
  const g = c.getContext('2d');
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (PAL[ch]) { g.fillStyle = PAL[ch]; g.fillRect(i, j, 1, 1); }
  }));
  return c;
}
function whiteOf(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  return c;
}
const SPRITE_DATA = {
  falcao: [
    '..bb........',
    '..dbb.......',
    '..dbbbb.....',
    'oyddbbbbcc..',
    'oyddwwbbbccw',
    'oyddbbbbcc..',
    '..dbbbb.....',
    '..dbb.......',
    '..bb........',
  ],
  vespa: [
    'gg..........',
    '.gkcc.......',
    'oykkcccc....',
    'oykkwwcccccw',
    'oykkcccc....',
    '.gkcc.......',
    'gg..........',
  ],
  tita: [
    '..kkk.........',
    '..kggg........',
    '..kgggggg.....',
    '.okggggggg....',
    'oykgggrrgggg..',
    'oykggwwrrggggw',
    'oykgggrrgggg..',
    '.okggggggg....',
    '..kgggggg.....',
    '..kggg........',
    '..kkk.........',
  ],
  drone: [
    '..rrr..',
    '.rRRRr.',
    'rRyyyRr',
    'rRywyRr',
    'rRyyyRr',
    '.rRRRr.',
    '..rrr..',
  ],
  fighter: [
    '......RR..',
    '....RRr...',
    '..rrrrrRoy',
    'wrrRRrrRoy',
    'wrrRRrrRoy',
    '..rrrrrRoy',
    '....RRr...',
    '......RR..',
  ],
  tank: [
    '...PPPPPPPP...',
    '..PpppppppppP.',
    '.Pppkkppppppp.',
    'Pppkkkkpppppp.',
    'wwpkyykppppppP',
    'wwpkyykppppppP',
    'Pppkkkkpppppp.',
    '.Pppkkppppppp.',
    '..PpppppppppP.',
    '...PPPPPPPP...',
  ],
  coin: [
    '.yy.',
    'yywy',
    'yyyy',
    '.yy.',
  ],
  heart: [
    'r.r.',
    'rrrr',
    '.rr.',
  ],
};
const SPR = {};
for (const k in SPRITE_DATA) { SPR[k] = makeSprite(SPRITE_DATA[k]); SPR[k + 'W'] = whiteOf(SPR[k]); }

function drawSpr(img, x, y, flip = false) {
  const dx = Math.round(x - img.width / 2), dy = Math.round(y - img.height / 2);
  if (!flip) { ctx.drawImage(img, dx, dy); return; }
  ctx.save(); ctx.translate(dx + img.width, dy); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0); ctx.restore();
}

/* ------------------------------ primitivas de pixel ------------------------------ */
const FONT = '"Press Start 2P", monospace';
function text(s, x, y, col = '#fff', align = 'left', size = 8) {
  ctx.font = `${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'top';
  s = plain(s);
  ctx.fillStyle = '#000'; ctx.fillText(s, Math.round(x) + 1, Math.round(y) + 1);
  ctx.fillStyle = col; ctx.fillText(s, Math.round(x), Math.round(y));
}
function pline(x0, y0, x1, y1, col, dash = 0, phase = 0) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  ctx.fillStyle = col;
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, i = 0;
  for (;;) {
    if (!dash || ((i + phase) % (dash * 2)) < dash) ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
    i++;
  }
}
function pcircle(cx, cy, r, col, dash = 0, phase = 0) {
  ctx.fillStyle = col;
  const n = Math.max(16, Math.floor(r * 6.3));
  for (let i = 0; i < n; i++) {
    if (dash && ((i + phase) % (dash * 2)) >= dash) continue;
    const a = (i / n) * Math.PI * 2;
    ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
  }
}
function bar(x, y, w, h, frac, col, bg = '#1a1a2e') {
  ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col; ctx.fillRect(x, y, Math.round(w * clamp(frac, 0, 1)), h);
}

/* ------------------------------ planetas (render procedural) ------------------------------ */
const PLANET_PALS = [
  ['#1b3a7a', '#2a6fdb', '#5fb3ff', '#c8f0ff'], // oceânico
  ['#5a2a12', '#a8551f', '#e08a3a', '#ffd08a'], // desértico
  ['#1d3f18', '#3f8a2e', '#76c442', '#d6f2a0'], // selva
  ['#3b1f4f', '#6b3a8a', '#b06ad0', '#f0c0ff'], // gasoso
  ['#3a3a44', '#6a6a78', '#a8a8b8', '#ececf4'], // rochoso
  ['#4c1414', '#a32a2a', '#e8553a', '#ffb070'], // vulcânico
  ['#123c44', '#2a8a8a', '#5ad0c0', '#c0fff0'], // gelo
];
function renderPlanet(r, pal, seed) {
  const s = r * 2 + 2, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d'), rng = mulberry32(seed);
  const ph = rng() * 10, freq = 2 + rng() * 4, spots = [];
  for (let i = 0; i < 6; i++) spots.push([rng() * 2 - 1, rng() * 2 - 1, 0.12 + rng() * 0.3]);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const nx = (x + 0.5 - s / 2) / r, ny = (y + 0.5 - s / 2) / r, d2 = nx * nx + ny * ny;
    if (d2 > 1) continue;
    const nz = Math.sqrt(1 - d2);
    let v = -0.55 * nx - 0.45 * ny + 0.7 * nz;
    v = v * 0.9 + Math.sin(ny * freq * 3 + ph + Math.sin(nx * 3 + ph) * 0.8) * 0.16 + 0.15;
    for (const sp of spots) if ((nx - sp[0]) ** 2 + (ny - sp[1]) ** 2 < sp[2] * sp[2]) v -= 0.16;
    v += ((x + y) & 1) ? 0.06 : -0.06; // dithering
    g.fillStyle = pal[clamp(Math.floor(v * 4), 0, 3)];
    g.fillRect(x, y, 1, 1);
  }
  return c;
}
const planetCache = new Map();
function planetSprite(p, r = p.r) {
  const key = p.seed + ':' + r + ':' + p.pal;
  if (!planetCache.has(key)) planetCache.set(key, renderPlanet(r, PLANET_PALS[p.pal], p.seed));
  return planetCache.get(key);
}

/* ------------------------------ fundos ------------------------------ */
function makeMapBg() {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), rng = mulberry32(1234);
  g.fillStyle = '#05050f'; g.fillRect(0, 0, W, H);
  // nebulosas pontilhadas
  const neb = [[120, 200, '#1a0f33'], [360, 70, '#2a0f22'], [260, 160, '#0f1f33']];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    for (const [nx, ny, col] of neb) {
      const d = Math.hypot((x - nx) / 1.6, y - ny);
      const v = 1 - d / 110 + Math.sin(x * 0.07 + y * 0.03) * 0.15;
      if (v > 0 && rng() < v * 0.55) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
    }
  }
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(rng() * W), y = Math.floor(rng() * H), b = rng();
    g.fillStyle = b > 0.9 ? '#ffffff' : b > 0.6 ? '#9aa4d0' : '#3d4470';
    g.fillRect(x, y, 1, 1);
    if (b > 0.97) { g.fillStyle = '#5a6acf'; g.fillRect(x - 1, y, 1, 1); g.fillRect(x + 1, y, 1, 1); g.fillRect(x, y - 1, 1, 1); g.fillRect(x, y + 1, 1, 1); }
  }
  return c;
}
const bgMap = makeMapBg();
const stars = Array.from({ length: 110 }, () => ({ x: rand(W), y: rand(H), z: rand(0.15, 1) }));
function updateStars(dt, speed = 1) {
  for (const s of stars) { s.x -= (15 + 90 * s.z) * dt * speed; if (s.x < 0) { s.x += W; s.y = rand(H); } }
}
function drawStars() {
  for (const s of stars) {
    ctx.fillStyle = s.z > 0.75 ? '#ffffff' : s.z > 0.45 ? '#8a94c0' : '#3d4470';
    ctx.fillRect(Math.round(s.x), Math.round(s.y), s.z > 0.88 ? 2 : 1, 1);
  }
}

/* ------------------------------ dados do jogo ------------------------------ */
const HULLS = {
  falcao: { nome: 'Falcão', desc: 'Caça equilibrado de patrulha.', price: 0, hp: 1, dmg: 1, rate: 1, speed: 1, guns: 0, spr: 'falcao' },
  vespa: { nome: 'Vespa', desc: 'Interceptor veloz, dispara muito rápido.', price: 900, hp: 0.85, dmg: 0.9, rate: 0.68, speed: 1.35, guns: 0, spr: 'vespa' },
  tita: { nome: 'Titã', desc: 'Fragata pesada: casco enorme e +1 canhão.', price: 2400, hp: 1.75, dmg: 1.25, rate: 1.1, speed: 0.85, guns: 1, spr: 'tita' },
};
const UPGRADES = {
  casco: { nome: 'Blindagem', desc: '+25 de casco máximo', max: 8, base: 80 },
  escudo: { nome: 'Escudo', desc: '+20 de escudo regenerável', max: 6, base: 120 },
  laser: { nome: 'Laser', desc: '+3 de dano por disparo', max: 8, base: 100 },
  cadencia: { nome: 'Cadência', desc: 'Dispara 12% mais rápido', max: 6, base: 110 },
  motor: { nome: 'Motor', desc: '+velocidade de manobra', max: 5, base: 70 },
  canhoes: { nome: 'Canhões', desc: '+1 disparo em leque', max: 3, base: 450 },
  ima: { nome: 'Ímã', desc: 'Atrai créditos de mais longe', max: 3, base: 60 },
};
const upCost = (k, lvl) => Math.round(UPGRADES[k].base * Math.pow(1.65, lvl));
const mineCost = p => Math.round(60 * Math.pow(1.75, p.mine));
const defCost = p => Math.round(80 * Math.pow(1.75, p.def));
const xpNeed = lvl => Math.round(80 * Math.pow(lvl, 1.5));
const BOMB_COST = 120, BOMB_MAX = 5, PLANET_MAX = 5;
const ENEMY = 'Império Nyx';

let S = null; // estado salvo
function shipStats() {
  const u = S.ship.up, h = HULLS[S.ship.hull], L = S.pilot.level;
  return {
    maxHp: Math.round((60 + 25 * u.casco + 6 * (L - 1)) * h.hp),
    maxShield: 20 * u.escudo,
    dmg: (6 + 3 * u.laser) * (1 + 0.05 * (L - 1)) * h.dmg,
    cd: 0.3 * Math.pow(0.88, u.cadencia) * h.rate,
    speed: (95 + 14 * u.motor) * h.speed,
    guns: 1 + u.canhoes + h.guns,
    magnet: 30 + 25 * u.ima,
  };
}
const owned = () => S.planets.filter(p => p.owner === 'player');
const incomeOf = p => (0.6 + p.mine * 1.2) * p.rich;
const incomePerSec = () => owned().reduce((a, p) => a + incomeOf(p), 0);
const isAttackable = p => p.owner !== 'player' && p.links.some(id => S.planets[id].owner === 'player');
function conquestDiff(p) {
  if (p.owner === 'neutral') return Math.max(1, p.diff * 0.8);
  return p.diff + p.def * 0.5 + (p.capital ? 1 : 0);
}
const ownerName = o => (o === 'player' ? 'Sua Federação' : o === 'enemy' ? ENEMY : 'Piratas');
const stars5 = d => '★'.repeat(clamp(Math.round(d), 1, 9));

/* ------------------------------ geração da galáxia ------------------------------ */
const MID_NAMES = ['Vega Prime', 'Kepler-9', 'Tártaro', 'Rubra', 'Órion IV', 'Xandar', 'Sílica', 'Hélios', 'Cronos', 'Íris', 'Zênite', 'Umbra'];
function newGame() {
  const seed = (Math.random() * 1e9) | 0, rng = mulberry32(seed);
  const cols = [1, 3, 3, 3, 3, 1];
  const names = MID_NAMES.slice().sort(() => rng() - 0.5);
  const planets = [], colIds = [];
  let id = 0;
  cols.forEach((n, ci) => {
    const ids = [], band = (222 - 42) / n;
    for (let k = 0; k < n; k++) {
      const home = ci === 0, capital = ci === cols.length - 1;
      const x = 34 + ci * (412 / (cols.length - 1)) + (home || capital ? 0 : (rng() - 0.5) * 34);
      const y = n === 1 ? 132 : 42 + band * k + band / 2 + (rng() - 0.5) * band * 0.45;
      const p = {
        id, x: Math.round(x), y: Math.round(y),
        r: home ? 10 : capital ? 12 : 6 + Math.floor(rng() * 4),
        name: home ? 'Aurora' : capital ? 'Nyx' : names.pop(),
        pal: home ? 2 : capital ? 5 : Math.floor(rng() * PLANET_PALS.length),
        seed: (rng() * 1e9) | 0,
        owner: home ? 'player' : ci <= 2 ? 'neutral' : 'enemy',
        mine: home ? 1 : 0,
        def: home ? 1 : capital ? 3 : ci >= 3 ? ci - 2 : 0,
        diff: ci + (capital ? 1 : 0),
        rich: home ? 1.2 : 1 + rng() * 0.6,
        links: [], home, capital,
      };
      planets.push(p); ids.push(id); id++;
    }
    colIds.push(ids);
  });
  const link = (a, b) => { if (a !== b && !planets[a].links.includes(b)) { planets[a].links.push(b); planets[b].links.push(a); } };
  const nearest = (p, ids) => ids.slice().sort((a, b) => dist(p.x, p.y, planets[a].x, planets[a].y) - dist(p.x, p.y, planets[b].x, planets[b].y));
  for (let ci = 0; ci < colIds.length - 1; ci++) {
    const next = colIds[ci + 1];
    for (const a of colIds[ci]) {
      const ns = nearest(planets[a], next);
      link(a, ns[0]);
      if (ns[1] !== undefined && (ci === 0 || rng() < 0.45)) link(a, ns[1]);
    }
    for (const b of next) if (!planets[b].links.some(x => colIds[ci].includes(x))) link(b, nearest(planets[b], colIds[ci])[0]);
    const col = colIds[ci + 1].slice().sort((a, b) => planets[a].y - planets[b].y);
    for (let k = 0; k < col.length - 1; k++) if (rng() < 0.35) link(col[k], col[k + 1]);
  }
  S = {
    v: 1, seed, credits: 150, time: 0,
    pilot: { level: 1, xp: 0 },
    ship: { hull: 'falcao', owned: ['falcao'], up: { casco: 0, escudo: 0, laser: 0, cadencia: 0, motor: 0, canhoes: 0, ima: 0 }, hp: 60, bombs: 1 },
    planets, at: 0, attack: null, nextAttack: 95, nextExpand: 75,
    stats: { kills: 0, conquered: 0, defended: 0, lost: 0 }, won: false,
  };
  S.ship.hp = shipStats().maxHp;
}

/* ------------------------------ salvar / carregar ------------------------------ */
const SAVE_KEY = 'conquista-estelar-v1';
function save() { try { if (S) localStorage.setItem(SAVE_KEY, JSON.stringify(S)); return true; } catch (e) { return false; } }
function loadSave() {
  try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (d && d.v === 1 && Array.isArray(d.planets)) return d; } catch (e) { /* sem save */ }
  return null;
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }

/* ------------------------------ entrada ------------------------------ */
const keys = { left: false, right: false, up: false, down: false, fire: false };
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'fire', KeyJ: 'fire' };
const pointer = { x: W / 2, y: H / 2, down: false, sx: 0, sy: 0 };
addEventListener('keydown', e => {
  Sfx.init();
  if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.repeat) return;
  if (scene === 'combat') {
    if ((e.code === 'KeyB' || e.code === 'KeyK') && !panelOpen) useBomb();
    if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  } else if (scene === 'map') {
    if (e.code === 'Escape' && panelOpen && panelKind !== 'locked') closePanel();
    if (e.code === 'KeyH' && !travel) openHangar();
  }
  if (e.code === 'KeyM') toggleSound();
});
addEventListener('keyup', e => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });
function toLogical(e) {
  const r = cv.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}
cv.addEventListener('pointerdown', e => {
  Sfx.init();
  const p = toLogical(e);
  Object.assign(pointer, p, { down: true, sx: p.x, sy: p.y });
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
});
cv.addEventListener('pointermove', e => Object.assign(pointer, toLogical(e)));
cv.addEventListener('pointerup', e => {
  const p = toLogical(e);
  pointer.down = false;
  if (scene === 'map' && dist(p.x, p.y, pointer.sx, pointer.sy) < 8) mapClick(p.x, p.y);
});
cv.addEventListener('pointercancel', () => { pointer.down = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; pointer.down = false; if (scene === 'combat' && combat && !combat.paused && !combat.over) togglePause(); });

/* ------------------------------ UI HTML: painéis e barra ------------------------------ */
let panelOpen = false, panelKind = null, panelRefresh = null;
function mkBtn({ label, onClick, cls = '', disabled = false, cost }) {
  const e = document.createElement('button');
  e.className = 'btn ' + cls; e.innerHTML = label; e.disabled = disabled;
  if (cost !== undefined) e.dataset.cost = cost;
  e.addEventListener('click', ev => { ev.stopPropagation(); Sfx.init(); if (!e.disabled) { Sfx.click(); onClick(); } });
  return e;
}
function openPanel(title, body, buttons = [], opts = {}) {
  panelEl.innerHTML = '';
  panelRefresh = null;
  const box = document.createElement('div');
  box.className = 'box' + (opts.cls ? ' ' + opts.cls : '');
  if (title) { const h = document.createElement('h2'); h.textContent = title; box.appendChild(h); }
  const b = document.createElement('div'); b.className = 'body';
  if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
  box.appendChild(b);
  if (buttons.length) {
    const row = document.createElement('div'); row.className = 'btns';
    buttons.forEach(bt => row.appendChild(mkBtn(bt)));
    box.appendChild(row);
  }
  panelEl.appendChild(box);
  panelEl.classList.add('show');
  panelOpen = true; panelKind = opts.kind || null;
  return box;
}
function closePanel() { panelEl.classList.remove('show'); panelEl.innerHTML = ''; panelOpen = false; panelKind = null; panelRefresh = null; }
panelEl.addEventListener('click', e => { if (e.target === panelEl && scene === 'map' && panelKind !== 'locked') closePanel(); });

let bombBtn = null, soundBtn = null;
function setBar(mode) {
  barEl.innerHTML = ''; bombBtn = null; soundBtn = null;
  const add = b => { const e = mkBtn(b); barEl.appendChild(e); return e; };
  if (mode === 'title') {
    add({ label: 'Novo jogo', cls: 'go', onClick: () => { if (loadSave()) confirmNew(); else startNew(); } });
    if (loadSave()) add({ label: 'Continuar', onClick: continueGame });
    add({ label: 'Como jogar', onClick: () => openHelp() });
  } else if (mode === 'map') {
    add({ label: 'Hangar', cls: 'go', onClick: () => { if (!travel) openHangar(); } });
    add({ label: 'Base', onClick: () => { if (!travel) openPlanet(S.planets[S.at]); } });
    add({ label: 'Salvar', onClick: () => toast(save() ? 'Jogo salvo!' : 'Falha ao salvar', '#63c74d') });
    soundBtn = add({ label: soundLabel(), onClick: toggleSound });
    add({ label: '?', onClick: () => openHelp() });
  } else if (mode === 'combat') {
    bombBtn = add({ label: bombLabel(), cls: 'danger small', onClick: useBomb });
    add({ label: 'Pausa', cls: 'small', onClick: togglePause });
  }
}
const soundLabel = () => 'Som: ' + (Sfx.on ? 'ON' : 'OFF');
const bombLabel = () => 'Bomba x' + (S ? S.ship.bombs : 0);
function toggleSound() { Sfx.on = !Sfx.on; if (soundBtn) soundBtn.innerHTML = soundLabel(); }

/* ------------------------------ toasts (mensagens no mapa) ------------------------------ */
const toasts = [];
function toast(msg, col = '#ffffff') { toasts.unshift({ msg, col, t: 4 }); if (toasts.length > 5) toasts.pop(); }
function updateToasts(dt) { for (let i = toasts.length - 1; i >= 0; i--) if ((toasts[i].t -= dt) <= 0) toasts.splice(i, 1); }
function drawToasts(y0) {
  toasts.forEach((t, i) => {
    if (Math.floor(t.t * 10) % 2 === 0 && t.t < 0.6) return;
    const s = plain(t.msg); ctx.font = `8px ${FONT}`;
    const w = ctx.measureText(s).width + 8;
    ctx.fillStyle = 'rgba(5,5,20,0.8)'; ctx.fillRect(4, y0 + i * 13, w, 12);
    text(s, 8, y0 + 2 + i * 13, t.col);
  });
}

/* ------------------------------ progressão do piloto ------------------------------ */
function addXP(n) {
  S.pilot.xp += n;
  while (S.pilot.xp >= xpNeed(S.pilot.level)) {
    S.pilot.xp -= xpNeed(S.pilot.level);
    S.pilot.level++;
    const st = shipStats();
    S.ship.hp = st.maxHp;
    if (combat) { combat.st = st; combat.p.hp = st.maxHp; addFloat(combat.p.x, combat.p.y - 14, 'NIVEL ' + S.pilot.level + '!', '#55ffff'); }
    toast('Piloto subiu para o nível ' + S.pilot.level + '!', '#55ffff');
    Sfx.level();
  }
}

/* =====================================================================
   CENAS
   ===================================================================== */
let scene = 'title', travel = null, combat = null, hoverPlanet = null, sceneT = 0;

function startNew() { closePanel(); newGame(); save(); enterMap(); openHelp(true); }
function continueGame() { const d = loadSave(); if (!d) return; S = d; if (S.attack) S.attack.engaged = false; enterMap(); toast('Bem-vindo de volta, comandante!', '#63c74d'); }
function confirmNew() {
  openPanel('NOVO JOGO?', '<p>Já existe uma campanha salva. Começar outra vai <span class="red">apagar</span> o progresso atual.</p>', [
    { label: 'Cancelar', onClick: closePanel },
    { label: 'Apagar e começar', cls: 'danger', onClick: startNew },
  ]);
}
function enterMap() { scene = 'map'; sceneT = 0; setBar('map'); }
function toTitle() { closePanel(); save(); scene = 'title'; combat = null; travel = null; setBar('title'); }

function openHelp(intro = false) {
  const html = `
    ${intro ? '<p>Comandante, a Federação começa com um único planeta: <b class="green">Aurora</b>. O <b class="red">Império Nyx</b> domina o lado leste da galáxia e vai se expandir. Conquiste, fortaleça e proteja seus mundos!</p>' : ''}
    <div class="sec">OBJETIVO</div>
    <p>Conquiste planetas vizinhos, aprimore minas e defesas, melhore sua nave e destrua a capital <b class="red">Nyx</b>.</p>
    <div class="sec">NO MAPA</div>
    <div class="keys">
      <b>Clique</b><span>em um planeta para ver opções</span>
      <b>Anel amarelo</b><span>planeta que pode ser invadido</span>
      <b>H</b><span>abre o Hangar (naves e upgrades)</span>
      <b>Minas</b><span>geram créditos por segundo</span>
      <b>Defesas</b><span>torretas que ajudam e resistem a ataques</span>
    </div>
    <div class="sec">EM COMBATE</div>
    <div class="keys">
      <b>WASD / Setas</b><span>mover a nave</span>
      <b>Espaço / J</b><span>atirar</span>
      <b>B / K</b><span>bomba de pulso (limpa a tela)</span>
      <b>Esc / P</b><span>pausar / recuar</span>
      <b>Mouse / Toque</b><span>segure para mover e atirar</span>
    </div>
    <p class="muted" style="margin-top:.8em">O jogo é salvo automaticamente neste navegador.</p>`;
  openPanel(intro ? 'MISSÃO' : 'COMO JOGAR', html, [{ label: intro ? 'Vamos lá!' : 'Fechar', cls: 'go', onClick: closePanel }]);
}

/* ------------------------------ MAPA ------------------------------ */
function shipMapPos() {
  const t = performance.now() / 1000;
  if (travel) {
    const k = clamp(travel.t / travel.dur, 0, 1), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const tx = travel.to.x - travel.to.r - 8, ty = travel.to.y - travel.to.r - 4;
    return { x: travel.fx + (tx - travel.fx) * e, y: travel.fy + (ty - travel.fy) * e, flip: tx < travel.fx };
  }
  const p = S.planets[S.at];
  return { x: p.x - p.r - 8, y: p.y - p.r - 4 + Math.round(Math.sin(t * 2)), flip: false };
}
function travelTo(p, then) {
  closePanel();
  const from = shipMapPos();
  travel = { fx: from.x, fy: from.y, to: p, t: 0, dur: clamp(dist(from.x, from.y, p.x, p.y) / 170, 0.35, 1.5), then };
  Sfx.tone(220, 0.4, 'sawtooth', 0.03, 400);
}
function updateTravel(dt) {
  if (!travel) return;
  travel.t += dt;
  if (travel.t < travel.dur) return;
  const tr = travel; travel = null;
  if (tr.then === 'dock') { S.at = tr.to.id; toast('Atracado em ' + tr.to.name); }
  else if (tr.then === 'conquer') startCombat('conquer', tr.to, conquestDiff(tr.to));
  else if (tr.then === 'defend' && S.attack) startCombat('defend', tr.to, S.attack.str);
}

let saveTimer = 0;
function updateWorld(dt) {
  S.time += dt;
  S.credits += incomePerSec() * dt;
  const st = shipStats();
  if (!travel && S.planets[S.at].owner === 'player') S.ship.hp = Math.min(st.maxHp, S.ship.hp + 1.5 * dt);
  const enemyAlive = S.planets.some(p => p.owner === 'enemy');
  if (enemyAlive) {
    if (!S.attack) {
      S.nextAttack -= dt;
      if (S.nextAttack <= 0) { S.nextAttack = rand(55, 85); launchAttack(); }
    } else if (!S.attack.engaged) {
      S.attack.t -= dt;
      if (S.attack.t <= 0) autoResolve();
    }
    S.nextExpand -= dt;
    if (S.nextExpand <= 0) { S.nextExpand = rand(80, 120); enemyExpand(); }
  }
  if ((saveTimer += dt) > 15) { saveTimer = 0; save(); }
}
function launchAttack() {
  const targets = owned().filter(p => p.links.some(id => S.planets[id].owner === 'enemy'));
  if (!targets.length) return;
  const p = pick(targets);
  const src = Math.max(...p.links.map(id => S.planets[id]).filter(q => q.owner === 'enemy').map(q => q.diff));
  const str = clamp(src - 1 + Math.floor(S.time / 240), 1, 9);
  S.attack = { pid: p.id, str, t: 35, engaged: false };
  Sfx.alarm();
  toast('ALERTA: ' + p.name + ' sob ataque!', '#ff5050');
  if (!travel) openAlert();
}
const defendChance = (p, str) => { const pw = 0.8 + p.def * 1.5; return pw / (pw + str); };
function openAlert() {
  if (!S.attack) return;
  const p = S.planets[S.attack.pid], ch = Math.round(defendChance(p, S.attack.str) * 100);
  openPanel('⚠ ATAQUE INIMIGO!', `
    <p>Uma frota do <b class="red">${ENEMY}</b> está atacando <b class="green">${p.name}</b>!</p>
    <p>Força da frota: <span class="red">${stars5(S.attack.str)}</span><br>Defesa do planeta: <span class="cyan">Nv ${p.def}</span></p>
    <p>Se você não intervir, as defesas têm <b class="${ch >= 50 ? 'green' : 'red'}">${ch}%</b> de chance de resistir sozinhas.</p>
    <p class="muted">Ao defender pessoalmente, as torretas do planeta lutam ao seu lado.</p>`, [
    { label: `Confiar nas defesas (${ch}%)`, onClick: closePanel },
    { label: 'Defender!', cls: 'go', onClick: engageDefense },
  ]);
}
function engageDefense() {
  if (!S.attack) return;
  S.attack.engaged = true;
  travelTo(S.planets[S.attack.pid], 'defend');
}
function autoResolve() {
  const a = S.attack; if (!a) return;
  S.attack = null;
  const p = S.planets[a.pid];
  if (p.owner !== 'player') return;
  if (Math.random() < defendChance(p, a.str)) {
    toast('As defesas de ' + p.name + ' repeliram o ataque!', '#63c74d');
    S.stats.defended++;
  } else {
    loseP(p);
    toast(p.name + ' caiu nas mãos do inimigo!', '#ff5050');
    Sfx.bad();
  }
  if (panelKind === 'alert') closePanel();
  checkEnd();
}
function loseP(p) {
  p.owner = 'enemy'; p.mine = Math.max(0, p.mine - 1); p.def = 1;
  S.stats.lost++;
  relocate();
}
function relocate() {
  if (S.planets[S.at].owner === 'player') return;
  const mine = owned(); if (!mine.length) return;
  const here = S.planets[S.at];
  mine.sort((a, b) => dist(a.x, a.y, here.x, here.y) - dist(b.x, b.y, here.x, here.y));
  S.at = mine[0].id;
}
function enemyExpand() {
  const cands = S.planets.filter(p => p.owner === 'neutral' && p.links.some(id => S.planets[id].owner === 'enemy'));
  if (cands.length) {
    const p = pick(cands);
    p.owner = 'enemy'; p.def = Math.max(1, p.def);
    toast('O ' + ENEMY + ' tomou ' + p.name + '!', '#e43b44');
  }
  const enemies = S.planets.filter(p => p.owner === 'enemy' && p.def < PLANET_MAX);
  if (enemies.length && Math.random() < 0.5) pick(enemies).def++;
}
function checkEnd() {
  if (!owned().length) { gameOver(); return true; }
  if (!S.won && !S.planets.some(p => p.owner === 'enemy')) { S.won = true; save(); victory(); return true; }
  return false;
}
function victory() {
  Sfx.level();
  openPanel('★ VITÓRIA! ★', `
    <p>O <b class="red">${ENEMY}</b> caiu! A galáxia está sob a proteção da Federação.</p>
    <p>Tempo de campanha: <b>${Math.floor(S.time / 60)} min</b><br>
    Planetas conquistados: <b class="green">${S.stats.conquered}</b><br>
    Ataques repelidos: <b class="cyan">${S.stats.defended}</b><br>
    Inimigos abatidos: <b class="gold">${S.stats.kills}</b><br>
    Nível do piloto: <b>${S.pilot.level}</b></p>
    <p class="muted">Você pode continuar jogando para conquistar os planetas piratas restantes.</p>`, [
    { label: 'Menu', onClick: toTitle },
    { label: 'Continuar', cls: 'go', onClick: closePanel },
  ], { kind: 'locked' });
}
function gameOver() {
  Sfx.bad();
  clearSave();
  openPanel('FIM DE JOGO', `
    <p>Todos os planetas da Federação foram tomados pelo <b class="red">${ENEMY}</b>.</p>
    <p>Você resistiu por <b>${Math.floor(S.time / 60)} min</b>, conquistou <b class="green">${S.stats.conquered}</b> planetas e abateu <b class="gold">${S.stats.kills}</b> inimigos.</p>`, [
    { label: 'Menu', onClick: () => { S = null; closePanel(); scene = 'title'; setBar('title'); } },
    { label: 'Tentar de novo', cls: 'go', onClick: startNew },
  ], { kind: 'locked' });
}

function mapClick(x, y) {
  if (travel || panelOpen) return;
  const p = S.planets.find(q => dist(x, y, q.x, q.y) < q.r + 6);
  if (p) { Sfx.click(); if (S.attack && S.attack.pid === p.id && !S.attack.engaged) openAlert(); else openPlanet(p); }
}

function pipsHtml(n, max) { let s = '<span class="pips">'; for (let i = 0; i < max; i++) s += `<i class="${i < n ? 'on' : ''}"></i>`; return s + '</span>'; }
function openPlanet(p) {
  const root = document.createElement('div');
  const st = shipStats(), hpPct = Math.round((S.ship.hp / st.maxHp) * 100);
  const btns = [{ label: 'Fechar', onClick: closePanel }];
  const color = p.owner === 'player' ? 'green' : p.owner === 'enemy' ? 'red' : 'muted';
  let html = `<p>Dono: <b class="${color}">${ownerName(p.owner)}</b>${p.capital ? ' <span class="gold">(CAPITAL)</span>' : ''}${p.home ? ' <span class="gold">(SEDE)</span>' : ''}</p>`;
  if (p.owner === 'player') {
    html += `<p>Renda: <b class="gold">+${incomeOf(p).toFixed(1)}/s</b> &nbsp; Riqueza: x${p.rich.toFixed(2)}</p>`;
    root.innerHTML = html;
    const mk = (name, lvl, desc, cost, onBuy) => {
      const row = document.createElement('div'); row.className = 'row';
      row.innerHTML = `<div><div class="name">${name}${pipsHtml(lvl, PLANET_MAX)}</div><div class="desc">${desc}</div></div>`;
      const maxed = lvl >= PLANET_MAX;
      row.appendChild(mkBtn({ label: maxed ? 'MÁX' : '$' + fmt(cost), cls: 'small', disabled: maxed || S.credits < cost, cost: maxed ? undefined : cost, onClick: onBuy }));
      root.appendChild(row);
    };
    mk('Mina', p.mine, `+${(1.2 * p.rich).toFixed(1)} créditos/s por nível`, mineCost(p), () => { const c = mineCost(p); if (S.credits >= c) { S.credits -= c; p.mine++; Sfx.buy(); openPlanet(p); } });
    mk('Defesa', p.def, 'Torretas automáticas e resistência a invasões', defCost(p), () => { const c = defCost(p); if (S.credits >= c) { S.credits -= c; p.def++; Sfx.buy(); openPlanet(p); } });
    if (S.at !== p.id) btns.push({ label: 'Viajar até aqui', onClick: () => travelTo(p, 'dock') });
    else root.insertAdjacentHTML('beforeend', '<p class="muted" style="margin-top:.8em">Sua nave está atracada aqui e se repara lentamente.</p>');
    if (S.attack && S.attack.pid === p.id && !S.attack.engaged) btns.push({ label: 'Defender!', cls: 'go', onClick: engageDefense });
  } else {
    const d = conquestDiff(p);
    html += `<p>Ameaça: <span class="red">${stars5(d)}</span><br>Defesas: <span class="cyan">Nv ${p.def}</span><br>Recompensa estimada: <span class="gold">$${fmt(40 * d + (p.capital ? 600 : 0))}</span> + XP</p>`;
    if (p.capital) html += '<p class="red">A capital é protegida pela nau-capitânia do Império!</p>';
    if (isAttackable(p)) {
      if (hpPct < 50) html += `<p class="red">Atenção: casco em ${hpPct}%. Repare no Hangar antes!</p>`;
      btns.push({ label: 'Invadir!', cls: 'danger', onClick: () => travelTo(p, 'conquer') });
    } else {
      html += '<p class="muted">Fora de alcance: conquiste um planeta vizinho primeiro.</p>';
    }
    root.innerHTML = html;
  }
  const prev = panelEl.querySelector('.body');
  const scroll = prev ? prev.scrollTop : 0;
  openPanel(plain(p.name), root, btns, { kind: 'planet' });
  panelEl.querySelector('.body').scrollTop = scroll;
  panelRefresh = () => root.querySelectorAll('[data-cost]').forEach(b => { b.disabled = S.credits < +b.dataset.cost; });
}

function openHangar() {
  const prev = panelKind === 'hangar' ? panelEl.querySelector('.body') : null;
  const scroll = prev ? prev.scrollTop : 0;
  const st = shipStats(), h = HULLS[S.ship.hull], root = document.createElement('div');
  const top = document.createElement('div'); top.className = 'stats';
  const pv = document.createElement('canvas'), spr = SPR[h.spr];
  pv.width = spr.width + 2; pv.height = spr.height + 2;
  pv.getContext('2d').drawImage(spr, 1, 1);
  pv.style.width = (pv.width * 0.45) + 'em';
  top.appendChild(pv);
  const dl = document.createElement('div');
  dl.innerHTML = `<div class="name gold">${h.nome}</div>
    <dl>
      <dt>Casco</dt><dd><span id="hpv">${Math.round(S.ship.hp)}</span>/${st.maxHp}</dd>
      <dt>Escudo</dt><dd>${st.maxShield}</dd>
      <dt>Dano</dt><dd>${st.dmg.toFixed(1)}</dd>
      <dt>Disparos/s</dt><dd>${(1 / st.cd).toFixed(1)}</dd>
      <dt>Canhões</dt><dd>${st.guns}</dd>
      <dt>Velocidade</dt><dd>${Math.round(st.speed)}</dd>
      <dt>Bombas</dt><dd>${S.ship.bombs}/${BOMB_MAX}</dd>
      <dt>Créditos</dt><dd class="gold" id="crv">$${fmt(S.credits)}</dd>
    </dl>`;
  top.appendChild(dl);
  root.appendChild(top);

  const sec = t => { const d = document.createElement('div'); d.className = 'sec'; d.textContent = t; root.appendChild(d); };
  const row = (nameHtml, desc, btn) => {
    const r = document.createElement('div'); r.className = 'row';
    r.innerHTML = `<div><div class="name">${nameHtml}</div><div class="desc">${desc}</div></div>`;
    r.appendChild(mkBtn(btn)); root.appendChild(r);
  };
  const buy = (cost, fn) => () => { if (S.credits < cost) return; S.credits -= cost; fn(); Sfx.buy(); openHangar(); };

  sec('SERVIÇOS');
  const missing = Math.max(0, st.maxHp - S.ship.hp), repair = Math.ceil(missing * 0.5);
  row('Reparar casco', missing > 0 ? `Restaura ${Math.ceil(missing)} pontos de casco` : 'Casco intacto',
    { label: missing > 0 ? '$' + fmt(repair) : 'OK', cls: 'small', disabled: missing <= 0 || S.credits < repair, cost: missing > 0 ? repair : undefined, onClick: buy(repair, () => { S.ship.hp = st.maxHp; }) });
  const bFull = S.ship.bombs >= BOMB_MAX;
  row('Bomba de pulso', 'Destrói projéteis e causa dano em todos os inimigos',
    { label: bFull ? 'MÁX' : '$' + BOMB_COST, cls: 'small', disabled: bFull || S.credits < BOMB_COST, cost: bFull ? undefined : BOMB_COST, onClick: buy(BOMB_COST, () => { S.ship.bombs++; }) });

  sec('APRIMORAMENTOS');
  for (const k in UPGRADES) {
    const u = UPGRADES[k], lvl = S.ship.up[k], maxed = lvl >= u.max, c = upCost(k, lvl);
    row(u.nome + pipsHtml(lvl, u.max), u.desc, {
      label: maxed ? 'MÁX' : '$' + fmt(c), cls: 'small', disabled: maxed || S.credits < c, cost: maxed ? undefined : c,
      onClick: buy(c, () => {
        const before = shipStats().maxHp;
        S.ship.up[k]++;
        S.ship.hp += Math.max(0, shipStats().maxHp - before);
      }),
    });
  }

  sec('NAVES');
  for (const k in HULLS) {
    const hh = HULLS[k], has = S.ship.owned.includes(k), cur = S.ship.hull === k;
    const desc = `${hh.desc} Casco x${hh.hp} · Dano x${hh.dmg} · Vel x${hh.speed}`;
    const swap = () => { S.ship.hull = k; S.ship.hp = Math.min(S.ship.hp, shipStats().maxHp); };
    if (cur) row(hh.nome, desc, { label: 'Em uso', cls: 'small', disabled: true, onClick: () => {} });
    else if (has) row(hh.nome, desc, { label: 'Usar', cls: 'small go', onClick: () => { swap(); Sfx.buy(); openHangar(); } });
    else row(hh.nome, desc, { label: '$' + fmt(hh.price), cls: 'small', disabled: S.credits < hh.price, cost: hh.price, onClick: buy(hh.price, () => { S.ship.owned.push(k); swap(); S.ship.hp = shipStats().maxHp; }) });
  }

  openPanel('HANGAR', root, [{ label: 'Fechar', onClick: closePanel }], { cls: 'wide', kind: 'hangar' });
  panelEl.querySelector('.body').scrollTop = scroll;
  const crv = root.querySelector('#crv'), hpv = root.querySelector('#hpv');
  panelRefresh = () => {
    crv.textContent = '$' + fmt(S.credits);
    hpv.textContent = Math.round(S.ship.hp);
    root.querySelectorAll('[data-cost]').forEach(b => { b.disabled = S.credits < +b.dataset.cost; });
  };
}

function drawMap() {
  ctx.drawImage(bgMap, 0, 0);
  const t = performance.now() / 1000;
  // rotas
  const done = new Set();
  for (const p of S.planets) for (const id of p.links) {
    const k = Math.min(p.id, id) + '-' + Math.max(p.id, id);
    if (done.has(k)) continue; done.add(k);
    const q = S.planets[id], pp = p.owner === 'player', qp = q.owner === 'player';
    if (pp && qp) pline(p.x, p.y, q.x, q.y, '#2e6b3a');
    else if (pp !== qp) pline(p.x, p.y, q.x, q.y, '#8a7a2a', 3, Math.floor(t * 8));
    else pline(p.x, p.y, q.x, q.y, '#262b4a', 2);
  }
  // planetas
  for (const p of S.planets) {
    const spr = planetSprite(p);
    ctx.drawImage(spr, Math.round(p.x - spr.width / 2), Math.round(p.y - spr.height / 2));
    const ring = p.owner === 'player' ? '#63c74d' : p.owner === 'enemy' ? '#e43b44' : '#7a7a8a';
    const underAtk = S.attack && S.attack.pid === p.id;
    if (underAtk) {
      if (Math.floor(t * 4) % 2 === 0) pcircle(p.x, p.y, p.r + 3, '#ff3030');
      pcircle(p.x, p.y, p.r + 6, '#ff5050', 2, Math.floor(t * 10));
      text('!', p.x + 1, p.y - p.r - 17, '#ff5050', 'center');
    } else pcircle(p.x, p.y, p.r + 3, ring, p.owner === 'neutral' ? 2 : 0);
    if (isAttackable(p) && !underAtk) pcircle(p.x, p.y, p.r + 6, '#feae34', 2, Math.floor(t * 6));
    if (p === hoverPlanet) pcircle(p.x, p.y, p.r + 9, '#ffffff', 1, Math.floor(t * 10));
    if (p.capital || p.home) { // coroa
      ctx.fillStyle = p.capital ? '#e43b44' : '#feae34';
      const cx = p.x, cy = p.y - p.r - 8;
      ctx.fillRect(cx - 3, cy + 1, 7, 2); ctx.fillRect(cx - 3, cy - 1, 1, 2); ctx.fillRect(cx, cy - 2, 1, 3); ctx.fillRect(cx + 3, cy - 1, 1, 2);
    }
    const py = p.y + p.r + 6, w = Math.max(p.mine, p.def) * 3;
    for (let i = 0; i < p.mine; i++) { ctx.fillStyle = '#feae34'; ctx.fillRect(p.x - w / 2 + i * 3, py, 2, 2); }
    for (let i = 0; i < p.def; i++) { ctx.fillStyle = '#55ffff'; ctx.fillRect(p.x - w / 2 + i * 3, py + 3, 2, 2); }
  }
  // nave do jogador
  const sp = shipMapPos(), spr = SPR[HULLS[S.ship.hull].spr];
  drawSpr(spr, sp.x, sp.y, sp.flip);
  if (travel && Math.random() < 0.8) { ctx.fillStyle = pick(['#f77622', '#feae34']); ctx.fillRect(Math.round(sp.x + (sp.flip ? spr.width / 2 : -spr.width / 2 - 2)), Math.round(sp.y), 2, 1); }
  // tooltip
  if (hoverPlanet && !panelOpen) {
    const p = hoverPlanet, l1 = plain(p.name), l2 = plain(ownerName(p.owner));
    const l3 = p.owner === 'player' ? '+' + incomeOf(p).toFixed(1) + '/S' : 'AMEACA ' + conquestDiff(p).toFixed(1);
    ctx.font = `8px ${FONT}`;
    const w = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width, ctx.measureText(l3).width) + 10;
    let x = p.x + p.r + 10, y = p.y - 18;
    if (x + w > W - 4) x = p.x - p.r - 10 - w;
    y = clamp(y, 18, H - 50);
    ctx.fillStyle = 'rgba(10,12,32,0.92)'; ctx.fillRect(x, y, w, 36);
    ctx.fillStyle = '#5a6acf'; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + 35, w, 1); ctx.fillRect(x, y, 1, 36); ctx.fillRect(x + w - 1, y, 1, 36);
    text(l1, x + 5, y + 4, '#feae34');
    text(l2, x + 5, y + 14, p.owner === 'player' ? '#63c74d' : p.owner === 'enemy' ? '#e43b44' : '#9a9aa8');
    text(l3, x + 5, y + 24, '#c0cbdc');
  }
  drawMapHud();
}
function drawMapHud() {
  const st = shipStats();
  ctx.fillStyle = 'rgba(6,6,20,0.9)'; ctx.fillRect(0, 0, W, 14);
  ctx.fillStyle = '#3a3f6a'; ctx.fillRect(0, 14, W, 1);
  text('$' + fmt(S.credits), 4, 3, '#feae34');
  text('+' + incomePerSec().toFixed(1) + '/S', 92, 3, '#a8884a');
  text('PIL ' + S.pilot.level, 176, 3, '#55ffff');
  bar(236, 5, 40, 4, S.pilot.xp / xpNeed(S.pilot.level), '#55ffff');
  text('CASCO', 290, 3, '#c0cbdc');
  bar(334, 5, 50, 4, S.ship.hp / st.maxHp, S.ship.hp / st.maxHp > 0.35 ? '#63c74d' : '#e43b44');
  text(owned().length + '/' + S.planets.length, 476, 3, '#63c74d', 'right');
  let y0 = 20;
  if (S.attack) {
    const p = S.planets[S.attack.pid];
    if (Math.floor(performance.now() / 300) % 2 === 0 || S.attack.engaged) {
      ctx.fillStyle = 'rgba(80,0,0,0.85)'; ctx.fillRect(0, 15, W, 12);
      text(S.attack.engaged ? 'A CAMINHO DE ' + p.name : 'ATAQUE EM ' + p.name + '! ' + Math.ceil(S.attack.t) + 'S - CLIQUE NO PLANETA', W / 2, 17, '#ffd0d0', 'center');
    }
    y0 = 32;
  }
  drawToasts(y0);
}

/* ------------------------------ COMBATE ------------------------------ */
const PLANET_CX = -70, PLANET_R = 110;
function startCombat(mode, planet, d) {
  closePanel();
  const st = shipStats(), s = 1 + 0.35 * (d - 1);
  const nW = 2 + Math.floor(d / 2), waves = [];
  for (let i = 0; i < nW; i++) {
    const n = 4 + Math.floor(d * 1.5) + i * 2, q = [];
    for (let k = 0; k < n; k++) {
      const r = Math.random();
      q.push(d >= 2 && r < 0.06 + 0.035 * d ? 'tank' : r < 0.3 + 0.06 * d ? 'fighter' : 'drone');
    }
    waves.push(q);
  }
  if (mode === 'conquer' && planet.capital) waves.push(['boss']);
  const C = {
    mode, planet, d, s, waves, wave: -1, queue: [], spawnT: 0, betweenT: 1.2, banner: null,
    enemies: [], pb: [], eb: [], parts: [], picks: [], floats: [],
    p: { x: mode === 'defend' ? 90 : 60, y: H / 2, hp: Math.min(S.ship.hp, st.maxHp), sh: st.maxShield, cd: 0, inv: 1.2, shT: 0 },
    st, earned: 0, kills: 0, time: 0, shake: 0, flash: 0, over: null, overT: 0, paused: false, boss: null,
    planetHP: 0, planetMax: 0, turrets: [],
  };
  if (mode === 'defend') {
    C.planetMax = C.planetHP = 120 + planet.def * 70;
    const n = planet.def;
    for (let i = 0; i < n; i++) {
      const a = n === 1 ? 0 : -0.75 + (1.5 * i) / (n - 1);
      C.turrets.push({ x: PLANET_CX + Math.cos(a) * (PLANET_R + 1), y: H / 2 + Math.sin(a) * (PLANET_R + 1), cd: rand(0.3, 1), dmg: 6 + 4 * planet.def });
    }
  }
  combat = C; scene = 'combat'; sceneT = 0; setBar('combat');
  Sfx.tone(110, 0.6, 'sawtooth', 0.05, 330);
}
function spawnEnemy(type) {
  const C = combat, s = C.s;
  const e = { type, x: W + 14, y: rand(30, H - 22), vx: 0, vy: 0, t: rand(10), cd: rand(0.8, 1.8), hit: 0 };
  if (type === 'drone') Object.assign(e, { hp: 10 * s, r: 4, spd: 55 + 7 * C.d, cdmg: 9 * s, spr: 'drone', xp: 3, coin: 2 });
  else if (type === 'fighter') Object.assign(e, { hp: 20 * s, r: 5, spd: 75, cdmg: 12 * s, spr: 'fighter', xp: 6, coin: 4, tx: rand(W * 0.55, W - 40) });
  else if (type === 'tank') Object.assign(e, { hp: 70 * s, r: 7, spd: 28, cdmg: 20 * s, spr: 'tank', xp: 15, coin: 10, tx: rand(W * 0.62, W - 50) });
  else if (type === 'boss') { Object.assign(e, { hp: 700 * s, r: 22, spd: 30, cdmg: 30 * s, boss: true, xp: 220, coin: 160, tx: W - 70, y: H / 2, x: W + 40, burst: 2.5, summon: 6 }); C.boss = e; }
  e.maxHp = e.hp;
  C.enemies.push(e);
}
function eShot(x, y, a, spd, dmg, col = '#f77622', size = 3) {
  combat.eb.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, dmg, col, size });
}
function burst(x, y, n, cols, spd = 60, life = 0.5) {
  for (let i = 0; i < n; i++) {
    const a = rand(Math.PI * 2), v = rand(spd * 0.2, spd);
    combat.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(life * 0.5, life), max: life, col: pick(cols), size: Math.random() < 0.3 ? 2 : 1 });
  }
}
function addFloat(x, y, s, col) { combat.floats.push({ x, y, s, col, t: 1 }); }
function fire() {
  const C = combat, p = C.p, st = C.st, n = st.guns;
  for (let i = 0; i < n; i++) {
    const a = (i - (n - 1) / 2) * 0.11;
    C.pb.push({ x: p.x + 6, y: p.y + (n > 1 ? 0 : 0), vx: Math.cos(a) * 320, vy: Math.sin(a) * 320, dmg: st.dmg, col: '#55ffff' });
  }
  Sfx.shoot();
}
function useBomb() {
  const C = combat;
  if (!C || C.over || C.paused || S.ship.bombs <= 0) return;
  S.ship.bombs--;
  C.eb.length = 0; C.flash = 0.35; C.shake = 6;
  for (const e of C.enemies) { e.hp -= 40 * C.st.dmg / 6; e.hit = 0.15; if (e.hp <= 0) kill(e, true); }
  burst(C.p.x, C.p.y, 40, ['#ffffff', '#55ffff', '#5a6acf'], 220, 0.7);
  Sfx.boom(true);
  if (bombBtn) bombBtn.innerHTML = bombLabel();
}
function hurtPlayer(dmg) {
  const C = combat, p = C.p;
  if (p.inv > 0 || C.over) return;
  p.inv = 0.6; p.shT = 2.5;
  if (p.sh > 0) { const a = Math.min(p.sh, dmg); p.sh -= a; dmg -= a; burst(p.x, p.y, 6, ['#55ffff', '#ffffff'], 60, 0.3); }
  p.hp -= dmg; C.shake = 4; Sfx.hit();
  if (p.hp <= 0) {
    p.hp = 0; C.over = 'lose'; C.overT = 2;
    burst(p.x, p.y, 50, ['#feae34', '#f77622', '#e43b44', '#ffffff'], 120, 1.2); Sfx.boom(true);
  }
}
function kill(e, reward) {
  if (e.dead) return;
  const C = combat;
  e.dead = true;
  burst(e.x, e.y, e.boss ? 80 : 14 + e.r * 2, ['#feae34', '#f77622', '#e43b44', '#ffffff'], e.boss ? 160 : 80, e.boss ? 1.4 : 0.6);
  Sfx.boom(e.boss || e.type === 'tank');
  if (e.boss) { C.shake = 10; C.flash = 0.4; C.boss = null; }
  if (!reward) return;
  C.kills++; S.stats.kills++;
  addXP(Math.round(e.xp * C.s));
  const val = Math.round(e.coin * (1 + 0.3 * C.d));
  const coins = Math.min(6, Math.ceil(val / 4));
  for (let i = 0; i < coins; i++) C.picks.push({ kind: 'coin', x: e.x + rand(-6, 6), y: e.y + rand(-6, 6), vx: rand(-30, 30), vy: rand(-30, 30), val: Math.ceil(val / coins), t: 10 });
  if (Math.random() < 0.06 || e.boss) C.picks.push({ kind: 'heart', x: e.x, y: e.y, vx: -10, vy: 0, val: 15, t: 10 });
}
function togglePause() {
  const C = combat;
  if (!C || C.over) return;
  if (C.paused) { C.paused = false; closePanel(); return; }
  C.paused = true;
  const retreatTxt = C.mode === 'defend' ? 'Recuar deixa o planeta por conta das próprias defesas.' : 'Recuar cancela a invasão (sem penalidade).';
  openPanel('PAUSADO', `<p>${retreatTxt}</p>`, [
    { label: 'Recuar', cls: 'danger', onClick: () => { closePanel(); C.paused = false; C.over = 'retreat'; C.overT = 0; } },
    { label: 'Continuar', cls: 'go', onClick: () => { C.paused = false; closePanel(); } },
  ], { kind: 'locked' });
}

function updateCombat(dt) {
  const C = combat;
  if (C.paused) return;
  C.time += dt;
  C.shake = Math.max(0, C.shake - dt * 20);
  C.flash = Math.max(0, C.flash - dt);
  updateStars(dt, 2.2);
  updateFx(dt);
  if (C.over) {
    C.overT -= dt;
    if (C.overT <= 0) finishCombat();
    return;
  }
  const p = C.p, st = C.st;

  // movimento
  let mx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), my = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  if (mx && my) { mx *= 0.7071; my *= 0.7071; }
  if (pointer.down && !panelOpen) {
    const dx = pointer.x - p.x, dy = pointer.y - p.y, dd = Math.hypot(dx, dy);
    if (dd > 2) { const k = Math.min(1, dd / 14); mx = (dx / dd) * k; my = (dy / dd) * k; }
  }
  p.x = clamp(p.x + mx * st.speed * dt, C.mode === 'defend' ? 50 : 8, W - 8);
  p.y = clamp(p.y + my * st.speed * dt, 20, H - 8);

  // tiro
  p.cd -= dt;
  if ((keys.fire || (pointer.down && !panelOpen)) && p.cd <= 0) { p.cd = st.cd; fire(); }
  p.inv -= dt; p.shT -= dt;
  if (p.shT <= 0 && p.sh < st.maxShield) p.sh = Math.min(st.maxShield, p.sh + 10 * dt);

  // ondas
  if (!C.queue.length && !C.enemies.length) {
    C.betweenT -= dt;
    if (C.betweenT <= 0) {
      C.wave++;
      if (C.wave >= C.waves.length) {
        C.over = 'win'; C.overT = 1.6; Sfx.level();
      } else {
        C.queue = C.waves[C.wave].slice();
        const isBoss = C.queue[0] === 'boss';
        C.banner = { s: isBoss ? 'ALERTA: NAU-CAPITANIA!' : 'ONDA ' + (C.wave + 1) + '/' + C.waves.length, t: 1.8, col: isBoss ? '#e43b44' : '#feae34' };
        if (isBoss) Sfx.alarm();
        C.spawnT = 1; C.betweenT = 2;
      }
    }
  } else if (C.queue.length) {
    C.spawnT -= dt;
    if (C.spawnT <= 0) { spawnEnemy(C.queue.shift()); C.spawnT = rand(0.35, 0.9) * Math.max(0.5, 1 - 0.05 * C.d); }
  }
  if (C.banner && (C.banner.t -= dt) <= 0) C.banner = null;

  // inimigos
  const bs = 1 + 0.08 * C.d; // velocidade dos projéteis
  for (const e of C.enemies) {
    e.t += dt; e.hit -= dt; e.cd -= dt;
    const aim = Math.atan2(p.y - e.y, p.x - e.x);
    if (e.type === 'drone') {
      let tx = p.x, ty = p.y;
      if (C.mode === 'defend' && dist(e.x, e.y, p.x, p.y) > 70) { tx = PLANET_CX; ty = H / 2; }
      const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy) || 1;
      e.vx += ((dx / d) * e.spd - e.vx) * 2 * dt; e.vy += ((dy / d) * e.spd - e.vy) * 2 * dt;
    } else if (e.type === 'fighter' || e.type === 'tank') {
      e.vx = e.x > e.tx ? -e.spd : C.mode === 'defend' ? (e.type === 'tank' ? -7 : -12) : 0;
      e.vy = Math.sin(e.t * (e.type === 'tank' ? 0.8 : 1.6)) * e.spd * (e.type === 'tank' ? 0.6 : 0.7);
      if (e.y < 24) e.vy = Math.abs(e.vy); if (e.y > H - 14) e.vy = -Math.abs(e.vy);
      if (e.cd <= 0 && e.x < W - 6) {
        if (e.type === 'fighter') { e.cd = rand(1.4, 2.2); eShot(e.x - 5, e.y, aim, 105 * bs, 5 * C.s); }
        else { e.cd = rand(2, 2.6); for (let k = -1; k <= 1; k++) eShot(e.x - 7, e.y, aim + k * 0.22, 80 * bs, 7 * C.s, '#b55088', 4); }
      }
    } else if (e.type === 'boss') {
      e.vx = e.x > e.tx ? -e.spd : 0;
      e.vy = Math.sin(e.t * 0.7) * 45;
      const rage = e.hp < e.maxHp * 0.5 ? 1.6 : 1;
      if (e.cd <= 0) { e.cd = 1 / rage; for (let k = -1; k <= 1; k++) eShot(e.x - 22, e.y, aim + k * 0.15, 120 * bs, 9 * C.s); }
      e.burst -= dt * rage;
      if (e.burst <= 0) { e.burst = 2.6; const n = 18, off = rand(1); for (let k = 0; k < n; k++) eShot(e.x, e.y, ((k + off) / n) * Math.PI * 2, 70 * bs, 8 * C.s, '#e43b44', 4); }
      e.summon -= dt;
      if (e.summon <= 0) { e.summon = 7 / rage; spawnEnemy('drone'); spawnEnemy('drone'); }
    }
    e.x += e.vx * dt; e.y += e.vy * dt;
    if (dist(e.x, e.y, p.x, p.y) < e.r + 4) { hurtPlayer(e.cdmg); if (!e.boss) kill(e, false); }
    if (C.mode === 'defend' && !e.boss && dist(e.x, e.y, PLANET_CX, H / 2) < PLANET_R + e.r) {
      C.planetHP -= e.cdmg * 1.5; C.shake = 3; kill(e, false);
      if (C.planetHP <= 0) { C.planetHP = 0; C.over = 'planetLost'; C.overT = 2; Sfx.bad(); }
    }
    if (e.x < -30) e.dead = true;
  }
  C.enemies = C.enemies.filter(e => !e.dead);

  // torretas do planeta
  for (const t of C.turrets) {
    t.cd -= dt;
    if (t.cd > 0) continue;
    let best = null, bd = 280;
    for (const e of C.enemies) { const d = dist(t.x, t.y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
    if (best) {
      t.cd = Math.max(0.5, 1.2 - 0.1 * C.planet.def);
      const a = Math.atan2(best.y - t.y, best.x - t.x);
      C.pb.push({ x: t.x, y: t.y, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240, dmg: t.dmg, col: '#63c74d' });
    }
  }

  // projéteis do jogador
  for (const b of C.pb) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x > W + 6 || b.x < -6 || b.y < -6 || b.y > H + 6) { b.dead = true; continue; }
    for (const e of C.enemies) {
      if (e.dead || dist(b.x, b.y, e.x, e.y) > e.r + 2) continue;
      e.hp -= b.dmg; e.hit = 0.07; b.dead = true;
      burst(b.x, b.y, 3, ['#ffffff', b.col], 50, 0.25);
      if (e.hp <= 0) kill(e, true);
      break;
    }
  }
  C.pb = C.pb.filter(b => !b.dead);
  C.enemies = C.enemies.filter(e => !e.dead);

  // projéteis inimigos
  for (const b of C.eb) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < -8 || b.x > W + 8 || b.y < -8 || b.y > H + 8) { b.dead = true; continue; }
    if (dist(b.x, b.y, p.x, p.y) < 4 + b.size / 2) { b.dead = true; hurtPlayer(b.dmg); }
  }
  C.eb = C.eb.filter(b => !b.dead);

  // coletáveis
  for (const k of C.picks) {
    k.t -= dt;
    const d = dist(k.x, k.y, p.x, p.y);
    if (d < st.magnet) { const a = Math.atan2(p.y - k.y, p.x - k.x); k.vx = Math.cos(a) * 200; k.vy = Math.sin(a) * 200; }
    else { k.vx += (-20 - k.vx) * dt * 2; k.vy *= 1 - dt * 2; }
    k.x += k.vx * dt; k.y += k.vy * dt;
    if (d < 8) {
      k.dead = true;
      if (k.kind === 'coin') { S.credits += k.val; C.earned += k.val; addFloat(k.x, k.y - 6, '+' + k.val, '#feae34'); Sfx.coin(); }
      else { p.hp = Math.min(st.maxHp, p.hp + k.val); addFloat(k.x, k.y - 6, '+' + k.val + ' HP', '#63c74d'); Sfx.coin(); }
    }
    if (k.t <= 0 || k.x < -10) k.dead = true;
  }
  C.picks = C.picks.filter(k => !k.dead);
}
function updateFx(dt) {
  const C = combat;
  for (const q of C.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 1 - dt * 2; q.vy *= 1 - dt * 2; q.life -= dt; }
  C.parts = C.parts.filter(q => q.life > 0);
  for (const f of C.floats) { f.y -= 18 * dt; f.t -= dt; }
  C.floats = C.floats.filter(f => f.t > 0);
}

function finishCombat() {
  const C = combat, pl = C.planet, d = C.d, st = shipStats();
  S.ship.hp = clamp(Math.round(C.p.hp), 0, st.maxHp);
  combat = null; scene = 'map'; setBar('map');
  let title, body, cls = 'go';
  if (C.over === 'win' && C.mode === 'conquer') {
    pl.owner = 'player'; pl.def = Math.max(0, pl.def - 1); S.at = pl.id;
    const rew = Math.round(40 * d + (pl.capital ? 600 : 0));
    S.credits += rew; addXP(Math.round(35 * d)); S.stats.conquered++;
    title = 'PLANETA CONQUISTADO!';
    body = `<p><b class="green">${pl.name}</b> agora pertence à Federação.</p>
      <p>Recompensa: <b class="gold">$${fmt(rew)}</b> + <span class="gold">$${fmt(C.earned)}</span> coletados<br>Inimigos abatidos: ${C.kills}</p>
      <p class="muted">Melhore a mina e a defesa do planeta para protegê-lo.</p>`;
  } else if (C.over === 'win') {
    const rew = Math.round(30 * d);
    S.credits += rew; addXP(Math.round(25 * d)); S.stats.defended++; S.attack = null; S.at = pl.id;
    title = 'ATAQUE REPELIDO!';
    body = `<p><b class="green">${pl.name}</b> está a salvo, comandante!</p>
      <p>Recompensa: <b class="gold">$${fmt(rew)}</b> + <span class="gold">$${fmt(C.earned)}</span> coletados<br>Inimigos abatidos: ${C.kills}</p>`;
  } else if (C.over === 'lose') {
    const lost = Math.floor(S.credits * 0.15);
    S.credits -= lost; S.ship.hp = Math.ceil(st.maxHp * 0.5);
    title = 'NAVE DESTRUÍDA'; cls = 'danger';
    body = `<p>Sua nave foi abatida e rebocada para a base. O resgate custou <b class="red">$${fmt(lost)}</b>.</p>`;
    if (C.mode === 'defend') {
      S.attack = null;
      if (pl.owner === 'player') { loseP(pl); body += `<p class="red">${pl.name} foi tomado pelo inimigo.</p>`; }
    }
    const home = S.planets.find(p => p.home && p.owner === 'player');
    if (home) S.at = home.id;
    relocate();
    Sfx.bad();
  } else if (C.over === 'planetLost') {
    S.attack = null; loseP(pl); cls = 'danger';
    title = 'PLANETA PERDIDO';
    body = `<p>As defesas de <b>${pl.name}</b> colapsaram e o <b class="red">${ENEMY}</b> tomou o planeta.</p><p class="muted">Reconquiste-o quando estiver mais forte!</p>`;
  } else { // recuo
    if (C.mode === 'defend' && S.attack) { S.attack.engaged = false; S.attack.t = 0; autoResolve(); }
    else toast('Invasão cancelada. Recuando.');
    save();
    checkEnd();
    return;
  }
  save();
  openPanel(title, body, [{ label: 'OK', cls, onClick: () => { closePanel(); checkEnd(); } }], { kind: 'locked' });
}

function drawBoss(e) {
  const x = Math.round(e.x), y = Math.round(e.y), f = e.hit > 0, t = performance.now() / 1000;
  const c = (col) => (f ? '#ffffff' : col);
  ctx.fillStyle = c('#3b1f4f'); ctx.fillRect(x - 6, y - 24, 24, 8); ctx.fillRect(x - 6, y + 16, 24, 8);
  ctx.fillStyle = c('#68386c'); ctx.fillRect(x - 18, y - 16, 36, 32);
  ctx.fillStyle = c('#a22633'); ctx.fillRect(x - 26, y - 7, 10, 14); ctx.fillRect(x - 30, y - 3, 4, 6);
  ctx.fillStyle = c('#b55088'); ctx.fillRect(x - 14, y - 12, 26, 3); ctx.fillRect(x - 14, y + 9, 26, 3);
  ctx.fillStyle = c('#454555'); ctx.fillRect(x + 16, y - 20, 6, 40);
  ctx.fillStyle = f ? '#fff' : Math.floor(t * 6) % 2 ? '#feae34' : '#f77622';
  ctx.fillRect(x + 22, y - 16, 3, 6); ctx.fillRect(x + 22, y + 10, 3, 6);
  const pulse = Math.floor(t * 4) % 2;
  ctx.fillStyle = f ? '#fff' : pulse ? '#feae34' : '#e43b44'; ctx.fillRect(x - 6, y - 5, 10, 10);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 4, y - 3, 3, 3);
}
function drawCombat() {
  const C = combat, t = performance.now() / 1000;
  ctx.fillStyle = '#04040c'; ctx.fillRect(0, 0, W, H);
  ctx.save();
  if (C.shake > 0) ctx.translate(Math.round(rand(-C.shake, C.shake)), Math.round(rand(-C.shake, C.shake)));
  drawStars();
  if (C.mode === 'conquer') { // planeta-alvo ao fundo
    const spr = planetSprite(C.planet, 46);
    ctx.globalAlpha = 0.55; ctx.drawImage(spr, W - 70, 26); ctx.globalAlpha = 1;
  } else {
    const spr = planetSprite(C.planet, PLANET_R);
    ctx.drawImage(spr, PLANET_CX - PLANET_R - 1, H / 2 - PLANET_R - 1);
    pcircle(PLANET_CX, H / 2, PLANET_R + 3, C.planetHP / C.planetMax > 0.3 ? '#55ffff' : '#e43b44', 2, Math.floor(t * 8));
    for (const tr of C.turrets) {
      ctx.fillStyle = '#454555'; ctx.fillRect(Math.round(tr.x) - 3, Math.round(tr.y) - 3, 6, 6);
      ctx.fillStyle = '#63c74d'; ctx.fillRect(Math.round(tr.x) - 1, Math.round(tr.y) - 1, 3, 3);
    }
  }
  // coletáveis
  for (const k of C.picks) if (k.t > 2 || Math.floor(k.t * 8) % 2) drawSpr(SPR[k.kind], k.x, k.y);
  // inimigos
  for (const e of C.enemies) {
    if (e.boss) drawBoss(e);
    else drawSpr(SPR[e.spr + (e.hit > 0 ? 'W' : '')], e.x, e.y);
  }
  // jogador
  const p = C.p;
  if (C.over !== 'lose' && (p.inv <= 0 || Math.floor(t * 20) % 2)) {
    const spr = SPR[HULLS[S.ship.hull].spr];
    ctx.fillStyle = pick(['#f77622', '#feae34', '#e43b44']);
    ctx.fillRect(Math.round(p.x - spr.width / 2) - randi(2, 5), Math.round(p.y) - 1, 3, 2);
    drawSpr(spr, p.x, p.y);
    if (p.sh > 0 && p.shT > 2.2) pcircle(p.x, p.y, 9, '#55ffff', 1, Math.floor(t * 20));
  }
  // projéteis
  for (const b of C.pb) { ctx.fillStyle = b.col; ctx.fillRect(Math.round(b.x) - 2, Math.round(b.y), 5, 1); ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(b.x) + 2, Math.round(b.y), 1, 1); }
  for (const b of C.eb) {
    const s = b.size, h = Math.floor(t * 12) % 2;
    ctx.fillStyle = h ? b.col : '#ffffff'; ctx.fillRect(Math.round(b.x - s / 2), Math.round(b.y - s / 2), s, s);
  }
  for (const q of C.parts) { ctx.globalAlpha = clamp(q.life / q.max + 0.2, 0, 1); ctx.fillStyle = q.col; ctx.fillRect(Math.round(q.x), Math.round(q.y), q.size, q.size); }
  ctx.globalAlpha = 1;
  for (const f of C.floats) text(f.s, f.x, f.y, f.col, 'center');
  ctx.restore();
  if (C.flash > 0) { ctx.globalAlpha = Math.min(1, C.flash * 2); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }

  // HUD
  const st = C.st;
  ctx.fillStyle = 'rgba(6,6,20,0.8)'; ctx.fillRect(0, 0, W, 14);
  text('CASCO', 4, 3, '#c0cbdc');
  bar(48, 4, 60, 3, p.hp / st.maxHp, p.hp / st.maxHp > 0.35 ? '#63c74d' : '#e43b44');
  if (st.maxShield) bar(48, 9, 60, 2, p.sh / st.maxShield, '#55ffff');
  text(C.wave >= 0 ? 'ONDA ' + Math.min(C.wave + 1, C.waves.length) + '/' + C.waves.length : 'PREPARE-SE', W / 2, 3, '#feae34', 'center');
  text('+$' + fmt(C.earned), W - 4, 3, '#feae34', 'right');
  if (C.mode === 'defend') {
    text(C.planet.name, 4, H - 12, '#55ffff');
    bar(4 + plain(C.planet.name).length * 8 + 6, H - 10, 70, 4, C.planetHP / C.planetMax, C.planetHP / C.planetMax > 0.3 ? '#55ffff' : '#e43b44');
  }
  if (C.boss) { text('NAU-CAPITANIA', W / 2, 18, '#e43b44', 'center'); bar(W / 2 - 80, 28, 160, 4, C.boss.hp / C.boss.maxHp, '#e43b44'); }
  if (C.banner) { const big = C.banner.s.length < 14 ? 16 : 8; text(C.banner.s, W / 2, H / 2 - 30, C.banner.col, 'center', big); }
  if (C.time < 5 && !C.over) text('SETAS/WASD MOVER  ESPACO ATIRAR  B BOMBA  ESC PAUSA', W / 2, H - 22, '#8a8fc0', 'center');
  if (C.over === 'win') text(C.mode === 'conquer' ? 'VITORIA!' : 'DEFENDIDO!', W / 2, H / 2 - 10, '#63c74d', 'center', 16);
  if (C.over === 'lose') text('NAVE DESTRUIDA', W / 2, H / 2 - 10, '#e43b44', 'center', 16);
  if (C.over === 'planetLost') text('PLANETA PERDIDO', W / 2, H / 2 - 10, '#e43b44', 'center', 16);
}

/* ------------------------------ TÍTULO ------------------------------ */
const titlePlanet = { seed: 777, pal: 3, r: 60 };
const titlePlanet2 = { seed: 4242, pal: 5, r: 14 };
function drawTitle() {
  const t = performance.now() / 1000;
  ctx.fillStyle = '#04040c'; ctx.fillRect(0, 0, W, H);
  drawStars();
  ctx.drawImage(planetSprite(titlePlanet), -40, 150);
  ctx.drawImage(planetSprite(titlePlanet2), 390, 40);
  const bob = Math.round(Math.sin(t * 2) * 3);
  text('CONQUISTA', W / 2 + 2, 42 + bob, '#68386c', 'center', 32);
  text('CONQUISTA', W / 2, 40 + bob, '#feae34', 'center', 32);
  text('ESTELAR', W / 2 + 2, 82 + bob, '#1b3a7a', 'center', 24);
  text('ESTELAR', W / 2, 80 + bob, '#55ffff', 'center', 24);
  text('UM RPG DE CONQUISTA GALACTICA', W / 2, 118, '#c0cbdc', 'center');
  // desfile de naves
  const xs = ((t * 60) % (W + 120)) - 60;
  drawSpr(SPR.falcao, xs, 160);
  drawSpr(SPR.vespa, xs - 22, 150);
  drawSpr(SPR.tita, xs - 26, 172);
  const ex = W + 60 - ((t * 45) % (W + 160));
  drawSpr(SPR.fighter, ex, 200); drawSpr(SPR.drone, ex + 18, 192); drawSpr(SPR.tank, ex + 30, 210);
  if (Math.floor(t * 2) % 2) text('ESCOLHA UMA OPCAO ABAIXO', W / 2, 228, '#ffffff', 'center');
}

/* ------------------------------ loop principal ------------------------------ */
let last = performance.now(), refreshT = 0;
function update(dt) {
  sceneT += dt;
  if (scene === 'title') updateStars(dt, 0.6);
  else if (scene === 'map' && S) {
    updateTravel(dt);
    if (S) updateWorld(dt);
    hoverPlanet = travel ? null : S.planets.find(q => dist(pointer.x, pointer.y, q.x, q.y) < q.r + 6) || null;
    cv.style.cursor = hoverPlanet ? 'pointer' : 'default';
  } else if (scene === 'combat' && combat) { updateCombat(dt); cv.style.cursor = 'crosshair'; }
  updateToasts(dt);
  if (panelRefresh && (refreshT += dt) > 0.25) { refreshT = 0; panelRefresh(); }
}
function render() {
  if (scene === 'title') drawTitle();
  else if (scene === 'map' && S) drawMap();
  else if (scene === 'combat' && combat) drawCombat();
}
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt); render();
  requestAnimationFrame(loop);
}
function resize() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  const sc = s >= 2 ? Math.floor(s * 2) / 2 : s;
  wrap.style.width = W * sc + 'px';
  wrap.style.height = H * sc + 'px';
  wrap.style.setProperty('--u', sc);
}
addEventListener('resize', resize);
addEventListener('beforeunload', () => { if (scene === 'map') save(); });
resize();
setBar('title');
const fontReady = document.fonts && document.fonts.load ? document.fonts.load(`8px ${FONT}`) : Promise.resolve();
Promise.race([fontReady, new Promise(r => setTimeout(r, 1500))]).catch(() => {}).then(() => requestAnimationFrame(loop));
