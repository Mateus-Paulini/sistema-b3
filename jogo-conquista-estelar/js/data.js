'use strict';
/* =====================================================================
   DADOS DE PROGRESSÃO: atributos da nave, módulos, raridades, inimigos,
   edifícios planetários, pesquisa, governos e eventos.
   Todas as curvas de custo seguem base × 1,15^nível (sem teto).
   ===================================================================== */

const GROWTH = 1.15;
const romanize = n => {
  if (n <= 0) return '0';
  if (n > 3999) return fmt(n);
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = ''; for (const [v, r] of map) while (n >= v) { s += r; n -= v; } return s;
};

/* ---------- atributos da nave (níveis infinitos) ---------- */
const SHIP_ATTRS = {
  casco: { nome: 'Casco', desc: 'Integridade estrutural: +9% por nível', base: 60 },
  escudo: { nome: 'Escudo', desc: 'Barreira regenerável: +9% por nível', base: 80 },
  motor: { nome: 'Motor', desc: 'Empuxo, velocidade máxima e giro', base: 50 },
  armas: { nome: 'Armas', desc: 'Dano do canhão principal: +10% por nível', base: 70 },
  reator: { nome: 'Reator', desc: 'Energia para turbo e armas especiais', base: 55 },
  carga: { nome: 'Porão de carga', desc: 'Capacidade de minério', base: 40 },
  sensores: { nome: 'Sensores', desc: 'Alcance de radar, descobertas e coleta', base: 45 },
};
const attrCost = (k, lvl) => Math.round(SHIP_ATTRS[k].base * Math.pow(GROWTH, lvl));
const TIER_STEP = 10; // níveis somados para cada nova classe Mk
const shipTier = lv => 1 + Math.floor(Object.values(lv).reduce((a, b) => a + b, 0) / TIER_STEP);
const slotsFor = tier => Math.min(10, 2 + Math.floor((tier - 1) / 2));
const HULL_COLORS = ['#b9c2cf', '#c9ccd4', '#d9d2c0', '#c0d4dc', '#d8c8d8', '#e0d8b8', '#c8dcc8', '#f0f0f4'];
const ACCENTS = ['#ff7a2f', '#2fb8ff', '#ffd02f', '#7dffa8', '#ff4f8a', '#b07bff', '#4ff0d2', '#ffffff'];

/* ---------- raridades e módulos ---------- */
const RARITIES = [
  { nome: 'Comum', mult: 1, cor: '#b8c4d6' },
  { nome: 'Incomum', mult: 1.45, cor: '#6fdc7a' },
  { nome: 'Raro', mult: 2.1, cor: '#5fa8ff' },
  { nome: 'Épico', mult: 3, cor: '#c27bff' },
  { nome: 'Lendário', mult: 4.4, cor: '#ffb547' },
  { nome: 'Artefato', mult: 6.8, cor: '#ff5ad0' },
];
const MODULES = {
  plasma: { nome: 'Canhão de plasma', cat: 'arma', desc: 'Esferas lentas e devastadoras', val: 2.4, cd: 1.0, unit: '× dano base' },
  missil: { nome: 'Lançador de mísseis', cat: 'arma', desc: 'Mísseis teleguiados', val: 1.7, cd: 1.5, unit: '× dano base' },
  feixe: { nome: 'Feixe de mineração', cat: 'arma', desc: 'Raio contínuo; dano triplo em asteroides', val: 0.32, cd: 0.1, unit: '× dano base/tique' },
  coletor: { nome: 'Coletor de minério', cat: 'util', desc: 'Mais minério por asteroide', val: 0.25, pct: true },
  scanner: { nome: 'Scanner profundo', cat: 'util', desc: 'Alcance de sensores e créditos de cartografia', val: 0.25, pct: true },
  trator: { nome: 'Raio trator', cat: 'util', desc: 'Alcance de coleta de minério', val: 0.5, pct: true },
  blindagem: { nome: 'Blindagem reativa', cat: 'passivo', desc: 'Casco máximo', val: 0.14, pct: true },
  regen: { nome: 'Nanorreparo', cat: 'passivo', desc: 'Repara o casco por segundo (% do máximo)', val: 0.006, pct: true },
  propulsor: { nome: 'Propulsor auxiliar', cat: 'passivo', desc: 'Velocidade e empuxo', val: 0.07, pct: true },
  capacitor: { nome: 'Capacitor', cat: 'passivo', desc: 'Escudo e energia', val: 0.14, pct: true },
};
const CAT_NAMES = { arma: 'Arma', util: 'Utilitário', passivo: 'Passivo' };
const moduleValue = m => MODULES[m.k].val * RARITIES[m.rar].mult * (1 + 0.12 * m.lvl);
const moduleUpCost = m => Math.round(120 * RARITIES[m.rar].mult * Math.pow(GROWTH, m.lvl));
const moduleSellValue = m => Math.round(90 * RARITIES[m.rar].mult * (1 + m.lvl * 0.5));
function rollRarity(bonus = 0) {
  // bonus ~ 0..∞ desloca os pesos para raridades melhores
  const w = [60, 26 + bonus * 4, 10 + bonus * 4, 3 + bonus * 3, 0.8 + bonus * 1.6, 0.15 + bonus * 0.8];
  let tot = w.reduce((a, b) => a + b, 0), x = Math.random() * tot;
  for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return i; }
  return 0;
}
let modSeq = 1;
function makeModule(k, rar, lvl = 0) { return { id: Date.now().toString(36) + (modSeq++).toString(36), k, rar, lvl }; }
function randomModule(bonus = 0) { return makeModule(pickR(Object.keys(MODULES)), rollRarity(bonus)); }
function moduleLabel(m) { return `${MODULES[m.k].nome} <span style="color:${RARITIES[m.rar].cor}">${RARITIES[m.rar].nome}</span>${m.lvl ? ' +' + m.lvl : ''}`; }
function moduleEffect(m) {
  const d = MODULES[m.k], v = moduleValue(m);
  return d.pct ? '+' + (v * 100).toFixed(d.k === 'regen' || m.k === 'regen' ? 2 : 0) + '% ' + d.desc.toLowerCase() : v.toFixed(2) + ' ' + d.unit;
}

/* ---------- inimigos ---------- */
const ENEMY_TYPES = {
  batedor: { nome: 'Batedor pirata', hp: 32, dmg: 5, spd: 430, cd: 0.85, r: 18, tier: 1, loot: 1, minD: 0 },
  corsario: { nome: 'Corsário', hp: 75, dmg: 8, spd: 340, cd: 0.7, r: 24, tier: 3, loot: 2.2, minD: 3 },
  canhoneira: { nome: 'Canhoneira', hp: 210, dmg: 15, spd: 230, cd: 1.25, r: 34, tier: 6, loot: 5, minD: 7 },
  sentinela: { nome: 'Sentinela dos Antigos', hp: 650, dmg: 22, spd: 270, cd: 0.9, r: 40, tier: 10, loot: 14, minD: 14 },
};
const enemyScale = d => Math.pow(1.12, d);

/* ---------- edifícios planetários (níveis infinitos) ---------- */
const BUILDINGS = {
  mina: { nome: 'Complexo de mineração', desc: 'Extrai os recursos naturais do planeta para o armazém imperial', base: 220 },
  fazenda: { nome: 'Fazendas hidropônicas', desc: 'Alimento: acelera o crescimento da população', base: 160 },
  habitat: { nome: 'Habitats', desc: 'Aumenta a população máxima', base: 190 },
  comercio: { nome: 'Porto comercial', desc: 'Gera créditos a partir da população', base: 260 },
  universidade: { nome: 'Universidade', desc: 'Gera pontos de pesquisa', base: 340 },
  estaleiro: { nome: 'Estaleiro', desc: 'Libera classes maiores de nave, dá desconto em melhorias e produz módulos', base: 420 },
};

/* ---------- defesa planetária: tipos independentes, níveis infinitos ---------- */
const DEFENSES = {
  laser: { nome: 'Torres laser', desc: 'Disparos rápidos de curto alcance', base: 260, power: 1, range: 1300, cd: 0.45, dmg: 9 },
  missil: { nome: 'Baterias de mísseis', desc: 'Mísseis teleguiados de longo alcance', base: 380, power: 1.4, range: 2200, cd: 2.2, dmg: 26 },
  canhao: { nome: 'Canhão orbital', desc: 'Projéteis de massa: lento, devastador, alcance enorme', base: 650, power: 2, range: 3000, cd: 3.2, dmg: 90, req: { laser: 3 } },
  minas: { nome: 'Campo minado', desc: 'Minas na órbita explodem quando inimigos se aproximam', base: 300, power: 0.9, range: 90, cd: 6, dmg: 70 },
  hangar: { nome: 'Hangar de caças', desc: 'Lança caças-drones que patrulham e perseguem invasores', base: 520, power: 1.6, range: 2600, cd: 0.6, dmg: 7, req: { laser: 2 } },
  escudo: { nome: 'Escudo planetário', desc: 'Absorve ataques de raides e eleva a estabilidade', base: 450, power: 1.8 },
  fortaleza: { nome: 'Fortaleza orbital', desc: 'Estação de batalha com várias baterias e grande poder de fogo', base: 2400, power: 5, range: 2400, cd: 0.9, dmg: 40, req: { laser: 5, missil: 5, escudo: 3 } },
};
const DEF_KEYS = Object.keys(DEFENSES);
const defCost = (k, lvl, p) => Math.round(DEFENSES[k].base * Math.pow(GROWTH, lvl) * (1 + 0.04 * (p.dist || 0)));
const defScale = lvl => Math.pow(1.12, lvl);

/* ---------- frota: classes de nave e armamentos ---------- */
const WEAPONS = {
  laser: { nome: 'Laser', desc: 'Cadência alta, alcance médio', dmg: 7, cd: 0.3, range: 950, speed: 1500, req: 0 },
  flak: { nome: 'Flak', desc: 'Rajada em leque de curto alcance', dmg: 4, cd: 0.4, range: 600, speed: 1100, pellets: 5, req: 1 },
  plasma: { nome: 'Plasma', desc: 'Esferas pesadas e lentas', dmg: 28, cd: 1.1, range: 850, speed: 760, req: 2 },
  missil: { nome: 'Mísseis', desc: 'Teleguiados, longo alcance', dmg: 20, cd: 1.6, range: 1600, speed: 500, req: 3 },
  feixe: { nome: 'Feixe de mineração', desc: 'Raio contínuo; triplo de dano em asteroides', dmg: 3.5, cd: 0.1, range: 560, req: 0 },
  railgun: { nome: 'Canhão de trilho', desc: 'Projétil hipersônico, alcance extremo', dmg: 60, cd: 2.3, range: 2000, speed: 3200, req: 5 },
};
const SHIP_CLASSES = {
  caca: { nome: 'Caça', desc: 'Pequeno, ágil e barato', hp: 60, spd: 760, slots: 1, cargo: 0, cost: 380, req: 0, vt: 1, scale: 0.75, hull: '#b9c2cf' },
  minerador: { nome: 'Minerador', desc: 'Barcaça de mineração com porão próprio', hp: 130, spd: 480, slots: 1, cargo: 35, cost: 560, req: 0, vt: 2, scale: 0.9, hull: '#d8c49a', mine: 1.6, def: ['feixe'] },
  interceptador: { nome: 'Interceptador', desc: 'O mais rápido da frota', hp: 55, spd: 900, slots: 2, cargo: 0, cost: 720, req: 1, vt: 2, scale: 0.8, hull: '#c0d4dc' },
  cargueiro: { nome: 'Cargueiro', desc: 'Porão enorme, sem armas', hp: 240, spd: 420, slots: 0, cargo: 140, cost: 900, req: 1, vt: 3, scale: 1.1, hull: '#9aa4ae' },
  corveta: { nome: 'Corveta', desc: 'Escolta versátil', hp: 170, spd: 620, slots: 2, cargo: 5, cost: 1150, req: 2, vt: 4, scale: 0.95, hull: '#c9ccd4' },
  fragata: { nome: 'Fragata', desc: 'Blindada, três baterias', hp: 400, spd: 500, slots: 3, cargo: 10, cost: 2600, req: 4, vt: 6, scale: 1.15, hull: '#d9d2c0' },
  destroier: { nome: 'Destróier', desc: 'Navio de linha com quatro baterias', hp: 750, spd: 430, slots: 4, cargo: 15, cost: 5400, req: 7, vt: 9, scale: 1.35, hull: '#c8d0dc' },
  cruzador: { nome: 'Cruzador', desc: 'Fortaleza móvel com seis baterias', hp: 1500, spd: 340, slots: 6, cargo: 25, cost: 15000, req: 12, vt: 14, scale: 1.7, hull: '#e0e4ec' },
};
const CLASS_KEYS = Object.keys(SHIP_CLASSES);
const shipUpCost = s => Math.round(SHIP_CLASSES[s.cls].cost * 0.35 * Math.pow(GROWTH, s.lvl));
const ORDERS = {
  escolta: { nome: 'Escoltar', desc: 'Seguem a nau capitânia e defendem quem atacar' },
  agressivo: { nome: 'Caçar', desc: 'Atacam qualquer pirata ao alcance dos sensores' },
  minerar: { nome: 'Minerar', desc: 'Mineram asteroides próximos quando não há ameaças' },
  passivo: { nome: 'Passivo', desc: 'Só seguem; não entram em combate' },
};
const SHIP_NAMES = ['Aurora', 'Vigília', 'Ícaro', 'Tempestade', 'Lâmina', 'Órion', 'Sentinela', 'Fênix', 'Relâmpago', 'Corvo', 'Andrômeda', 'Valquíria', 'Trovão', 'Cometa', 'Nêmesis', 'Atlas', 'Hidra', 'Pégaso', 'Quimera', 'Zéfiro'];
const buildCost = (k, lvl, p) => Math.round(BUILDINGS[k].base * Math.pow(GROWTH, lvl) * (1 + 0.04 * (p.dist || 0)));

/* ---------- pesquisa (níveis infinitos) ---------- */
const TECHS = {
  balistica: { nome: 'Balística', desc: '+6% de dano de todas as armas', base: 40 },
  propulsao: { nome: 'Propulsão', desc: '+4% de velocidade e empuxo', base: 40 },
  blindagem: { nome: 'Ligas avançadas', desc: '+6% de casco e escudo', base: 45 },
  economia: { nome: 'Economia', desc: '+6% de renda das colônias e preços de venda', base: 50 },
  mineracao: { nome: 'Mineração', desc: '+8% de minério extraído (nave e minas)', base: 40 },
  cartografia: { nome: 'Cartografia', desc: '+10% de créditos por descoberta e alcance de sensores', base: 35 },
  sociologia: { nome: 'Sociologia', desc: '+3 de estabilidade em todas as colônias', base: 60 },
  logistica: { nome: 'Logística de frota', desc: '+1 nave no limite de comando', base: 70 },
  fortificacao: { nome: 'Fortificação', desc: '+8% de dano e resistência das defesas planetárias', base: 55 },
};
const techCost = (k, lvl) => Math.round(TECHS[k].base * Math.pow(1.18, lvl));

/* ---------- governos ---------- */
const GOV_MODS = {
  democracia: { income: 1.1, research: 1.15, defense: 0.9, growth: 1.1, stab: 72, influence: 1.25, pros: 'Estável, boa pesquisa e renda', cons: 'Defesa fraca; eleições mudam o rumo' },
  monarquia: { income: 1.0, research: 0.95, defense: 1.15, growth: 1.0, stab: 66, influence: 1.0, pros: 'Lealdade e boa defesa', cons: 'Crises de sucessão' },
  tecnocracia: { income: 1.0, research: 1.7, defense: 1.0, growth: 0.65, stab: 60, influence: 0.9, pros: 'Pesquisa muito acelerada', cons: 'População cresce devagar' },
  teocracia: { income: 0.9, research: 0.6, defense: 1.2, growth: 1.25, stab: 82, influence: 1.0, pros: 'Altíssima estabilidade, população cresce', cons: 'Pesquisa travada' },
  corporatocracia: { income: 1.55, research: 1.0, defense: 0.9, growth: 1.0, stab: 54, influence: 0.8, pros: 'Renda muito alta', cons: 'Instável; vizinhos desconfiam' },
  anarquia: { income: 0.5, research: 0.85, defense: 0.6, growth: 1.35, stab: 32, influence: 0.6, pros: 'Sem custo de manutenção, população explode', cons: 'Caos: piratas e revoltas' },
  militar: { income: 0.85, research: 0.9, defense: 1.9, growth: 0.9, stab: 52, influence: 0.9, pros: 'Defesa máxima', cons: 'Revoltas frequentes' },
};
const GOV_KEYS = Object.keys(GOV_MODS);
// afinidade entre regimes (-2 hostil … +2 aliado)
const GOV_RIVAL = {
  democracia: ['militar', 'monarquia', 'anarquia'], monarquia: ['democracia', 'anarquia'], tecnocracia: ['teocracia', 'anarquia'],
  teocracia: ['tecnocracia', 'corporatocracia'], corporatocracia: ['anarquia', 'teocracia'], anarquia: ['corporatocracia', 'militar', 'monarquia'],
  militar: ['democracia', 'anarquia'],
};
const GOV_FRIEND = { democracia: ['tecnocracia', 'corporatocracia'], monarquia: ['teocracia', 'militar'], tecnocracia: ['democracia', 'corporatocracia'], teocracia: ['monarquia'], corporatocracia: ['democracia', 'tecnocracia'], anarquia: [], militar: ['monarquia'] };
function govAffinity(a, b) {
  if (a === 'nenhum' || b === 'nenhum') return 0;
  if (a === b) return 2;
  if (GOV_RIVAL[a].includes(b)) return -2;
  if (GOV_FRIEND[a].includes(b)) return 1;
  return 0;
}

/* ---------- marcos narrativos por anel ---------- */
const RING_LORE = [
  'O Núcleo: berço da Federação. Rotas seguras, mercados calmos e quase nenhum pirata.',
  'Fronteira Interna: os primeiros corsários aparecem. Os minérios de titânio ficam mais comuns.',
  'A Orla: sinais fracos de uma civilização extinta, os Ithar. Seus artefatos valem fortunas.',
  'Marcas Exteriores: as canhoneiras piratas dominam as rotas. Os mundos aqui seguem leis próprias.',
  'Vazio Profundo: cristais quânticos brotam dos asteroides. Algo antigo vigia este lugar.',
  'O Abismo: as Sentinelas dos Antigos despertaram. Nenhum mapa foi além daqui.',
];
