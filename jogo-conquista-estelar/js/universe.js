'use strict';
/* =====================================================================
   UNIVERSO: tabelas de dados e geração procedural por setor.
   Mesma coordenada + mesma semente = mesmo conteúdo, sempre.
   ===================================================================== */

const SECTOR = 9000;

const PLANET_TYPES = {
  rochoso: { nome: 'Rochoso', hab: 0, atmo: null, atmoA: 0, clouds: 0, ring: 0.08, size: [90, 190], variants: 3 },
  desertico: { nome: 'Desértico', hab: 0.25, atmo: '#e9b37c', atmoA: 0.45, clouds: 0.1, ring: 0.06, size: [110, 220], variants: 3 },
  oceanico: { nome: 'Oceânico', hab: 0.8, atmo: '#7cc0ff', atmoA: 0.75, clouds: 0.6, ring: 0.05, size: [150, 270], variants: 2 },
  terrestre: { nome: 'Terrestre', hab: 1, atmo: '#8cc8ff', atmoA: 0.7, clouds: 0.5, ring: 0.05, size: [140, 260], variants: 3 },
  vulcanico: { nome: 'Vulcânico', hab: 0, atmo: '#ff7b3a', atmoA: 0.35, clouds: 0.15, ring: 0.06, size: [100, 200], variants: 2 },
  gelado: { nome: 'Gelado', hab: 0.1, atmo: '#cfe8ff', atmoA: 0.45, clouds: 0.2, ring: 0.15, size: [110, 230], variants: 2 },
  gasoso: { nome: 'Gigante gasoso', hab: 0, atmo: '#f2d6a8', atmoA: 0.5, clouds: 0, ring: 0.55, size: [300, 500], variants: 5 },
  exotico: { nome: 'Exótico', hab: 0.05, atmo: '#c27bff', atmoA: 0.65, clouds: 0.25, ring: 0.3, size: [120, 250], variants: 3 },
};

const RESOURCES = {
  ferro: { nome: 'Ferro', base: 4, cor: '#c08a5a' },
  titanio: { nome: 'Titânio', base: 11, cor: '#9fc4e8' },
  platina: { nome: 'Platina', base: 28, cor: '#f2f2ff' },
  cristal: { nome: 'Cristal quântico', base: 75, cor: '#c27bff' },
  helio3: { nome: 'Hélio-3', base: 18, cor: '#ffd27a' },
  biomassa: { nome: 'Biomassa', base: 9, cor: '#7fd36b' },
  artefatos: { nome: 'Artefatos antigos', base: 140, cor: '#4ff0d2' },
};
const ORES = ['ferro', 'titanio', 'platina', 'cristal'];

const GOVS = {
  nenhum: { nome: 'Nenhum', desc: 'Mundo desabitado.' },
  democracia: { nome: 'Democracia', desc: 'Estável e próspera, mas lenta para decidir.' },
  monarquia: { nome: 'Monarquia', desc: 'Lealdade forte; depende do humor da coroa.' },
  tecnocracia: { nome: 'Tecnocracia', desc: 'Pesquisa acelerada, população menor.' },
  teocracia: { nome: 'Teocracia', desc: 'Moral elevada, ciência contida.' },
  corporatocracia: { nome: 'Corporatocracia', desc: 'Comércio farto, impostos altos.' },
  anarquia: { nome: 'Anarquia', desc: 'Sem impostos, sem ordem: piratas à vontade.' },
  militar: { nome: 'Regime militar', desc: 'Defesas fortes, risco de revoltas.' },
};

const STAR_CLASSES = {
  M: { nome: 'Anã vermelha', col: '#ff7a4d', glow: '#ff5a2a', core: '#ffd6b8', r: [90, 140], w: 30, temp: 0.55 },
  K: { nome: 'Anã laranja', col: '#ffad5c', glow: '#ff8a2a', core: '#ffecd2', r: [120, 170], w: 22, temp: 0.8 },
  G: { nome: 'Anã amarela', col: '#ffd977', glow: '#ffb83a', core: '#fffaeb', r: [140, 200], w: 18, temp: 1 },
  F: { nome: 'Branco-amarelada', col: '#fff0c4', glow: '#ffe08a', core: '#ffffff', r: [160, 220], w: 12, temp: 1.2 },
  A: { nome: 'Estrela branca', col: '#e4ecff', glow: '#b8ccff', core: '#ffffff', r: [180, 250], w: 8, temp: 1.5 },
  B: { nome: 'Gigante azul', col: '#a3c6ff', glow: '#5f95ff', core: '#f2f7ff', r: [240, 330], w: 5, temp: 2.2 },
  W: { nome: 'Anã branca', col: '#d6e4ff', glow: '#9bb8ff', core: '#ffffff', r: [45, 65], w: 4, temp: 0.9 },
};

const RING_NAMES = ['Núcleo', 'Fronteira Interna', 'Orla', 'Marcas Exteriores', 'Vazio Profundo', 'Abismo'];
function ringOf(d) { return Math.floor(d / 4); }
function ringName(r) { return r < RING_NAMES.length ? RING_NAMES[r] : 'Abismo ' + (r - RING_NAMES.length + 2); }

/* ---------- nomes ---------- */
const SYL_A = ['Ka', 'Vor', 'Tel', 'Ix', 'Ae', 'Zan', 'Mor', 'Qua', 'Ry', 'Sol', 'Neb', 'Tor', 'Ul', 'Xe', 'Ori', 'Sha', 'Dra', 'Ve', 'Lu', 'Cy', 'Ith', 'Bel', 'Kor', 'Ny', 'Ar', 'Eos', 'Gal', 'Hy', 'Om', 'Pra'];
const SYL_B = ['ra', 'li', 'on', 'th', 'ex', 'ar', 'is', 'um', 'or', 'en', 'ya', 'ux', 'ze', 'ka', 'nd', 'va', 'ri', 'mo'];
const SYL_C = ['a', 'is', 'on', 'us', 'ar', 'ia', 'e', 'ix', 'or', 'eth', 'ion', 'ara', 'yx', 'ul'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
function genName(rng) {
  let s = rng.pick(SYL_A);
  if (rng.chance(0.65)) s += rng.pick(SYL_B);
  s += rng.pick(SYL_C);
  if (rng.chance(0.18)) s += '-' + rng.int(2, 99);
  return s;
}

/* ---------- geração do setor ---------- */
const sectorCache = new Map();
function getSector(sx, sy) {
  const key = sx + ',' + sy;
  let s = sectorCache.get(key);
  if (!s) { s = genSector(sx, sy, G.seed); sectorCache.set(key, s); }
  s.lastUse = performance.now();
  return s;
}
function trimSectors() {
  if (sectorCache.size < 80) return;
  const arr = [...sectorCache.values()].sort((a, b) => a.lastUse - b.lastUse);
  for (let i = 0; i < arr.length - 60; i++) sectorCache.delete(arr[i].key);
}

function genSector(sx, sy, wseed) {
  const rng = makeRng(hash2(sx, sy, wseed));
  const d = Math.hypot(sx, sy);
  const home = sx === 0 && sy === 0;
  const cx = sx * SECTOR + SECTOR / 2, cy = sy * SECTOR + SECTOR / 2;
  const sec = { sx, sy, key: sx + ',' + sy, d, ring: ringOf(d), home, star: null, bh: null, planets: [], asteroids: [] };

  if (home || rng.chance(0.62)) {
    if (!home && d > 3 && rng.chance(0.03 + Math.min(0.05, d * 0.002))) {
      sec.bh = { x: cx + rng.range(-1500, 1500), y: cy + rng.range(-1500, 1500), r: rng.range(110, 210), name: genName(rng) + ' (buraco negro)', seed: rng.int(1, 1e9), id: sec.key + ':bh' };
    } else {
      genSystem(sec, rng, cx, cy, home);
    }
  }
  // aglomerados de asteroides soltos
  const clusters = rng.int(home ? 1 : 0, 2);
  for (let c = 0; c < clusters; c++) {
    const ax = cx + rng.range(-3800, 3800), ay = cy + rng.range(-3800, 3800);
    if (sec.star && dist(ax, ay, sec.star.x, sec.star.y) < sec.star.r * 3) continue;
    const n = rng.int(8, 20);
    for (let i = 0; i < n; i++) addAsteroid(sec, rng, ax + rng.range(-650, 650), ay + rng.range(-650, 650));
  }
  return sec;
}

function genSystem(sec, rng, cx, cy, home) {
  const cls = home ? 'G' : rng.weighted(Object.fromEntries(Object.entries(STAR_CLASSES).map(([k, v]) => [k, v.w])));
  const sc = STAR_CLASSES[cls];
  const sx = home ? cx - 600 : cx + rng.range(-1200, 1200), sy = home ? cy : cy + rng.range(-1200, 1200);
  const name = home ? 'Hélion' : genName(rng);
  sec.star = { x: sx, y: sy, cls, r: rng.range(sc.r[0], sc.r[1]), name, seed: rng.int(1, 1e9), id: sec.key + ':star' };
  const n = home ? 4 : rng.int(1, 6);
  let orbit = sec.star.r + rng.range(700, 1000);
  for (let i = 0; i < n; i++) {
    const zone = orbit / 1000 / Math.sqrt(sc.temp); // < 1.4 quente, 1.4-2.6 temperado, > 2.6 frio
    let type;
    if (home && i === 1) type = 'terrestre';
    else if (zone < 1.4) type = rng.weighted({ vulcanico: 4, rochoso: 4, desertico: 3, exotico: 0.3 + sec.d * 0.05 });
    else if (zone < 2.6) type = rng.weighted({ terrestre: 3, oceanico: 3, desertico: 2, rochoso: 2, exotico: 0.3 + sec.d * 0.05 });
    else type = rng.weighted({ gasoso: 5, gelado: 4, rochoso: 1.5, exotico: 0.5 + sec.d * 0.06 });
    const pt = PLANET_TYPES[type];
    const r = rng.range(pt.size[0], pt.size[1]);
    orbit += r;
    const p = makePlanet(sec, rng, i, type, r, orbit, home && i === 1);
    sec.planets.push(p);
    orbit += r + rng.range(450, 850);
    // cinturão de asteroides entre órbitas
    if (rng.chance(home && i === 1 ? 1 : 0.25) && orbit < 4300) {
      const br = orbit + 120, cnt = rng.int(30, 55), a0 = rng.range(0, TAU), span = rng.range(1.2, 3);
      for (let k = 0; k < cnt; k++) {
        const a = a0 + rng.range(0, span), rr = br + rng.range(-160, 160);
        addAsteroid(sec, rng, sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
      }
      orbit += 420;
    }
    if (orbit > 4400) break;
  }
}

function makePlanet(sec, rng, i, type, r, orbit, isHome) {
  const pt = PLANET_TYPES[type], star = sec.star, sc = STAR_CLASSES[star.cls];
  const p = {
    id: sec.key + ':' + i, sec: sec.key, idx: i, type, r, orbit,
    a0: rng.range(0, TAU), w: 0.0035 * Math.pow(1000 / orbit, 1.5),
    name: isHome ? 'Nova Aurora' : rng.chance(0.7) ? star.name + ' ' + ROMAN[i] : genName(rng),
    seed: rng.int(1, 1e9), variant: rng.int(0, pt.variants - 1),
    spin: rng.range(0.006, 0.02) * (rng.chance(0.15) ? -1 : 1),
    tilt: rng.range(-0.45, 0.45),
    ring: rng.chance(pt.ring) && !isHome, ringTilt: rng.range(-0.5, 0.5),
    home: isHome, cx: star.x, cy: star.y, dist: sec.d,
  };
  const temp = Math.round(-180 + 460 * sc.temp / Math.sqrt(orbit / 1000) * 0.55 + (type === 'vulcanico' ? 300 : 0) + (type === 'gelado' ? -60 : 0));
  p.tempC = temp;
  p.grav = +(r / 180 * (type === 'gasoso' ? 1.6 : 1) * rng.range(0.8, 1.2)).toFixed(2);
  p.diam = Math.round(r * 62 + rng.range(-400, 400)); // km
  // recursos
  const res = {};
  const add = (k, v) => { if (v > 0.05) res[k] = +clamp(v, 0, 1).toFixed(2); };
  add('ferro', rng.range(0, 1) * (type === 'rochoso' || type === 'vulcanico' ? 1 : 0.5));
  add('titanio', rng.range(0, 0.9) * (type === 'vulcanico' || type === 'desertico' ? 1 : 0.5));
  add('platina', rng.range(-0.3, 0.8) * (1 + sec.d * 0.03));
  if (type === 'gasoso' || type === 'gelado') add('helio3', rng.range(0.3, 1));
  if (type === 'terrestre' || type === 'oceanico') add('biomassa', rng.range(0.4, 1));
  if (type === 'exotico' || sec.d > 6) add('cristal', rng.range(-0.4, 0.9) * (type === 'exotico' ? 1.5 : 0.6));
  if (rng.chance(0.04 + sec.d * 0.01)) add('artefatos', rng.range(0.2, 0.8));
  p.res = res;
  // população e governo
  const habitable = isHome || rng.chance(pt.hab * (temp > -60 && temp < 90 ? 1 : 0.25));
  if (habitable) {
    p.pop = isHome ? 4.2e9 : Math.round(Math.pow(10, rng.range(3, 9.8)) * Math.max(0.05, pt.hab));
    p.gov = isHome ? 'democracia' : rng.weighted({ democracia: 3, monarquia: 2, tecnocracia: 2, teocracia: 1.5, corporatocracia: 2, anarquia: 1 + sec.d * 0.1, militar: 1.5 });
  } else { p.pop = 0; p.gov = 'nenhum'; }
  // perigos
  const hz = [];
  if ((type === 'gasoso' || type === 'oceanico' || type === 'desertico') && rng.chance(0.4)) hz.push('Tempestades');
  if ((sc.temp > 1.4 && orbit < 2200) || (type === 'exotico' && rng.chance(0.5))) hz.push('Radiação');
  if (!isHome && rng.chance(Math.min(0.6, 0.05 + sec.d * 0.04) * (p.gov === 'anarquia' ? 2 : 1))) hz.push('Piratas em órbita');
  p.hazards = hz;
  // mercado: multiplicadores de preço por recurso
  p.market = {};
  for (const k in RESOURCES) p.market[k] = +(rng.range(0.75, 1.35) * (res[k] ? 1 - res[k] * 0.35 : 1.1) * (1 + sec.d * 0.04)).toFixed(3);
  return p;
}

function addAsteroid(sec, rng, x, y) {
  const d = sec.d;
  const big = rng.chance(0.12);
  const r = big ? rng.range(55, 85) : rng.range(14, 42);
  const ore = rng.weighted({ ferro: 60, titanio: 22 + d * 2, platina: 4 + d * 1.6, cristal: d >= 5 ? (d - 4) * 2.2 : 0 });
  sec.asteroids.push({
    id: sec.key + ':a' + sec.asteroids.length, x, y, r, ore,
    spin: rng.range(-0.6, 0.6), a0: rng.range(0, TAU), seed: rng.int(1, 1e9),
    hp: r * 2.2 * (1 + d * 0.12), maxHp: r * 2.2 * (1 + d * 0.12), dist: d,
  });
}

function planetPos(p, t) {
  const a = p.a0 + p.w * t;
  return { x: p.cx + Math.cos(a) * p.orbit, y: p.cy + Math.sin(a) * p.orbit };
}
