'use strict';
/* =====================================================================
   NAVE E COMBATE: atributos infinitos, módulos, armas, piratas.
   ===================================================================== */

let ST = null; // atributos calculados no quadro atual
const ENEMIES = [];

function equippedModules() {
  const out = [];
  for (const id of G.ship.equip) { const m = G.inv.find(x => x.id === id); if (m) out.push(m); }
  return out;
}
function moduleTotals() {
  const t = {};
  for (const m of equippedModules()) t[m.k] = (t[m.k] || 0) + moduleValue(m);
  return t;
}
function shipStats() {
  const L = G.ship.lv, T = G.tech, E = 1 + 0.05 * (G.meta.essence || 0), M = moduleTotals();
  const tier = shipTier(L), tb = 1 + 0.06 * T.blindagem;
  const prop = (1 + 0.04 * T.propulsao) * (1 + (M.propulsor || 0));
  return {
    tier, slots: slotsFor(tier),
    hullMax: Math.round(100 * Math.pow(1.09, L.casco) * tb * (1 + (M.blindagem || 0)) * E),
    shieldMax: L.escudo ? Math.round(40 * Math.pow(1.09, L.escudo - 1) * tb * (1 + (M.capacitor || 0)) * E) : 0,
    energyMax: Math.round(100 * Math.pow(1.07, L.reator) * (1 + (M.capacitor || 0))),
    energyRegen: 14 * Math.pow(1.06, L.reator),
    thrust: 560 * (1 + 0.5 * (1 - Math.pow(0.94, L.motor))) * prop,
    maxSpeed: 650 * (1 + 0.9 * (1 - Math.pow(0.95, L.motor))) * prop,
    turn: 3.6 + 2.2 * (1 - Math.pow(0.93, L.motor)),
    boost: 1.85,
    dmg: 10 * Math.pow(1.1, L.armas) * (1 + 0.06 * T.balistica) * E,
    fireCd: 0.16 * Math.pow(0.975, Math.min(L.armas, 40)),
    cargoMax: Math.round((40 + 12 * L.carga) * Math.pow(1.03, L.carga)),
    sensor: 3400 * (1 + 0.05 * L.sensores) * (1 + 0.1 * T.cartografia) * (1 + (M.scanner || 0)),
    tractor: (240 + 18 * L.sensores) * (1 + (M.trator || 0)),
    oreMult: (1 + (M.coletor || 0)) * (1 + 0.08 * T.mineracao),
    regen: M.regen || 0,
    mapBonus: (1 + 0.1 * T.cartografia) * (1 + (M.scanner || 0)),
  };
}
let designCache = { key: '', d: null };
function currentDesign() {
  const tier = shipTier(G.ship.lv), key = tier + ':' + G.ship.paint;
  if (designCache.key !== key) {
    designCache = { key, d: makeShipDesign(tier, HULL_COLORS[(tier - 1) % HULL_COLORS.length], ACCENTS[G.ship.paint % ACCENTS.length], 7 + tier) };
  }
  return designCache.d;
}

/* ---------- dano no jogador ---------- */
let shieldT = 0;
function damage(v, quiet) {
  const S = G.ship;
  if (dead || v <= 0) return;
  shieldT = 3;
  if (S.shield > 0) {
    const a = Math.min(S.shield, v); S.shield -= a; v -= a;
    if (!quiet) burst(S.x, S.y, 6, [95, 225, 255], 140, 0.4, 2);
  }
  if (v <= 0) return;
  S.hull -= v;
  if (!quiet) shake = Math.min(14, shake + v * 0.4);
  if (S.hull <= 0) killShip('Casco destruído.');
}

/* ---------- armas ---------- */
let fireT = 0;
const wTimers = {};
const beam = { on: false, x2: 0, y2: 0, t: 0 };
function fireWeapons(dt, firing) {
  const S = G.ship, D = currentDesign();
  fireT -= dt;
  beam.on = false;
  if (!firing || dead) return;
  const ca = Math.cos(S.a), sa = Math.sin(S.a), nose = D.len * 0.55;
  if (fireT <= 0) {
    fireT = ST.fireCd;
    PROJ.push({ own: 'p', kind: 'laser', x: S.x + ca * nose, y: S.y + sa * nose, vx: S.vx + ca * 1500, vy: S.vy + sa * 1500, life: 0.75, dmg: ST.dmg });
    if (D.wingGuns) for (const sg of [-1, 1]) {
      const ox = -sa * D.span * 0.7 * sg, oy = ca * D.span * 0.7 * sg;
      PROJ.push({ own: 'p', kind: 'laser', x: S.x + ox + ca * 10, y: S.y + oy + sa * 10, vx: S.vx + ca * 1500, vy: S.vy + sa * 1500, life: 0.7, dmg: ST.dmg * 0.5 });
    }
    Sfx.shot();
  }
  for (const m of equippedModules()) {
    const md = MODULES[m.k];
    if (md.cat !== 'arma') continue;
    wTimers[m.id] = (wTimers[m.id] || 0) - dt;
    if (wTimers[m.id] > 0) continue;
    const v = moduleValue(m);
    if (m.k === 'plasma' && S.energy >= 6) {
      wTimers[m.id] = md.cd; S.energy -= 6;
      PROJ.push({ own: 'p', kind: 'plasma', x: S.x + ca * nose, y: S.y + sa * nose, vx: S.vx + ca * 760, vy: S.vy + sa * 760, life: 1.8, dmg: ST.dmg * v, r: 10 });
      Sfx.tone(180, 0.25, 'sawtooth', 0.04, -80);
    } else if (m.k === 'missil' && S.energy >= 8) {
      wTimers[m.id] = md.cd; S.energy -= 8;
      for (const sg of [-1, 1]) PROJ.push({ own: 'p', kind: 'missile', x: S.x - sa * 12 * sg, y: S.y + ca * 12 * sg, vx: S.vx + ca * 200 - sa * 160 * sg, vy: S.vy + sa * 200 + ca * 160 * sg, life: 3.2, dmg: ST.dmg * v * 0.5, a: S.a });
      Sfx.noise(0.25, 0.04, 1200);
    } else if (m.k === 'feixe' && S.energy >= 1) {
      wTimers[m.id] = md.cd; S.energy -= 1;
      const hit = raycast(S.x + ca * nose, S.y + sa * nose, ca, sa, 560);
      beam.on = true; beam.x2 = hit.x; beam.y2 = hit.y;
      if (hit.obj) {
        if (hit.kind === 'ast') hitAsteroid(hit.obj, ST.dmg * v * 3, hit.x, hit.y);
        else hitEnemy(hit.obj, ST.dmg * v, hit.x, hit.y);
      }
    }
  }
}
function raycast(x, y, dx, dy, len) {
  let best = null, bt = len, kind = '';
  const test = (o, r, k) => {
    const ox = o.x - x, oy = o.y - y, t = ox * dx + oy * dy;
    if (t < 0 || t > bt) return;
    const px = ox - dx * t, py = oy - dy * t;
    if (px * px + py * py < r * r) { bt = t; best = o; kind = k; }
  };
  for (const a of snap.asts) test(a, a.r * 0.85, 'ast');
  for (const a of FRAGS) test(a, a.r * 0.85, 'ast');
  for (const e of ENEMIES) test(e, e.r, 'en');
  return { x: x + dx * bt, y: y + dy * bt, obj: best, kind };
}

function hitEnemy(e, dmg, x, y) {
  e.hp -= dmg; e.hit = 0.08; e.aggro = true;
  burst(x, y, 4, [255, 220, 160], 140, 0.3, 2);
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  const i = ENEMIES.indexOf(e); if (i < 0) return;
  ENEMIES.splice(i, 1);
  burst(e.x, e.y, 50 + e.r, [255, 160, 70], 300, 1.2, 3.5);
  burst(e.x, e.y, 20, [255, 255, 255], 200, 0.5, 2);
  Sfx.boom(e.r > 30);
  G.stats.kills++;
  const T = ENEMY_TYPES[e.type], cr = Math.round(18 * T.loot * e.s * (1 + 0.06 * G.tech.economia));
  const n = Math.min(8, 2 + Math.floor(T.loot));
  for (let k = 0; k < n; k++) {
    const a = rnd(TAU), v = rnd(40, 140);
    PICKS.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, kind: 'cr', val: Math.ceil(cr / n), t: 40, rot: rnd(TAU) });
  }
  if (Math.random() < 0.5) {
    const ore = pickR(ORES.filter(o => o !== 'cristal' || e.d > 5));
    for (let k = 0; k < 2 + T.loot; k++) PICKS.push({ x: e.x, y: e.y, vx: rnd(-90, 90), vy: rnd(-90, 90), ore, kind: 'ore', t: 40, rot: rnd(TAU) });
  }
  if (Math.random() < 0.07 + 0.025 * T.loot) {
    const m = randomModule(e.d * 0.15 + T.loot * 0.2);
    G.inv.push(m);
    toast(`Módulo recuperado dos destroços: ${stripTags(moduleLabel(m))}`, 'disc');
  }
  onKill(e);
}
const stripTags = s => s.replace(/<[^>]+>/g, '');

/* ---------- piratas ---------- */
let pirateT = 35;
function spawnFleet(d, nearX, nearY, raid) {
  const S = G.ship;
  const n = Math.min(raid ? 9 : 7, 1 + Math.floor(Math.random() * (1 + d / 5)) + Math.floor(escorts().length / 2) + (raid ? 2 : 0));
  const a0 = rnd(TAU);
  const cx = nearX ?? S.x + Math.cos(a0) * rnd(1900, 2500), cy = nearY ?? S.y + Math.sin(a0) * rnd(1900, 2500);
  const types = Object.keys(ENEMY_TYPES).filter(k => ENEMY_TYPES[k].minD <= d);
  for (let i = 0; i < n; i++) {
    const w = {}; types.forEach((k, j) => { w[k] = 1 + j * (d / 10); });
    const tp = i === 0 && d > 8 && types.length > 2 ? types[types.length - 1] : makeRng((Math.random() * 1e9) | 0).weighted(w);
    const T = ENEMY_TYPES[tp], s = enemyScale(d);
    ENEMIES.push({
      type: tp, x: cx + rnd(-200, 200), y: cy + rnd(-200, 200), vx: 0, vy: 0, a: a0 + Math.PI,
      hp: T.hp * s, maxHp: T.hp * s, dmg: T.dmg * s, spd: T.spd, cd: rnd(1, 2), r: T.r, s, d, t: rnd(10), hit: 0,
      orbit: Math.random() < 0.5 ? 1 : -1, range: rnd(380, 620),
      design: makeShipDesign(T.tier, '#4a4048', '#ff3b3b', 99 + T.tier), raid: !!raid,
    });
  }
  toast(n > 1 ? `Frota pirata detectada: ${n} naves!` : 'Nave pirata detectada!', 'bad');
  Sfx.warn();
}
function pirateRisk() {
  const S = G.ship, d = Math.hypot(S.x, S.y) / SECTOR;
  if (d < 1.4) return 0;
  let r = Math.min(0.8, 0.18 + d * 0.035);
  for (const p of snap.planets) {
    if (dist(S.x, S.y, p._x, p._y) > 5000) continue;
    if (p.hazards.includes('Piratas em órbita')) r += 0.25;
    if (planetGov(p) === 'anarquia') r += 0.12;
    if (isColony(p)) r -= 0.03 * Math.min(20, defensePower(p, G.col[p.id]));
  }
  return clamp(r, 0, 0.95);
}
function updateEnemies(dt) {
  const S = G.ship, d = Math.hypot(S.x, S.y) / SECTOR;
  if (!dock && !dead && mode === 'play') {
    pirateT -= dt;
    if (pirateT <= 0) {
      pirateT = rnd(26, 48);
      if (ENEMIES.length < 4 && Math.random() < pirateRisk()) spawnFleet(d);
    }
  }
  for (let i = ENEMIES.length - 1; i >= 0; i--) {
    const e = ENEMIES[i];
    e.t += dt; e.hit -= dt; e.cd -= dt;
    const dS = dist(S.x, S.y, e.x, e.y);
    if (dS > 9000) { ENEMIES.splice(i, 1); continue; }
    // alvo: o mais próximo entre a nau capitânia e as naves da frota
    let T = (!dead && !dock) ? { x: S.x, y: S.y, vx: S.vx, vy: S.vy, player: true } : null, td = T ? dS : 1e9;
    for (const ft of fleetTargets()) { const d2 = dist(e.x, e.y, ft.x, ft.y); if (d2 < td && d2 < 2600) { td = d2; T = ft; } }
    if (!T && e.raid) for (const p of snap.planets) if (isColony(p)) { const d2 = dist(e.x, e.y, p._x, p._y); if (d2 < td) { td = d2; T = { x: p._x, y: p._y, vx: 0, vy: 0, planet: p }; } }
    const tx = T ? T.x : S.x, ty = T ? T.y : S.y, tgvx = T ? T.vx : 0, tgvy = T ? T.vy : 0;
    const dx = tx - e.x, dy = ty - e.y, dd = Math.hypot(dx, dy) || 1;
    let tvx, tvy;
    const hunting = !!T;
    if (!hunting) { tvx = Math.cos(e.t * 0.3) * e.spd * 0.4; tvy = Math.sin(e.t * 0.3) * e.spd * 0.4; }
    else if (dd > e.range + 160) { tvx = dx / dd * e.spd; tvy = dy / dd * e.spd; }
    else {
      const tx = -dy / dd * e.orbit, ty = dx / dd * e.orbit, rad = (dd - e.range) / 200;
      tvx = (tx + dx / dd * rad) * e.spd * 0.75; tvy = (ty + dy / dd * rad) * e.spd * 0.75;
    }
    e.vx += (tvx - e.vx) * Math.min(1, 2.2 * dt); e.vy += (tvy - e.vy) * Math.min(1, 2.2 * dt);
    // separação entre naves inimigas
    for (const o of ENEMIES) if (o !== e) { const ox = e.x - o.x, oy = e.y - o.y, od = Math.hypot(ox, oy); if (od < 90 && od > 0) { e.vx += ox / od * 240 * dt; e.vy += oy / od * 240 * dt; } }
    e.x += e.vx * dt; e.y += e.vy * dt;
    const aimA = Math.atan2(dy + tgvy * dd / 900, dx + tgvx * dd / 900);
    const faceA = hunting && dd < 1300 ? aimA : Math.atan2(e.vy, e.vx);
    e.a += clamp(angDiff(e.a, faceA), -4 * dt, 4 * dt);
    if (hunting && dd < 1150 && e.cd <= 0 && Math.abs(angDiff(e.a, aimA)) < 0.3) {
      e.cd = ENEMY_TYPES[e.type].cd * rnd(0.85, 1.2);
      const ca = Math.cos(e.a), sa = Math.sin(e.a);
      const spread = e.type === 'canhoneira' ? [-0.12, 0, 0.12] : e.type === 'sentinela' ? [-0.2, -0.07, 0.07, 0.2] : [0];
      for (const sp of spread) {
        const a = e.a + sp;
        PROJ.push({ own: 'e', kind: e.type === 'sentinela' ? 'ancient' : 'elaser', x: e.x + ca * e.r, y: e.y + sa * e.r, vx: e.vx + Math.cos(a) * 900, vy: e.vy + Math.sin(a) * 900, life: 1.5, dmg: e.dmg });
      }
      if (Sfx.rate('es', 120)) Sfx.tone(520, 0.08, 'square', 0.015, -260);
    }
    if (T && T.player && dd < e.r + 18) { damage(e.dmg * 1.5); e.vx = -e.vx; e.vy = -e.vy; }
  }
}

/* ---------- projéteis ---------- */
function updateProjectiles(dt) {
  const S = G.ship;
  const all = snap.asts.concat(FRAGS);
  for (let i = PROJ.length - 1; i >= 0; i--) {
    const b = PROJ[i];
    b.life -= dt;
    if (b.kind === 'missile') {
      let tgt = null, bd = 1800;
      if (b.tgt && (ENEMIES.includes(b.tgt) || (b.tgt.hp > 0 && !ENEMIES.length))) tgt = b.tgt;
      else for (const e of ENEMIES) { const d = dist(b.x, b.y, e.x, e.y); if (d < bd) { bd = d; tgt = e; } }
      if (!tgt && auto && auto.kind === 'mine' && auto.target) tgt = auto.target;
      const sp = Math.hypot(b.vx, b.vy);
      let want = Math.atan2(b.vy, b.vx);
      if (tgt) want = Math.atan2(tgt.y - b.y, tgt.x - b.x);
      b.a += clamp(angDiff(b.a, want), -5 * dt, 5 * dt);
      const ns = Math.min(1100, sp + 900 * dt);
      b.vx = Math.cos(b.a) * ns; b.vy = Math.sin(b.a) * ns;
      if (Math.random() < 0.6) PARTS.push({ x: b.x, y: b.y, vx: rnd(-20, 20), vy: rnd(-20, 20), life: 0.5, max: 0.5, size: 3, col: [255, 180, 100], add: true });
    }
    const steps = 3;
    let hit = false;
    for (let s = 0; s < steps && !hit; s++) {
      b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
      if (b.own === 'e') {
        if (!dead && !dock && dist(b.x, b.y, S.x, S.y) < 20) { damage(b.dmg); burst(b.x, b.y, 6, [255, 90, 70], 150, 0.35, 2); hit = true; continue; }
        for (const ft of fleetTargets()) if (dist(b.x, b.y, ft.x, ft.y) < ft.r) { damageFleetShip(ft.s, b.dmg); burst(b.x, b.y, 6, [255, 90, 70], 150, 0.35, 2); hit = true; break; }
        continue;
      }
      const rad = b.r || 0;
      for (const e of ENEMIES) {
        if (dist(b.x, b.y, e.x, e.y) < e.r + rad) { hitEnemy(e, b.dmg, b.x, b.y); hit = true; break; }
      }
      if (hit) break;
      for (const a of all) {
        if (Math.abs(b.x - a.x) > a.r + 12 + rad || Math.abs(b.y - a.y) > a.r + 12 + rad) continue;
        if (dist(b.x, b.y, a.x, a.y) < a.r * 0.85 + rad) { hitAsteroid(a, b.dmg, b.x, b.y); hit = true; break; }
      }
    }
    if (hit && (b.kind === 'plasma' || b.kind === 'missile' || b.kind === 'rail')) { burst(b.x, b.y, 22, [255, 150, 255], 220, 0.6, 3); Sfx.boom(false); }
    if (hit || b.life <= 0) PROJ.splice(i, 1);
  }
}

/* ---------- melhorias e módulos ---------- */
function shipyardHere() {
  if (!dock) return null;
  const c = G.col[dock.id];
  if (c) return { discount: 1 - 0.5 * (1 - Math.pow(0.96, c.b.estaleiro)), colony: true };
  if (dock.pop > 0) return { discount: 1, colony: false };
  return null;
}
function buyAttr(k) {
  const y = shipyardHere(); if (!y) return false;
  const c = Math.round(attrCost(k, G.ship.lv[k]) * y.discount);
  if (G.credits < c) return false;
  const before = shipStats(), tierBefore = before.tier;
  G.credits -= c; G.ship.lv[k]++;
  const after = shipStats();
  G.ship.hull += Math.max(0, after.hullMax - before.hullMax);
  G.ship.shield += Math.max(0, after.shieldMax - before.shieldMax);
  if (after.tier > tierBefore) { toast(`Nova classe de nave: Mk ${romanize(after.tier)}! Visual e espaços de módulo atualizados.`, 'disc'); Sfx.disc(); }
  else Sfx.ok();
  return true;
}
function equipModule(m) {
  const st = shipStats();
  if (G.ship.equip.includes(m.id)) { G.ship.equip = G.ship.equip.filter(x => x !== m.id); return; }
  if (G.ship.equip.length >= st.slots) { toast(`Todos os ${st.slots} espaços estão ocupados. Suba a classe da nave para ganhar mais.`, 'bad'); return; }
  G.ship.equip.push(m.id);
}
function upgradeModule(m) {
  const c = moduleUpCost(m);
  if (G.credits < c) return;
  G.credits -= c; m.lvl++; Sfx.ok();
}
function sellModule(m) {
  G.credits += moduleSellValue(m);
  G.ship.equip = G.ship.equip.filter(x => x !== m.id);
  G.inv = G.inv.filter(x => x !== m);
  Sfx.ok();
}
const FORGE_COST = { ferro: 14, titanio: 8, platina: 3 };
function canForge(useCrystal) {
  for (const k in FORGE_COST) if (resAvail(k) < FORGE_COST[k]) return false;
  return !useCrystal || resAvail('cristal') >= 3;
}
function forge(useCrystal) {
  if (!canForge(useCrystal)) return null;
  for (const k in FORGE_COST) spendRes(k, FORGE_COST[k]);
  if (useCrystal) spendRes('cristal', 3);
  const d = dock ? dock.dist : 0;
  const m = randomModule(d * 0.1 + (useCrystal ? 2.5 : 0) + (G.col[dock?.id]?.b.estaleiro || 0) * 0.15);
  G.inv.push(m);
  Sfx.disc();
  return m;
}
// recursos disponíveis = porão da nave + armazém imperial
const resAvail = k => (G.cargo[k] || 0) + Math.floor(G.stock[k] || 0);
function spendRes(k, q) {
  const fromCargo = Math.min(G.cargo[k] || 0, q);
  G.cargo[k] = (G.cargo[k] || 0) - fromCargo;
  G.stock[k] = (G.stock[k] || 0) - (q - fromCargo);
}
function shopOffers(p) {
  const win = Math.floor(G.time / 300);
  const rng = makeRng(hashStr(p.id + ':' + win + ':' + G.seed));
  const out = [];
  for (let i = 0; i < 3; i++) {
    const keys = Object.keys(MODULES), k = keys[Math.floor(rng() * keys.length)];
    const bonus = p.dist * 0.12 + (G.col[p.id]?.b.estaleiro || 0) * 0.15;
    let rar = 0; const w = [60, 26 + bonus * 4, 10 + bonus * 4, 3 + bonus * 3, 0.8 + bonus * 1.6, 0.15 + bonus * 0.8];
    let x = rng() * w.reduce((a, b) => a + b, 0); for (let j = 0; j < w.length; j++) { x -= w[j]; if (x <= 0) { rar = j; break; } }
    const id = 'shop:' + p.id + ':' + win + ':' + i;
    out.push({ id, k, rar, lvl: 0, price: Math.round(380 * RARITIES[rar].mult * (1 + 0.1 * p.dist)), sold: !!G.shopSold[id] });
  }
  return out;
}
