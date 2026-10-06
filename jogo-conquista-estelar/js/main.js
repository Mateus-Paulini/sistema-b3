'use strict';
/* =====================================================================
   CONQUISTA ESTELAR — jogo principal (estágio 1: exploração infinita)
   ===================================================================== */

const cv = document.getElementById('view'), ctx = cv.getContext('2d');
const radarCv = document.getElementById('radar'), rctx = radarCv.getContext('2d');
const $ = id => document.getElementById(id);
let DPR = 1, CW = 0, CH = 0;
let G = null;                 // estado salvo
let mode = 'title';           // title | play
let dock = null;              // planeta onde a nave está em órbita
let dead = 0;                 // contagem regressiva de respawn
const cam = { x: 0, y: 0, z: 0.6 };
const PROJ = [], PICKS = [], FRAGS = [], PARTS = [];
let snap = { stars: [], bhs: [], planets: [], asts: [] };

/* ---------- atributos da nave (serão expandidos no estágio 2) ---------- */
function shipStats() {
  return { hullMax: 100, energyMax: 100, thrust: 560, maxSpeed: 640, boost: 1.85, turn: 5, dmg: 10, fireCd: 0.14, cargoMax: 40, sensor: 3400, tractor: 170 };
}
let shipDesign = makeShipDesign(1);

/* ---------- novo jogo / salvar ---------- */
const SAVE_KEY = 'conquista-estelar-v2';
function newGame(seed) {
  G = {
    v: 2, seed: seed ?? ((Math.random() * 1e9) | 0), time: 0,
    ship: { x: 0, y: 0, vx: 0, vy: 0, a: 0, hull: 100, energy: 100 },
    credits: 250, cargo: {}, discovered: {}, lastDock: null, mined: {},
    stats: { dist: 0, mined: 0, found: 0, deaths: 0, earned: 0 }, zoom: 0.55,
  };
  resetWorldCaches();
  const home = getSector(0, 0).planets.find(p => p.home);
  const pos = planetPos(home, 0);
  G.ship.x = pos.x + home.r + 380; G.ship.y = pos.y + 120; G.ship.a = Math.PI;
  G.lastDock = home.id;
  cam.x = G.ship.x; cam.y = G.ship.y;
}
function resetWorldCaches() {
  sectorCache.clear(); texCache.clear(); planetCanvases.clear(); nebCache.clear(); ringCache.clear(); starCache.clear(); diskCache.clear();
  nebNoise = null; Jobs.q.length = 0;
  PROJ.length = PICKS.length = FRAGS.length = PARTS.length = 0;
}
function save() {
  if (!G || mode !== 'play') return false;
  try {
    const now = G.time;
    for (const k in G.mined) if (now - G.mined[k] > 700) delete G.mined[k];
    localStorage.setItem(SAVE_KEY, JSON.stringify(G)); return true;
  } catch (e) { return false; }
}
function loadSave() {
  try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (d && d.v === 2) return d; } catch (e) { /* sem save */ }
  return null;
}
function findPlanet(id) {
  const [sec, i] = id.split(':'), [sx, sy] = sec.split(',').map(Number);
  return getSector(sx, sy).planets.find(p => p.id === id) || null;
}

/* ---------- entrada ---------- */
const keys = {};
const mouse = { x: 0, y: 0, down: false, active: 0 };
let touchMode = false;
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0, on: false };
const tbtn = { fire: false, boost: false };
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat || mode !== 'play') return;
  if (e.code === 'KeyE') interact();
  if (e.code === 'Escape') { if (panelOpen) closePanel(); }
  if (e.code === 'KeyH') openHelp();
  if (e.code === 'Equal' || e.code === 'NumpadAdd') G.zoom = clamp(G.zoom * 1.15, 0.12, 1.6);
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') G.zoom = clamp(G.zoom / 1.15, 0.12, 1.6);
});
addEventListener('keyup', e => { keys[e.code] = false; });
cv.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { mouse.x = e.clientX * DPR; mouse.y = e.clientY * DPR; mouse.active = performance.now(); } });
cv.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') { if (e.button === 0) mouse.down = true; mouse.x = e.clientX * DPR; mouse.y = e.clientY * DPR; mouse.active = performance.now(); return; }
  setTouch(true);
  if (e.clientX < innerWidth * 0.5 && joy.id === null) {
    joy.id = e.pointerId; joy.ox = joy.x = e.clientX; joy.oy = joy.y = e.clientY; joy.on = true;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
});
cv.addEventListener('pointermove', e => { if (e.pointerId === joy.id) { joy.x = e.clientX; joy.y = e.clientY; } });
const endJoy = e => { if (e.pointerId === joy.id) { joy.id = null; joy.on = false; } if (e.pointerType === 'mouse') mouse.down = false; };
cv.addEventListener('pointerup', endJoy); cv.addEventListener('pointercancel', endJoy);
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.down = false; });
cv.addEventListener('wheel', e => { if (mode !== 'play') return; e.preventDefault(); G.zoom = clamp(G.zoom * (e.deltaY > 0 ? 0.9 : 1.11), 0.12, 1.6); }, { passive: false });
cv.addEventListener('contextmenu', e => e.preventDefault());
function setTouch(on) { if (touchMode === on) return; touchMode = on; document.body.classList.toggle('touch', on); }
for (const [id, k] of [['t-fire', 'fire'], ['t-boost', 'boost']]) {
  const el = $(id);
  el.addEventListener('pointerdown', e => { e.preventDefault(); tbtn[k] = true; });
  el.addEventListener('pointerup', () => { tbtn[k] = false; }); el.addEventListener('pointerleave', () => { tbtn[k] = false; });
}
$('t-zin').addEventListener('click', () => { G.zoom = clamp(G.zoom * 1.25, 0.12, 1.6); });
$('t-zout').addEventListener('click', () => { G.zoom = clamp(G.zoom / 1.25, 0.12, 1.6); });
$('prompt').addEventListener('click', () => interact());

/* ---------- áudio simples (sintetizado) ---------- */
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
  shot() { if (this.rate('s', 90)) this.tone(880, 0.09, 'triangle', 0.03, -500); },
  rock() { if (this.rate('r', 40)) this.noise(0.08, 0.05, 1500); },
  boom(big) { this.noise(big ? 0.9 : 0.35, big ? 0.22 : 0.1, big ? 500 : 900); },
  pick() { if (this.rate('p', 50)) this.tone(1200 + Math.random() * 300, 0.07, 'sine', 0.03); },
  ok() { [660, 880, 1320].forEach((f, i) => this.tone(f, 0.12, 'sine', 0.04, 0, i * 0.07)); },
  disc() { [523, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.035, 0, i * 0.12)); },
  warn() { if (this.rate('w', 900)) { this.tone(440, 0.15, 'square', 0.025); this.tone(330, 0.15, 'square', 0.025, 0, 0.18); } },
};
addEventListener('pointerdown', () => Sfx.init()); addEventListener('keydown', () => Sfx.init());

/* ---------- toasts ---------- */
function toast(msg, cls = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + cls; el.textContent = msg;
  $('toasts').prepend(el);
  setTimeout(() => el.classList.add('out'), 3800);
  setTimeout(() => el.remove(), 4400);
  while ($('toasts').children.length > 5) $('toasts').lastChild.remove();
}

/* ---------- painéis ---------- */
let panelOpen = false, panelTick = null;
function openPanel(content, opts = {}) {
  const p = $('panel');
  p.innerHTML = '';
  p.className = 'show ' + (opts.cls || '');
  const box = document.createElement('div'); box.className = 'sheet';
  const close = document.createElement('button'); close.className = 'x'; close.setAttribute('aria-label', 'Fechar'); close.textContent = '×';
  close.onclick = () => closePanel();
  box.appendChild(close);
  if (typeof content === 'string') box.insertAdjacentHTML('beforeend', content); else box.appendChild(content);
  p.appendChild(box);
  panelOpen = true; panelTick = opts.tick || null;
  return box;
}
function closePanel() {
  const p = $('panel'); p.className = ''; p.innerHTML = '';
  panelOpen = false; panelTick = null;
  if (dock) undock();
}
function btn(label, onClick, cls = '', disabled = false) {
  const b = document.createElement('button'); b.className = 'btn ' + cls; b.innerHTML = label; b.disabled = disabled;
  b.addEventListener('click', e => { e.stopPropagation(); if (!b.disabled) onClick(); });
  return b;
}

/* ---------- interação: órbita / mercado ---------- */
let nearPlanet = null;
function interact() {
  if (mode !== 'play' || dead) return;
  if (dock) { closePanel(); return; }
  if (nearPlanet) dockAt(nearPlanet);
}
function dockAt(p) {
  dock = p; G.lastDock = p.id;
  G.ship.vx = G.ship.vy = 0;
  Sfx.ok();
  openPlanetPanel(p);
}
function undock() {
  const p = dock; dock = null;
  if (p) { const pos = planetPos(p, G.time); const a = Math.atan2(G.ship.y - pos.y, G.ship.x - pos.x); G.ship.vx = Math.cos(a) * 120; G.ship.vy = Math.sin(a) * 120; }
}
function cargoUsed() { let n = 0; for (const k in G.cargo) n += G.cargo[k]; return n; }
const ATMOS = { terrestre: 'Nitrogênio-oxigênio (respirável)', oceanico: 'Úmida, rica em vapor', desertico: 'Fina, rica em CO₂', vulcanico: 'Tóxica, sulfurosa', gelado: 'Rarefeita, metano', gasoso: 'Hidrogênio e hélio', exotico: 'Anômala, composição desconhecida', rochoso: 'Nenhuma' };
function sellPrice(p, k) { return Math.max(1, Math.round(RESOURCES[k].base * p.market[k])); }

function openPlanetPanel(p) {
  const sec = getSector(...p.sec.split(',').map(Number)), star = sec.star, sc = STAR_CLASSES[star.cls];
  const root = document.createElement('div'); root.className = 'planet';
  const head = document.createElement('div'); head.className = 'p-head';
  const portrait = document.createElement('canvas'); portrait.className = 'portrait';
  portrait.width = portrait.height = Math.round(200 * DPR);
  head.appendChild(portrait);
  const gov = GOVS[p.gov];
  head.insertAdjacentHTML('beforeend', `<div class="p-title">
    <div class="eyebrow">${PLANET_TYPES[p.type].nome} · Sistema ${star.name}</div>
    <h2>${p.name}</h2>
    <div class="chips">${p.home ? '<span class="chip ok">Mundo natal</span>' : ''}${p.hazards.map(h => `<span class="chip warn">${h}</span>`).join('')}${p.ring ? '<span class="chip">Anéis</span>' : ''}</div>
  </div>`);
  root.appendChild(head);
  const facts = [
    ['Estrela', `${star.name} (${sc.nome})`],
    ['Diâmetro', fmt(p.diam) + ' km'],
    ['Gravidade', p.grav.toLocaleString('pt-BR') + ' g'],
    ['Temperatura', p.tempC + ' °C'],
    ['Atmosfera', ATMOS[p.type]],
    ['População', p.pop ? fmtBig(p.pop) + ' hab.' : 'Desabitado'],
    ['Governo', `${gov.nome}${p.pop ? ` <span class="muted">· ${gov.desc}</span>` : ''}`],
    ['Setor', `${p.sec.replace(',', ', ')} · ${ringName(sec.ring)}`],
  ];
  root.insertAdjacentHTML('beforeend', `<h3>Dados planetários</h3><dl class="facts">${facts.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>`);
  const res = Object.entries(p.res).sort((a, b) => b[1] - a[1]);
  root.insertAdjacentHTML('beforeend', `<h3>Recursos naturais</h3>${res.length ? `<div class="res">${res.map(([k, v]) => `<div class="res-row"><span>${RESOURCES[k].nome}</span><span class="meter"><i style="width:${Math.round(v * 100)}%;background:${RESOURCES[k].cor}"></i></span><span class="num">${Math.round(v * 100)}%</span></div>`).join('')}</div>` : '<p class="muted">Nenhum recurso relevante detectado.</p>'}`);

  // mercado
  const mk = document.createElement('div');
  const renderMarket = () => {
    mk.innerHTML = '<h3>Mercado</h3>';
    const keysC = Object.keys(G.cargo).filter(k => G.cargo[k] > 0);
    if (!keysC.length) mk.insertAdjacentHTML('beforeend', '<p class="muted">Seu porão está vazio. Minere asteroides para ter o que vender.</p>');
    let total = 0;
    for (const k of keysC) {
      const q = G.cargo[k], pr = sellPrice(p, k); total += q * pr;
      const row = document.createElement('div'); row.className = 'm-row';
      const trend = p.market[k] > 1.15 ? '<span class="up">alta demanda</span>' : p.market[k] < 0.85 ? '<span class="down">mercado saturado</span>' : '';
      row.innerHTML = `<span class="dot" style="background:${RESOURCES[k].cor}"></span><span class="nm">${RESOURCES[k].nome} ${trend}</span><span class="num">${q} × ${pr} CR</span>`;
      row.appendChild(btn('Vender', () => sell(p, k), 'sm'));
      mk.appendChild(row);
    }
    if (keysC.length > 1) { const r = document.createElement('div'); r.className = 'm-total'; r.appendChild(btn(`Vender tudo · ${fmt(total)} CR`, () => { for (const k of keysC) sell(p, k, true); Sfx.ok(); }, 'primary')); mk.appendChild(r); }
    // estaleiro (reparo)
    const st = shipStats(), miss = Math.ceil(st.hullMax - G.ship.hull), cost = Math.ceil(miss * 1.5);
    mk.insertAdjacentHTML('beforeend', '<h3>Estaleiro orbital</h3>');
    const rr = document.createElement('div'); rr.className = 'm-row';
    rr.innerHTML = `<span class="dot" style="background:#5fe1ff"></span><span class="nm">Reparar casco <span class="muted">${Math.round(G.ship.hull)}/${st.hullMax}</span></span><span class="num">${miss > 0 ? fmt(cost) + ' CR' : 'Intacto'}</span>`;
    rr.appendChild(btn('Reparar', () => { if (G.credits >= cost) { G.credits -= cost; G.ship.hull = st.hullMax; Sfx.ok(); renderMarket(); } }, 'sm', miss <= 0 || G.credits < cost));
    mk.appendChild(rr);
  };
  const sell = (pl, k, quiet) => {
    const q = G.cargo[k] || 0; if (!q) return;
    const v = q * sellPrice(pl, k);
    G.credits += v; G.stats.earned += v; G.cargo[k] = 0;
    if (!quiet) Sfx.ok();
    toast(`Vendido: ${q} ${RESOURCES[k].nome} por ${fmt(v)} CR`, 'gold');
    renderMarket();
  };
  renderMarket();
  root.appendChild(mk);
  const foot = document.createElement('div'); foot.className = 'foot';
  foot.appendChild(btn('Deixar órbita <kbd>E</kbd>', () => closePanel(), 'primary'));
  root.appendChild(foot);
  const pctx = portrait.getContext('2d');
  openPanel(root, {
    cls: 'side',
    tick: () => {
      pctx.clearRect(0, 0, portrait.width, portrait.height);
      const R = portrait.width * (p.ring ? 0.2 : 0.36);
      const pos = planetPos(p, G.time);
      drawPlanet(pctx, p, portrait.width / 2, portrait.height / 2, R, Math.atan2(p.cy - pos.y, p.cx - pos.x), G.time, 'p');
    },
  });
}

function openHelp() {
  openPanel(`<div class="help">
    <div class="eyebrow">Manual de bordo</div><h2>Controles</h2>
    <dl class="keys">
      <dt>W A S D / setas</dt><dd>Propulsão na direção desejada</dd>
      <dt>Mouse</dt><dd>Mira; a nave gira para o cursor</dd>
      <dt>Clique / Espaço</dt><dd>Disparar o laser de mineração</dd>
      <dt>Shift</dt><dd>Pós-combustão (gasta energia)</dd>
      <dt>E</dt><dd>Entrar / sair da órbita de um planeta</dd>
      <dt>Roda do mouse / + −</dt><dd>Zoom</dd>
      <dt>H</dt><dd>Este manual</dd>
    </dl>
    <h3>Como jogar</h3>
    <p>O universo é infinito: cada setor é gerado a partir da sua coordenada e é sempre o mesmo quando você volta. Quanto mais longe da origem, mais ricos os minérios e mais estranhos os mundos, e mais perigoso o caminho.</p>
    <p>Destrua asteroides para coletar minério e venda nos planetas. Cada mundo tem seu próprio mercado, governo e recursos. Descobrir planetas e estrelas rende créditos de cartografia.</p>
    <p class="muted">Cuidado com o calor das estrelas e com a gravidade dos buracos negros.</p>
    <div class="foot"></div></div>`);
  $('panel').querySelector('.foot').appendChild(btn('Entendi', () => closePanel(), 'primary'));
}

/* ---------- partículas ---------- */
function burst(x, y, n, col, spd, life, size = 2, add = true) {
  for (let i = 0; i < n; i++) {
    const a = rnd(TAU), v = rnd(spd * 0.15, spd);
    PARTS.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(life * 0.4, life), max: life, size: rnd(size * 0.5, size * 1.4), col, add });
  }
}

/* ---------- mundo: coleta de objetos próximos ---------- */
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
let fireT = 0, thrustVis = 0, hudT = 0, saveT = 0, hazardMsg = '';
function update(dt) {
  if (!G) return;
  G.time += dt;
  snap = gatherWorld();
  const S = G.ship, st = shipStats();
  if (mode === 'title') {
    const home = snap.planets.find(p => p.home) || snap.planets[0];
    if (home) { cam.x = lerp(cam.x, home._x - 900 / cam.z * (innerWidth > 800 ? 0.45 : 0) + Math.cos(G.time * 0.05) * 300, 0.02); cam.y = lerp(cam.y, home._y + Math.sin(G.time * 0.05) * 300, 0.02); }
    cam.z = 0.45;
    updateParts(dt);
    return;
  }
  hazardMsg = '';
  if (dead > 0) {
    dead -= dt;
    if (dead <= 0) respawn();
  } else if (dock) {
    const pos = planetPos(dock, G.time), a = Math.atan2(S.y - pos.y, S.x - pos.x) + dt * 0.12, r = dock.r + 140;
    S.x = pos.x + Math.cos(a) * r; S.y = pos.y + Math.sin(a) * r; S.a = a + Math.PI / 2; S.vx = S.vy = 0;
    thrustVis = lerp(thrustVis, 0.15, 0.1);
    S.energy = Math.min(st.energyMax, S.energy + 30 * dt);
  } else {
    flight(dt, st);
  }
  // câmera
  const lead = 0.35;
  cam.x = lerp(cam.x, S.x + S.vx * lead, 1 - Math.exp(-5 * dt));
  cam.y = lerp(cam.y, S.y + S.vy * lead, 1 - Math.exp(-5 * dt));
  const sp = Math.hypot(S.vx, S.vy);
  cam.z = lerp(cam.z, G.zoom * (1 - Math.min(0.25, (sp / st.maxSpeed) * 0.25)), 1 - Math.exp(-3 * dt));

  updateProjectiles(dt);
  updatePickups(dt, st);
  updateFrags(dt);
  updateParts(dt);
  discover(st);

  // prompt / HUD
  if ((hudT += dt) > 0.1) { hudT = 0; updateHud(st); }
  if ((saveT += dt) > 12) { saveT = 0; save(); }
  if (panelTick) panelTick();
}

function flight(dt, st) {
  const S = G.ship;
  let ix = 0, iy = 0;
  if (keys.KeyW || keys.ArrowUp) iy -= 1;
  if (keys.KeyS || keys.ArrowDown) iy += 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  if (joy.on) {
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy);
    if (d > 8) { const k = Math.min(1, d / 60); ix = dx / d * k; iy = dy / d * k; }
  }
  const il = Math.hypot(ix, iy);
  if (il > 1) { ix /= il; iy /= il; }
  const boosting = (keys.ShiftLeft || keys.ShiftRight || tbtn.boost) && il > 0 && S.energy > 2;
  const thrust = st.thrust * (boosting ? st.boost : 1);
  S.vx += ix * thrust * dt; S.vy += iy * thrust * dt;
  if (boosting) S.energy -= 28 * dt; else S.energy = Math.min(st.energyMax, S.energy + 14 * dt);
  // arrasto leve (controle), velocidade máxima
  const drag = il > 0 ? 0.35 : 0.9;
  S.vx *= Math.exp(-drag * dt); S.vy *= Math.exp(-drag * dt);
  const maxV = st.maxSpeed * (boosting ? st.boost : 1);
  let sp = Math.hypot(S.vx, S.vy);
  if (sp > maxV) { S.vx *= maxV / sp; S.vy *= maxV / sp; sp = maxV; }
  // forças do ambiente
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
      const k = (lim - d) / lim;
      damage(k * 45 * dt, true);
      hazardMsg = 'Calor estelar crítico! Casco derretendo.';
      if (d < s.r) { killShip('Sua nave foi vaporizada pela estrela.'); return; }
    }
  }
  S.x += S.vx * dt; S.y += S.vy * dt;
  G.stats.dist += sp * dt;
  // orientação: mira do mouse, joystick ou direção de movimento
  let target = S.a;
  const mouseRecent = !touchMode && performance.now() - mouse.active < 4000;
  if (mouseRecent) {
    const wx = (mouse.x - CW / 2) / (cam.z * DPR) + cam.x, wy = (mouse.y - CH / 2) / (cam.z * DPR) + cam.y;
    target = Math.atan2(wy - S.y, wx - S.x);
  } else if (il > 0.1) target = Math.atan2(iy, ix);
  else if (sp > 40) target = Math.atan2(S.vy, S.vx);
  S.a += clamp(angDiff(S.a, target), -st.turn * dt, st.turn * dt);
  thrustVis = lerp(thrustVis, il > 0 ? (boosting ? 1 : 0.65) : 0.08, 1 - Math.exp(-10 * dt));
  // tiro
  fireT -= dt;
  const firing = keys.Space || mouse.down || tbtn.fire;
  if (firing && fireT <= 0) {
    fireT = st.fireCd;
    const ca = Math.cos(S.a), sa = Math.sin(S.a), nose = shipDesign.len * 0.55;
    PROJ.push({ x: S.x + ca * nose, y: S.y + sa * nose, vx: S.vx + ca * 1500, vy: S.vy + sa * 1500, life: 0.75, dmg: st.dmg });
    Sfx.shot();
  }
  // colisão com asteroides
  const all = snap.asts.concat(FRAGS);
  for (const a of all) {
    const ax = a.x, ay = a.y, rr = a.r * 0.82 + 16, d = dist(S.x, S.y, ax, ay);
    if (d < rr && d > 0) {
      const nx = (S.x - ax) / d, ny = (S.y - ay) / d, vn = S.vx * nx + S.vy * ny - (a.vx || 0) * nx - (a.vy || 0) * ny;
      S.x = ax + nx * rr; S.y = ay + ny * rr;
      if (vn < 0) {
        S.vx -= 1.6 * vn * nx; S.vy -= 1.6 * vn * ny;
        if (-vn > 110) { damage((-vn - 110) * 0.06); burst(S.x - nx * 14, S.y - ny * 14, 10, [255, 200, 140], 160, 0.5, 2.5); Sfx.rock(); }
      }
    }
  }
  // planeta próximo para órbita
  nearPlanet = null;
  for (const p of snap.planets) if (dist(S.x, S.y, p._x, p._y) < p.r + 320) { nearPlanet = p; break; }
}
function damage(v, quiet) {
  const S = G.ship;
  if (dead || v <= 0) return;
  S.hull -= v;
  if (!quiet) shake = Math.min(14, shake + v * 0.5);
  if (S.hull <= 0) killShip('Casco destruído.');
}
let shake = 0, deathMsg = '';
function killShip(msg) {
  if (dead) return;
  const S = G.ship;
  S.hull = 0; dead = 3; deathMsg = msg; G.stats.deaths++;
  burst(S.x, S.y, 90, [255, 170, 80], 420, 1.6, 4);
  burst(S.x, S.y, 50, [255, 255, 255], 260, 0.8, 2);
  Sfx.boom(true); shake = 22;
  const lost = cargoUsed();
  G.cargo = {};
  toast(msg + (lost ? ` Carga perdida: ${lost} un.` : ''), 'bad');
}
function respawn() {
  const S = G.ship, st = shipStats();
  const p = (G.lastDock && findPlanet(G.lastDock)) || getSector(0, 0).planets.find(q => q.home);
  const fee = Math.floor(G.credits * 0.1);
  G.credits -= fee;
  const pos = planetPos(p, G.time);
  S.x = pos.x + p.r + 300; S.y = pos.y; S.vx = S.vy = 0; S.hull = st.hullMax; S.energy = st.energyMax;
  cam.x = S.x; cam.y = S.y;
  toast(`Rebocado até ${p.name}. Taxa de resgate: ${fmt(fee)} CR.`);
}

function hitAsteroid(a, dmg, x, y) {
  a.hp -= dmg;
  burst(x, y, 4, [200, 190, 170], 120, 0.4, 2, false);
  Sfx.rock();
  if (a.hp <= 0) breakAsteroid(a);
}
function breakAsteroid(a) {
  const isFrag = a.frag;
  if (isFrag) { const i = FRAGS.indexOf(a); if (i >= 0) FRAGS.splice(i, 1); }
  else G.mined[a.id] = G.time;
  burst(a.x, a.y, 18 + a.r * 0.6, [170, 160, 150], 160 + a.r * 2, 1.2, 3, false);
  burst(a.x, a.y, 10, [255, 200, 140], 200, 0.5, 2);
  Sfx.boom(false);
  G.stats.mined++;
  if (a.r > 34) {
    const n = a.r > 60 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const ang = rnd(TAU), r = a.r * rnd(0.35, 0.5);
      FRAGS.push({ frag: true, x: a.x + Math.cos(ang) * a.r * 0.4, y: a.y + Math.sin(ang) * a.r * 0.4, vx: Math.cos(ang) * rnd(20, 70) + (a.vx || 0), vy: Math.sin(ang) * rnd(20, 70) + (a.vy || 0), r, ore: a.ore, seed: (a.seed + i * 7919) | 0, spin: rnd(-1, 1), a0: rnd(TAU), hp: r * 2.2, maxHp: r * 2.2, born: G.time });
    }
  }
  const drops = Math.max(1, Math.round(a.r / 12));
  for (let i = 0; i < drops; i++) {
    const ang = rnd(TAU), v = rnd(30, 110);
    PICKS.push({ x: a.x, y: a.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, ore: a.ore, t: 45, rot: rnd(TAU) });
  }
}
function updateProjectiles(dt) {
  const all = snap.asts.concat(FRAGS);
  for (let i = PROJ.length - 1; i >= 0; i--) {
    const b = PROJ[i];
    b.life -= dt;
    const steps = 3;
    let hit = false;
    for (let s = 0; s < steps && !hit; s++) {
      b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
      for (const a of all) {
        if (Math.abs(b.x - a.x) > a.r + 10 || Math.abs(b.y - a.y) > a.r + 10) continue;
        if (dist(b.x, b.y, a.x, a.y) < a.r * 0.85) { hitAsteroid(a, b.dmg, b.x, b.y); hit = true; break; }
      }
    }
    if (hit || b.life <= 0) PROJ.splice(i, 1);
  }
}
function updatePickups(dt, st) {
  const S = G.ship, full = cargoUsed() >= st.cargoMax;
  for (let i = PICKS.length - 1; i >= 0; i--) {
    const k = PICKS[i];
    k.t -= dt; k.rot += dt * 2;
    const d = dist(k.x, k.y, S.x, S.y);
    if (!dead && !full && d < st.tractor) {
      const a = Math.atan2(S.y - k.y, S.x - k.x), pull = 900 * (1 - d / st.tractor) + 200;
      k.vx += Math.cos(a) * pull * dt; k.vy += Math.sin(a) * pull * dt;
    }
    k.vx *= Math.exp(-1.5 * dt); k.vy *= Math.exp(-1.5 * dt);
    k.x += k.vx * dt; k.y += k.vy * dt;
    if (!dead && d < 26) {
      if (full) { if (Sfx.rate('full', 3000)) toast('Porão de carga cheio! Venda em um planeta.', 'bad'); continue; }
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
    if (G.time - f.born > 120) FRAGS.splice(i, 1);
  }
}
function updateParts(dt) {
  for (let i = PARTS.length - 1; i >= 0; i--) {
    const q = PARTS[i];
    q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= Math.exp(-1.8 * dt); q.vy *= Math.exp(-1.8 * dt);
    if ((q.life -= dt) <= 0) PARTS.splice(i, 1);
  }
  if (PARTS.length > 1500) PARTS.splice(0, PARTS.length - 1500);
}
function discover(st) {
  const S = G.ship;
  const check = (id, x, y, label, reward) => {
    if (G.discovered[id] || dist(S.x, S.y, x, y) > st.sensor) return;
    G.discovered[id] = 1; G.stats.found++;
    G.credits += reward; G.stats.earned += reward;
    toast(`Descoberto: ${label} · +${fmt(reward)} CR`, 'disc');
    Sfx.disc();
  };
  const secD = Math.hypot(S.x / SECTOR, S.y / SECTOR);
  for (const s of snap.stars) check(s.id, s.x, s.y, `${s.name} (${STAR_CLASSES[s.cls].nome})`, Math.round(20 * (1 + secD * 0.5)));
  for (const b of snap.bhs) check(b.id, b.x, b.y, b.name, Math.round(150 * (1 + secD * 0.5)));
  for (const p of snap.planets) check(p.id, p._x, p._y, `${p.name} (${PLANET_TYPES[p.type].nome})`, Math.round(12 * (1 + secD * 0.5) * (p.pop ? 1.5 : 1)));
}

/* ---------- HUD ---------- */
function updateHud(st) {
  const S = G.ship;
  $('h-cr').textContent = fmt(G.credits);
  setBar('h-hull', S.hull / st.hullMax, `${Math.max(0, Math.round(S.hull))}/${st.hullMax}`);
  setBar('h-en', S.energy / st.energyMax, `${Math.round(S.energy)}/${st.energyMax}`);
  const cu = cargoUsed();
  setBar('h-cargo', cu / st.cargoMax, `${cu}/${st.cargoMax}`);
  $('h-spd').textContent = Math.round(Math.hypot(S.vx, S.vy));
  const sx = Math.floor(S.x / SECTOR), sy = Math.floor(S.y / SECTOR), d = Math.hypot(S.x / SECTOR, S.y / SECTOR);
  $('h-sec').textContent = `${sx}, ${sy}`;
  $('h-ring').textContent = `${ringName(ringOf(d))} · ${d.toFixed(1)} setores da origem`;
  const pr = $('prompt');
  let msg = '', cls = '';
  if (dead) { msg = deathMsg + ' Aguardando resgate…'; cls = 'bad'; }
  else if (hazardMsg) { msg = hazardMsg; cls = 'bad'; Sfx.warn(); }
  else if (!dock && nearPlanet) { msg = `<kbd>E</kbd> Entrar em órbita de <b>${nearPlanet.name}</b>`; cls = 'act'; }
  if (pr.dataset.msg !== msg) { pr.innerHTML = msg; pr.dataset.msg = msg; }
  pr.className = msg ? 'show ' + cls : '';
  drawRadar(st);
}
function setBar(id, f, label) {
  const el = $(id);
  el.querySelector('i').style.width = clamp(f, 0, 1) * 100 + '%';
  el.querySelector('span').textContent = label;
  el.classList.toggle('low', f < 0.3);
}
const TYPE_COL = { rochoso: '#a39a8e', desertico: '#e0a060', oceanico: '#3f8fe0', terrestre: '#5fc06a', vulcanico: '#ff6a30', gelado: '#d8ecff', gasoso: '#e8c890', exotico: '#c27bff' };
function drawRadar(st) {
  const w = radarCv.width, h = radarCv.height, c = rctx, R = w / 2 - 4, range = 7000, S = G.ship;
  c.clearRect(0, 0, w, h);
  c.save(); c.translate(w / 2, h / 2);
  c.fillStyle = 'rgba(6,14,26,0.72)'; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(95,225,255,0.18)'; c.lineWidth = 1;
  for (const k of [0.33, 0.66, 1]) { c.beginPath(); c.arc(0, 0, R * k, 0, TAU); c.stroke(); }
  c.beginPath(); c.moveTo(-R, 0); c.lineTo(R, 0); c.moveTo(0, -R); c.lineTo(0, R); c.stroke();
  const sweep = (performance.now() / 1000) % TAU;
  const sg = c.createConicGradient ? c.createConicGradient(sweep, 0, 0) : null;
  if (sg) { sg.addColorStop(0, 'rgba(95,225,255,0.22)'); sg.addColorStop(0.12, 'rgba(95,225,255,0)'); sg.addColorStop(1, 'rgba(95,225,255,0)'); c.fillStyle = sg; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill(); }
  c.beginPath(); c.arc(0, 0, R, 0, TAU); c.clip();
  const k = R / range;
  const P = (x, y) => [(x - S.x) * k, (y - S.y) * k];
  for (const a of snap.asts) { const [x, y] = P(a.x, a.y); c.fillStyle = 'rgba(160,150,140,0.55)'; c.fillRect(x - 0.8, y - 0.8, 1.6, 1.6); }
  for (const s of snap.stars) { const [x, y] = P(s.x, s.y); c.fillStyle = STAR_CLASSES[s.cls].col; c.shadowColor = c.fillStyle; c.shadowBlur = 8; c.beginPath(); c.arc(x, y, 4, 0, TAU); c.fill(); c.shadowBlur = 0; }
  for (const b of snap.bhs) { const [x, y] = P(b.x, b.y); c.strokeStyle = '#ff9a50'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, 4, 0, TAU); c.stroke(); }
  for (const p of snap.planets) {
    const [x, y] = P(p._x, p._y);
    c.fillStyle = TYPE_COL[p.type]; c.beginPath(); c.arc(x, y, clamp(p.r * k * 2.2, 2, 6), 0, TAU); c.fill();
    if (p === nearPlanet || p === dock) { c.strokeStyle = '#5fe1ff'; c.lineWidth = 1; c.beginPath(); c.arc(x, y, 8, 0, TAU); c.stroke(); }
  }
  c.restore();
  // seta para a origem (mundo natal)
  const ha = Math.atan2(-S.y, -S.x), hd = Math.hypot(S.x, S.y);
  if (hd > range * 0.9) {
    c.save(); c.translate(w / 2 + Math.cos(ha) * (R - 7), h / 2 + Math.sin(ha) * (R - 7)); c.rotate(ha);
    c.fillStyle = '#7dffa8'; c.beginPath(); c.moveTo(6, 0); c.lineTo(-4, -4); c.lineTo(-4, 4); c.fill(); c.restore();
  }
  // a nave no centro
  c.save(); c.translate(w / 2, h / 2); c.rotate(S.a); c.fillStyle = '#fff';
  c.beginPath(); c.moveTo(6, 0); c.lineTo(-4, -3.5); c.lineTo(-2, 0); c.lineTo(-4, 3.5); c.fill(); c.restore();
}

/* ---------- render ---------- */
const STAR_LAYERS = [
  { tile: makeStarTile(11, 1100, 1.1, 0.55), f: 0.012 },
  { tile: makeStarTile(22, 420, 2.2, 0.8), f: 0.035 },
  { tile: makeStarTile(33, 110, 3.4, 1), f: 0.08 },
];
const DUST = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), z: rnd(0.4, 1) }));
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#02040a'; ctx.fillRect(0, 0, CW, CH);
  if (!G) return;
  const Z = cam.z * DPR;
  // estrelas de fundo (paralaxe)
  for (const L of STAR_LAYERS) {
    const ox = -(((cam.x * L.f * DPR) % STAR_TILE) + STAR_TILE) % STAR_TILE, oy = -(((cam.y * L.f * DPR) % STAR_TILE) + STAR_TILE) % STAR_TILE;
    for (let y = oy; y < CH; y += STAR_TILE) for (let x = ox; x < CW; x += STAR_TILE) ctx.drawImage(L.tile, x, y);
  }
  // nebulosas
  const NF = 0.15;
  const nx0 = cam.x * NF - CW / 2 / DPR, ny0 = cam.y * NF - CH / 2 / DPR;
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
  // tremor
  let shx = 0, shy = 0;
  if (shake > 0.3) { shx = rnd(-shake, shake) * DPR; shy = rnd(-shake, shake) * DPR; }
  const WX = x => (x - cam.x) * Z + CW / 2 + shx, WY = y => (y - cam.y) * Z + CH / 2 + shy;
  const vis = (x, y, r) => x + r > 0 && x - r < CW && y + r > 0 && y - r < CH;
  const t = G.time;

  for (const s of snap.stars) { const x = WX(s.x), y = WY(s.y), R = s.r * Z; if (vis(x, y, R * 9)) drawStar(ctx, s, x, y, R, t); }
  for (const b of snap.bhs) { const x = WX(b.x), y = WY(b.y), R = b.r * Z; if (vis(x, y, R * 8)) drawBlackHole(ctx, b, x, y, R, t); }
  // órbitas sutis
  ctx.lineWidth = 1;
  for (const p of snap.planets) {
    const x = WX(p.cx), y = WY(p.cy), R = p.orbit * Z;
    if (!vis(x, y, R + 5)) continue;
    ctx.strokeStyle = p === dock || p === nearPlanet ? 'rgba(95,225,255,0.16)' : 'rgba(150,170,210,0.06)';
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
  }
  for (const p of snap.planets) {
    const x = WX(p._x), y = WY(p._y), R = p.r * Z;
    if (!vis(x, y, R * 2.4)) continue;
    drawPlanet(ctx, p, x, y, R, Math.atan2(p.cy - p._y, p.cx - p._x), t);
  }
  // asteroides
  for (const a of snap.asts.concat(FRAGS)) {
    const x = WX(a.x), y = WY(a.y), R = a.r * Z;
    if (!vis(x, y, R * 1.2)) continue;
    const sp = asteroidSprite(a), s = (a.r * 2 + 4) * Z;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a.a0 + a.spin * t);
    ctx.drawImage(sp, -s / 2, -s / 2, s, s);
    ctx.restore();
  }
  // minério solto
  ctx.globalCompositeOperation = 'lighter';
  for (const k of PICKS) {
    const x = WX(k.x), y = WY(k.y);
    if (!vis(x, y, 20)) continue;
    const c = hexRgb(RESOURCES[k.ore].cor), s = 5 * Z * 1.4 + 2;
    const g = ctx.createRadialGradient(x, y, 0, x, y, s * 3);
    g.addColorStop(0, rgba(c, 0.9)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s * 3, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(k.rot); ctx.fillStyle = '#fff'; ctx.fillRect(-s * 0.4, -s * 0.4, s * 0.8, s * 0.8); ctx.restore();
  }
  // projéteis
  for (const b of PROJ) {
    const x = WX(b.x), y = WY(b.y), a = Math.atan2(b.vy, b.vx), l = 26 * Z + 6;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    const g = ctx.createLinearGradient(-l, 0, 4, 0);
    g.addColorStop(0, 'rgba(80,220,255,0)'); g.addColorStop(0.7, 'rgba(120,235,255,0.9)'); g.addColorStop(1, '#fff');
    ctx.fillStyle = g; ctx.fillRect(-l, -1.6 * DPR, l + 4, 3.2 * DPR);
    ctx.restore();
  }
  // partículas
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
  // nave
  const S = G.ship;
  if (mode === 'play' && !dead) {
    const x = WX(S.x), y = WY(S.y), sp = shipSprite(shipDesign, 3), k = Z / sp.scale;
    drawEngineFlames(ctx, shipDesign, x, y, S.a, thrustVis, Z, t);
    ctx.save(); ctx.translate(x, y); ctx.rotate(S.a);
    // sombra suave
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8 * DPR;
    ctx.drawImage(sp.cv, -sp.size * k / 2, -sp.size * k / 2, sp.size * k, sp.size * k);
    ctx.shadowBlur = 0;
    // luzes de navegação
    const blink = Math.floor(t * 1.5) % 2 === 0;
    if (blink) {
      ctx.globalCompositeOperation = 'lighter';
      for (const [yy, col] of [[-shipDesign.span, '255,60,60'], [shipDesign.span, '60,255,120']]) {
        const lx = -shipDesign.len * (shipDesign.sweep + 0.06) * Z, ly = yy * 0.96 * Z;
        const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 7 * DPR);
        g.addColorStop(0, `rgba(${col},0.9)`); g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, 7 * DPR, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }
  // poeira espacial (sensação de velocidade)
  if (mode === 'play') {
    ctx.strokeStyle = 'rgba(190,210,255,0.35)'; ctx.lineWidth = DPR;
    const vx = S.vx * Z, vy = S.vy * Z, sp = Math.hypot(vx, vy);
    for (const d of DUST) {
      const x = ((d.x * CW - cam.x * Z * d.z) % CW + CW) % CW, y = ((d.y * CH - cam.y * Z * d.z) % CH + CH) % CH;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - vx * 0.03 * d.z - 0.5, y - vy * 0.03 * d.z); ctx.globalAlpha = clamp(sp / 400, 0.15, 0.8) * d.z; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // rótulos de planetas
  ctx.font = `${Math.round(12 * DPR)}px "Exo 2", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  for (const p of snap.planets) {
    const x = WX(p._x), y = WY(p._y), R = p.r * Z;
    if (!vis(x, y, R + 60)) continue;
    const known = G.discovered[p.id];
    ctx.fillStyle = known ? 'rgba(220,235,255,0.75)' : 'rgba(220,235,255,0.35)';
    ctx.fillText(known ? p.name : 'Sinal desconhecido', x, y + R * (p.ring ? 0.9 : 1) + 18 * DPR);
    if (known) { ctx.fillStyle = 'rgba(150,175,210,0.6)'; ctx.font = `${Math.round(10 * DPR)}px "Exo 2", system-ui, sans-serif`; ctx.fillText(PLANET_TYPES[p.type].nome + (p.pop ? ' · habitado' : ''), x, y + R * (p.ring ? 0.9 : 1) + 32 * DPR); ctx.font = `${Math.round(12 * DPR)}px "Exo 2", system-ui, sans-serif`; }
  }
  shake *= 0.86;
  // joystick virtual
  if (joy.on) {
    ctx.strokeStyle = 'rgba(95,225,255,0.4)'; ctx.lineWidth = 2 * DPR;
    ctx.beginPath(); ctx.arc(joy.ox * DPR, joy.oy * DPR, 60 * DPR, 0, TAU); ctx.stroke();
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.min(60, Math.hypot(dx, dy)), a = Math.atan2(dy, dx);
    ctx.fillStyle = 'rgba(95,225,255,0.35)'; ctx.beginPath(); ctx.arc((joy.ox + Math.cos(a) * d) * DPR, (joy.oy + Math.sin(a) * d) * DPR, 24 * DPR, 0, TAU); ctx.fill();
  }
}

/* ---------- tela de título ---------- */
function showTitle() {
  mode = 'title';
  document.body.classList.add('at-title');
  $('btn-continue').hidden = !loadSave();
}
function startPlay() {
  mode = 'play'; dock = null; dead = 0;
  document.body.classList.remove('at-title');
  cam.x = G.ship.x; cam.y = G.ship.y;
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
$('h-help').addEventListener('click', () => openHelp());
addEventListener('beforeunload', () => save());
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

/* ---------- loop ---------- */
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  CW = cv.width = Math.round(innerWidth * DPR); CH = cv.height = Math.round(innerHeight * DPR);
  const rs = Math.round(170 * DPR);
  radarCv.width = radarCv.height = rs;
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
// fundo do título: uma galáxia de demonstração
newGame(1337);
const saved = loadSave();
if (saved) { G.seed = saved.seed; resetWorldCaches(); }
showTitle();
requestAnimationFrame(loop);
