'use strict';
/* =====================================================================
   CONQUISTA ESTELAR: loop principal, pilotagem, piloto automático,
   mundo, render e HUD.
   ===================================================================== */

const cv = document.getElementById('view'), ctx = cv.getContext('2d');
const radarCv = document.getElementById('radar'), rctx = radarCv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
let G = null;
let mode = 'title';
let dock = null, dead = 0, shake = 0, deathMsg = '';
const cam = { x: 0, y: 0, z: 0.6 };
const PROJ = [], PICKS = [], FRAGS = [], PARTS = [];
let snap = { stars: [], bhs: [], planets: [], asts: [] };
let auto = null; // piloto automático: {kind: mine|dock|attack, target}

/* ---------- estado novo / salvar ---------- */
const SAVE_KEY = 'conquista-estelar-v3';
function freshState(seed, meta) {
  return {
    v: 3, seed: seed ?? ((Math.random() * 1e9) | 0), time: 0,
    ship: { x: 0, y: 0, vx: 0, vy: 0, a: 0, hull: 100, shield: 0, energy: 100, lv: { casco: 0, escudo: 0, motor: 0, armas: 0, reator: 0, carga: 0, sensores: 0 }, equip: [], paint: 0 },
    credits: 300 + 150 * ((meta && meta.essence) || 0), rp: 0, cargo: {}, stock: {}, inv: [],
    tech: Object.fromEntries(Object.keys(TECHS).map(k => [k, 0])),
    col: {}, inf: {}, ngov: {}, events: [], news: [], contracts: [], doneContracts: {}, shopSold: {}, extract: {},
    discovered: {}, lastDock: null, mined: {}, rings: { 0: 1 }, maxDist: 0,
    stats: { dist: 0, mined: 0, found: 0, deaths: 0, earned: 0, kills: 0 },
    meta: meta || { essence: 0, ascensions: 0 }, zoom: 0.55, fleet: [], fleetOrder: 'escolta',
  };
}
function newGame(seed, meta) {
  G = freshState(seed, meta);
  resetWorldCaches();
  const home = getSector(0, 0).planets.find(p => p.home);
  const pos = planetPos(home, 0);
  newColony(home, 'democracia', home.pop);
  G.col[home.id].b.mina = 1; G.col[home.id].b.comercio = 1;
  G.news = [{ t: 0, msg: 'A Federação inicia sua expansão a partir de Nova Aurora.', cls: 'ok' }];
  G.ship.x = pos.x + home.r + 380; G.ship.y = pos.y + 120; G.ship.a = Math.PI;
  G.lastDock = home.id;
  G.inv.push(makeModule('feixe', 0));
  G.ship.equip.push(G.inv[0].id);
  cam.x = G.ship.x; cam.y = G.ship.y;
  ST = shipStats();
  G.fleet.push(newFleetShip('caca'));
}
function migrate(d) {
  const f = freshState(d.seed, d.meta);
  for (const k in f) if (d[k] === undefined) d[k] = f[k];
  for (const k in f.ship) if (d.ship[k] === undefined) d.ship[k] = f.ship[k];
  for (const k in f.ship.lv) if (d.ship.lv[k] === undefined) d.ship.lv[k] = 0;
  for (const k in f.tech) if (d.tech[k] === undefined) d.tech[k] = 0;
  for (const k in f.stats) if (d.stats[k] === undefined) d.stats[k] = 0;
  for (const id in d.col) {
    const c = d.col[id];
    if (!c.def) c.def = Object.fromEntries(DEF_KEYS.map(k => [k, 0]));
    for (const k of DEF_KEYS) if (c.def[k] === undefined) c.def[k] = 0;
    if (c.b.defesa) { c.def.laser = Math.max(c.def.laser, c.b.defesa); }
    delete c.b.defesa;
  }
  return d;
}
function resetWorldCaches() {
  sectorCache.clear(); texCache.clear(); planetCanvases.clear(); nebCache.clear(); ringCache.clear(); starCache.clear(); diskCache.clear(); planetCache.clear();
  nebNoise = null; Jobs.q.length = 0;
  PROJ.length = PICKS.length = FRAGS.length = PARTS.length = ENEMIES.length = 0;
  FLEET_RT.clear(); DRONES.clear(); designCacheF.clear();
  auto = null; dock = null; dead = 0; extracting = null;
}
function save() {
  if (!G || mode !== 'play') return false;
  try {
    for (const k in G.mined) if (G.time - G.mined[k] > 700) delete G.mined[k];
    const cols = {};
    for (const id in G.col) { const { _nb, _pt, _cd, ...rest } = G.col[id]; cols[id] = rest; }
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...G, col: cols }));
    return true;
  } catch (e) { return false; }
}
function loadSave() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (d && d.v === 3) return migrate(d);
  } catch (e) { /* sem save */ }
  return null;
}
function findPlanet(id) {
  const sec = id.split(':')[0], [sx, sy] = sec.split(',').map(Number);
  return getSector(sx, sy).planets.find(p => p.id === id) || null;
}

/* ---------- áudio sintetizado ---------- */
const Sfx = {
  ac: null, on: true, last: {},
  init() { if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; } try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ac = null; } },
  tone(f, d, type = 'sine', v = 0.05, slide = 0, delay = 0) {
    if (!this.on || !this.ac) return;
    const t = this.ac.currentTime + delay, o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(this.ac.destination); o.start(t); o.stop(t + d + 0.05);
  },
  noise(d, v = 0.08, f = 800) {
    if (!this.on || !this.ac) return;
    const n = Math.floor(this.ac.sampleRate * d), b = this.ac.createBuffer(1, n, this.ac.sampleRate), c = b.getChannelData(0);
    for (let i = 0; i < n; i++) c[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    const s = this.ac.createBufferSource(), fl = this.ac.createBiquadFilter(), g = this.ac.createGain();
    fl.type = 'lowpass'; fl.frequency.value = f; s.buffer = b; g.gain.value = v;
    s.connect(fl).connect(g).connect(this.ac.destination); s.start();
  },
  rate(k, ms) { const n = performance.now(); if (n - (this.last[k] || 0) < ms) return false; this.last[k] = n; return true; },
  shot() { if (this.rate('s', 90)) this.tone(880, 0.09, 'triangle', 0.025, -500); },
  rock() { if (this.rate('r', 50)) this.noise(0.08, 0.04, 1500); },
  boom(big) { this.noise(big ? 0.9 : 0.35, big ? 0.2 : 0.09, big ? 500 : 900); },
  pick() { if (this.rate('p', 50)) this.tone(1200 + Math.random() * 300, 0.07, 'sine', 0.03); },
  ok() { [660, 880, 1320].forEach((f, i) => this.tone(f, 0.12, 'sine', 0.035, 0, i * 0.07)); },
  disc() { [523, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.035, 0, i * 0.12)); },
  warn() { if (this.rate('w', 900)) { this.tone(440, 0.15, 'square', 0.022); this.tone(330, 0.15, 'square', 0.022, 0, 0.18); } },
};
addEventListener('pointerdown', () => Sfx.init()); addEventListener('keydown', () => Sfx.init());

/* ---------- entrada ---------- */
const keys = {};
const mouse = { x: 0, y: 0, down: false, moved: 0 };
let turnKeyT = 0, touchMode = false;
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0, on: false, t0: 0 };
const tbtn = { fire: false, boost: false };
const PANEL_KEYS = { KeyF: () => openFleetPanel(), KeyN: () => openShipPanel(), KeyI: () => openEmpirePanel(), KeyR: () => openResearchPanel(), KeyP: () => openPoliticsPanel(), KeyC: () => openContractsPanel(), KeyM: () => openMapPanel(), KeyH: () => openHelp() };
const PANEL_KEY_KIND = { KeyF: 'fleet', KeyN: 'ship', KeyI: 'empire', KeyR: 'research', KeyP: 'politics', KeyC: 'contracts', KeyM: 'map', KeyH: 'help' };
const MOVE_KEYS = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(e.code)) turnKeyT = performance.now();
  if (mode !== 'play') return;
  if (MOVE_KEYS.includes(e.code) && auto && !dock) cancelAuto('Piloto automático desligado.');
  if (['KeyW', 'ArrowUp'].includes(e.code) && dock && !e.repeat) { closePanel(); if (dock) undock(); }
  if (e.repeat) return;
  if (e.code === 'KeyE') interact();
  if (e.code === 'Escape') { if (panelOpen) closePanel(); else if (auto) cancelAuto('Piloto automático desligado.'); }
  if (PANEL_KEYS[e.code]) { if (panel && panel.kind === PANEL_KEY_KIND[e.code]) closePanel(); else PANEL_KEYS[e.code](); }
  if (e.code === 'Equal' || e.code === 'NumpadAdd') G.zoom = clamp(G.zoom * 1.15, 0.1, 1.6);
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') G.zoom = clamp(G.zoom / 1.15, 0.1, 1.6);
});
addEventListener('keyup', e => { keys[e.code] = false; });
const screenToWorld = (sx, sy) => [(sx * DPR - CW / 2) / (cam.z * DPR) + cam.x, (sy * DPR - CH / 2) / (cam.z * DPR) + cam.y];

function pickObject(wx, wy) {
  const tol = 14 / cam.z;
  for (const e of ENEMIES) if (dist(wx, wy, e.x, e.y) < e.r + tol) return { kind: 'attack', target: e };
  for (const a of FRAGS) if (dist(wx, wy, a.x, a.y) < a.r + tol) return { kind: 'mine', target: a };
  for (const a of snap.asts) if (dist(wx, wy, a.x, a.y) < a.r + tol) return { kind: 'mine', target: a };
  for (const p of snap.planets) if (dist(wx, wy, p._x, p._y) < p.r * 1.05 + tol) return { kind: 'dock', target: p };
  return null;
}
function engage(o) {
  if (!o || mode !== 'play' || dead) return false;
  if (dock) { if (o.kind === 'dock' && o.target === dock) return false; closePanel(); }
  auto = { kind: o.kind, target: o.target };
  if (o.kind === 'dock') toast(`Piloto automático: rumo a ${o.target.name}.`);
  else if (o.kind === 'mine') toast('Piloto automático: mineração. Use W A S D para retomar o controle.');
  else toast(`Piloto automático: atacando ${ENEMY_TYPES[o.target.type].nome}.`, 'bad');
  Sfx.tone(700, 0.08, 'sine', 0.03); Sfx.tone(1050, 0.1, 'sine', 0.03, 0, 0.08);
  return true;
}
function setRoute(p) { engage({ kind: 'dock', target: p }); }
function cancelAuto(msg) { if (!auto) return; auto = null; if (msg) toast(msg); }

cv.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = performance.now(); }
  if (e.pointerId === joy.id) { joy.x = e.clientX; joy.y = e.clientY; }
});
cv.addEventListener('pointerdown', e => {
  if (mode !== 'play') return;
  if (e.pointerType === 'mouse') {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = performance.now();
    if (e.button !== 0) return;
    const [wx, wy] = screenToWorld(e.clientX, e.clientY);
    const o = pickObject(wx, wy);
    if (o) engage(o); else mouse.down = true;
    return;
  }
  setTouch(true);
  if (joy.id === null) {
    joy.id = e.pointerId; joy.ox = joy.x = e.clientX; joy.oy = joy.y = e.clientY; joy.on = false; joy.t0 = performance.now();
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
});
const endPointer = e => {
  if (e.pointerType === 'mouse') { mouse.down = false; return; }
  if (e.pointerId === joy.id) {
    const tap = !joy.on && performance.now() - joy.t0 < 350;
    if (tap && mode === 'play') { const [wx, wy] = screenToWorld(joy.ox, joy.oy); const o = pickObject(wx, wy); if (o) engage(o); }
    joy.id = null; joy.on = false;
  }
};
cv.addEventListener('pointerup', endPointer); cv.addEventListener('pointercancel', endPointer);
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.down = false; });
cv.addEventListener('wheel', e => { if (mode !== 'play') return; e.preventDefault(); G.zoom = clamp(G.zoom * (e.deltaY > 0 ? 0.9 : 1.11), 0.1, 1.6); }, { passive: false });
cv.addEventListener('contextmenu', e => e.preventDefault());
function setTouch(on) { if (touchMode === on) return; touchMode = on; document.body.classList.toggle('touch', on); }
for (const [id, k] of [['t-fire', 'fire'], ['t-boost', 'boost']]) {
  const el = $(id);
  el.addEventListener('pointerdown', e => { e.preventDefault(); tbtn[k] = true; if (k === 'fire' && auto) cancelAuto(); });
  el.addEventListener('pointerup', () => { tbtn[k] = false; }); el.addEventListener('pointerleave', () => { tbtn[k] = false; });
}
$('t-zin').addEventListener('click', () => { G.zoom = clamp(G.zoom * 1.25, 0.1, 1.6); });
$('t-zout').addEventListener('click', () => { G.zoom = clamp(G.zoom / 1.25, 0.1, 1.6); });
$('prompt').addEventListener('click', () => { if (auto) cancelAuto('Piloto automático desligado.'); else interact(); });
document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.open; if (panel && panel.kind === PANEL_KEY_KIND[k]) closePanel(); else PANEL_KEYS[k](); }));

/* ---------- órbita ---------- */
let nearPlanet = null;
function interact() {
  if (mode !== 'play' || dead) return;
  if (dock) { closePanel(); return; }
  if (nearPlanet) dockAt(nearPlanet);
}
function dockAt(p) {
  dock = p; G.lastDock = p.id; auto = null;
  G.ship.vx = G.ship.vy = 0;
  Sfx.ok();
  openPlanetPanel(p);
}
function undock() {
  const p = dock; dock = null; extracting = null;
  if (p) { const pos = planetPos(p, G.time); const a = Math.atan2(G.ship.y - pos.y, G.ship.x - pos.x); G.ship.vx = Math.cos(a) * 120; G.ship.vy = Math.sin(a) * 120; G.ship.a = a; }
}

/* ---------- partículas ---------- */
function burst(x, y, n, col, spd, life, size = 2, add = true) {
  for (let i = 0; i < n; i++) {
    const a = rnd(TAU), v = rnd(spd * 0.15, spd);
    PARTS.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(life * 0.4, life), max: life, size: rnd(size * 0.5, size * 1.4), col, add });
  }
}

/* ---------- mundo próximo ---------- */
function gatherWorld() {
  const sx = Math.floor(cam.x / SECTOR), sy = Math.floor(cam.y / SECTOR);
  const out = { stars: [], bhs: [], planets: [], asts: [] };
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const s = getSector(sx + dx, sy + dy);
    if (s.star) out.stars.push(s.star);
    if (s.bh) out.bhs.push(s.bh);
    for (const p of s.planets) { const pos = planetPos(p, G.time); p._x = pos.x; p._y = pos.y; out.planets.push(p); }
    for (const a of s.asteroids) {
      const m = G.mined[a.id];
      if (m !== undefined) { if (G.time - m < 600) continue; delete G.mined[a.id]; a.hp = a.maxHp; }
      out.asts.push(a);
    }
  }
  trimSectors();
  return out;
}

/* ---------- atualização ---------- */
let thrustVis = 0, hudT = 0, saveT = 0, liveT = 0, hazardMsg = '';
function update(dt) {
  if (!G) return;
  G.time += dt;
  snap = gatherWorld();
  ST = shipStats();
  const S = G.ship;
  if (mode === 'title') {
    const home = snap.planets.find(p => p.home) || snap.planets[0];
    if (home) { cam.x = lerp(cam.x, home._x - 900 / cam.z * (innerWidth > 800 ? 0.45 : 0) + Math.cos(G.time * 0.05) * 300, 0.02); cam.y = lerp(cam.y, home._y + Math.sin(G.time * 0.05) * 300, 0.02); }
    cam.z = 0.45;
    updateParts(dt);
    return;
  }
  hazardMsg = '';
  let firing = false;
  if (dead > 0) { dead -= dt; if (dead <= 0) respawn(); }
  else if (dock) {
    const pos = planetPos(dock, G.time), a = Math.atan2(S.y - pos.y, S.x - pos.x) + dt * 0.12, r = dock.r + 140;
    S.x = pos.x + Math.cos(a) * r; S.y = pos.y + Math.sin(a) * r; S.a = a + Math.PI / 2; S.vx = S.vy = 0;
    thrustVis = lerp(thrustVis, 0.12, 0.1);
    S.energy = Math.min(ST.energyMax, S.energy + 30 * dt);
    S.shield = Math.min(ST.shieldMax, S.shield + ST.shieldMax * 0.2 * dt);
  } else {
    firing = auto ? autopilot(dt) : flight(dt);
    if (!dead) environment(dt);
    if (!dead) moveShip(dt);
  }
  // regeneração
  shieldT -= dt;
  if (shieldT <= 0 && S.shield < ST.shieldMax) S.shield = Math.min(ST.shieldMax, S.shield + ST.shieldMax * 0.12 * dt);
  if (ST.regen && S.hull > 0 && S.hull < ST.hullMax) S.hull = Math.min(ST.hullMax, S.hull + ST.hullMax * ST.regen * dt);
  S.hull = Math.min(S.hull, ST.hullMax); S.shield = Math.min(S.shield, ST.shieldMax);
  fireWeapons(dt, firing && !dock);
  // câmera
  cam.x = lerp(cam.x, S.x + S.vx * 0.35, 1 - Math.exp(-5 * dt));
  cam.y = lerp(cam.y, S.y + S.vy * 0.35, 1 - Math.exp(-5 * dt));
  const sp = Math.hypot(S.vx, S.vy);
  cam.z = lerp(cam.z, G.zoom * (1 - Math.min(0.25, (sp / ST.maxSpeed) * 0.25)), 1 - Math.exp(-3 * dt));

  updateProjectiles(dt);
  updateEnemies(dt);
  updateFleet(dt);
  updatePickups(dt);
  updateFrags(dt);
  updateParts(dt);
  updateExtraction(dt);
  updateEmpire(dt);
  discover();
  milestones();

  if ((hudT += dt) > 0.1) { hudT = 0; updateHud(); }
  if ((saveT += dt) > 15) { saveT = 0; save(); }
  if (panel && panel.tick) panel.tick();
  if ((liveT += dt) > 0.3 && panelOpen) { liveT = 0; liveRefresh(); }
}

/* pilotagem manual: o empuxo sempre segue o bico da nave */
function flight(dt) {
  const S = G.ship;
  let fwd = (keys.KeyW || keys.ArrowUp) ? 1 : 0;
  const back = keys.KeyS || keys.ArrowDown;
  const rot = ((keys.KeyD || keys.ArrowRight) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft) ? 1 : 0);
  if (rot) S.a += rot * ST.turn * dt;
  else if (joy.id !== null) {
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy);
    if (d > 10) {
      joy.on = true;
      const want = Math.atan2(dy, dx);
      S.a += clamp(angDiff(S.a, want), -ST.turn * dt, ST.turn * dt);
      fwd = Math.min(1, d / 70) * Math.pow(Math.max(0, Math.cos(angDiff(S.a, want))), 2);
    }
  } else if (!touchMode && mouse.moved > turnKeyT) {
    const [wx, wy] = screenToWorld(mouse.x, mouse.y);
    const want = Math.atan2(wy - S.y, wx - S.x);
    S.a += clamp(angDiff(S.a, want), -ST.turn * dt, ST.turn * dt);
  }
  const boosting = (keys.ShiftLeft || keys.ShiftRight || tbtn.boost) && fwd > 0 && S.energy > 2;
  applyThrust(dt, fwd, boosting);
  if (back) {
    const sp = Math.hypot(S.vx, S.vy);
    if (sp > 40) { S.vx *= Math.exp(-2.4 * dt); S.vy *= Math.exp(-2.4 * dt); }
    else { S.vx -= Math.cos(S.a) * ST.thrust * 0.3 * dt; S.vy -= Math.sin(S.a) * ST.thrust * 0.3 * dt; }
  }
  return keys.Space || mouse.down || tbtn.fire;
}
function applyThrust(dt, f, boosting) {
  const S = G.ship;
  const thrust = ST.thrust * (boosting ? ST.boost : 1) * f;
  S.vx += Math.cos(S.a) * thrust * dt; S.vy += Math.sin(S.a) * thrust * dt;
  if (boosting) S.energy -= 28 * dt; else S.energy = Math.min(ST.energyMax, S.energy + ST.energyRegen * dt);
  // estabilizador inercial: sem empuxo, a nave desacelera sozinha
  const drag = f > 0 ? 0.3 : 0.75;
  S.vx *= Math.exp(-drag * dt); S.vy *= Math.exp(-drag * dt);
  const maxV = ST.maxSpeed * (boosting ? ST.boost : 1), sp = Math.hypot(S.vx, S.vy);
  if (sp > maxV) { S.vx *= maxV / sp; S.vy *= maxV / sp; }
  thrustVis = lerp(thrustVis, f > 0 ? (boosting ? 1 : 0.4 + 0.3 * f) : 0.06, 1 - Math.exp(-10 * dt));
}
/* piloto automático: gira para a direção necessária e acelera pelo bico */
function steer(dt, tx, ty, stand, fx, fy, tvx = 0, tvy = 0) {
  const S = G.ship, dx = tx - S.x, dy = ty - S.y, d = Math.hypot(dx, dy) || 1;
  const along = d - stand;
  const desired = along > 0 ? Math.min(ST.maxSpeed, Math.sqrt(2 * ST.thrust * 0.45 * along)) : Math.max(-120, along * 1.5);
  const dvx = dx / d * desired + tvx - S.vx, dvy = dy / d * desired + tvy - S.vy, dv = Math.hypot(dvx, dvy);
  const needA = Math.atan2(dvy, dvx);
  let want = needA;
  if (fx !== undefined && Math.abs(along) < 260 && dv < 140) want = Math.atan2(fy - S.y, fx - S.x);
  else if (dv < 25) want = fx !== undefined ? Math.atan2(fy - S.y, fx - S.x) : S.a;
  S.a += clamp(angDiff(S.a, want), -ST.turn * dt, ST.turn * dt);
  const align = Math.cos(angDiff(S.a, needA));
  const f = dv > 25 && align > 0.2 ? clamp(dv / 260, 0, 1) * align : 0;
  applyThrust(dt, f, false);
  if (dv > 25 && align < 0.2 && Math.abs(along) < 400) { S.vx *= Math.exp(-1.2 * dt); S.vy *= Math.exp(-1.2 * dt); }
  return d;
}
const astAlive = a => a && (a.frag ? FRAGS.includes(a) : snap.asts.includes(a)) && a.hp > 0;
function nearestAst(r) {
  const S = G.ship; let best = null, bd = r;
  for (const a of FRAGS.concat(snap.asts)) { const d = dist(S.x, S.y, a.x, a.y); if (d < bd) { bd = d; best = a; } }
  return best;
}
function nearestPick(r) {
  const S = G.ship; let best = null, bd = r;
  for (const k of PICKS) { const d = dist(S.x, S.y, k.x, k.y); if (d < bd) { bd = d; best = k; } }
  return best;
}
function autopilot(dt) {
  const S = G.ship, A = auto;
  if (A.kind === 'dock') {
    const p = A.target, pos = planetPos(p, G.time), ang = p.a0 + p.w * G.time;
    A.tx = pos.x; A.ty = pos.y;
    const d = steer(dt, pos.x, pos.y, p.r + 230, undefined, undefined, -Math.sin(ang) * p.w * p.orbit, Math.cos(ang) * p.w * p.orbit);
    if (d < p.r + 330 && Math.hypot(S.vx, S.vy) < 240) dockAt(p);
    return false;
  }
  if (A.kind === 'attack') {
    if (!ENEMIES.includes(A.target)) {
      let next = null, bd = 2600;
      for (const o of ENEMIES) { const dd = dist(S.x, S.y, o.x, o.y); if (dd < bd) { bd = dd; next = o; } }
      if (!next) { auto = null; toast('Área limpa: piratas eliminados.', 'gold'); return false; }
      A.target = next;
    }
    const e = A.target;
    A.tx = e.x; A.ty = e.y;
    const d = dist(S.x, S.y, e.x, e.y);
    if (d > 1100) { steer(dt, e.x, e.y, 520, e.x, e.y, e.vx, e.vy); return false; }
    // em combate: mantém o bico no alvo (com antecipação) e controla a distância pelo empuxo
    const lead = d / 1500, aimA = Math.atan2(e.y + e.vy * lead - S.y, e.x + e.vx * lead - S.x);
    S.a += clamp(angDiff(S.a, aimA), -ST.turn * dt, ST.turn * dt);
    const f = d > 650 ? 1 : d > 420 ? 0.35 : 0;
    applyThrust(dt, f * Math.max(0, Math.cos(angDiff(S.a, aimA))), false);
    if (d < 380) { S.vx *= Math.exp(-1.5 * dt); S.vy *= Math.exp(-1.5 * dt); }
    return Math.abs(angDiff(S.a, aimA)) < 0.3;
  }
  // mineração automática: minera, recolhe o minério e segue para o próximo asteroide
  if (!astAlive(A.target)) {
    const pk = nearestPick(Math.max(700, ST.tractor * 2));
    if (pk && cargoUsed() < cargoCap()) { A.tx = pk.x; A.ty = pk.y; steer(dt, pk.x, pk.y, 0); return false; }
    if (cargoUsed() >= cargoCap()) { auto = null; toast('Porão cheio: mineração automática concluída. Clique num planeta para vender.', 'gold'); return false; }
    A.target = nearestAst(2200);
    if (!A.target) { auto = null; toast('Nenhum asteroide por perto. Mineração encerrada.'); return false; }
  }
  const a = A.target;
  A.tx = a.x; A.ty = a.y;
  const stand = a.r + 240;
  const d = steer(dt, a.x, a.y, stand, a.x, a.y, a.vx || 0, a.vy || 0);
  return d < stand + 320 && Math.abs(angDiff(S.a, Math.atan2(a.y - S.y, a.x - S.x))) < 0.22;
}
function environment(dt) {
  const S = G.ship;
  for (const b of snap.bhs) {
    const dx = b.x - S.x, dy = b.y - S.y, d = Math.hypot(dx, dy);
    if (d < 5200) {
      const a = Math.min(2200, 2.6e8 / (d * d));
      S.vx += (dx / d) * a * dt; S.vy += (dy / d) * a * dt;
      if (d < 2600) hazardMsg = 'Gravidade extrema: afaste-se do buraco negro!';
      if (d < b.r * 1.15) { killShip('Sua nave cruzou o horizonte de eventos.'); return; }
    }
  }
  for (const s of snap.stars) {
    const d = dist(S.x, S.y, s.x, s.y), lim = s.r * 2.6;
    if (d < lim) {
      damage(((lim - d) / lim) * ST.hullMax * 0.4 * dt, true);
      hazardMsg = 'Calor estelar crítico! Casco derretendo.';
      if (d < s.r) { killShip('Sua nave foi vaporizada pela estrela.'); return; }
    }
  }
}
function moveShip(dt) {
  const S = G.ship;
  S.x += S.vx * dt; S.y += S.vy * dt;
  G.stats.dist += Math.hypot(S.vx, S.vy) * dt;
  for (const a of snap.asts.concat(FRAGS)) {
    const rr = a.r * 0.82 + 16, d = dist(S.x, S.y, a.x, a.y);
    if (d < rr && d > 0) {
      const nx = (S.x - a.x) / d, ny = (S.y - a.y) / d, vn = S.vx * nx + S.vy * ny - (a.vx || 0) * nx - (a.vy || 0) * ny;
      S.x = a.x + nx * rr; S.y = a.y + ny * rr;
      if (vn < 0) {
        S.vx -= 1.6 * vn * nx; S.vy -= 1.6 * vn * ny;
        if (-vn > 110) { damage((-vn - 110) * 0.03 * Math.max(1, ST.hullMax / 100)); burst(S.x - nx * 14, S.y - ny * 14, 10, [255, 200, 140], 160, 0.5, 2.5); Sfx.rock(); }
      }
    }
  }
  nearPlanet = null;
  for (const p of snap.planets) if (dist(S.x, S.y, p._x, p._y) < p.r + 330) { nearPlanet = p; break; }
}
function killShip(msg) {
  if (dead) return;
  const S = G.ship;
  S.hull = 0; S.shield = 0; dead = 3; deathMsg = msg; G.stats.deaths++; auto = null;
  burst(S.x, S.y, 90, [255, 170, 80], 420, 1.6, 4);
  burst(S.x, S.y, 50, [255, 255, 255], 260, 0.8, 2);
  Sfx.boom(true); shake = 22;
  const lost = cargoUsed();
  G.cargo = {};
  toast(msg + (lost ? ` Carga perdida: ${lost} un.` : ''), 'bad');
}
function respawn() {
  const S = G.ship;
  const p = (G.lastDock && findPlanet(G.lastDock)) || getSector(0, 0).planets.find(q => q.home);
  const fee = Math.floor(G.credits * 0.1);
  G.credits -= fee;
  const pos = planetPos(p, G.time);
  S.x = pos.x + p.r + 300; S.y = pos.y; S.vx = S.vy = 0; S.hull = ST.hullMax; S.shield = ST.shieldMax; S.energy = ST.energyMax;
  cam.x = S.x; cam.y = S.y;
  ENEMIES.length = 0; FLEET_RT.clear();
  toast(`Rebocado até ${p.name}. Taxa de resgate: ${fmt(fee)} CR.`);
}

/* ---------- asteroides e coleta ---------- */
function hitAsteroid(a, dmg, x, y) {
  a.hp -= dmg;
  burst(x, y, 4, [200, 190, 170], 120, 0.4, 2, false);
  Sfx.rock();
  if (a.hp <= 0) breakAsteroid(a);
}
function breakAsteroid(a) {
  if (a.frag) { const i = FRAGS.indexOf(a); if (i < 0) return; FRAGS.splice(i, 1); }
  else { if (G.mined[a.id] !== undefined) return; G.mined[a.id] = G.time; }
  burst(a.x, a.y, 18 + a.r * 0.6, [170, 160, 150], 160 + a.r * 2, 1.2, 3, false);
  burst(a.x, a.y, 10, [255, 200, 140], 200, 0.5, 2);
  Sfx.boom(false);
  G.stats.mined++;
  if (a.r > 34) {
    const n = a.r > 60 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const ang = rnd(TAU), r = a.r * rnd(0.35, 0.5), hp = r * 2.2 * (1 + (a.dist || 0) * 0.12);
      FRAGS.push({ frag: true, x: a.x + Math.cos(ang) * a.r * 0.4, y: a.y + Math.sin(ang) * a.r * 0.4, vx: Math.cos(ang) * rnd(20, 70) + (a.vx || 0), vy: Math.sin(ang) * rnd(20, 70) + (a.vy || 0), r, ore: a.ore, seed: (a.seed + i * 7919) | 0, spin: rnd(-1, 1), a0: rnd(TAU), hp, maxHp: hp, born: G.time, dist: a.dist });
    }
  }
  const drops = Math.max(1, Math.round((a.r / 12) * ST.oreMult));
  for (let i = 0; i < drops; i++) {
    const ang = rnd(TAU), v = rnd(30, 110);
    PICKS.push({ x: a.x, y: a.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, kind: 'ore', ore: a.ore, t: 45, rot: rnd(TAU) });
  }
}
function updatePickups(dt) {
  const S = G.ship, full = cargoUsed() >= cargoCap();
  for (let i = PICKS.length - 1; i >= 0; i--) {
    const k = PICKS[i];
    k.t -= dt; k.rot += dt * 2;
    const d = dist(k.x, k.y, S.x, S.y), wants = k.kind === 'cr' || !full;
    if (!dead && wants && d < ST.tractor) {
      const a = Math.atan2(S.y - k.y, S.x - k.x), pull = 1100 * (1 - d / ST.tractor) + 260;
      k.vx += Math.cos(a) * pull * dt; k.vy += Math.sin(a) * pull * dt;
    }
    k.vx *= Math.exp(-1.5 * dt); k.vy *= Math.exp(-1.5 * dt);
    k.x += k.vx * dt; k.y += k.vy * dt;
    if (!dead && d < 28) {
      if (k.kind === 'cr') { G.credits += k.val; G.stats.earned += k.val; PICKS.splice(i, 1); Sfx.pick(); continue; }
      if (full) { if (Sfx.rate('full', 4000)) toast('Porão de carga cheio! Venda em um planeta.', 'bad'); continue; }
      G.cargo[k.ore] = (G.cargo[k.ore] || 0) + 1;
      PICKS.splice(i, 1); Sfx.pick();
      continue;
    }
    if (k.t <= 0) PICKS.splice(i, 1);
  }
}
function updateFrags(dt) {
  for (let i = FRAGS.length - 1; i >= 0; i--) {
    const f = FRAGS[i];
    f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= Math.exp(-0.2 * dt); f.vy *= Math.exp(-0.2 * dt);
    if (G.time - f.born > 150) FRAGS.splice(i, 1);
  }
}
function updateParts(dt) {
  for (let i = PARTS.length - 1; i >= 0; i--) {
    const q = PARTS[i];
    q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= Math.exp(-1.8 * dt); q.vy *= Math.exp(-1.8 * dt);
    if ((q.life -= dt) <= 0) PARTS.splice(i, 1);
  }
  if (PARTS.length > 1600) PARTS.splice(0, PARTS.length - 1600);
}
function discover() {
  const S = G.ship;
  const check = (id, x, y, label, reward) => {
    if (G.discovered[id] || dist(S.x, S.y, x, y) > ST.sensor) return;
    G.discovered[id] = 1; G.stats.found++;
    reward = Math.round(reward * ST.mapBonus);
    G.credits += reward; G.stats.earned += reward;
    toast(`Descoberto: ${label} · +${fmt(reward)} CR`, 'disc');
    Sfx.disc();
  };
  const secD = Math.hypot(S.x / SECTOR, S.y / SECTOR);
  for (const s of snap.stars) check(s.id, s.x, s.y, `${s.name} (${STAR_CLASSES[s.cls].nome})`, 20 * (1 + secD * 0.5));
  for (const b of snap.bhs) check(b.id, b.x, b.y, b.name, 150 * (1 + secD * 0.5));
  for (const p of snap.planets) check(p.id, p._x, p._y, `${p.name} (${PLANET_TYPES[p.type].nome})`, 12 * (1 + secD * 0.5) * (p.pop ? 1.5 : 1));
}
function milestones() {
  const S = G.ship, d = Math.hypot(S.x, S.y) / SECTOR;
  if (d > G.maxDist) G.maxDist = d;
  const r = ringOf(d);
  if (!G.rings[r]) {
    G.rings[r] = 1;
    news(`Primeira expedição ao anel ${ringName(r)}.`, 'ok');
    if (!panelOpen) openLore(r); else toast(`Novo anel alcançado: ${ringName(r)}`, 'disc');
  }
}

/* ---------- HUD ---------- */
function updateHud() {
  const S = G.ship;
  $('h-cr').textContent = G.credits >= 1e7 ? fmtBig(G.credits) : fmt(G.credits);
  $('h-rp').textContent = G.rp >= 1e7 ? fmtBig(G.rp) : fmt(G.rp);
  $('h-mk').textContent = 'Mk ' + romanize(ST.tier);
  setBar('h-hull', S.hull / ST.hullMax, `${fmt(Math.max(0, S.hull))}/${fmt(ST.hullMax)}`);
  setBar('h-sh', ST.shieldMax ? S.shield / ST.shieldMax : 0, ST.shieldMax ? `${fmt(S.shield)}/${fmt(ST.shieldMax)}` : '—');
  setBar('h-en', S.energy / ST.energyMax, `${fmt(S.energy)}/${fmt(ST.energyMax)}`);
  const cu = cargoUsed();
  setBar('h-cargo', cu / cargoCap(), `${cu}/${fmt(cargoCap())}`);
  $('h-spd').textContent = Math.round(Math.hypot(S.vx, S.vy));
  $('h-fleet').textContent = `${escorts().length} escoltas · ${G.fleet.length}/${fleetCap()}`;
  const sx = Math.floor(S.x / SECTOR), sy = Math.floor(S.y / SECTOR), d = Math.hypot(S.x / SECTOR, S.y / SECTOR);
  $('h-sec').textContent = `${sx}, ${sy}`;
  $('h-ring').textContent = `${ringName(ringOf(d))} · ${d.toFixed(1)} setores da origem`;
  const badge = $('b-pol'); badge.textContent = G.events.length || ''; badge.hidden = !G.events.length;
  const pr = $('prompt');
  let msg = '', cls = '';
  if (dead) { msg = deathMsg + ' Aguardando resgate…'; cls = 'bad'; }
  else if (hazardMsg) { msg = hazardMsg; cls = 'bad'; Sfx.warn(); }
  else if (extracting) { msg = `Extração orbital em andamento… ${Math.round(extracting.t / extracting.dur * 100)}%`; }
  else if (auto) {
    const what = auto.kind === 'dock' ? `Rota para <b>${auto.target.name}</b> · ${fmt(dist(S.x, S.y, auto.tx ?? S.x, auto.ty ?? S.y))} u` : auto.kind === 'mine' ? `Mineração automática · porão ${cu}/${fmt(cargoCap())}` : `Atacando <b>${ENEMY_TYPES[auto.target.type].nome}</b>`;
    msg = `<span class="ap">Piloto automático</span> ${what} · <kbd>W A S D</kbd> retoma`; cls = 'auto';
  } else if (!dock && nearPlanet) { msg = `<kbd>E</kbd> Entrar em órbita de <b>${nearPlanet.name}</b>`; cls = 'act'; }
  else if (ENEMIES.length) { msg = `${ENEMIES.length} pirata${ENEMIES.length > 1 ? 's' : ''} por perto · clique numa nave para atacar`; cls = 'bad'; }
  if (pr.dataset.msg !== msg) { pr.innerHTML = msg; pr.dataset.msg = msg; }
  pr.className = msg ? 'show ' + cls : '';
  drawRadar();
}
function setBar(id, f, label) {
  const el = $(id);
  el.querySelector('i').style.width = clamp(f, 0, 1) * 100 + '%';
  el.querySelector('span').textContent = label;
  el.classList.toggle('low', f < 0.3);
}
const TYPE_COL = { rochoso: '#a39a8e', desertico: '#e0a060', oceanico: '#3f8fe0', terrestre: '#5fc06a', vulcanico: '#ff6a30', gelado: '#d8ecff', gasoso: '#e8c890', exotico: '#c27bff' };
function drawRadar() {
  const w = radarCv.width, hh = radarCv.height, c = rctx, R = w / 2 - 4, range = 7000, S = G.ship;
  c.clearRect(0, 0, w, hh);
  c.save(); c.translate(w / 2, hh / 2);
  c.fillStyle = 'rgba(6,14,26,0.72)'; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(95,225,255,0.18)'; c.lineWidth = 1;
  for (const k of [0.33, 0.66, 1]) { c.beginPath(); c.arc(0, 0, R * k, 0, TAU); c.stroke(); }
  c.beginPath(); c.moveTo(-R, 0); c.lineTo(R, 0); c.moveTo(0, -R); c.lineTo(0, R); c.stroke();
  if (c.createConicGradient) { const sg = c.createConicGradient((performance.now() / 1000) % TAU, 0, 0); sg.addColorStop(0, 'rgba(95,225,255,0.22)'); sg.addColorStop(0.12, 'rgba(95,225,255,0)'); sg.addColorStop(1, 'rgba(95,225,255,0)'); c.fillStyle = sg; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill(); }
  c.beginPath(); c.arc(0, 0, R, 0, TAU); c.clip();
  const k = R / range, P = (x, y) => [(x - S.x) * k, (y - S.y) * k];
  for (const a of snap.asts) { const [x, y] = P(a.x, a.y); c.fillStyle = 'rgba(160,150,140,0.55)'; c.fillRect(x - 0.8, y - 0.8, 1.6, 1.6); }
  for (const s of snap.stars) { const [x, y] = P(s.x, s.y); c.fillStyle = STAR_CLASSES[s.cls].col; c.beginPath(); c.arc(x, y, 4, 0, TAU); c.fill(); }
  for (const b of snap.bhs) { const [x, y] = P(b.x, b.y); c.strokeStyle = '#ff9a50'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, 4, 0, TAU); c.stroke(); }
  for (const p of snap.planets) {
    const [x, y] = P(p._x, p._y);
    c.fillStyle = TYPE_COL[p.type]; c.beginPath(); c.arc(x, y, clamp(p.r * k * 2.2, 2, 6), 0, TAU); c.fill();
    if (isColony(p)) { c.strokeStyle = '#7dffa8'; c.lineWidth = 1.2; c.beginPath(); c.arc(x, y, 8, 0, TAU); c.stroke(); }
  }
  for (const e of ENEMIES) { const [x, y] = P(e.x, e.y); c.fillStyle = '#ff4040'; c.beginPath(); c.moveTo(x, y - 3.5); c.lineTo(x + 3.5, y + 3); c.lineTo(x - 3.5, y + 3); c.fill(); }
  if (auto && auto.tx !== undefined) { const [x, y] = P(auto.tx, auto.ty); c.strokeStyle = '#5fe1ff'; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(0, 0); c.lineTo(x, y); c.stroke(); c.setLineDash([]); }
  c.restore();
  const ha = Math.atan2(-S.y, -S.x);
  if (Math.hypot(S.x, S.y) > range * 0.9) {
    c.save(); c.translate(w / 2 + Math.cos(ha) * (R - 7), hh / 2 + Math.sin(ha) * (R - 7)); c.rotate(ha);
    c.fillStyle = '#7dffa8'; c.beginPath(); c.moveTo(6, 0); c.lineTo(-4, -4); c.lineTo(-4, 4); c.fill(); c.restore();
  }
  c.save(); c.translate(w / 2, hh / 2); c.rotate(S.a); c.fillStyle = '#fff';
  c.beginPath(); c.moveTo(6, 0); c.lineTo(-4, -3.5); c.lineTo(-2, 0); c.lineTo(-4, 3.5); c.fill(); c.restore();
}

/* ---------- render ---------- */
const STAR_LAYERS = [
  { tile: makeStarTile(11, 1100, 1.1, 0.55), f: 0.012 },
  { tile: makeStarTile(22, 420, 2.2, 0.8), f: 0.035 },
  { tile: makeStarTile(33, 110, 3.4, 1), f: 0.08 },
];
const DUST = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), z: rnd(0.4, 1) }));
const PROJ_COL = { flak: [255, 220, 140], rail: [230, 240, 255], laser: [120, 235, 255], elaser: [255, 80, 70], ancient: [120, 255, 170], def: [125, 255, 168], plasma: [255, 120, 255], missile: [255, 200, 120] };
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#02040a'; ctx.fillRect(0, 0, CW, CH);
  if (!G) return;
  const Z = cam.z * DPR;
  for (const L of STAR_LAYERS) {
    const ox = -(((cam.x * L.f * DPR) % STAR_TILE) + STAR_TILE) % STAR_TILE, oy = -(((cam.y * L.f * DPR) % STAR_TILE) + STAR_TILE) % STAR_TILE;
    for (let y = oy; y < CH; y += STAR_TILE) for (let x = ox; x < CW; x += STAR_TILE) ctx.drawImage(L.tile, x, y);
  }
  const NF = 0.15, nx0 = cam.x * NF - CW / 2 / DPR, ny0 = cam.y * NF - CH / 2 / DPR;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  for (let cy = Math.floor(ny0 / NEB_CHUNK); cy * NEB_CHUNK < ny0 + CH / DPR; cy++) {
    for (let cx = Math.floor(nx0 / NEB_CHUNK); cx * NEB_CHUNK < nx0 + CW / DPR; cx++) {
      const ch = nebulaChunk(cx, cy);
      if (!ch.ready) continue;
      const x0 = Math.round((cx * NEB_CHUNK - nx0) * DPR), y0 = Math.round((cy * NEB_CHUNK - ny0) * DPR);
      const x1 = Math.round(((cx + 1) * NEB_CHUNK - nx0) * DPR), y1 = Math.round(((cy + 1) * NEB_CHUNK - ny0) * DPR);
      ctx.drawImage(ch.cv, 1, 1, NEB_RES, NEB_RES, x0, y0, x1 - x0, y1 - y0);
    }
  }
  let shx = 0, shy = 0;
  if (shake > 0.3) { shx = rnd(-shake, shake) * DPR; shy = rnd(-shake, shake) * DPR; }
  const WX = x => (x - cam.x) * Z + CW / 2 + shx, WY = y => (y - cam.y) * Z + CH / 2 + shy;
  const vis = (x, y, r) => x + r > 0 && x - r < CW && y + r > 0 && y - r < CH;
  const t = G.time;

  for (const s of snap.stars) { const x = WX(s.x), y = WY(s.y), R = s.r * Z; if (vis(x, y, R * 9)) drawStar(ctx, s, x, y, R, t); }
  for (const b of snap.bhs) { const x = WX(b.x), y = WY(b.y), R = b.r * Z; if (vis(x, y, R * 8)) drawBlackHole(ctx, b, x, y, R, t); }
  ctx.lineWidth = 1;
  for (const p of snap.planets) {
    const x = WX(p.cx), y = WY(p.cy), R = p.orbit * Z;
    if (!vis(x, y, R + 5)) continue;
    ctx.strokeStyle = isColony(p) ? 'rgba(125,255,168,0.12)' : p === nearPlanet ? 'rgba(95,225,255,0.16)' : 'rgba(150,170,210,0.06)';
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
  }
  for (const p of snap.planets) {
    const x = WX(p._x), y = WY(p._y), R = p.r * Z;
    if (!vis(x, y, R * 2.4)) continue;
    drawPlanet(ctx, p, x, y, R, Math.atan2(p.cy - p._y, p.cx - p._x), t);
    const c = G.col[p.id];
    if (c && c.def) drawDefenses(p, c, WX, WY, Z, t);
  }
  for (const a of snap.asts.concat(FRAGS)) {
    const x = WX(a.x), y = WY(a.y), R = a.r * Z;
    if (!vis(x, y, R * 1.2)) continue;
    const sp = asteroidSprite(a), s = (a.r * 2 + 4) * Z;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a.a0 + a.spin * t);
    ctx.drawImage(sp, -s / 2, -s / 2, s, s);
    ctx.restore();
    if (a.hp < a.maxHp && auto && auto.target === a) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - R, y + R + 6 * DPR, R * 2, 3 * DPR);
      ctx.fillStyle = '#ffb547'; ctx.fillRect(x - R, y + R + 6 * DPR, R * 2 * clamp(a.hp / a.maxHp, 0, 1), 3 * DPR);
    }
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const k of PICKS) {
    const x = WX(k.x), y = WY(k.y);
    if (!vis(x, y, 20)) continue;
    const c = k.kind === 'cr' ? [255, 200, 80] : hexRgb(RESOURCES[k.ore].cor), s = 5 * Z * 1.4 + 2;
    const g = ctx.createRadialGradient(x, y, 0, x, y, s * 3);
    g.addColorStop(0, rgba(c, 0.9)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s * 3, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(k.rot); ctx.fillStyle = '#fff';
    if (k.kind === 'cr') { ctx.beginPath(); ctx.arc(0, 0, s * 0.45, 0, TAU); ctx.fill(); } else ctx.fillRect(-s * 0.4, -s * 0.4, s * 0.8, s * 0.8);
    ctx.restore();
  }
  for (const b of PROJ) {
    const x = WX(b.x), y = WY(b.y);
    if (!vis(x, y, 40)) continue;
    const col = PROJ_COL[b.kind] || PROJ_COL.laser, a = Math.atan2(b.vy, b.vx);
    if (b.kind === 'plasma') {
      const r = (b.r + 4) * Z + 3, g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
      g.addColorStop(0, '#fff'); g.addColorStop(0.3, rgba(col, 0.9)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, TAU); ctx.fill(); continue;
    }
    if (b.kind === 'missile') {
      ctx.save(); ctx.translate(x, y); ctx.rotate(b.a); ctx.fillStyle = '#dfe6ee'; ctx.fillRect(-7 * Z - 2, -1.5 * DPR, 12 * Z + 3, 3 * DPR);
      const g = ctx.createRadialGradient(-8 * Z, 0, 0, -8 * Z, 0, 10 * DPR); g.addColorStop(0, 'rgba(255,220,150,0.9)'); g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(-8 * Z, 0, 10 * DPR, 0, TAU); ctx.fill(); ctx.restore(); continue;
    }
    const l = 26 * Z + 6;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    const g = ctx.createLinearGradient(-l, 0, 4, 0);
    g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.7, rgba(col, 0.9)); g.addColorStop(1, '#fff');
    ctx.fillStyle = g; ctx.fillRect(-l, -1.6 * DPR, l + 4, 3.2 * DPR);
    ctx.restore();
  }
  const S = G.ship;
  if (beam.on && !dead) {
    const D = currentDesign(), nx = S.x + Math.cos(S.a) * D.len * 0.55, ny = S.y + Math.sin(S.a) * D.len * 0.55;
    const x1 = WX(nx), y1 = WY(ny), x2 = WX(beam.x2), y2 = WY(beam.y2);
    for (const [w, a] of [[9, 0.15], [4, 0.45], [1.6, 1]]) { ctx.strokeStyle = `rgba(160,255,200,${a})`; ctx.lineWidth = w * DPR * (0.8 + Math.random() * 0.4); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    const g = ctx.createRadialGradient(x2, y2, 0, x2, y2, 18 * DPR); g.addColorStop(0, 'rgba(200,255,220,0.9)'); g.addColorStop(1, 'rgba(120,255,170,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x2, y2, 18 * DPR, 0, TAU); ctx.fill();
  }
  for (const q of PARTS) {
    const x = WX(q.x), y = WY(q.y);
    if (!vis(x, y, 10)) continue;
    const a = clamp(q.life / q.max, 0, 1);
    ctx.globalCompositeOperation = q.add ? 'lighter' : 'source-over';
    ctx.fillStyle = rgba(q.col, a * (q.add ? 0.9 : 0.6));
    const s = q.size * DPR * (q.add ? 1 : Math.max(0.6, Z * 1.5));
    ctx.fillRect(x - s / 2, y - s / 2, s, s);
  }
  ctx.globalCompositeOperation = 'source-over';
  for (const e of ENEMIES) {
    const x = WX(e.x), y = WY(e.y);
    if (!vis(x, y, 80 * Z + 20)) continue;
    const sp = shipSprite(e.design, 2), k = Z / sp.scale;
    drawEngineFlames(ctx, e.design, x, y, e.a, 0.7, Z, t, [255, 110, 70]);
    ctx.save(); ctx.translate(x, y); ctx.rotate(e.a);
    ctx.drawImage(sp.cv, -sp.size * k / 2, -sp.size * k / 2, sp.size * k, sp.size * k);
    if (e.hit > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6; ctx.drawImage(sp.cv, -sp.size * k / 2, -sp.size * k / 2, sp.size * k, sp.size * k); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    ctx.restore();
    const bw = Math.max(30 * DPR, e.r * 2 * Z);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - bw / 2, y - e.r * Z - 12 * DPR, bw, 3 * DPR);
    ctx.fillStyle = '#ff5050'; ctx.fillRect(x - bw / 2, y - e.r * Z - 12 * DPR, bw * clamp(e.hp / e.maxHp, 0, 1), 3 * DPR);
  }
  if (mode === 'play') drawFleet(WX, WY, Z, t, vis);
  if (mode === 'play' && !dead) {
    const D = currentDesign(), x = WX(S.x), y = WY(S.y), sp = shipSprite(D, 3), k = Z / sp.scale;
    drawEngineFlames(ctx, D, x, y, S.a, thrustVis, Z, t);
    ctx.save(); ctx.translate(x, y); ctx.rotate(S.a);
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8 * DPR;
    ctx.drawImage(sp.cv, -sp.size * k / 2, -sp.size * k / 2, sp.size * k, sp.size * k);
    ctx.shadowBlur = 0;
    if (Math.floor(t * 1.5) % 2 === 0) {
      ctx.globalCompositeOperation = 'lighter';
      for (const [yy, col] of [[-D.span, '255,60,60'], [D.span, '60,255,120']]) {
        const lx = -D.len * (D.sweep + 0.06) * Z, ly = yy * 0.96 * Z;
        const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 7 * DPR);
        g.addColorStop(0, `rgba(${col},0.9)`); g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, 7 * DPR, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
    if (S.shield > 0 && shieldT > 2.6) {
      ctx.globalCompositeOperation = 'lighter';
      const r = D.len * 0.8 * Z, g = ctx.createRadialGradient(x, y, r * 0.7, x, y, r);
      g.addColorStop(0, 'rgba(95,225,255,0)'); g.addColorStop(1, `rgba(95,225,255,${(shieldT - 2.6) * 1.2})`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  if (mode === 'play') {
    ctx.strokeStyle = 'rgba(190,210,255,0.35)'; ctx.lineWidth = DPR;
    const vx = S.vx * Z, vy = S.vy * Z, spd = Math.hypot(vx, vy);
    for (const d of DUST) {
      const x = ((d.x * CW - cam.x * Z * d.z) % CW + CW) % CW, y = ((d.y * CH - cam.y * Z * d.z) % CH + CH) % CH;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - vx * 0.03 * d.z - 0.5, y - vy * 0.03 * d.z); ctx.globalAlpha = clamp(spd / 400, 0.15, 0.8) * d.z; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // alvo do piloto automático
  if (auto && mode === 'play') {
    const tg = auto.target, tx = auto.kind === 'dock' ? tg._x : tg.x, ty = auto.kind === 'dock' ? tg._y : tg.y;
    if (tx !== undefined) {
      const x = WX(tx), y = WY(ty), r = (auto.kind === 'dock' ? tg.r * 1.15 : tg.r + 14) * Z + 6 * DPR;
      ctx.strokeStyle = auto.kind === 'attack' ? 'rgba(255,90,90,0.85)' : 'rgba(95,225,255,0.85)'; ctx.lineWidth = 1.5 * DPR;
      ctx.setLineDash([6 * DPR, 6 * DPR]); ctx.lineDashOffset = -t * 20 * DPR;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
  }
  // destaque do objeto sob o cursor
  if (mode === 'play' && !touchMode && !panelOpen) {
    const [wx, wy] = screenToWorld(mouse.x, mouse.y), o = pickObject(wx, wy);
    cv.style.cursor = o ? 'pointer' : 'crosshair';
    if (o && (!auto || auto.target !== o.target)) {
      const tg = o.target, tx = o.kind === 'dock' ? tg._x : tg.x, ty = o.kind === 'dock' ? tg._y : tg.y, r = (o.kind === 'dock' ? tg.r * 1.15 : tg.r + 14) * Z + 6 * DPR;
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = DPR; ctx.beginPath(); ctx.arc(WX(tx), WY(ty), r, 0, TAU); ctx.stroke();
      ctx.font = `${Math.round(12 * DPR)}px "Exo 2", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(230,241,255,0.9)';
      ctx.fillText(o.kind === 'dock' ? 'Clique: ir e entrar em órbita' : o.kind === 'mine' ? 'Clique: minerar automaticamente' : 'Clique: atacar', WX(tx), WY(ty) - r - 8 * DPR);
    }
  }
  ctx.textAlign = 'center';
  for (const p of snap.planets) {
    const x = WX(p._x), y = WY(p._y), R = p.r * Z;
    if (!vis(x, y, R + 60)) continue;
    const known = G.discovered[p.id] || isColony(p), c = G.col[p.id];
    const ly = y + R * (p.ring ? 0.9 : 1) + 18 * DPR;
    ctx.font = `${Math.round(12 * DPR)}px "Exo 2", system-ui, sans-serif`;
    ctx.fillStyle = c ? 'rgba(125,255,168,0.9)' : known ? 'rgba(220,235,255,0.75)' : 'rgba(220,235,255,0.35)';
    ctx.fillText(known ? p.name : 'Sinal desconhecido', x, ly);
    if (known) {
      ctx.font = `${Math.round(10 * DPR)}px "Exo 2", system-ui, sans-serif`; ctx.fillStyle = 'rgba(150,175,210,0.65)';
      const sub = c ? `Colônia · ${GOVS[c.gov].nome}` : PLANET_TYPES[p.type].nome + (p.pop ? ' · ' + GOVS[planetGov(p)].nome : '');
      ctx.fillText(sub, x, ly + 14 * DPR);
    }
  }
  shake *= 0.86;
  if (joy.on) {
    ctx.strokeStyle = 'rgba(95,225,255,0.4)'; ctx.lineWidth = 2 * DPR;
    ctx.beginPath(); ctx.arc(joy.ox * DPR, joy.oy * DPR, 60 * DPR, 0, TAU); ctx.stroke();
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.min(60, Math.hypot(dx, dy)), a = Math.atan2(dy, dx);
    ctx.fillStyle = 'rgba(95,225,255,0.35)'; ctx.beginPath(); ctx.arc((joy.ox + Math.cos(a) * d) * DPR, (joy.oy + Math.sin(a) * d) * DPR, 24 * DPR, 0, TAU); ctx.fill();
  }
}
function drawFleet(WX, WY, Z, t, vis) {
  for (const s of G.fleet) {
    const rt = FLEET_RT.get(s.id); if (!rt) continue;
    const x = WX(rt.x), y = WY(rt.y);
    if (!vis(x, y, 120 * Z + 20)) continue;
    const D = fleetDesign(s), sp = shipSprite(D, 2), k = Z / sp.scale, f = fstats(s);
    if (rt.beam) {
      const nx = WX(rt.x + Math.cos(rt.a) * f.r), ny = WY(rt.y + Math.sin(rt.a) * f.r);
      for (const [w, a] of [[7, 0.15], [3, 0.5], [1.2, 1]]) { ctx.strokeStyle = `rgba(160,255,200,${a})`; ctx.lineWidth = w * DPR; ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(WX(rt.beam.x2), WY(rt.beam.y2)); ctx.stroke(); }
    }
    drawEngineFlames(ctx, D, x, y, rt.a, rt.thrust, Z, t);
    ctx.save(); ctx.translate(x, y); ctx.rotate(rt.a);
    ctx.drawImage(sp.cv, -sp.size * k / 2, -sp.size * k / 2, sp.size * k, sp.size * k);
    if (rt.hit > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; ctx.drawImage(sp.cv, -sp.size * k / 2, -sp.size * k / 2, sp.size * k, sp.size * k); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    ctx.restore();
    const R = f.r * Z, hpF = s.hp / f.hpMax;
    if (hpF < 0.999) {
      const bw = Math.max(26 * DPR, R * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - bw / 2, y - R - 10 * DPR, bw, 3 * DPR);
      ctx.fillStyle = hpF > 0.35 ? '#7dffa8' : '#ff5a5a'; ctx.fillRect(x - bw / 2, y - R - 10 * DPR, bw * clamp(hpF, 0, 1), 3 * DPR);
    }
    if (cam.z > 0.35) {
      ctx.font = `${Math.round(10 * DPR)}px "Exo 2", system-ui, sans-serif`; ctx.textAlign = 'center';
      ctx.fillStyle = s.post ? 'rgba(125,255,168,0.7)' : 'rgba(150,200,255,0.7)';
      ctx.fillText(s.name, x, y + R + 14 * DPR);
    }
  }
}
function drawDefenses(p, c, WX, WY, Z, t) {
  const near = ENEMIES.some(e => dist(e.x, e.y, p._x, p._y) < 3000);
  // escudo planetário
  const es = defLv(c, 'escudo');
  if (es) {
    const x = WX(p._x), y = WY(p._y), R = (p.r + 40 + Math.min(80, es * 6)) * Z;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, R * 0.85, x, y, R);
    g.addColorStop(0, 'rgba(95,180,255,0)'); g.addColorStop(1, `rgba(120,200,255,${near ? 0.35 + 0.1 * Math.sin(t * 6) : 0.08})`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  for (const u of defenseUnits(p, c)) {
    const x = WX(u.x), y = WY(u.y);
    if (x < -60 || y < -60 || x > CW + 60 || y > CH + 60) continue;
    const s = Math.max(3 * DPR, ({ laser: 12, missil: 16, canhao: 22, minas: 7, fortaleza: 70 })[u.type] * Z);
    ctx.save(); ctx.translate(x, y); ctx.rotate(u.a);
    if (u.type === 'minas') {
      const armed = (c._cd && (c._cd['minas' + u.i] || 0) <= 0);
      ctx.fillStyle = '#4a4f58'; ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill();
      ctx.fillStyle = armed ? (Math.floor(t * 2 + u.i) % 2 ? '#ff4040' : '#802020') : '#333'; ctx.beginPath(); ctx.arc(0, 0, s * 0.4, 0, TAU); ctx.fill();
    } else if (u.type === 'fortaleza') {
      ctx.fillStyle = '#4c5462'; ctx.fillRect(-s, -s * 0.18, s * 2, s * 0.36); ctx.fillRect(-s * 0.18, -s, s * 0.36, s * 2);
      const g = ctx.createRadialGradient(-s * 0.2, -s * 0.2, 0, 0, 0, s * 0.55); g.addColorStop(0, '#d8e0ec'); g.addColorStop(1, '#5a6474');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, s * 0.55, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#8a96a8'; ctx.lineWidth = Math.max(1, s * 0.06); ctx.beginPath(); ctx.arc(0, 0, s * 0.8, 0, TAU); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#7dffa8';
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(Math.cos(i * Math.PI / 2) * s * 0.9, Math.sin(i * Math.PI / 2) * s * 0.9, s * 0.07, 0, TAU); ctx.fill(); }
    } else {
      const col = { laser: '#7dffa8', missil: '#ffb547', canhao: '#9cc2ff' }[u.type];
      ctx.fillStyle = '#5a6270'; ctx.fillRect(-s, -s * 0.32, s * 2, s * 0.64);
      ctx.fillStyle = '#a2adbd'; ctx.beginPath(); ctx.arc(0, 0, s * 0.55, 0, TAU); ctx.fill();
      if (u.type === 'canhao') { ctx.fillStyle = '#3a404a'; ctx.fillRect(0, -s * 0.14, s * 1.4, s * 0.28); }
      if (u.type === 'missil') { ctx.fillStyle = '#3a404a'; ctx.fillRect(-s * 0.45, -s * 0.45, s * 0.9, s * 0.9); }
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, s * 0.22, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  const ds = DRONES.get(p.id);
  if (ds) for (const d of ds) {
    const x = WX(d.x), y = WY(d.y), s = Math.max(3 * DPR, 9 * Z);
    ctx.save(); ctx.translate(x, y); ctx.rotate(d.a);
    ctx.fillStyle = '#c8d2e0'; ctx.beginPath(); ctx.moveTo(s * 1.2, 0); ctx.lineTo(-s, -s * 0.8); ctx.lineTo(-s * 0.5, 0); ctx.lineTo(-s, s * 0.8); ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(120,200,255,0.8)'; ctx.beginPath(); ctx.arc(-s * 0.8, 0, s * 0.35, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

/* ---------- título ---------- */
function showTitle() {
  mode = 'title';
  document.body.classList.add('at-title');
  $('btn-continue').hidden = !loadSave();
}
function startPlay() {
  mode = 'play'; dock = null; dead = 0; auto = null;
  document.body.classList.remove('at-title');
  cam.x = G.ship.x; cam.y = G.ship.y;
  ST = shipStats();
}
$('btn-new').addEventListener('click', () => {
  if (loadSave() && !$('btn-new').dataset.confirm) { $('btn-new').dataset.confirm = '1'; $('btn-new').textContent = 'Confirmar: apagar campanha salva'; return; }
  newGame(); startPlay(); save(); openHelp();
});
$('btn-continue').addEventListener('click', () => {
  const d = loadSave(); if (!d) return;
  resetWorldCaches(); G = d; G.zoom = G.zoom || 0.55; startPlay(); toast('Bem-vindo de volta, comandante.');
});
$('btn-help').addEventListener('click', () => openHelp());
$('h-menu').addEventListener('click', () => { save(); closePanel(); showTitle(); });
addEventListener('beforeunload', () => save());
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

/* ---------- loop ---------- */
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  CW = cv.width = Math.round(innerWidth * DPR); CH = cv.height = Math.round(innerHeight * DPR);
  radarCv.width = radarCv.height = Math.round(170 * DPR);
}
addEventListener('resize', resize);
resize();
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  Jobs.run(mode === 'title' ? 12 : 6);
  update(dt);
  render();
  requestAnimationFrame(loop);
}
newGame(1337);
const saved = loadSave();
if (saved) { G.seed = saved.seed; resetWorldCaches(); }
showTitle();
requestAnimationFrame(loop);
