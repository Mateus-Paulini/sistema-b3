'use strict';
/* =====================================================================
   FROTA: naves de escolta e de guarnição, com classes, armamentos
   configuráveis, níveis infinitos e IA de formação, combate e mineração.
   Defesas planetárias em órbita: torres, mísseis, canhões, minas,
   caças-drones, escudo e fortaleza.
   ===================================================================== */

const FLEET_RT = new Map(); // estado de voo de cada nave (não é salvo)
const DRONES = new Map();   // caças-drones por colônia

/* ---------- atributos ---------- */
function fleetCap() { return 3 + Math.floor((ST ? ST.tier : 1) / 3) + (G.tech.logistica || 0); }
function fstats(s) {
  const C = SHIP_CLASSES[s.cls], E = ESS();
  return {
    hpMax: Math.round(C.hp * Math.pow(1.1, s.lvl) * (1 + 0.06 * G.tech.blindagem) * E),
    dmg: Math.pow(1.1, s.lvl) * (1 + 0.06 * G.tech.balistica) * E,
    spd: C.spd * (1 + 0.04 * G.tech.propulsao) * (1 + 0.01 * Math.min(s.lvl, 40)),
    cargo: Math.round(C.cargo * (1 + 0.08 * s.lvl) * (C.mine ? 1 + 0.08 * G.tech.mineracao : 1)),
    r: 22 * C.scale,
  };
}
const escorts = () => G.fleet.filter(s => !s.post);
function cargoCap() { let c = ST.cargoMax; for (const s of escorts()) c += fstats(s).cargo; return c; }
function shipPower(s) { const f = fstats(s); return f.hpMax / 120 + s.weapons.length * f.dmg * 1.5; }
const designCacheF = new Map();
// silhueta própria de cada classe: proporções de comprimento, largura, asas, motores
const CLASS_STYLE = {
  caca: { l: 0.9, w: 0.9, s: 1.25, e: 0.9, sweep: 0.36, eng: 1 },
  interceptador: { l: 1.25, w: 0.7, s: 0.8, e: 0.8, sweep: 0.46, eng: 2 },
  minerador: { l: 0.85, w: 1.7, s: 0.75, e: 1.1, sweep: 0.22, eng: 2 },
  cargueiro: { l: 1.2, w: 2.1, s: 0.45, e: 1.2, sweep: 0.2, eng: 4 },
  corveta: { l: 1.05, w: 1.1, s: 1.0, e: 1, sweep: 0.32, eng: 2 },
  fragata: { l: 1.2, w: 1.25, s: 1.15, e: 1.05, sweep: 0.3, eng: 3 },
  destroier: { l: 1.45, w: 1.15, s: 0.85, e: 1.1, sweep: 0.4, eng: 4 },
  cruzador: { l: 1.5, w: 1.5, s: 1.1, e: 1.2, sweep: 0.34, eng: 5 },
};
function fleetDesign(s) {
  const C = SHIP_CLASSES[s.cls], t = C.vt + Math.floor(s.lvl / 10), key = s.cls + ':' + t + ':' + G.ship.paint;
  let d = designCacheF.get(key);
  if (!d) {
    d = makeShipDesign(t, C.hull, ACCENTS[G.ship.paint % ACCENTS.length], hashStr(s.cls) % 9999);
    const k = C.scale * (t > 6 ? 0.85 : 1), st = CLASS_STYLE[s.cls];
    d.len *= k * st.l; d.width *= k * st.w; d.span *= k * st.s; d.engR *= k * st.e; d.sweep = st.sweep;
    d.engines = d.engines.map(e => e * k * st.w);
    if (st.eng) { d.engines = []; for (let i = 0; i < st.eng; i++) d.engines.push(st.eng === 1 ? 0 : -d.width * 0.42 + (d.width * 0.84 * i) / (st.eng - 1)); }
    d.wingGuns = SHIP_CLASSES[s.cls].slots ? Math.min(3, Math.floor(SHIP_CLASSES[s.cls].slots / 2)) : 0;
    designCacheF.set(key, d);
  }
  return d;
}
function newFleetShip(cls) {
  const C = SHIP_CLASSES[cls];
  const used = new Set(G.fleet.map(s => s.name));
  const base = SHIP_NAMES.find(n => !used.has(n)) || 'Nave ' + (G.fleet.length + 1);
  const weapons = [];
  for (let i = 0; i < C.slots; i++) weapons.push(C.def ? C.def[i] || 'laser' : 'laser');
  const s = { id: 'f' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), cls, name: base, lvl: 0, weapons, hp: 0, post: null };
  s.hp = fstats(s).hpMax;
  return s;
}

/* ---------- construção, melhoria, configuração ---------- */
function shipyardLevel() {
  if (!dock) return -1;
  const c = G.col[dock.id];
  if (c) return c.b.estaleiro || 0;
  return dock.pop > 0 ? 1 : -1; // estaleiros civis constroem apenas naves leves
}
const buildPrice = cls => Math.round(SHIP_CLASSES[cls].cost * (1 + 0.12 * G.fleet.length) * (1 + 0.04 * (dock ? dock.dist : 0)));
function buildShip(cls) {
  const C = SHIP_CLASSES[cls], c = buildPrice(cls);
  if (G.fleet.length >= fleetCap()) { toast(`Limite de comando atingido (${fleetCap()}). Pesquise Logística de frota ou suba a classe da nau capitânia.`, 'bad'); return false; }
  if (shipyardLevel() < C.req || G.credits < c) return false;
  G.credits -= c;
  const s = newFleetShip(cls);
  G.fleet.push(s);
  Sfx.disc(); toast(`${C.nome} "${s.name}" entrou para a frota.`, 'disc');
  return true;
}
function upgradeFleetShip(s) {
  const c = shipUpCost(s);
  if (G.credits < c || shipyardLevel() < 0) return false;
  const before = fstats(s).hpMax;
  G.credits -= c; s.lvl++;
  s.hp += fstats(s).hpMax - before;
  Sfx.ok();
  return true;
}
function refit(s, slot, w) {
  if (shipyardLevel() < WEAPONS[w].req) return false;
  s.weapons[slot] = w; Sfx.ok();
  return true;
}
function scrapShip(s) {
  const v = Math.round(SHIP_CLASSES[s.cls].cost * 0.4 * (1 + s.lvl * 0.3));
  G.credits += v;
  G.fleet = G.fleet.filter(x => x !== s);
  FLEET_RT.delete(s.id);
  toast(`${s.name} desmontada: +${fmt(v)} CR`, 'gold');
}
function garrison(s, p) { s.post = p ? p.id : null; FLEET_RT.delete(s.id); Sfx.ok(); }

/* ---------- IA ---------- */
function rtOf(s, x, y) {
  let rt = FLEET_RT.get(s.id);
  if (!rt) { rt = { x: x + rnd(-200, 200), y: y + rnd(-200, 200), vx: 0, vy: 0, a: rnd(TAU), cd: {}, hit: 0, beam: null, thrust: 0 }; FLEET_RT.set(s.id, rt); }
  return rt;
}
function nearestEnemy(x, y, r) { let b = null, bd = r; for (const e of ENEMIES) { const d = dist(x, y, e.x, e.y); if (d < bd) { bd = d; b = e; } } return b; }
function moveTo(rt, f, tx, ty, stand, dt, faceA) {
  const dx = tx - rt.x, dy = ty - rt.y, d = Math.hypot(dx, dy) || 1, along = d - stand;
  const sp = along > 0 ? Math.min(f.spd, along * 2.2) : Math.max(-f.spd * 0.3, along * 2);
  const tvx = dx / d * sp, tvy = dy / d * sp;
  rt.vx += (tvx - rt.vx) * Math.min(1, 2.4 * dt); rt.vy += (tvy - rt.vy) * Math.min(1, 2.4 * dt);
  const v = Math.hypot(rt.vx, rt.vy);
  const want = faceA !== undefined ? faceA : v > 30 ? Math.atan2(rt.vy, rt.vx) : rt.a;
  rt.a += clamp(angDiff(rt.a, want), -3.5 * dt, 3.5 * dt);
  rt.thrust = clamp(v / f.spd, 0.08, 1);
  return d;
}
function weaponRange(s) { let r = 350; for (const w of s.weapons) r = Math.max(r, WEAPONS[w].range * 0.7); return Math.min(r, 900); }
function fireFleet(s, rt, f, target, isAst, dt) {
  rt.beam = null;
  const tx = target.x, ty = target.y, d = dist(rt.x, rt.y, tx, ty);
  const aim = Math.atan2(ty - rt.y, tx - rt.x);
  s.weapons.forEach((w, i) => {
    const W = WEAPONS[w], k = 'w' + i;
    rt.cd[k] = (rt.cd[k] || rnd(0, W.cd)) - dt;
    if (rt.cd[k] > 0 || d > W.range || Math.abs(angDiff(rt.a, aim)) > 0.45) return;
    rt.cd[k] = W.cd * rnd(0.9, 1.1);
    const dmg = W.dmg * f.dmg, ca = Math.cos(rt.a), sa = Math.sin(rt.a), nx = rt.x + ca * f.r, ny = rt.y + sa * f.r;
    if (w === 'feixe') {
      rt.beam = { x2: tx, y2: ty, t: 0.15 };
      if (isAst) hitAsteroid(target, dmg * 3 * (SHIP_CLASSES[s.cls].mine || 1), tx, ty); else hitEnemy(target, dmg, tx, ty);
      return;
    }
    if (w === 'flak') { for (let p = 0; p < W.pellets; p++) { const a = rt.a + rnd(-0.25, 0.25); PROJ.push({ own: 'p', kind: 'flak', x: nx, y: ny, vx: rt.vx + Math.cos(a) * W.speed, vy: rt.vy + Math.sin(a) * W.speed, life: 0.6, dmg }); } return; }
    if (w === 'missil') { PROJ.push({ own: 'p', kind: 'missile', x: nx, y: ny, vx: rt.vx + ca * 200, vy: rt.vy + sa * 200, life: 3.2, dmg, a: rt.a, tgt: target }); return; }
    const kind = w === 'plasma' ? 'plasma' : w === 'railgun' ? 'rail' : 'laser';
    PROJ.push({ own: 'p', kind, x: nx, y: ny, vx: rt.vx + ca * W.speed, vy: rt.vy + sa * W.speed, life: W.range / W.speed + 0.1, dmg, r: w === 'plasma' ? 9 : 0 });
  });
  if (Sfx.rate('fl', 140)) Sfx.tone(760, 0.06, 'triangle', 0.012, -300);
}
function updateFleet(dt) {
  const S = G.ship;
  const anchor = dock ? (() => { const p = planetPos(dock, G.time); return { x: p.x, y: p.y, a: 0, r: dock.r + 260 }; })() : { x: S.x, y: S.y, a: S.a, r: 0 };
  const list = escorts(), order = G.fleetOrder;
  const enemiesNear = ENEMIES.some(e => dist(e.x, e.y, anchor.x, anchor.y) < 3000);
  const free = cargoCap() - cargoUsed();
  const mining = new Set();
  list.forEach((s, i) => {
    const f = fstats(s), rt = rtOf(s, anchor.x, anchor.y);
    if (dead) { rt.x = anchor.x; rt.y = anchor.y; rt.vx = rt.vy = 0; return; }
    // escolta muito para trás salta de volta para junto da nau capitânia
    if (dist(rt.x, rt.y, anchor.x, anchor.y) > 6000) { const a = rnd(TAU); rt.x = anchor.x + Math.cos(a) * 400; rt.y = anchor.y + Math.sin(a) * 400; rt.vx = rt.vy = 0; burst(rt.x, rt.y, 20, [120, 200, 255], 200, 0.6, 2); }
    // reparo fora de combate
    if (!enemiesNear) s.hp = Math.min(f.hpMax, s.hp + f.hpMax * (dock ? 0.1 : 0.015) * dt);
    rt.hit -= dt;
    if (rt.beam && (rt.beam.t -= dt) <= 0) rt.beam = null;
    let target = null;
    if (order !== 'passivo') target = nearestEnemy(rt.x, rt.y, order === 'agressivo' ? 2800 : 1500);
    if (target && dist(target.x, target.y, anchor.x, anchor.y) > (order === 'agressivo' ? 3200 : 2000)) target = null;
    if (target && s.weapons.length) {
      const range = weaponRange(s), d = dist(rt.x, rt.y, target.x, target.y);
      const aim = Math.atan2(target.y - rt.y, target.x - rt.x);
      if (d > range) moveTo(rt, f, target.x, target.y, range * 0.85, dt, d < range * 1.6 ? aim : undefined);
      else {
        // órbita de combate
        const side = i % 2 ? 1 : -1, ox = target.x + Math.cos(aim + Math.PI + side * 0.9) * range * 0.8, oy = target.y + Math.sin(aim + Math.PI + side * 0.9) * range * 0.8;
        moveTo(rt, f, ox, oy, 0, dt, aim);
      }
      fireFleet(s, rt, f, target, false, dt);
    } else if (order === 'minerar' && !dock && free > 0 && s.weapons.length) {
      let best = null, bd = 1800;
      for (const a of snap.asts.concat(FRAGS)) { if (mining.has(a)) continue; const d = dist(anchor.x, anchor.y, a.x, a.y); if (d < bd) { bd = d; best = a; } }
      if (best) {
        mining.add(best);
        const aim = Math.atan2(best.y - rt.y, best.x - rt.x);
        moveTo(rt, f, best.x, best.y, best.r + 190, dt, dist(rt.x, rt.y, best.x, best.y) < best.r + 450 ? aim : undefined);
        fireFleet(s, rt, f, best, true, dt);
      } else formation(rt, f, anchor, i, dt);
    } else formation(rt, f, anchor, i, dt);
    rt.x += rt.vx * dt; rt.y += rt.vy * dt;
    // coleta de minério e créditos
    for (let j = PICKS.length - 1; j >= 0; j--) {
      const k = PICKS[j], dk = dist(k.x, k.y, rt.x, rt.y);
      if (dk > 40) {
        // raio trator das escoltas
        if (dk < 340 && (k.kind === 'cr' || cargoUsed() < cargoCap())) { const a = Math.atan2(rt.y - k.y, rt.x - k.x); k.vx += Math.cos(a) * 900 * dt; k.vy += Math.sin(a) * 900 * dt; }
        continue;
      }
      if (k.kind === 'cr') { G.credits += k.val; G.stats.earned += k.val; PICKS.splice(j, 1); }
      else if (cargoUsed() < cargoCap()) { G.cargo[k.ore] = (G.cargo[k.ore] || 0) + 1; PICKS.splice(j, 1); }
    }
  });
  // guarnições: patrulham a colônia em que estão
  for (const s of G.fleet) {
    if (!s.post) continue;
    const p = snap.planets.find(q => q.id === s.post);
    if (!p) { FLEET_RT.delete(s.id); continue; }
    const f = fstats(s), rt = rtOf(s, p._x, p._y);
    rt.hit -= dt; if (rt.beam && (rt.beam.t -= dt) <= 0) rt.beam = null;
    const target = nearestEnemy(p._x, p._y, 2600);
    if (target && s.weapons.length) {
      const range = weaponRange(s), aim = Math.atan2(target.y - rt.y, target.x - rt.x);
      moveTo(rt, f, target.x, target.y, range * 0.8, dt, dist(rt.x, rt.y, target.x, target.y) < range * 1.5 ? aim : undefined);
      fireFleet(s, rt, f, target, false, dt);
    } else {
      s.hp = Math.min(f.hpMax, s.hp + f.hpMax * 0.05 * dt);
      const idx = G.fleet.filter(x => x.post === s.post).indexOf(s), a = G.time * 0.08 + idx * 1.3, R = p.r + 420 + idx * 40;
      moveTo(rt, f, p._x + Math.cos(a) * R, p._y + Math.sin(a) * R, 0, dt);
    }
    rt.x += rt.vx * dt; rt.y += rt.vy * dt;
  }
}
function formation(rt, f, anchor, i, dt) {
  let tx, ty;
  if (anchor.r) { // flagship em órbita: escoltas orbitam o planeta
    const a = G.time * 0.1 + i * 0.7; tx = anchor.x + Math.cos(a) * (anchor.r + 120 + (i % 3) * 60); ty = anchor.y + Math.sin(a) * (anchor.r + 120 + (i % 3) * 60);
  } else { // formação em V atrás da nau capitânia
    const row = Math.floor(i / 2) + 1, side = i % 2 ? 1 : -1, ca = Math.cos(anchor.a), sa = Math.sin(anchor.a);
    const lx = -row * 120, ly = side * row * 95;
    tx = anchor.x + ca * lx - sa * ly; ty = anchor.y + sa * lx + ca * ly;
  }
  const d = moveTo(rt, f, tx, ty, 0, dt);
  if (d < 60 && !anchor.r) rt.a += clamp(angDiff(rt.a, anchor.a), -2 * dt, 2 * dt);
}
// alvos possíveis para os piratas: nau capitânia e naves da frota
function fleetTargets() {
  const out = [];
  for (const s of G.fleet) { const rt = FLEET_RT.get(s.id); if (rt) out.push({ s, rt, x: rt.x, y: rt.y, vx: rt.vx, vy: rt.vy, r: fstats(s).r }); }
  return out;
}
function damageFleetShip(s, v) {
  s.hp -= v;
  const rt = FLEET_RT.get(s.id); if (rt) rt.hit = 0.1;
  if (s.hp <= 0) {
    if (rt) { burst(rt.x, rt.y, 60, [255, 170, 80], 320, 1.3, 3.5); burst(rt.x, rt.y, 25, [255, 255, 255], 220, 0.6, 2); }
    Sfx.boom(true);
    G.fleet = G.fleet.filter(x => x !== s); FLEET_RT.delete(s.id);
    toast(`Perdemos a ${SHIP_CLASSES[s.cls].nome} "${s.name}"!`, 'bad');
    news(`A ${SHIP_CLASSES[s.cls].nome} ${s.name} foi destruída em combate.`, 'bad');
  }
}

/* =====================================================================
   DEFESA PLANETÁRIA
   ===================================================================== */
const defLv = (c, k) => (c.def && c.def[k]) || 0;
function defMult(c) { return GOV_MODS[c.gov].defense * (1 + 0.08 * (G.tech.fortificacao || 0)) * ESS(); }
function defensePower(p, c) {
  let s = 0;
  for (const k of DEF_KEYS) s += DEFENSES[k].power * defLv(c, k) * Math.pow(1.04, defLv(c, k));
  s *= defMult(c);
  for (const f of G.fleet) if (f.post === p.id) s += shipPower(f) * 0.6;
  return s;
}
function defReqOk(c, k) { const r = DEFENSES[k].req; if (!r) return true; for (const q in r) if (defLv(c, q) < r[q]) return false; return true; }
function buildDefense(p, k) {
  const c = G.col[p.id]; if (!c || !defReqOk(c, k)) return false;
  const cost = defCost(k, defLv(c, k), p);
  if (G.credits < cost) return false;
  G.credits -= cost; c.def[k] = defLv(c, k) + 1; Sfx.ok();
  return true;
}
function defenseUnits(p, c) {
  const out = [], t = G.time;
  const ring = (type, n, R, w, off = 0) => { for (let i = 0; i < n; i++) { const a = t * w + off + (i / n) * TAU; out.push({ type, i, x: p._x + Math.cos(a) * R, y: p._y + Math.sin(a) * R, a }); } };
  ring('laser', Math.min(8, defLv(c, 'laser')), p.r + 70, 0.2);
  ring('missil', Math.min(4, Math.ceil(defLv(c, 'missil') / 2)), p.r + 125, -0.12, 0.4);
  ring('canhao', Math.min(3, Math.ceil(defLv(c, 'canhao') / 3)), p.r + 175, 0.06, 1.1);
  ring('fortaleza', defLv(c, 'fortaleza') ? 1 : 0, p.r + 360, 0.04, 2);
  const nm = Math.min(16, defLv(c, 'minas') * 2);
  for (let i = 0; i < nm; i++) { const a = t * 0.03 + (i / nm) * TAU + (i % 2) * 0.1, R = p.r + 270 + (i % 3) * 35; out.push({ type: 'minas', i, x: p._x + Math.cos(a) * R, y: p._y + Math.sin(a) * R, a }); }
  return out;
}
function updateDefenses(dt) {
  for (const p of snap.planets) {
    const c = G.col[p.id]; if (!c || !c.def) continue;
    c._cd = c._cd || {};
    const m = defMult(c);
    for (const u of defenseUnits(p, c)) {
      const D = DEFENSES[u.type], key = u.type + u.i, lv = defLv(c, u.type);
      c._cd[key] = (c._cd[key] ?? rnd(0, D.cd)) - dt;
      if (c._cd[key] > 0) continue;
      const dmg = D.dmg * defScale(lv) * m;
      if (u.type === 'minas') {
        const e = nearestEnemy(u.x, u.y, D.range);
        if (!e) continue;
        c._cd[key] = D.cd;
        for (const o of ENEMIES.slice()) if (dist(o.x, o.y, u.x, u.y) < 170) hitEnemy(o, dmg, o.x, o.y);
        burst(u.x, u.y, 40, [255, 190, 90], 260, 0.8, 3); Sfx.boom(false);
        continue;
      }
      const e = nearestEnemy(u.x, u.y, D.range);
      if (!e) continue;
      c._cd[key] = D.cd * (u.type === 'laser' ? Math.max(0.5, 1 - lv * 0.02) : 1);
      const a = Math.atan2(e.y - u.y, e.x - u.x);
      if (u.type === 'missil') PROJ.push({ own: 'p', kind: 'missile', x: u.x, y: u.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, life: 4, dmg, a, tgt: e });
      else if (u.type === 'canhao') PROJ.push({ own: 'p', kind: 'rail', x: u.x, y: u.y, vx: Math.cos(a) * 3200, vy: Math.sin(a) * 3200, life: 1.2, dmg });
      else if (u.type === 'fortaleza') {
        for (const sp of [-0.06, 0, 0.06]) PROJ.push({ own: 'p', kind: 'def', x: u.x, y: u.y, vx: Math.cos(a + sp) * 1400, vy: Math.sin(a + sp) * 1400, life: 2, dmg });
        if (Math.random() < 0.3) PROJ.push({ own: 'p', kind: 'missile', x: u.x, y: u.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, life: 4, dmg: dmg * 1.5, a, tgt: e });
      } else PROJ.push({ own: 'p', kind: 'def', x: u.x, y: u.y, vx: Math.cos(a) * 1300, vy: Math.sin(a) * 1300, life: 1.2, dmg });
    }
    // caças-drones do hangar
    const want = Math.min(8, defLv(c, 'hangar') * 2);
    let ds = DRONES.get(p.id);
    if (!ds) { ds = []; DRONES.set(p.id, ds); }
    while (ds.length < want) ds.push({ x: p._x + rnd(-200, 200), y: p._y + rnd(-200, 200), vx: 0, vy: 0, a: 0, cd: rnd(0, 1), off: rnd(TAU) });
    if (ds.length > want) ds.length = want;
    const dmgD = DEFENSES.hangar.dmg * defScale(defLv(c, 'hangar')) * m;
    for (const d of ds) {
      const e = nearestEnemy(p._x, p._y, DEFENSES.hangar.range);
      let tx, ty, sp = 620;
      if (e) { const ang = G.time * 2 + d.off; tx = e.x + Math.cos(ang) * 260; ty = e.y + Math.sin(ang) * 260; }
      else { const ang = G.time * 0.35 + d.off; tx = p._x + Math.cos(ang) * (p.r + 480); ty = p._y + Math.sin(ang) * (p.r + 480); sp = 300; }
      const dx = tx - d.x, dy = ty - d.y, dd = Math.hypot(dx, dy) || 1;
      d.vx += (dx / dd * Math.min(sp, dd * 2) - d.vx) * Math.min(1, 3 * dt); d.vy += (dy / dd * Math.min(sp, dd * 2) - d.vy) * Math.min(1, 3 * dt);
      d.x += d.vx * dt; d.y += d.vy * dt;
      d.a = e ? Math.atan2(e.y - d.y, e.x - d.x) : Math.atan2(d.vy, d.vx);
      d.cd -= dt;
      if (e && d.cd <= 0 && dist(d.x, d.y, e.x, e.y) < 700) { d.cd = DEFENSES.hangar.cd; PROJ.push({ own: 'p', kind: 'def', x: d.x, y: d.y, vx: Math.cos(d.a) * 1300, vy: Math.sin(d.a) * 1300, life: 0.7, dmg: dmgD }); }
    }
  }
}
