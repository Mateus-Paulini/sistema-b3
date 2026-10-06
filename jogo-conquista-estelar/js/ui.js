'use strict';
/* =====================================================================
   INTERFACE: painéis (planeta, nave, império, pesquisa, política,
   contratos, mapa galáctico), toasts e utilidades de DOM.
   ===================================================================== */

const $ = id => document.getElementById(id);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

/* ---------- toasts ---------- */
function toast(msg, cls = '') {
  const el = h('div', 'toast ' + cls); el.textContent = msg;
  $('toasts').prepend(el);
  setTimeout(() => el.classList.add('out'), 4200);
  setTimeout(() => el.remove(), 4800);
  while ($('toasts').children.length > 5) $('toasts').lastChild.remove();
}

/* ---------- painel lateral genérico ---------- */
let panelOpen = false, panel = null; // {kind, render, tick, tab}
function btn(label, onClick, cls = '', disabled = false, cost) {
  const b = h('button', 'btn ' + cls, label); b.disabled = disabled;
  if (cost !== undefined && !disabled) b.dataset.cost = cost;
  b.addEventListener('click', e => { e.stopPropagation(); Sfx.init(); if (!b.disabled) { onClick(); } });
  return b;
}
function showPanel(kind, render, opts = {}) {
  const same = panel && panel.kind === kind;
  panel = { kind, render, tick: opts.tick || null, cls: opts.cls || 'side', onClose: opts.onClose };
  draw(same);
}
function draw(noAnim) {
  if (!panel) return;
  const P = $('panel'), old = P.querySelector('.sheet'), scroll = old ? old.scrollTop : 0;
  P.innerHTML = '';
  P.className = 'show ' + panel.cls;
  const box = h('div', 'sheet' + (noAnim ? ' noanim' : ''));
  const x = h('button', 'x', '×'); x.setAttribute('aria-label', 'Fechar'); x.onclick = () => closePanel();
  box.appendChild(x);
  const content = panel.render();
  if (typeof content === 'string') box.insertAdjacentHTML('beforeend', content); else box.appendChild(content);
  P.appendChild(box);
  box.scrollTop = noAnim ? scroll : 0;
  panelOpen = true;
  liveRefresh();
}
const redraw = () => draw(true);
function closePanel() {
  const P = $('panel'); P.className = ''; P.innerHTML = '';
  const cb = panel && panel.onClose;
  panelOpen = false; panel = null;
  if (cb) cb();
}
// valores ao vivo e botões com custo
const LIVE = {
  credits: () => fmt(G.credits) + ' CR', rp: () => fmt(G.rp) + ' PP',
};
function liveRefresh() {
  const P = $('panel');
  P.querySelectorAll('[data-live]').forEach(e => { const f = LIVE[e.dataset.live]; if (f) e.textContent = f(); });
  P.querySelectorAll('[data-cost]').forEach(b => { b.disabled = (b.dataset.cur === 'rp' ? G.rp : G.credits) < +b.dataset.cost; });
}
const pips = (v, max = 10) => `<span class="lvl">Nv ${fmt(v)}</span>`;
function tabs(list, cur, onPick) {
  const nav = h('div', 'tabs');
  for (const [k, label] of list) { const b = h('button', 'tab' + (k === cur ? ' on' : ''), label); b.onclick = () => onPick(k); nav.appendChild(b); }
  return nav;
}
function row(title, desc, right, extra = '') {
  const r = h('div', 'row ' + extra);
  const l = h('div', 'r-main', `<div class="r-title">${title}</div>${desc ? `<div class="r-desc">${desc}</div>` : ''}`);
  r.appendChild(l);
  const rc = h('div', 'r-act');
  (Array.isArray(right) ? right : [right]).forEach(x => x && rc.appendChild(typeof x === 'string' ? h('span', 'num', x) : x));
  r.appendChild(rc);
  return r;
}
const sec = (t) => h('h3', '', t);
const statusBar = () => h('div', 'wallet', `<span data-live="credits"></span><span data-live="rp" class="rp"></span>`);

/* =====================================================================
   PAINEL DO PLANETA
   ===================================================================== */
const ATMOS = { terrestre: 'Nitrogênio-oxigênio (respirável)', oceanico: 'Úmida, rica em vapor', desertico: 'Fina, rica em CO₂', vulcanico: 'Tóxica, sulfurosa', gelado: 'Rarefeita, metano', gasoso: 'Hidrogênio e hélio', exotico: 'Anômala, composição desconhecida', rochoso: 'Nenhuma' };
const sellPrice = (p, k) => Math.max(1, Math.round(RESOURCES[k].base * p.market[k] * (1 + 0.06 * G.tech.economia) * (planetGov(p) === 'corporatocracia' ? 1.1 : 1)));
const cargoUsed = () => { let n = 0; for (const k in G.cargo) n += G.cargo[k]; return n; };
const EXTRACT_CD = 240;

function openPlanetPanel(p, tab) {
  const portrait = h('canvas', 'portrait');
  portrait.width = portrait.height = Math.round(170 * DPR);
  const pctx = portrait.getContext('2d');
  let cur = tab || 'geral';
  const render = () => {
    const root = h('div', 'planet');
    const star = getSector(...p.sec.split(',').map(Number)).star, sc = STAR_CLASSES[star.cls];
    const gov = planetGov(p), col = G.col[p.id];
    const head = h('div', 'p-head');
    head.appendChild(portrait);
    const chips = [];
    if (col) chips.push('<span class="chip ok">Colônia da Federação</span>');
    else if (p.pop > 0) chips.push(`<span class="chip">Independente · ${GOVS[gov].nome}</span>`);
    else chips.push('<span class="chip">Desabitado</span>');
    for (const z of p.hazards) chips.push(`<span class="chip warn">${z}</span>`);
    if (p.ring) chips.push('<span class="chip">Anéis</span>');
    head.appendChild(h('div', 'p-title', `<div class="eyebrow">${PLANET_TYPES[p.type].nome} · Sistema ${star.name}</div><h2>${p.name}</h2><div class="chips">${chips.join('')}</div>`));
    root.appendChild(head);
    root.appendChild(statusBar());
    const list = [['geral', 'Visão geral'], ['mercado', 'Mercado'], ['estaleiro', 'Estaleiro'], ['colonia', col ? 'Colônia' : p.pop > 0 ? 'Diplomacia' : 'Colonizar']];
    if (col) list.push(['defesa', 'Defesa']);
    if (p.pop > 0) list.push(['contratos', 'Contratos']);
    root.appendChild(tabs(list, cur, k => { cur = k; redraw(); }));
    const body = h('div', 'tab-body');
    ({ geral: tabGeral, mercado: tabMercado, estaleiro: tabEstaleiro, colonia: tabColonia, defesa: tabDefesa, contratos: tabContratos }[cur])(body, p, star, sc);
    root.appendChild(body);
    const foot = h('div', 'foot');
    foot.appendChild(btn('Deixar órbita <kbd>E</kbd>', () => closePanel(), 'primary'));
    root.appendChild(foot);
    return root;
  };
  showPanel('planet', render, {
    onClose: () => { if (dock) undock(); },
    tick: () => {
      pctx.clearRect(0, 0, portrait.width, portrait.height);
      const pos = planetPos(p, G.time);
      drawPlanet(pctx, p, portrait.width / 2, portrait.height / 2, portrait.width * (p.ring ? 0.2 : 0.36), Math.atan2(p.cy - pos.y, p.cx - pos.x), G.time, 'p');
    },
  });
}

function tabGeral(body, p, star, sc) {
  const col = G.col[p.id], gov = planetGov(p);
  const pop = col ? col.pop : p.pop;
  const facts = [
    ['Estrela', `${star.name} (${sc.nome})`], ['Diâmetro', fmt(p.diam) + ' km'], ['Gravidade', p.grav.toLocaleString('pt-BR') + ' g'],
    ['Temperatura', p.tempC + ' °C'], ['Atmosfera', ATMOS[p.type]], ['População', pop ? fmtBig(pop) + ' hab.' : 'Desabitado'],
    ['Governo', pop ? `${GOVS[gov].nome} <span class="muted">· ${GOVS[gov].desc}</span>` : 'Nenhum'],
    ['Setor', `${p.sec.replace(',', ', ')} · ${ringName(ringOf(p.dist))}`],
  ];
  body.insertAdjacentHTML('beforeend', `<h3>Dados planetários</h3><dl class="facts">${facts.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>`);
  const res = Object.entries(p.res).sort((a, b) => b[1] - a[1]);
  body.insertAdjacentHTML('beforeend', `<h3>Recursos naturais</h3>${res.length ? `<div class="res">${res.map(([k, v]) => `<div class="res-row"><span>${RESOURCES[k].nome}</span><span class="meter"><i style="width:${Math.round(v * 100)}%;background:${RESOURCES[k].cor}"></i></span><span class="num">${Math.round(v * 100)}%</span></div>`).join('')}</div>` : '<p class="muted">Nenhum recurso relevante detectado.</p>'}`);
  // extração orbital: minerar o próprio planeta
  if (res.length) {
    const last = G.extract[p.id] || -1e9, left = Math.ceil(EXTRACT_CD - (G.time - last));
    body.appendChild(sec('Extração orbital'));
    const desc = 'Lança sondas de mineração na superfície. O rendimento depende da abundância de cada recurso e do porão livre.';
    body.appendChild(row('Minerar este planeta', desc, left > 0 ? `Recarga: ${left}s` : btn(extracting ? 'Extraindo…' : 'Iniciar extração', () => startExtraction(p), 'sm', !!extracting)));
  }
}

let extracting = null;
function startExtraction(p) {
  if (extracting) return;
  extracting = { p, t: 0, dur: 8 };
  toast(`Sondas descendo em ${p.name}…`);
  Sfx.tone(300, 0.6, 'sine', 0.04, 300);
  redraw();
}
function updateExtraction(dt) {
  if (!extracting) return;
  if (!dock || dock !== extracting.p) { extracting = null; toast('Extração interrompida: você deixou a órbita.', 'bad'); return; }
  extracting.t += dt;
  if (extracting.t < extracting.dur) return;
  const p = extracting.p; extracting = null;
  G.extract[p.id] = G.time;
  const free = cargoCap() - cargoUsed();
  let got = 0; const parts = [];
  for (const [k, v] of Object.entries(p.res)) {
    const q = Math.min(free - got, Math.round(v * (6 + p.r / 30) * ST.oreMult));
    if (q > 0) { G.cargo[k] = (G.cargo[k] || 0) + q; got += q; parts.push(`${q} ${RESOURCES[k].nome}`); }
  }
  toast(got ? `Extração concluída: ${parts.join(', ')}.` : 'Porão cheio: nada pôde ser embarcado.', got ? 'gold' : 'bad');
  Sfx.ok();
  if (panel && panel.kind === 'planet') redraw();
}

function tabMercado(body, p) {
  body.appendChild(sec('Vender carga da nave'));
  const keysC = Object.keys(G.cargo).filter(k => G.cargo[k] > 0);
  if (!keysC.length) body.insertAdjacentHTML('beforeend', '<p class="muted">Seu porão está vazio. Minere asteroides ou use a extração orbital.</p>');
  let total = 0;
  const sell = (k, from, quiet) => {
    const store = from === 'stock' ? G.stock : G.cargo;
    const q = Math.floor(store[k] || 0); if (!q) return 0;
    const v = q * sellPrice(p, k);
    G.credits += v; G.stats.earned += v; store[k] -= q;
    addInfluence(p, v / (30 * (1 + p.dist * 0.3)));
    if (!quiet) { Sfx.ok(); toast(`Vendido: ${q} ${RESOURCES[k].nome} por ${fmt(v)} CR`, 'gold'); redraw(); }
    return v;
  };
  for (const k of keysC) {
    const q = G.cargo[k], pr = sellPrice(p, k); total += q * pr;
    const trend = p.market[k] > 1.15 ? ' <span class="up">alta demanda</span>' : p.market[k] < 0.85 ? ' <span class="down">saturado</span>' : '';
    body.appendChild(row(`<span class="dot" style="background:${RESOURCES[k].cor}"></span>${RESOURCES[k].nome}${trend}`, `${q} × ${pr} CR`, btn('Vender', () => sell(k, 'cargo'), 'sm')));
  }
  if (keysC.length > 1) { const r = h('div', 'm-total'); r.appendChild(btn(`Vender tudo · ${fmt(total)} CR`, () => { let v = 0; for (const k of keysC) v += sell(k, 'cargo', true); Sfx.ok(); toast(`Carga vendida por ${fmt(v)} CR`, 'gold'); redraw(); }, 'primary')); body.appendChild(r); }
  const stockK = Object.keys(G.stock).filter(k => G.stock[k] >= 1);
  body.appendChild(sec('Armazém imperial'));
  if (!stockK.length) body.insertAdjacentHTML('beforeend', '<p class="muted">Vazio. Minas nas suas colônias enchem o armazém automaticamente.</p>');
  for (const k of stockK) {
    const q = Math.floor(G.stock[k]), pr = sellPrice(p, k);
    body.appendChild(row(`<span class="dot" style="background:${RESOURCES[k].cor}"></span>${RESOURCES[k].nome}`, `${fmt(q)} × ${pr} CR = ${fmt(q * pr)} CR`, btn('Vender', () => sell(k, 'stock'), 'sm')));
  }
  body.appendChild(sec('Preços deste mercado'));
  body.insertAdjacentHTML('beforeend', `<div class="price-grid">${Object.keys(RESOURCES).map(k => `<span><i class="dot" style="background:${RESOURCES[k].cor}"></i>${RESOURCES[k].nome}</span><b class="num">${sellPrice(p, k)} CR</b>`).join('')}</div>`);
}

function tabEstaleiro(body, p) {
  const y = shipyardHere();
  const st = shipStats();
  // reparo funciona em qualquer órbita
  const miss = Math.ceil(st.hullMax - G.ship.hull), rc = Math.ceil(miss * 1.2 * (1 + p.dist * 0.05));
  body.appendChild(sec('Serviços'));
  body.appendChild(row('Reparar casco', `${fmt(G.ship.hull)}/${fmt(st.hullMax)}`, miss > 0 ? btn(`${fmt(rc)} CR`, () => { if (G.credits >= rc) { G.credits -= rc; G.ship.hull = st.hullMax; Sfx.ok(); redraw(); } }, 'sm', false, rc) : 'Intacto'));
  if (!y) {
    body.insertAdjacentHTML('beforeend', '<p class="muted">Mundo desabitado: não há estaleiro aqui. Melhorias e lojas exigem um planeta habitado ou uma colônia sua.</p>');
    return;
  }
  body.insertAdjacentHTML('beforeend', `<p class="muted">${y.colony && y.discount < 1 ? `Estaleiro da Federação: <b class="ok">${Math.round((1 - y.discount) * 100)}% de desconto</b> em melhorias.` : 'Estaleiro civil.'} Classe atual: <b>Mk ${romanize(st.tier)}</b> · ${G.ship.equip.length}/${st.slots} módulos.</p>`);
  body.appendChild(sec(`Construir naves · frota ${G.fleet.length}/${fleetCap()}`));
  const yl = shipyardLevel();
  body.insertAdjacentHTML('beforeend', `<p class="muted small">${y.colony ? `Estaleiro nível ${yl}: classes maiores exigem estaleiros mais desenvolvidos (aba Colônia).` : 'Estaleiro civil: apenas naves leves. Colônias com estaleiro constroem classes maiores.'}</p>`);
  for (const k of CLASS_KEYS) {
    const C = SHIP_CLASSES[k], ok = yl >= C.req, price = buildPrice(k);
    body.appendChild(row(`${C.nome} <span class="muted small">· ${C.slots} arma${C.slots === 1 ? '' : 's'}${C.cargo ? ` · porão ${C.cargo}` : ''}</span>`,
      ok ? `${C.desc}. Casco ${fmt(C.hp)}, velocidade ${C.spd}.` : `Requer estaleiro nível ${C.req}.`,
      ok ? btn(`${fmt(price)} CR`, () => { if (buildShip(k)) redraw(); }, 'sm', G.fleet.length >= fleetCap(), price) : '🔒', ok ? '' : 'dim'));
  }
  body.appendChild(sec('Melhorias da nau capitânia (sem limite de nível)'));
  attrRows(body, y.discount);
  body.appendChild(sec('Loja de módulos'));
  for (const o of shopOffers(p)) {
    if (o.sold) { body.appendChild(row(`${moduleLabel(o)}`, 'Vendido', '—', 'dim')); continue; }
    body.appendChild(row(moduleLabel(o), `${CAT_NAMES[MODULES[o.k].cat]} · ${moduleEffect(o)}`, btn(`${fmt(o.price)} CR`, () => {
      if (G.credits < o.price) return;
      G.credits -= o.price; G.shopSold[o.id] = 1;
      const m = makeModule(o.k, o.rar); G.inv.push(m);
      Sfx.ok(); toast(`Comprado: ${stripTags(moduleLabel(m))}`, 'gold'); redraw();
    }, 'sm', false, o.price)));
  }
  body.insertAdjacentHTML('beforeend', '<p class="muted small">O estoque muda a cada 5 minutos.</p>');
  body.appendChild(sec('Forja de módulos'));
  const costTxt = Object.entries(FORGE_COST).map(([k, v]) => `${v} ${RESOURCES[k].nome}`).join(', ');
  body.appendChild(row('Forjar módulo aleatório', `Custo: ${costTxt}. Usa o porão e o armazém imperial.`, btn('Forjar', () => { const m = forge(false); if (m) { toast(`Forjado: ${stripTags(moduleLabel(m))}`, 'disc'); redraw(); } }, 'sm', !canForge(false))));
  body.appendChild(row('Forja quântica', 'Mesmo custo + 3 Cristal quântico. Chance muito maior de raridades altas.', btn('Forjar', () => { const m = forge(true); if (m) { toast(`Forjado: ${stripTags(moduleLabel(m))}`, 'disc'); redraw(); } }, 'sm', !canForge(true))));
  body.appendChild(sec('Pintura'));
  const pr = h('div', 'paints');
  ACCENTS.forEach((c, i) => { const b = h('button', 'paint' + (G.ship.paint === i ? ' on' : '')); b.style.background = c; b.setAttribute('aria-label', 'Cor ' + (i + 1)); b.onclick = () => { G.ship.paint = i; redraw(); }; pr.appendChild(b); });
  body.appendChild(pr);
}
function attrRows(body, discount) {
  const st = shipStats();
  const fx = {
    casco: `${fmt(st.hullMax)} pts`, escudo: st.shieldMax ? `${fmt(st.shieldMax)} pts` : 'desligado', motor: `${Math.round(st.maxSpeed)} u/s`,
    armas: `${st.dmg.toFixed(1)} dano`, reator: `${fmt(st.energyMax)} energia`, carga: `${fmt(st.cargoMax)} un.`, sensores: `${fmt(st.sensor)} u`,
  };
  for (const k in SHIP_ATTRS) {
    const lv = G.ship.lv[k], c = discount ? Math.round(attrCost(k, lv) * discount) : null;
    body.appendChild(row(`${SHIP_ATTRS[k].nome} ${pips(lv)}`, `${SHIP_ATTRS[k].desc} · atual: ${fx[k]}`,
      c === null ? '' : btn(`${fmt(c)} CR`, () => { if (buyAttr(k)) redraw(); }, 'sm', false, c)));
  }
}

function tabColonia(body, p) {
  const c = G.col[p.id];
  if (!c) {
    if (p.pop <= 0) {
      const cost = colonizeCost();
      body.appendChild(sec('Fundar colônia'));
      body.insertAdjacentHTML('beforeend', `<p>Este mundo está vazio. Uma colônia gera renda, pesquisa e recursos, e pode ser melhorada sem limite. Cada nova colônia custa mais que a anterior.</p>`);
      body.appendChild(row('Kit de colonização', `Colônias atuais: ${colonyCount()}`, btn(`${fmt(cost)} CR`, () => { if (colonize(p)) redraw(); }, 'primary', false, cost)));
      return;
    }
    const inf = G.inf[p.id] || 0, gov = planetGov(p);
    body.appendChild(sec('Influência da Federação'));
    body.insertAdjacentHTML('beforeend', `<div class="bigbar"><i style="width:${inf}%"></i><span>${Math.floor(inf)}/100</span></div>
      <p class="muted">Ganhe influência vendendo mercadorias aqui, cumprindo contratos deste planeta, abatendo piratas no sistema ou investindo diretamente. Com 100, o planeta pode aderir à Federação mantendo o governo atual (${GOVS[gov].nome}).</p>`);
    const ic = investCost(p);
    body.appendChild(row('Investir em infraestrutura', `+${Math.round(8 * GOV_MODS[gov].influence)} de influência`, btn(`${fmt(ic)} CR`, () => { invest(p); redraw(); }, 'sm', false, ic)));
    if (inf >= 100) body.appendChild(row('<b class="ok">Anexar à Federação</b>', 'O planeta vira sua colônia.', btn('Anexar', () => { if (annex(p)) redraw(); }, 'primary')));
    neighborsBlock(body, p, gov);
    return;
  }
  const r = colonyRates(p, c), cap = popCap(p, c);
  body.appendChild(sec('Situação'));
  body.insertAdjacentHTML('beforeend', `<dl class="facts">
    <dt>População</dt><dd>${fmtBig(c.pop)} / ${fmtBig(cap)}</dd>
    <dt>Estabilidade</dt><dd><span class="stab ${c.stab < 30 ? 'bad' : c.stab < 55 ? 'mid' : 'ok'}">${Math.round(c.stab)}%</span> <span class="muted">→ tende a ${Math.round(r.target)}%</span></dd>
    <dt>Renda</dt><dd>+${r.credits.toFixed(1)} CR/s</dd>
    <dt>Pesquisa</dt><dd>+${r.research.toFixed(2)} PP/s</dd>
    <dt>Mineração</dt><dd>${Object.keys(r.mine).length ? Object.entries(r.mine).map(([k, v]) => `${RESOURCES[k].nome} ${(v * 60).toFixed(1)}/min`).join(' · ') : 'sem minas'}</dd>
    <dt>Diplomacia</dt><dd>${r.dip >= 4 ? '<span class="ok">Aliança regional</span>' : r.dip <= -4 ? '<span class="bad">Embargo dos vizinhos</span>' : r.dip > 0 ? 'Relações cordiais' : r.dip < 0 ? 'Tensão regional' : 'Neutra'} (${r.dip > 0 ? '+' : ''}${r.dip})</dd>
  </dl>`);
  if (c.mods.length) body.insertAdjacentHTML('beforeend', `<p class="muted small">Efeitos temporários: ${c.mods.map(m => `${m.k === 'income' ? 'renda' : m.k === 'research' ? 'pesquisa' : 'estabilidade'} ${m.k === 'stab' ? '+' + m.v : '×' + m.v} (${Math.ceil(m.until - G.time)}s)`).join(', ')}</p>`);
  body.appendChild(sec('Governo'));
  const gcost = govChangeCost(p, c), cool = Math.ceil(120 - (G.time - c.govT));
  body.insertAdjacentHTML('beforeend', `<p class="muted">Trocar de regime custa ${fmt(gcost)} CR e derruba a estabilidade em 22 pontos.${cool > 0 ? ` Disponível em ${cool}s.` : ''}</p>`);
  const grid = h('div', 'gov-grid');
  for (const g of GOV_KEYS) {
    const m = GOV_MODS[g], on = c.gov === g;
    const card = h('button', 'gov' + (on ? ' on' : ''), `<b>${GOVS[g].nome}</b><span class="ok">+ ${m.pros}</span><span class="bad">− ${m.cons}</span><span class="mods">Renda ×${m.income} · Pesquisa ×${m.research} · Defesa ×${m.defense} · Estab. ${m.stab}</span>`);
    card.disabled = on || cool > 0 || G.credits < gcost;
    card.onclick = () => { if (setGov(p, g)) redraw(); };
    grid.appendChild(card);
  }
  body.appendChild(grid);
  body.appendChild(sec('Construções (sem limite de nível)'));
  for (const k in BUILDINGS) {
    const lv = c.b[k], cost = buildCost(k, lv, p);
    body.appendChild(row(`${BUILDINGS[k].nome} ${pips(lv)}`, BUILDINGS[k].desc, btn(`${fmt(cost)} CR`, () => { if (G.credits >= cost) { G.credits -= cost; c.b[k]++; Sfx.ok(); redraw(); } }, 'sm', false, cost)));
  }
  neighborsBlock(body, p, c.gov);
}
function neighborsBlock(body, p, myGov) {
  const ids = (G.col[p.id] && G.col[p.id]._nb) || neighborsOf(p);
  if (!ids.length) return;
  body.appendChild(sec('Vizinhos políticos'));
  const wrap = h('div', 'nbs');
  for (const id of ids.slice(0, 10)) {
    const q = colPlanet(id); if (!q) continue;
    const g = planetGov(q), a = isColony(q) ? 2 : govAffinity(myGov, g);
    const rel = isColony(q) ? '<span class="ok">Federação</span>' : a >= 2 ? '<span class="ok">Aliado</span>' : a > 0 ? '<span class="ok">Amistoso</span>' : a < 0 ? '<span class="bad">Hostil</span>' : '<span class="muted">Neutro</span>';
    wrap.insertAdjacentHTML('beforeend', `<div class="nb"><span>${G.discovered[id] ? q.name : 'Mundo não mapeado'}</span><span class="muted">${GOVS[g].nome}</span>${rel}</div>`);
  }
  body.appendChild(wrap);
}

function tabContratos(body, p) {
  body.appendChild(sec('Ofertas'));
  for (const c of contractOffers(p)) {
    body.appendChild(row(c.text, `Recompensa: ${fmt(c.reward)} CR + influência`, c.taken ? 'Aceito' : btn('Aceitar', () => { if (acceptContract(c)) redraw(); else toast('Limite de 4 contratos ativos.', 'bad'); }, 'sm', G.contracts.length >= 4)));
  }
  const mine = G.contracts.filter(c => c.pid === p.id);
  if (mine.length) {
    body.appendChild(sec('Seus contratos com este planeta'));
    for (const c of mine) body.appendChild(row(c.text, contractProgress(c), btn('Concluir', () => { if (completeContract(c)) redraw(); }, 'sm primary', !contractDone(c))));
  }
}
function contractProgress(c) {
  if (c.k === 'caca') return `${Math.min(c.prog, c.n)}/${c.n} abatidos`;
  if (c.k === 'explorar') return `${Math.min(G.stats.found - c.base, c.n)}/${c.n} descobertos`;
  return `${Math.min(resAvail(c.res), c.q)}/${c.q} disponíveis (porão + armazém). Entregue em órbita do planeta.`;
}

function tabDefesa(body, p) {
  const c = G.col[p.id];
  const pw = defensePower(p, c), threat = 2 + p.dist * 0.9;
  body.appendChild(sec('Poder defensivo'));
  body.insertAdjacentHTML('beforeend', `<div class="bigbar ${pw >= threat ? '' : 'warn'}"><i style="width:${Math.min(100, pw / (threat * 2) * 100)}%"></i><span>${pw.toFixed(1)} · ameaça pirata da região ≈ ${threat.toFixed(1)}</span></div>
    <p class="muted small">Cada tipo de defesa evolui sem limite (+12% de dano por nível). O regime (${GOVS[c.gov].nome}: defesa ×${GOV_MODS[c.gov].defense}) e a pesquisa de Fortificação multiplicam tudo. Raides contra a colônia comparam este poder com a força pirata.</p>`);
  body.appendChild(sec('Estruturas'));
  for (const k of DEF_KEYS) {
    const D = DEFENSES[k], lv = defLv(c, k), ok = defReqOk(c, k), cost = defCost(k, lv, p);
    const reqTxt = D.req ? 'Requer ' + Object.entries(D.req).map(([q, n]) => `${DEFENSES[q].nome} nv ${n}`).join(', ') : '';
    const eff = k === 'escudo' ? `bloqueio de raides ${Math.min(70, lv * 10)}% · +${Math.min(10, lv * 1.5).toFixed(1)} estab.` : D.dmg ? `dano ${(D.dmg * defScale(lv) * defMult(c)).toFixed(1)} · alcance ${fmt(D.range)}` : '';
    body.appendChild(row(`${D.nome} ${pips(lv)}`, `${D.desc}${eff ? ' · ' + eff : ''}${!ok ? ` · <span class="bad">${reqTxt}</span>` : ''}`,
      btn(`${fmt(cost)} CR`, () => { if (buildDefense(p, k)) redraw(); }, 'sm', !ok, ok ? cost : undefined), ok ? '' : 'dim'));
  }
  body.appendChild(sec('Guarnição'));
  const here = G.fleet.filter(s => s.post === p.id);
  if (!here.length) body.insertAdjacentHTML('beforeend', '<p class="muted">Nenhuma nave guarnecendo este planeta. Atribua naves pela aba Frota (F) enquanto estiver em órbita.</p>');
  for (const s of here) body.appendChild(row(`${s.name} <span class="muted">· ${SHIP_CLASSES[s.cls].nome} ${pips(s.lvl)}</span>`, `Poder ${shipPower(s).toFixed(1)}`, btn('Chamar para a frota', () => { garrison(s, null); redraw(); }, 'sm')));
  const avail = escorts();
  if (avail.length && dock === p) {
    const r = h('div', 'r-act left');
    avail.forEach(s => r.appendChild(btn(`Guarnecer: ${s.name}`, () => { garrison(s, p); redraw(); }, 'sm ghost')));
    body.appendChild(r);
  }
}

/* =====================================================================
   FROTA (F)
   ===================================================================== */
function openFleetPanel() {
  showPanel('fleet', () => {
    const root = h('div');
    const yl = shipyardLevel();
    root.appendChild(h('div', '', `<div class="eyebrow">Comando</div><h2>Frota</h2><p class="muted">A nau capitânia lidera; as escoltas seguem em formação, lutam, mineram e aumentam o porão total. Naves em guarnição defendem uma colônia. Limite de comando: <b>${G.fleet.length}/${fleetCap()}</b> (cresce com a classe Mk da nau capitânia e com a pesquisa Logística de frota).</p>`));
    root.appendChild(statusBar());
    root.appendChild(sec('Ordens das escoltas'));
    const og = h('div', 'orders');
    for (const k in ORDERS) { const b = h('button', 'gov' + (G.fleetOrder === k ? ' on' : ''), `<b>${ORDERS[k].nome}</b><span class="mods">${ORDERS[k].desc}</span>`); b.onclick = () => { G.fleetOrder = k; Sfx.ok(); redraw(); }; og.appendChild(b); }
    root.appendChild(og);
    if (yl < 0) root.insertAdjacentHTML('beforeend', '<p class="muted small">Melhorias e troca de armas exigem estar em órbita de um planeta com estaleiro (habitado ou colônia).</p>');
    const groups = [['Escoltas', G.fleet.filter(s => !s.post)], ['Guarnições', G.fleet.filter(s => s.post)]];
    for (const [title, list] of groups) {
      if (!list.length) continue;
      root.appendChild(sec(`${title} (${list.length})`));
      for (const s of list) {
        const C = SHIP_CLASSES[s.cls], f = fstats(s), card = h('div', 'shipcard');
        const D = fleetDesign(s), sp = shipSprite(D, 2), pv = h('canvas', 'mini'); pv.width = pv.height = 72;
        const g = pv.getContext('2d'); g.translate(36, 36); g.rotate(-Math.PI / 2); const kk = 66 / sp.size; g.drawImage(sp.cv, -sp.size * kk / 2, -sp.size * kk / 2, sp.size * kk, sp.size * kk);
        card.appendChild(pv);
        const info = h('div', 'sc-info');
        const where = s.post ? `Guarnecendo ${colPlanet(s.post) ? colPlanet(s.post).name : '?'}` : 'Na frota';
        info.innerHTML = `<div class="r-title">${s.name} <span class="muted">· ${C.nome}</span> ${pips(s.lvl)}</div>
          <div class="r-desc">${where} · casco ${fmt(s.hp)}/${fmt(f.hpMax)} · dano ×${f.dmg.toFixed(2)} · vel ${Math.round(f.spd)}${f.cargo ? ` · porão ${f.cargo}` : ''} · poder ${shipPower(s).toFixed(1)}</div>`;
        const hpb = h('div', 'meter'); hpb.innerHTML = `<i style="width:${clamp(s.hp / f.hpMax, 0, 1) * 100}%;background:${s.hp / f.hpMax > 0.35 ? 'var(--green)' : 'var(--red)'}"></i>`; info.appendChild(hpb);
        // armas por espaço
        if (s.weapons.length) {
          const ws = h('div', 'wslots');
          s.weapons.forEach((w, i) => {
            const sel = document.createElement('select'); sel.id = 'w-' + s.id + '-' + i; sel.disabled = yl < 0;
            for (const k in WEAPONS) { const o = document.createElement('option'); o.value = k; o.textContent = WEAPONS[k].nome + (yl < WEAPONS[k].req && k !== w ? ` (estaleiro ${WEAPONS[k].req})` : ''); o.disabled = yl < WEAPONS[k].req && k !== w; o.selected = k === w; sel.appendChild(o); }
            sel.onchange = () => { if (!refit(s, i, sel.value)) toast('Este armamento exige um estaleiro mais avançado.', 'bad'); redraw(); };
            const lab = h('label', '', `Arma ${i + 1}`); lab.setAttribute('for', sel.id);
            const wrap = h('span', 'wsl'); wrap.appendChild(lab); wrap.appendChild(sel); ws.appendChild(wrap);
          });
          info.appendChild(ws);
          info.insertAdjacentHTML('beforeend', `<div class="r-desc">${s.weapons.map(w => `${WEAPONS[w].nome}: ${(WEAPONS[w].dmg * f.dmg).toFixed(1)} dano, alcance ${WEAPONS[w].range}`).join(' · ')}</div>`);
        }
        const acts = h('div', 'r-act left');
        const uc = shipUpCost(s);
        acts.appendChild(btn(`Melhorar · ${fmt(uc)} CR`, () => { if (upgradeFleetShip(s)) redraw(); }, 'sm', yl < 0, yl < 0 ? undefined : uc));
        if (s.post) acts.appendChild(btn('Chamar para a frota', () => { garrison(s, null); redraw(); }, 'sm'));
        else if (dock && isColony(dock)) acts.appendChild(btn(`Guarnecer ${dock.name}`, () => { garrison(s, dock); redraw(); }, 'sm'));
        acts.appendChild(btn('Desmontar', () => { if (s._confirm) { scrapShip(s); redraw(); } else { s._confirm = true; redraw(); } }, 'sm ' + (s._confirm ? 'danger' : 'ghost')));
        info.appendChild(acts);
        card.appendChild(info);
        root.appendChild(card);
      }
    }
    if (!G.fleet.length) root.insertAdjacentHTML('beforeend', '<p class="muted">Sem naves na frota. Construa naves no Estaleiro de um planeta habitado ou colônia.</p>');
    return root;
  }, { onClose: () => { for (const s of G.fleet) delete s._confirm; } });
}

/* =====================================================================
   NAVE (N)
   ===================================================================== */
function openShipPanel() {
  showPanel('ship', () => {
    const st = shipStats(), root = h('div');
    const D = currentDesign(), sp = shipSprite(D, 3);
    const pv = h('canvas', 'ship-pv'); pv.width = pv.height = 220;
    const g = pv.getContext('2d'); g.translate(110, 110); g.rotate(-Math.PI / 2); const k = 200 / sp.size; g.drawImage(sp.cv, -sp.size * k / 2, -sp.size * k / 2, sp.size * k, sp.size * k);
    const head = h('div', 'p-head'); head.appendChild(pv);
    head.appendChild(h('div', 'p-title', `<div class="eyebrow">Nave da Federação</div><h2>Mk ${romanize(st.tier)}</h2><p class="muted">Próxima classe em ${TIER_STEP - (Object.values(G.ship.lv).reduce((a, b) => a + b, 0) % TIER_STEP)} níveis. Cada classe muda o casco e libera espaços de módulo.</p>`));
    root.appendChild(head);
    root.appendChild(statusBar());
    root.insertAdjacentHTML('beforeend', `<dl class="facts cols">
      <dt>Casco</dt><dd>${fmt(G.ship.hull)}/${fmt(st.hullMax)}</dd><dt>Escudo</dt><dd>${fmt(G.ship.shield)}/${fmt(st.shieldMax)}</dd>
      <dt>Dano</dt><dd>${st.dmg.toFixed(1)}</dd><dt>Disparos/s</dt><dd>${(1 / st.fireCd).toFixed(1)}</dd>
      <dt>Velocidade</dt><dd>${Math.round(st.maxSpeed)}</dd><dt>Energia</dt><dd>${fmt(st.energyMax)}</dd>
      <dt>Carga</dt><dd>${cargoUsed()}/${fmt(st.cargoMax)}</dd><dt>Sensores</dt><dd>${fmt(st.sensor)}</dd></dl>`);
    root.appendChild(sec('Atributos'));
    const y = shipyardHere();
    if (!y) root.insertAdjacentHTML('beforeend', '<p class="muted">Para comprar melhorias, entre em órbita de um planeta habitado ou de uma colônia sua.</p>');
    attrRows(root, y ? y.discount : null);
    root.appendChild(sec(`Módulos equipados (${G.ship.equip.length}/${st.slots})`));
    const eq = equippedModules();
    if (!eq.length) root.insertAdjacentHTML('beforeend', '<p class="muted">Nenhum módulo. Consiga módulos em lojas, na forja, em estaleiros de colônias ou nos destroços de piratas.</p>');
    for (const m of eq) root.appendChild(modRow(m, true));
    const rest = G.inv.filter(m => !G.ship.equip.includes(m.id)).sort((a, b) => b.rar - a.rar || b.lvl - a.lvl);
    if (rest.length) { root.appendChild(sec(`Inventário (${rest.length})`)); for (const m of rest) root.appendChild(modRow(m, false)); }
    return root;
  });
}
function modRow(m, on) {
  const c = moduleUpCost(m);
  return row(moduleLabel(m), `${CAT_NAMES[MODULES[m.k].cat]} · ${moduleEffect(m)}`, [
    btn(on ? 'Remover' : 'Equipar', () => { equipModule(m); redraw(); }, 'sm' + (on ? '' : ' primary')),
    btn(`+1 · ${fmt(c)} CR`, () => { upgradeModule(m); redraw(); }, 'sm', false, c),
    on ? null : btn(`Vender ${fmt(moduleSellValue(m))}`, () => { sellModule(m); redraw(); }, 'sm ghost'),
  ], on ? 'equipped' : '');
}

/* =====================================================================
   IMPÉRIO (I)
   ===================================================================== */
function openEmpirePanel() {
  showPanel('empire', () => {
    const root = h('div'), T = empireTotals();
    root.appendChild(h('div', '', `<div class="eyebrow">Federação</div><h2>Império</h2>`));
    root.appendChild(statusBar());
    root.insertAdjacentHTML('beforeend', `<dl class="facts cols">
      <dt>Colônias</dt><dd>${colonyCount()}</dd><dt>Renda</dt><dd>+${T.credits.toFixed(1)} CR/s</dd>
      <dt>Pesquisa</dt><dd>+${T.research.toFixed(2)} PP/s</dd><dt>Descobertas</dt><dd>${fmt(G.stats.found)}</dd>
      <dt>Piratas abatidos</dt><dd>${fmt(G.stats.kills)}</dd><dt>Distância máx.</dt><dd>${(G.maxDist || 0).toFixed(1)} setores</dd>
      <dt>Essência estelar</dt><dd>${G.meta.essence || 0} (+${(G.meta.essence || 0) * 5}% em tudo)</dd><dt>Ascensões</dt><dd>${G.meta.ascensions || 0}</dd></dl>`);
    root.appendChild(sec('Colônias'));
    for (const id in G.col) {
      const p = colPlanet(id), c = G.col[id]; if (!p) continue;
      const r = colonyRates(p, c);
      root.appendChild(row(`${p.name} <span class="muted">· ${GOVS[c.gov].nome}</span>`, `${fmtBig(c.pop)} hab. · estab. <span class="stab ${c.stab < 30 ? 'bad' : c.stab < 55 ? 'mid' : 'ok'}">${Math.round(c.stab)}%</span> · +${r.credits.toFixed(1)} CR/s`, btn('Traçar rota', () => { setRoute(p); closePanel(); }, 'sm')));
    }
    root.appendChild(sec('Armazém imperial'));
    const sk = Object.keys(G.stock).filter(k => G.stock[k] >= 0.5);
    root.insertAdjacentHTML('beforeend', sk.length ? `<div class="price-grid">${sk.map(k => `<span><i class="dot" style="background:${RESOURCES[k].cor}"></i>${RESOURCES[k].nome}</span><b class="num">${fmt(G.stock[k])}${T.mine[k] ? ` <small class="muted">+${(T.mine[k] * 60).toFixed(1)}/min</small>` : ''}</b>`).join('')}</div>` : '<p class="muted">Vazio.</p>');
    root.appendChild(sec('Ascensão'));
    const gain = ascendGain();
    root.insertAdjacentHTML('beforeend', `<p>Renascer em uma nova galáxia, mantendo a <b>Essência estelar</b> (cada ponto dá +5% permanente em dano, casco, renda e pesquisa) e o seu melhor módulo. Todo o resto recomeça.</p>
      <p class="muted">Requisito: chegar a 12 setores da origem ou ter 6 colônias. Ganho atual: <b>+${gain}</b> de Essência.</p>`);
    root.appendChild(row('Ascender', canAscend() ? 'Pronto.' : 'Ainda não disponível.', btn(confirmAsc ? 'Confirmar ascensão' : 'Ascender', () => { if (!confirmAsc) { confirmAsc = true; redraw(); return; } confirmAsc = false; closePanel(); ascend(); }, confirmAsc ? 'danger' : 'primary', !canAscend())));
    return root;
  }, { onClose: () => { confirmAsc = false; } });
}
let confirmAsc = false;

/* =====================================================================
   PESQUISA (R)
   ===================================================================== */
function openResearchPanel() {
  showPanel('research', () => {
    const root = h('div'), T = empireTotals();
    root.appendChild(h('div', '', `<div class="eyebrow">Ciência</div><h2>Pesquisa</h2><p class="muted">Pontos de pesquisa (PP) vêm das suas colônias, principalmente das universidades. Cada tecnologia tem níveis infinitos. Ritmo atual: +${T.research.toFixed(2)} PP/s.</p>`));
    root.appendChild(statusBar());
    for (const k in TECHS) {
      const lv = G.tech[k], c = techCost(k, lv), b = btn(`${fmt(c)} PP`, () => { if (buyTech(k)) redraw(); }, 'sm', false, c);
      b.dataset.cur = 'rp';
      root.appendChild(row(`${TECHS[k].nome} ${pips(lv)}`, TECHS[k].desc, b));
    }
    return root;
  });
}

/* =====================================================================
   POLÍTICA (P)
   ===================================================================== */
function openPoliticsPanel() {
  showPanel('politics', () => {
    const root = h('div');
    root.appendChild(h('div', '', `<div class="eyebrow">Conselho da Federação</div><h2>Política</h2>`));
    root.appendChild(statusBar());
    root.appendChild(sec(`Decisões pendentes (${G.events.length})`));
    if (!G.events.length) root.insertAdjacentHTML('beforeend', '<p class="muted">Nenhuma crise no momento.</p>');
    for (const ev of G.events) {
      const p = colPlanet(ev.pid), c = G.col[ev.pid]; if (!p || !c) continue;
      const def = EVENT_DEFS[ev.k], card = h('div', 'event');
      card.innerHTML = `<b>${def.title(p)}</b><p>${def.text(p, c)}</p><p class="muted small">Sem resposta em ${Math.ceil(ev.expires - G.time)}s, vale a opção padrão.</p>`;
      const bs = h('div', 'ev-btns');
      def.opts(p, c).forEach((o, i) => bs.appendChild(btn(o.label, () => { resolveEvent(ev, i); redraw(); }, 'sm' + (i === def.def ? '' : ' primary'), !!o.cost && G.credits < o.cost)));
      card.appendChild(bs);
      root.appendChild(card);
    }
    root.appendChild(sec('Colônias'));
    for (const id in G.col) {
      const p = colPlanet(id), c = G.col[id]; if (!p) continue;
      const dip = diplomacy(p);
      root.appendChild(row(`${p.name}`, `${GOVS[c.gov].nome} · estab. <span class="stab ${c.stab < 30 ? 'bad' : c.stab < 55 ? 'mid' : 'ok'}">${Math.round(c.stab)}%</span> · diplomacia ${dip > 0 ? '+' : ''}${dip}`, ''));
    }
    root.appendChild(sec('Notícias da galáxia'));
    root.insertAdjacentHTML('beforeend', G.news.length ? `<ul class="news">${G.news.slice(0, 30).map(n => `<li class="${n.cls}"><span class="muted">${fmtTime(n.t)}</span> ${n.msg}</li>`).join('')}</ul>` : '<p class="muted">Sem notícias.</p>');
    return root;
  });
}
const fmtTime = t => { const m = Math.floor(t / 60); return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };

/* =====================================================================
   CONTRATOS (C)
   ===================================================================== */
function openContractsPanel() {
  showPanel('contracts', () => {
    const root = h('div');
    root.appendChild(h('div', '', `<div class="eyebrow">Quadro de missões</div><h2>Contratos</h2><p class="muted">Planetas habitados oferecem contratos no próprio mercado. Até 4 ativos.</p>`));
    if (!G.contracts.length) root.insertAdjacentHTML('beforeend', '<p class="muted">Nenhum contrato ativo.</p>');
    for (const c of G.contracts) {
      const p = colPlanet(c.pid);
      root.appendChild(row(c.text, `${contractProgress(c)} · ${fmt(c.reward)} CR · contratante: ${p ? p.name : '?'}`, [
        contractDone(c) && c.k !== 'entrega' ? btn('Receber', () => { completeContract(c); redraw(); }, 'sm primary') : null,
        p ? btn('Rota', () => { setRoute(p); closePanel(); }, 'sm') : null,
        btn('Abandonar', () => { G.contracts = G.contracts.filter(x => x !== c); redraw(); }, 'sm ghost'),
      ]));
    }
    return root;
  });
}

/* =====================================================================
   MAPA GALÁCTICO (M)
   ===================================================================== */
let mapView = { cx: 0, cy: 0, scale: 0.008 };
function openMapPanel() {
  mapView.cx = G.ship.x; mapView.cy = G.ship.y;
  const cvs = h('canvas', 'galmap');
  let drag = null, hover = null;
  const W = () => cvs.width, H = () => cvs.height;
  const toScr = (x, y) => [(x - mapView.cx) * mapView.scale + W() / 2, (y - mapView.cy) * mapView.scale + H() / 2];
  const objects = () => {
    const out = [], R = Math.ceil((Math.max(W(), H()) / mapView.scale) / SECTOR / 2) + 1;
    const sx0 = Math.floor(mapView.cx / SECTOR), sy0 = Math.floor(mapView.cy / SECTOR);
    if (R > 9) return out;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const s = getSector(sx0 + dx, sy0 + dy);
      if (s.star && G.discovered[s.star.id]) out.push({ kind: 'star', o: s.star, x: s.star.x, y: s.star.y });
      if (s.bh && G.discovered[s.bh.id]) out.push({ kind: 'bh', o: s.bh, x: s.bh.x, y: s.bh.y });
      for (const p of s.planets) if (G.discovered[p.id] || isColony(p)) { const pos = planetPos(p, G.time); out.push({ kind: 'planet', o: p, x: pos.x, y: pos.y }); }
    }
    return out;
  };
  const paint = () => {
    const g = cvs.getContext('2d'), w = W(), hh = H();
    g.fillStyle = '#030712'; g.fillRect(0, 0, w, hh);
    // grade de setores
    g.strokeStyle = 'rgba(95,225,255,0.08)'; g.lineWidth = 1;
    const step = SECTOR * mapView.scale;
    if (step > 8) {
      const ox = ((-mapView.cx * mapView.scale + w / 2) % step + step) % step, oy = ((-mapView.cy * mapView.scale + hh / 2) % step + step) % step;
      for (let x = ox; x < w; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, hh); g.stroke(); }
      for (let y = oy; y < hh; y += step) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    }
    // anéis de distância
    g.strokeStyle = 'rgba(255,181,71,0.12)';
    const [ox0, oy0] = toScr(0, 0);
    for (let r = 1; r < 12; r++) { g.beginPath(); g.arc(ox0, oy0, r * 4 * SECTOR * mapView.scale, 0, TAU); g.stroke(); }
    const objs = objects();
    for (const ob of objs) {
      const [x, y] = toScr(ob.x, ob.y);
      if (x < -20 || y < -20 || x > w + 20 || y > hh + 20) continue;
      if (ob.kind === 'star') { g.fillStyle = STAR_CLASSES[ob.o.cls].col; g.beginPath(); g.arc(x, y, 3.5, 0, TAU); g.fill(); }
      else if (ob.kind === 'bh') { g.strokeStyle = '#ff9a50'; g.beginPath(); g.arc(x, y, 4, 0, TAU); g.stroke(); }
      else {
        const p = ob.o, col = isColony(p) ? '#7dffa8' : p.pop > 0 ? GOV_COLOR[planetGov(p)] : '#6a7690';
        g.fillStyle = col; g.beginPath(); g.arc(x, y, isColony(p) ? 4.5 : 3, 0, TAU); g.fill();
        if (isColony(p)) { g.strokeStyle = '#7dffa8'; g.beginPath(); g.arc(x, y, 8, 0, TAU); g.stroke(); }
        if (mapView.scale > 0.02 || isColony(p) || ob === hover) { g.fillStyle = 'rgba(220,235,255,0.75)'; g.font = '12px "Exo 2", sans-serif'; g.fillText(p.name, x + 8, y + 4); }
      }
    }
    // rota atual
    if (auto && auto.tx !== undefined) { const [a, b] = toScr(G.ship.x, G.ship.y), [c, d] = toScr(auto.tx, auto.ty); g.setLineDash([6, 6]); g.strokeStyle = 'rgba(95,225,255,0.6)'; g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); g.setLineDash([]); }
    // nave e origem
    const [sx, sy] = toScr(G.ship.x, G.ship.y);
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(sx + Math.cos(G.ship.a) * 9, sy + Math.sin(G.ship.a) * 9); g.lineTo(sx + Math.cos(G.ship.a + 2.5) * 6, sy + Math.sin(G.ship.a + 2.5) * 6); g.lineTo(sx + Math.cos(G.ship.a - 2.5) * 6, sy + Math.sin(G.ship.a - 2.5) * 6); g.fill();
    g.fillStyle = '#ffb547'; g.fillRect(ox0 - 2, oy0 - 2, 4, 4);
    if (hover) {
      const p = hover.o, [x, y] = toScr(hover.x, hover.y);
      const lines = hover.kind === 'planet' ? [p.name, `${PLANET_TYPES[p.type].nome}${p.pop > 0 ? ' · ' + GOVS[planetGov(p)].nome : ''}`, isColony(p) ? 'Sua colônia' : 'Clique para traçar rota'] : [p.name, hover.kind === 'star' ? STAR_CLASSES[p.cls].nome : 'Buraco negro'];
      g.font = '12px "Exo 2", sans-serif';
      const bw = Math.max(...lines.map(l => g.measureText(l).width)) + 16;
      g.fillStyle = 'rgba(8,16,30,0.92)'; g.fillRect(x + 12, y - 10, bw, lines.length * 16 + 8);
      g.strokeStyle = 'rgba(95,225,255,0.4)'; g.strokeRect(x + 12, y - 10, bw, lines.length * 16 + 8);
      lines.forEach((l, i) => { g.fillStyle = i ? '#8ea6c4' : '#e6f1ff'; g.fillText(l, x + 20, y + 6 + i * 16); });
    }
  };
  const pick = (mx, my) => { let best = null, bd = 14; for (const ob of objects()) { const [x, y] = toScr(ob.x, ob.y), d = Math.hypot(x - mx, y - my); if (d < bd) { bd = d; best = ob; } } return best; };
  const pos = e => { const r = cvs.getBoundingClientRect(); return [(e.clientX - r.left) * cvs.width / r.width, (e.clientY - r.top) * cvs.height / r.height]; };
  cvs.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, cx: mapView.cx, cy: mapView.cy, moved: false }; cvs.setPointerCapture(e.pointerId); });
  cvs.addEventListener('pointermove', e => {
    if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(dx, dy) > 4) drag.moved = true; const k = cvs.width / cvs.getBoundingClientRect().width; mapView.cx = drag.cx - dx * k / mapView.scale; mapView.cy = drag.cy - dy * k / mapView.scale; }
    const [mx, my] = pos(e); hover = pick(mx, my); cvs.style.cursor = hover && hover.kind === 'planet' ? 'pointer' : 'grab';
  });
  cvs.addEventListener('pointerup', e => {
    if (drag && !drag.moved) { const [mx, my] = pos(e), ob = pick(mx, my); if (ob && ob.kind === 'planet') { setRoute(ob.o); closePanel(); } }
    drag = null;
  });
  cvs.addEventListener('wheel', e => { e.preventDefault(); mapView.scale = clamp(mapView.scale * (e.deltaY > 0 ? 0.85 : 1.18), 0.0015, 0.08); }, { passive: false });
  showPanel('map', () => {
    const root = h('div', 'map-wrap');
    root.appendChild(h('div', 'map-head', `<div><div class="eyebrow">Cartografia</div><h2>Mapa galáctico</h2></div><p class="muted">Arraste para mover, role para zoom, clique num planeta para traçar a rota. Cores: <span style="color:#7dffa8">suas colônias</span>, demais cores = regime de governo.</p>`));
    const legend = h('div', 'legend', GOV_KEYS.map(g => `<span><i style="background:${GOV_COLOR[g]}"></i>${GOVS[g].nome}</span>`).join(''));
    root.appendChild(cvs); root.appendChild(legend);
    const zb = h('div', 'map-zoom');
    zb.appendChild(btn('+', () => { mapView.scale = clamp(mapView.scale * 1.4, 0.0015, 0.08); }, 'sm'));
    zb.appendChild(btn('−', () => { mapView.scale = clamp(mapView.scale / 1.4, 0.0015, 0.08); }, 'sm'));
    zb.appendChild(btn('Centralizar', () => { mapView.cx = G.ship.x; mapView.cy = G.ship.y; }, 'sm'));
    zb.appendChild(btn('Origem', () => { mapView.cx = 0; mapView.cy = 0; }, 'sm'));
    root.appendChild(zb);
    return root;
  }, {
    cls: 'full',
    tick: () => {
      const r = cvs.getBoundingClientRect();
      const w = Math.round(r.width * DPR), hh = Math.round(r.height * DPR);
      if (w > 0 && (cvs.width !== w || cvs.height !== hh)) { cvs.width = w; cvs.height = hh; }
      paint();
    },
  });
}
const GOV_COLOR = { democracia: '#5fa8ff', monarquia: '#ffd02f', tecnocracia: '#4ff0d2', teocracia: '#f0f0f0', corporatocracia: '#ff9a3c', anarquia: '#ff4f6a', militar: '#b07bff', nenhum: '#6a7690' };

/* =====================================================================
   AJUDA
   ===================================================================== */
function openHelp() {
  showPanel('help', () => `<div class="help">
    <div class="eyebrow">Manual de bordo</div><h2>Como jogar</h2>
    <h3>Pilotagem</h3>
    <dl class="keys">
      <dt>W / ↑</dt><dd>Propulsão para a frente (na direção do bico)</dd>
      <dt>S / ↓</dt><dd>Freio e ré lenta</dd>
      <dt>A D / ← →</dt><dd>Girar a nave</dd>
      <dt>Mouse</dt><dd>O bico segue o cursor (até você usar A/D)</dd>
      <dt>Espaço / segurar clique</dt><dd>Atirar</dd>
      <dt>Clique em objeto</dt><dd>Piloto automático: asteroide = minerar, planeta = ir e entrar em órbita, pirata = atacar</dd>
      <dt>Shift</dt><dd>Turbo (gasta energia)</dd>
      <dt>E</dt><dd>Entrar / sair da órbita</dd>
      <dt>Roda / + −</dt><dd>Zoom</dd>
    </dl>
    <h3>Painéis</h3>
    <dl class="keys">
      <dt>F</dt><dd>Frota: escoltas, guarnições, armas e ordens</dd><dt>N</dt><dd>Nau capitânia: atributos e módulos</dd><dt>I</dt><dd>Império: colônias, armazém, ascensão</dd>
      <dt>R</dt><dd>Pesquisa</dd><dt>P</dt><dd>Política: decisões e notícias</dd>
      <dt>C</dt><dd>Contratos</dd><dt>M</dt><dd>Mapa galáctico</dd><dt>H</dt><dd>Este manual</dd>
    </dl>
    <h3>Progressão</h3>
    <p>Tudo cresce sem limite: cada atributo da nave, cada módulo, cada construção e cada tecnologia. O custo sobe 15% por nível. A cada 10 níveis somados, a nave sobe de classe (Mk) e ganha visual e espaços de módulo novos.</p>
    <p>Você comanda uma frota: construa caças, mineradores, cargueiros, corvetas, fragatas, destróieres e cruzadores no estaleiro, escolha as armas de cada nave e dê ordens (escoltar, caçar, minerar). Naves podem ficar de guarnição numa colônia. Cada colônia tem defesas próprias (torres laser, mísseis, canhão orbital, minas, hangar de caças, escudo e fortaleza), todas com níveis infinitos.</p>
    <p>Funde colônias em mundos vazios ou ganhe influência em mundos habitados até eles aderirem à Federação. Escolha o governo de cada colônia: cada regime tem vantagens e custos reais, e os vizinhos reagem.</p>
    <p>Quanto mais longe da origem, mais ricos os recursos e mais fortes os piratas. Quando chegar longe o bastante, a Ascensão recomeça a galáxia com bônus permanentes.</p>
    <div class="foot" id="help-foot"></div></div>`);
  $('help-foot').appendChild(btn('Entendi', () => closePanel(), 'primary'));
}
function openLore(ring) {
  const txt = RING_LORE[Math.min(ring, RING_LORE.length - 1)];
  showPanel('lore', () => `<div class="help"><div class="eyebrow">Novo anel alcançado</div><h2>${ringName(ring)}</h2><p class="lore">${txt}</p><p class="muted">A partir daqui, piratas mais fortes e recursos mais valiosos.</p><div class="foot" id="lore-foot"></div></div>`);
  $('lore-foot').appendChild(btn('Seguir viagem', () => closePanel(), 'primary'));
}
