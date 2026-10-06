'use strict';
/* =====================================================================
   IMPÉRIO: colônias, edifícios, produção, pesquisa, política,
   diplomacia, eventos, contratos e ascensão.
   ===================================================================== */

const isColony = p => !!(p && G.col[p.id]);
const planetGov = p => (G.col[p.id] ? G.col[p.id].gov : G.ngov[p.id] || p.gov);
const colonyCount = () => Object.keys(G.col).length;
const ESS = () => 1 + 0.05 * (G.meta.essence || 0);
const planetCache = new Map();
function colPlanet(id) {
  let p = planetCache.get(id);
  if (!p) { p = findPlanet(id); if (p) planetCache.set(id, p); }
  return p;
}
function news(msg, cls = '') {
  G.news.unshift({ t: G.time, msg, cls });
  if (G.news.length > 60) G.news.length = 60;
}

/* ---------- fundação de colônias ---------- */
function newColony(p, gov, pop) {
  G.col[p.id] = { gov, b: { mina: 0, fazenda: 0, habitat: 0, comercio: 0, universidade: 0, estaleiro: 0 }, def: Object.fromEntries(DEF_KEYS.map(k => [k, 0])), pop, stab: GOV_MODS[gov].stab, since: G.time, govT: -999, mods: [], name: p.name };
  planetCache.set(p.id, p);
  news(`${p.name} agora faz parte da Federação.`, 'ok');
}
const colonizeCost = () => Math.round(1200 * Math.pow(1.45, Math.max(0, colonyCount() - 1)));
function colonize(p) {
  const c = colonizeCost();
  if (G.credits < c || p.pop > 0 || isColony(p)) return false;
  G.credits -= c;
  newColony(p, 'democracia', 2000);
  Sfx.disc(); toast(`Colônia fundada em ${p.name}!`, 'disc');
  return true;
}
function annex(p) {
  if ((G.inf[p.id] || 0) < 100 || isColony(p)) return false;
  newColony(p, planetGov(p) === 'nenhum' ? 'democracia' : planetGov(p), p.pop);
  delete G.inf[p.id];
  Sfx.disc(); toast(`${p.name} aderiu à Federação!`, 'disc');
  return true;
}
const investCost = p => Math.round(140 * (1 + p.dist * 0.3) * Math.max(1, Math.log10(p.pop + 10) / 3));
function invest(p) {
  const c = investCost(p);
  if (G.credits < c) return;
  G.credits -= c;
  addInfluence(p, 8 * GOV_MODS[planetGov(p)].influence);
  Sfx.ok();
}
function addInfluence(p, v) {
  if (!p || p.pop <= 0 || isColony(p)) return;
  const before = G.inf[p.id] || 0;
  G.inf[p.id] = clamp(before + v, 0, 100);
  if (before < 100 && G.inf[p.id] >= 100) { toast(`${p.name} aceita aderir à Federação. Visite o planeta para anexá-lo.`, 'disc'); news(`${p.name} está pronta para aderir à Federação.`, 'ok'); }
}

/* ---------- cálculos por colônia ---------- */
function popCap(p, c) {
  const habit = { terrestre: 1, oceanico: 0.8, desertico: 0.35, gelado: 0.25, exotico: 0.3, rochoso: 0.2, vulcanico: 0.12, gasoso: 0.08 }[p.type];
  const base = Math.max(p.pop * 1.2, 5e4 * habit * (p.r / 150));
  return base * Math.pow(1.35, c.b.habitat) * (1 + 0.1 * c.b.fazenda);
}
function diplomacy(p) {
  const c = G.col[p.id];
  if (!c._nb) c._nb = neighborsOf(p);
  let score = 0;
  for (const id of c._nb) { const q = colPlanet(id); if (q && !isColony(q)) score += govAffinity(c.gov, planetGov(q)); }
  return clamp(score, -8, 8);
}
function neighborsOf(p) {
  const [sx, sy] = p.sec.split(',').map(Number), out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    for (const q of getSector(sx + dx, sy + dy).planets) if (q.id !== p.id && q.pop > 0) { out.push(q.id); planetCache.set(q.id, q); }
  }
  return out;
}
function modVal(c, k) { let v = 1; for (const m of c.mods) if (m.k === k && m.until > G.time) v *= m.v; return v; }
function colonyRates(p, c) {
  const gm = GOV_MODS[c.gov], dip = diplomacy(p);
  const stabF = 0.4 + 0.6 * (c.stab / 100);
  const dipF = 1 + 0.04 * dip;
  const lp = Math.log10(c.pop + 10);
  const credits = (0.22 * Math.pow(lp, 1.5) + c.b.comercio * 0.9 * Math.pow(1.12, c.b.comercio) * (lp / 7)) * gm.income * (1 + 0.06 * G.tech.economia) * stabF * dipF * modVal(c, 'income') * ESS();
  const research = (0.03 * lp + c.b.universidade * 0.18 * Math.pow(1.1, c.b.universidade)) * gm.research * stabF * modVal(c, 'research') * ESS();
  const mine = {};
  if (c.b.mina) for (const k in p.res) mine[k] = 0.035 * c.b.mina * Math.pow(1.1, c.b.mina) * p.res[k] * (1 + 0.08 * G.tech.mineracao) * stabF * ESS();
  const defense = defensePower(p, c);
  const target = gm.stab + 3 * G.tech.sociologia + Math.min(18, defense * 1.2) + Math.min(10, defLv(c, 'escudo') * 1.5) + dip * 2.5 + (c.pop > popCap(p, c) * 0.95 ? -6 : 0) + modVal(c, 'stab') - 1;
  return { credits, research, mine, defense, dip, target: clamp(target, 0, 100), growth: 0.012 * gm.growth * (1 + 0.15 * c.b.fazenda) * stabF };
}
function empireTotals() {
  let credits = 0, research = 0; const mine = {};
  for (const id in G.col) {
    const p = colPlanet(id); if (!p) continue;
    const r = colonyRates(p, G.col[id]);
    credits += r.credits; research += r.research;
    for (const k in r.mine) mine[k] = (mine[k] || 0) + r.mine[k];
  }
  return { credits, research, mine };
}

/* ---------- tique do império (1×/s) ---------- */
let empT = 0, eventT = 50;
function updateEmpire(dt) {
  empT += dt;
  if (empT >= 1) {
    const step = empT; empT = 0;
    for (const id in G.col) {
      const p = colPlanet(id), c = G.col[id]; if (!p) continue;
      const r = colonyRates(p, c);
      G.credits += r.credits * step; G.stats.earned += r.credits * step;
      G.rp += r.research * step;
      for (const k in r.mine) G.stock[k] = (G.stock[k] || 0) + r.mine[k] * step;
      const cap = popCap(p, c);
      c.pop += r.growth * c.pop * (1 - c.pop / cap) * step;
      c.pop = Math.max(100, c.pop);
      c.stab += clamp(r.target - c.stab, -0.6 * step, 0.6 * step);
      c.mods = c.mods.filter(m => m.until > G.time);
      // estaleiro produz módulos
      if (c.b.estaleiro > 0) {
        c.shipT = (c.shipT || 0) + step;
        const every = 420 / (1 + 0.15 * c.b.estaleiro);
        if (c.shipT >= every) {
          c.shipT = 0;
          const m = randomModule(c.b.estaleiro * 0.2 + p.dist * 0.1);
          G.inv.push(m);
          toast(`Estaleiro de ${p.name} entregou: ${stripTags(moduleLabel(m))}`, 'disc');
        }
      }
      // secessão
      if (c.stab < 6 && !p.home) {
        news(`${p.name} declarou independência após meses de caos!`, 'bad');
        toast(`${p.name} se separou da Federação!`, 'bad');
        G.ngov[p.id] = c.gov === 'militar' ? 'anarquia' : 'militar';
        delete G.col[id];
      }
    }
  }
  // eventos políticos
  eventT -= dt;
  if (eventT <= 0) {
    eventT = rnd(40, 75);
    if (colonyCount()) spawnEvent();
    neighborPolitics();
  }
  // decisões que expiram
  for (let i = G.events.length - 1; i >= 0; i--) {
    const ev = G.events[i];
    if (G.time > ev.expires) { resolveEvent(ev, ev.def, true); }
  }
  updateDefenses(dt);
}

/* ---------- governo ---------- */
const govChangeCost = (p, c) => Math.round(400 * Math.max(1, Math.log10(c.pop + 10) - 2));
function setGov(p, gov) {
  const c = G.col[p.id];
  if (!c || c.gov === gov) return false;
  const cost = govChangeCost(p, c);
  if (G.credits < cost || G.time - c.govT < 120) return false;
  G.credits -= cost;
  c.gov = gov; c.govT = G.time; c.stab = Math.max(0, c.stab - 22);
  news(`${p.name} adotou o regime: ${GOVS[gov].nome}.`);
  Sfx.ok();
  return true;
}

/* ---------- eventos com decisões ---------- */
const EVENT_DEFS = {
  revolta: {
    title: p => `Revolta em ${p.name}`,
    text: () => 'Multidões tomaram as ruas da capital planetária. A ordem está por um fio.',
    opts: (p, c) => [
      { label: `Reprimir (${fmt(cost(p, 1))} CR)`, cost: cost(p, 1), fx: () => { c.stab += 8 + 10 * GOV_MODS[c.gov].defense; addMod(c, 'income', 0.85, 240); return 'A revolta foi contida à força. A economia sentiu o golpe.'; } },
      { label: `Negociar (${fmt(cost(p, 2))} CR)`, cost: cost(p, 2), fx: () => { c.stab += 28; return 'Um acordo foi firmado e a calma voltou às ruas.'; } },
      { label: 'Ignorar', fx: () => { c.stab -= 12; c.pop *= 0.95; return 'O caos se espalhou.'; } },
    ],
    def: 2,
  },
  golpe: {
    title: p => `Tentativa de golpe em ${p.name}`,
    text: () => 'Oficiais das forças planetárias exigem o poder.',
    opts: (p, c) => [
      { label: `Resistir (${fmt(cost(p, 1.5))} CR)`, cost: cost(p, 1.5), fx: () => { const ok = Math.random() < 0.35 + 0.04 * Math.min(12, defensePower(p, c)); if (ok) { c.stab += 10; return 'O golpe fracassou. Os conspiradores foram presos.'; } c.gov = 'militar'; c.stab = 40; return 'A resistência falhou. Uma junta militar assumiu o poder.'; } },
      { label: 'Aceitar a junta militar', fx: () => { c.gov = 'militar'; c.stab = Math.max(c.stab, 45); return 'O planeta agora é governado pelos militares.'; } },
    ],
    def: 1,
  },
  eleicao: {
    title: p => `Eleições em ${p.name}`,
    text: () => 'Três partidos disputam o governo. Seu apoio pode decidir a eleição.',
    opts: (p, c) => [
      { label: 'Partido Industrial', fx: () => { addMod(c, 'income', 1.35, 400); return 'Os industriais venceram: renda +35% por um tempo.'; } },
      { label: 'Partido da Ciência', fx: () => { addMod(c, 'research', 1.5, 400); return 'Os cientistas venceram: pesquisa +50% por um tempo.'; } },
      { label: 'Partido Popular', fx: () => { c.stab += 18; return 'O povo celebra: estabilidade em alta.'; } },
    ],
    def: 2,
  },
  sucessao: {
    title: p => `Crise de sucessão em ${p.name}`,
    text: () => 'O monarca morreu. Dois herdeiros reivindicam a coroa.',
    opts: (p, c) => [
      { label: 'Herdeira legítima', fx: () => { c.stab += 14; return 'A coroação foi pacífica.'; } },
      { label: 'Regente ambicioso', fx: () => { addMod(c, 'income', 1.4, 360); c.stab -= 14; return 'O regente impôs reformas lucrativas, mas impopulares.'; } },
    ],
    def: 0,
  },
  conselho: {
    title: p => `Conselho técnico de ${p.name}`,
    text: () => 'Os tecnocratas propõem um megaprojeto de pesquisa.',
    opts: (p, c) => [
      { label: `Financiar (${fmt(cost(p, 1.2))} CR)`, cost: cost(p, 1.2), fx: () => { G.rp += 40 * (1 + p.dist * 0.2); return 'O projeto rendeu avanços científicos.'; } },
      { label: 'Recusar', fx: () => { c.stab -= 6; return 'Os técnicos ficaram frustrados.'; } },
    ],
    def: 1,
  },
  cisma: {
    title: p => `Cisma religioso em ${p.name}`,
    text: () => 'Uma nova seita questiona o clero oficial.',
    opts: (p, c) => [
      { label: 'Tolerar a seita', fx: () => { c.stab -= 8; addMod(c, 'research', 1.3, 300); return 'A diversidade de ideias estimulou a ciência.'; } },
      { label: 'Excomungar', fx: () => { c.stab += 6; c.pop *= 0.97; return 'Os dissidentes foram exilados.'; } },
    ],
    def: 1,
  },
  cartel: {
    title: p => `Cartel em ${p.name}`,
    text: () => 'As megacorporações querem fixar preços e dobrar os lucros.',
    opts: (p, c) => [
      { label: 'Permitir', fx: () => { addMod(c, 'income', 1.6, 300); c.stab -= 15; return 'Lucros recordes, população furiosa.'; } },
      { label: 'Proibir', fx: () => { c.stab += 8; addMod(c, 'income', 0.85, 200); return 'As corporações recuaram, a contragosto.'; } },
    ],
    def: 1,
  },
  refugiados: {
    title: p => `Refugiados chegam a ${p.name}`,
    text: () => 'Naves de um mundo vizinho em guerra pedem asilo.',
    opts: (p, c) => [
      { label: 'Acolher', fx: () => { c.pop *= 1.12; c.stab -= 5; return 'A população cresceu, com alguma tensão.'; } },
      { label: 'Recusar', fx: () => { c.stab += 2; return 'As naves seguiram viagem.'; } },
    ],
    def: 0,
  },
  praga: {
    title: p => `Epidemia em ${p.name}`,
    text: () => 'Um patógeno desconhecido se espalha pelas cidades.',
    opts: (p, c) => [
      { label: `Quarentena e cura (${fmt(cost(p, 1))} CR)`, cost: cost(p, 1), fx: () => { c.pop *= 0.97; return 'A epidemia foi controlada rapidamente.'; } },
      { label: 'Deixar seguir', fx: () => { c.pop *= 0.82; c.stab -= 10; return 'A epidemia cobrou um preço alto.'; } },
    ],
    def: 1,
  },
  raide: {
    title: p => `Raide pirata contra ${p.name}`,
    text: (p, c) => `Uma frota pirata ataca a órbita. Poder defensivo: ${defensePower(p, c).toFixed(1)} contra força estimada ${(2 + p.dist * 0.9).toFixed(1)}.`,
    opts: (p, c) => [
      { label: 'Confiar nas defesas', fx: () => {
        const pw = 1 + defensePower(p, c), str = 2 + p.dist * 0.9;
        if (Math.random() < pw / (pw + str)) { c.stab += 4; return 'As defesas planetárias repeliram os piratas!'; }
        if (Math.random() < Math.min(0.7, defLv(c, 'escudo') * 0.1)) { c.stab -= 3; return 'O escudo planetário segurou o pior do ataque. Danos leves.'; }
        const ks = Object.keys(c.b).filter(k => c.b[k] > 0).map(k => ['b', k]).concat(Object.keys(c.def).filter(k => c.def[k] > 0).map(k => ['def', k]));
        if (ks.length) { const [g, k] = pickR(ks); c[g][k]--; }
        c.stab -= 10; return 'Os piratas saquearam a colônia e danificaram instalações.';
      } },
      { label: `Pagar resgate (${fmt(cost(p, 1.3))} CR)`, cost: cost(p, 1.3), fx: () => 'Os piratas levaram o dinheiro e partiram.' },
      { label: 'Enfrentar em combate', fx: () => { const pos = planetPos(p, G.time); spawnFleet(Math.max(2, p.dist + 1), pos.x + p.r + 700, pos.y, true); return `A frota pirata chegou à órbita de ${p.name}. Defesas, guarnição e frota estão em combate!`; } },
    ],
    def: 0,
  },
};
const cost = (p, k) => Math.round(260 * k * (1 + p.dist * 0.25) * Math.max(1, Math.log10((G.col[p.id]?.pop || 1e3) + 10) / 4));
function addMod(c, k, v, dur) { c.mods.push({ k, v, until: G.time + dur }); }
function spawnEvent() {
  const ids = Object.keys(G.col), id = pickR(ids), c = G.col[id], p = colPlanet(id);
  if (!p || G.events.some(e => e.pid === id)) return;
  const dip = diplomacy(p);
  const w = { descoberta: 2, boom: 2, refugiados: 1.2, praga: 0.8, raide: 0.6 + p.dist * 0.08 + (dip < -3 ? 1.5 : 0) };
  if (c.stab < 35) w.revolta = 5;
  if (c.stab < 50 && c.gov !== 'militar') w.golpe = 1.2 + (c.gov === 'anarquia' ? 1.5 : 0);
  if (c.gov === 'democracia') w.eleicao = 3;
  if (c.gov === 'monarquia') w.sucessao = 2;
  if (c.gov === 'tecnocracia') w.conselho = 2.5;
  if (c.gov === 'teocracia') w.cisma = 2;
  if (c.gov === 'corporatocracia') w.cartel = 2.5;
  if (dip >= 4) w.alianca = 1.5;
  const k = makeRng((Math.random() * 1e9) | 0).weighted(w);
  // eventos sem decisão
  if (k === 'descoberta') { const v = Math.round(25 * (1 + p.dist * 0.2) * GOV_MODS[c.gov].research); G.rp += v; news(`Cientistas de ${p.name} fizeram uma descoberta: +${v} pontos de pesquisa.`, 'ok'); return; }
  if (k === 'boom') { addMod(c, 'income', 1.5, 240); news(`Boom econômico em ${p.name}: renda +50% por 4 minutos.`, 'ok'); return; }
  if (k === 'alianca') { addMod(c, 'stab', 12, 400); addMod(c, 'income', 1.2, 400); news(`Os vizinhos de ${p.name} propuseram uma aliança comercial: renda e estabilidade em alta.`, 'ok'); return; }
  const def = EVENT_DEFS[k];
  const ev = { id: 'ev' + Math.floor(Math.random() * 1e9), k, pid: id, expires: G.time + 75, def: def.def };
  G.events.push(ev);
  toast(`Decisão necessária: ${def.title(p)}. Abra Política (P).`, 'bad');
  Sfx.warn();
}
function resolveEvent(ev, i, timeout) {
  const p = colPlanet(ev.pid), c = G.col[ev.pid];
  G.events = G.events.filter(e => e !== ev);
  if (!p || !c) return;
  const def = EVENT_DEFS[ev.k], opts = def.opts(p, c);
  let o = opts[i];
  if (o.cost && G.credits < o.cost) o = opts[def.def];
  if (o.cost) G.credits -= o.cost;
  const before = c.gov;
  const res = o.fx();
  c.stab = clamp(c.stab, 0, 100);
  news(`${def.title(p)}: ${timeout ? '(sem resposta) ' : ''}${res}`, c.stab < 30 ? 'bad' : '');
  if (c.gov !== before) news(`${p.name} agora é governado por: ${GOVS[c.gov].nome}.`, 'bad');
  Sfx.ok();
}
// mundos independentes também mudam de regime: o mapa político vive
function neighborPolitics() {
  const known = Object.keys(G.discovered).filter(id => id.split(':').length === 2 && !id.endsWith('star') && !id.endsWith('bh'));
  if (!known.length) return;
  const id = pickR(known), p = colPlanet(id);
  if (!p || p.pop <= 0 || isColony(p)) return;
  if (Math.random() < 0.55) return;
  const old = planetGov(p);
  let nw = pickR(GOV_KEYS.filter(g => g !== old));
  // vizinhos tendem a imitar colônias fortes por perto
  const near = Object.values(G.col).find(c => c._nb && c._nb.includes(id));
  if (near && Math.random() < 0.3) nw = near.gov;
  G.ngov[id] = nw;
  const how = nw === 'militar' ? 'Golpe militar' : nw === 'democracia' ? 'Revolução democrática' : nw === 'anarquia' ? 'Colapso do governo' : 'Mudança de regime';
  news(`${how} em ${p.name}: agora ${GOVS[nw].nome}.`);
}

/* ---------- contratos ---------- */
function contractOffers(p) {
  if (p.pop <= 0) return [];
  const win = Math.floor(G.time / 300), rng = makeRng(hashStr(p.id + '#' + win + '#' + G.seed)), gov = planetGov(p);
  const w = { entrega: gov === 'corporatocracia' ? 4 : 2, caca: gov === 'militar' ? 4 : p.dist > 1.5 ? 2 : 0, explorar: gov === 'tecnocracia' ? 4 : 1.5 };
  const out = [];
  for (let i = 0; i < 2; i++) {
    const k = rng.weighted(w), id = 'ct:' + p.id + ':' + win + ':' + i, m = 1 + p.dist * 0.3;
    let c;
    if (k === 'entrega') { const res = rng.pick(ORES.filter(o => o !== 'cristal' || p.dist > 5)), q = rng.int(8, 25); c = { id, k, pid: p.id, res, q, reward: Math.round(RESOURCES[res].base * q * 2.2 * m), text: `Entregar ${q} de ${RESOURCES[res].nome} em ${p.name}` }; }
    else if (k === 'caca') { const n = rng.int(3, 8); c = { id, k, pid: p.id, n, prog: 0, reward: Math.round(60 * n * m), text: `Abater ${n} naves piratas` }; }
    else { const n = rng.int(3, 7); c = { id, k, pid: p.id, n, base: 0, reward: Math.round(45 * n * m), text: `Descobrir ${n} novos corpos celestes` }; }
    c.taken = G.contracts.some(x => x.id === id) || !!G.doneContracts[id];
    out.push(c);
  }
  return out;
}
function acceptContract(c) {
  if (G.contracts.length >= 4 || c.taken) return false;
  const copy = { ...c };
  if (copy.k === 'explorar') copy.base = G.stats.found;
  G.contracts.push(copy); Sfx.ok();
  return true;
}
function contractDone(c) {
  if (c.k === 'caca') return c.prog >= c.n;
  if (c.k === 'explorar') return G.stats.found - c.base >= c.n;
  return resAvail(c.res) >= c.q;
}
function completeContract(c) {
  if (!contractDone(c)) return false;
  if (c.k === 'entrega') { if (!dock || dock.id !== c.pid) return false; spendRes(c.res, c.q); }
  G.credits += c.reward; G.stats.earned += c.reward;
  G.contracts = G.contracts.filter(x => x !== c);
  G.doneContracts[c.id] = 1;
  const p = colPlanet(c.pid);
  addInfluence(p, 15);
  toast(`Contrato concluído: +${fmt(c.reward)} CR e influência em ${p ? p.name : ''}.`, 'gold');
  Sfx.disc();
  return true;
}
function onKill(e) {
  for (const c of G.contracts) if (c.k === 'caca') c.prog++;
  for (const p of snap.planets) if (p.pop > 0 && dist(e.x, e.y, p._x, p._y) < 6000) addInfluence(p, 1.5);
}

/* ---------- pesquisa ---------- */
function buyTech(k) {
  const c = techCost(k, G.tech[k]);
  if (G.rp < c) return false;
  G.rp -= c; G.tech[k]++; Sfx.ok();
  return true;
}

/* ---------- ascensão (prestígio) ---------- */
function ascendGain() {
  return Math.floor(2 + (G.maxDist || 0) / 3 + colonyCount() * 1.5 + Math.log10(G.stats.earned + 1) * 1.5 + G.stats.kills / 40);
}
const canAscend = () => (G.maxDist || 0) >= 12 || colonyCount() >= 6;
function ascend() {
  if (!canAscend()) return;
  const gain = ascendGain();
  const meta = { essence: (G.meta.essence || 0) + gain, ascensions: (G.meta.ascensions || 0) + 1 };
  const best = G.inv.slice().sort((a, b) => moduleValue(b) - moduleValue(a))[0];
  newGame(undefined, meta);
  if (best) { G.inv.push({ ...best, id: 'heir' + Date.now().toString(36) }); }
  startPlay(); save();
  toast(`Ascensão ${meta.ascensions}: +${gain} de Essência estelar. Uma nova galáxia surge.`, 'disc');
  openHelp();
}
