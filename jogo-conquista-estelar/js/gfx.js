'use strict';
/* =====================================================================
   GRÁFICOS: planetas com textura procedural esférica, iluminação,
   nuvens, oceanos especulares, luzes noturnas, anéis; estrelas,
   buracos negros, asteroides, naves e fundos do espaço.
   ===================================================================== */

const TEX_W = 512, TEX_H = 256;

/* ---------- paletas por tipo/variante ---------- */
const PAL = {
  rochoso: [
    rampFn([[0, '#2c2826'], [0.35, '#57504a'], [0.6, '#857b70'], [0.85, '#b3a99c'], [1, '#d8d0c4']]),
    rampFn([[0, '#2a2420'], [0.4, '#5e4a3c'], [0.7, '#8f725a'], [1, '#c9ae90']]),
    rampFn([[0, '#1f2226'], [0.4, '#45505a'], [0.7, '#7a8794'], [1, '#c2ccd6']]),
  ],
  desertico: [
    rampFn([[0, '#5a2e17'], [0.35, '#9a5428'], [0.6, '#c97f42'], [0.85, '#e3ab6c'], [1, '#f4d3a0']]),
    rampFn([[0, '#4f3a22'], [0.4, '#8f7044'], [0.7, '#c9a66b'], [1, '#efdcae']]),
    rampFn([[0, '#4a1d16'], [0.4, '#8a3a26'], [0.7, '#c4623d'], [1, '#e9a27a']]),
  ],
  land: [
    rampFn([[0, '#c9b98a'], [0.06, '#4f7a35'], [0.3, '#2f5e2a'], [0.55, '#6b6a3a'], [0.75, '#7d6a52'], [0.9, '#9c9590'], [1, '#f2f4f6']]),
    rampFn([[0, '#d1c08e'], [0.08, '#7a8a3e'], [0.35, '#9a7a40'], [0.6, '#7a5a3a'], [0.85, '#a09080'], [1, '#f0f0f0']]),
    rampFn([[0, '#c2b388'], [0.06, '#3b6e4a'], [0.3, '#1f4f3a'], [0.6, '#445a3a'], [0.85, '#8a8a80'], [1, '#ffffff']]),
  ],
  water: [
    rampFn([[0, '#06183d'], [0.5, '#0b2f6e'], [0.85, '#1a5aa0'], [1, '#2f86c2']]),
    rampFn([[0, '#04232e'], [0.5, '#0a4a5e'], [0.85, '#167f8f'], [1, '#2bb3b8']]),
  ],
  vulcanico: [
    rampFn([[0, '#0c0a0a'], [0.4, '#221b19'], [0.7, '#3d302b'], [1, '#5c4a40']]),
    rampFn([[0, '#100808'], [0.4, '#2a1410'], [0.7, '#4a2a20'], [1, '#6e4636']]),
  ],
  gelado: [
    rampFn([[0, '#7f9fbf'], [0.35, '#b7cde3'], [0.65, '#dfeaf5'], [1, '#ffffff']]),
    rampFn([[0, '#5f8a94'], [0.4, '#a7cfd4'], [0.7, '#d9f0f0'], [1, '#ffffff']]),
  ],
  gasoso: [
    rampFn([[0, '#7a4a2a'], [0.2, '#c08a5a'], [0.4, '#e8c9a0'], [0.55, '#f6e6cc'], [0.7, '#c9925e'], [0.85, '#9a5e3a'], [1, '#e2c49a']]), // tipo Júpiter
    rampFn([[0, '#9a7a40'], [0.3, '#d9bd7a'], [0.5, '#f0dfae'], [0.75, '#c9a865'], [1, '#e8d39a']]), // tipo Saturno
    rampFn([[0, '#1a3a8a'], [0.3, '#2f62c9'], [0.55, '#5a9aee'], [0.8, '#2f5ab0'], [1, '#8fc0ff']]), // tipo Netuno
    rampFn([[0, '#2f6a6a'], [0.35, '#6ab3b0'], [0.6, '#a8e0d8'], [0.85, '#5aa09a'], [1, '#d0f4ee']]), // tipo Urano
    rampFn([[0, '#4a1a3a'], [0.3, '#8a3a5e'], [0.55, '#d07a8a'], [0.8, '#7a2a4a'], [1, '#f0b0b8']]), // exótico rosado
  ],
  exotico: [
    rampFn([[0, '#120a2a'], [0.4, '#2e1a5e'], [0.7, '#5a3aa0'], [1, '#9a7ae0']]),
    rampFn([[0, '#04201e'], [0.4, '#0d4a44'], [0.7, '#1f8a7a'], [1, '#6ff0d2']]),
    rampFn([[0, '#2a0a1a'], [0.4, '#5e1a3a'], [0.7, '#a03a6a'], [1, '#f07ab0']]),
  ],
};
const EMIS_COL = { vulcanico: [255, 110, 30], terrestre: [255, 200, 120], oceanico: [255, 205, 130], exotico: [80, 255, 220], desertico: [255, 190, 110] };
const EXO_EMIS = [[180, 120, 255], [80, 255, 210], [255, 90, 180]];

/* ---------- textura do planeta (gerada incrementalmente) ---------- */
const texCache = new Map(); // id -> {tex, spec, emis, cloud, ready, job}
function planetTex(p, prio = 0) {
  let t = texCache.get(p.id);
  if (!t) {
    t = { tex: new Uint8ClampedArray(TEX_W * TEX_H * 3), spec: new Uint8Array(TEX_W * TEX_H), emis: new Uint8Array(TEX_W * TEX_H), cloud: new Uint8Array(TEX_W * TEX_H), rows: 0, ready: false, last: performance.now() };
    t.job = Jobs.add(genPlanetTex(p, t), prio);
    texCache.set(p.id, t);
    if (texCache.size > 18) { // descarta as menos usadas
      const arr = [...texCache.entries()].sort((a, b) => a[1].last - b[1].last);
      for (let i = 0; i < arr.length - 16; i++) { const j = Jobs.q.indexOf(arr[i][1].job); if (j >= 0) Jobs.q.splice(j, 1); texCache.delete(arr[i][0]); }
    }
  }
  t.last = performance.now();
  if (prio > t.job.prio && !t.ready) { t.job.prio = prio; Jobs.q.sort((a, b) => b.prio - a.prio); }
  return t;
}

function* genPlanetTex(p, T) {
  const N = new Simplex(p.seed), N2 = new Simplex(p.seed ^ 0x9e3779b9);
  const rng = makeRng(p.seed);
  const type = p.type, v = p.variant, col = [0, 0, 0], col2 = [0, 0, 0];
  const pt = PLANET_TYPES[type];
  const freq = rng.range(1.2, 2.2), ox = rng.range(0, 100), oy = rng.range(0, 100), oz = rng.range(0, 100);
  const sea = type === 'oceanico' ? rng.range(0.56, 0.64) : rng.range(0.47, 0.53);
  const landRamp = PAL.land[v % PAL.land.length], waterRamp = PAL.water[type === 'oceanico' ? v % 2 : 0];
  const craters = [];
  if (type === 'rochoso' || type === 'gelado' || (type === 'desertico' && v === 1)) {
    const n = type === 'rochoso' ? 60 : 25;
    for (let i = 0; i < n; i++) {
      const u = rng.range(-1, 1), th = rng.range(0, TAU), s = Math.sqrt(1 - u * u);
      craters.push([s * Math.cos(th), u, s * Math.sin(th), Math.pow(rng(), 3) * 0.32 + 0.03]);
    }
  }
  const bands = rng.range(7, 16), storm = type === 'gasoso' && rng.chance(0.6) ? [rng.range(-0.5, 0.5), rng.range(0, TAU), rng.range(0.12, 0.22)] : null;
  const cloudy = pt.clouds, populated = p.pop > 1e6;
  const exoE = EXO_EMIS[v % EXO_EMIS.length];

  for (let y = 0; y < TEX_H; y++) {
    const lat = ((y + 0.5) / TEX_H - 0.5) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat), alat = Math.abs(lat) / (Math.PI / 2);
    for (let x = 0; x < TEX_W; x++) {
      const lon = ((x + 0.5) / TEX_W) * TAU;
      const px = cl * Math.cos(lon), py = sl, pz = cl * Math.sin(lon);
      const i = y * TEX_W + x, o = i * 3;
      let spec = 0, emis = 0, cloud = 0;
      // domínio deformado para formas orgânicas
      const wx = N2.noise3(px * 1.6 + 11, py * 1.6, pz * 1.6) * 0.35;
      const wy = N2.noise3(px * 1.6, py * 1.6 + 23, pz * 1.6) * 0.35;
      const qx = (px + wx) * freq + ox, qy = (py + wy) * freq + oy, qz = (pz + wx) * freq + oz;

      if (type === 'gasoso') {
        const turb = N.fbm(px * 2.2 + ox, py * 5 + oy, pz * 2.2 + oz, 5) * 0.75 + N2.fbm(px * 6, py * 16, pz * 6, 3) * 0.08;
        let t = 0.5 + 0.5 * Math.sin(lat * bands + turb * 2.2 + N.noise3(px, py * 3, pz) * 1.2);
        if (storm) {
          const dl = lat - storm[0], dlo = angDiff(storm[1], lon) * cl;
          const dd = Math.sqrt((dl / storm[2]) ** 2 + (dlo / (storm[2] * 1.8)) ** 2);
          if (dd < 1) { t = lerp(t, 0.05 + 0.15 * Math.sin(dd * 9 + turb * 3), smooth(1, 0.5, dd)); }
        }
        PAL.gasoso[v % PAL.gasoso.length](t, col);
        const shade = 0.93 + 0.1 * N2.noise3(px * 6, py * 22, pz * 6);
        col[0] *= shade; col[1] *= shade; col[2] *= shade;
      } else if (type === 'terrestre' || type === 'oceanico') {
        const h = 0.5 + 0.5 * N.fbm(qx, qy, qz, 7);
        if (h < sea) {
          waterRamp(clamp(1 - (sea - h) * 5, 0, 1), col);
          spec = 220;
        } else {
          const e = (h - sea) / (1 - sea);
          const moist = 0.5 + 0.5 * N2.fbm(px * 2 + 50, py * 2, pz * 2, 4);
          landRamp(clamp(e * 1.6, 0, 1), col);
          if (moist < 0.42 && e < 0.5) { const dry = smooth(0.42, 0.3, moist); col[0] = lerp(col[0], 196, dry * 0.7); col[1] = lerp(col[1], 160, dry * 0.7); col[2] = lerp(col[2], 105, dry * 0.7); }
          if (populated && e < 0.45) {
            const c = N2.noise3(px * 40, py * 40, pz * 40);
            if (c > 0.35) emis = clamp((c - 0.35) * 500, 0, 255) * clamp(1 - e * 2, 0, 1);
          }
        }
        const ice = smooth(0.78, 0.9, alat + N2.noise3(px * 4, py * 4, pz * 4) * 0.08);
        if (ice > 0) { col[0] = lerp(col[0], 240, ice); col[1] = lerp(col[1], 246, ice); col[2] = lerp(col[2], 252, ice); spec *= 1 - ice; emis *= 1 - ice; }
      } else if (type === 'vulcanico') {
        const h = 0.5 + 0.5 * N.fbm(qx, qy, qz, 6);
        PAL.vulcanico[v % 2](h, col);
        const r = N.ridged(px * 3 + ox, py * 3 + oy, pz * 3 + oz, 5);
        if (r > 0.86) { const k = smooth(0.86, 0.97, r); emis = 255 * k; col[0] = lerp(col[0], 255, k); col[1] = lerp(col[1], 90, k); col[2] = lerp(col[2], 20, k); }
      } else if (type === 'exotico') {
        const h = 0.5 + 0.5 * N.fbm(qx, qy, qz, 6);
        PAL.exotico[v % 3](h, col);
        const r = N.ridged(px * 2.5 + ox, py * 2.5 + oy, pz * 2.5 + oz, 5);
        if (r > 0.82) { const k = smooth(0.82, 0.95, r); emis = 230 * k; col[0] = lerp(col[0], exoE[0], k); col[1] = lerp(col[1], exoE[1], k); col[2] = lerp(col[2], exoE[2], k); }
        spec = 60;
      } else if (type === 'gelado') {
        const h = 0.5 + 0.5 * N.fbm(qx, qy, qz, 6);
        PAL.gelado[v % 2](h, col);
        const r = N.ridged(px * 3 + ox, py * 3 + oy, pz * 3 + oz, 4);
        if (r > 0.9) { const k = smooth(0.9, 0.98, r) * 0.6; col[0] *= 1 - k * 0.6; col[1] *= 1 - k * 0.4; col[2] *= 1 - k * 0.2; }
        spec = 90;
      } else { // rochoso / desértico
        let h = 0.5 + 0.5 * N.fbm(qx, qy, qz, 7);
        if (type === 'desertico') h += Math.sin((px * 9 + N.noise3(px * 3, py * 3, pz * 3) * 3) * 4) * 0.025;
        PAL[type][v % 3](clamp(h, 0, 1), col);
        if (type === 'desertico') { const ice = smooth(0.88, 0.95, alat); if (ice) { col[0] = lerp(col[0], 245, ice); col[1] = lerp(col[1], 235, ice); col[2] = lerp(col[2], 230, ice); } }
      }
      // crateras
      for (let c = 0; c < craters.length; c++) {
        const cr = craters[c], dot = px * cr[0] + py * cr[1] + pz * cr[2];
        if (dot < 0.9) continue;
        const ang = Math.acos(Math.min(1, dot)), rr = cr[3];
        if (ang > rr * 1.25) continue;
        const k = ang / rr;
        const f = k < 0.8 ? 0.78 + 0.12 * k : k < 1 ? 1.25 : 1 + 0.1 * (1.25 - k) * 4;
        col[0] *= f; col[1] *= f; col[2] *= f;
      }
      // nuvens
      if (cloudy > 0) {
        const cn = 0.5 + 0.5 * N2.fbm(px * 2.2 + wx * 3 + 70, py * 3.2 + wy * 3, pz * 2.2 + 30, 6);
        const thr = 1 - cloudy * 0.55;
        cloud = 255 * smooth(thr, thr + 0.2, cn) * (type === 'vulcanico' ? 0.5 : 1);
      }
      T.tex[o] = col[0]; T.tex[o + 1] = col[1]; T.tex[o + 2] = col[2];
      T.spec[i] = spec; T.emis[i] = emis; T.cloud[i] = cloud;
    }
    T.rows = y + 1;
    if ((y & 3) === 3) yield;
  }
  T.ready = true;
  T.avg = avgColor(T);
}
function avgColor(T) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < T.tex.length; i += 3 * 97) { r += T.tex[i]; g += T.tex[i + 1]; b += T.tex[i + 2]; n++; }
  return [r / n, g / n, b / n];
}

/* ---------- tabela de projeção da esfera, por raio de render ---------- */
const lutCache = new Map();
function sphereLUT(r) {
  let L = lutCache.get(r);
  if (L) return L;
  const size = r * 2 + 2, idx = [], u = [], v = [], nx = [], ny = [], nz = [], rim = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const X = (x + 0.5 - size / 2) / r, Y = (y + 0.5 - size / 2) / r, d2 = X * X + Y * Y;
    if (d2 > 1) continue;
    const Z = Math.sqrt(1 - d2);
    idx.push(y * size + x);
    u.push((Math.atan2(X, Z) / TAU + 0.5) * TEX_W);
    v.push(clamp((Math.asin(Y) / Math.PI + 0.5) * TEX_H - 0.5, 0, TEX_H - 1.001));
    nx.push(X); ny.push(Y); nz.push(Z); rim.push(Math.pow(1 - Z, 2.6));
  }
  L = { size, idx: Int32Array.from(idx), u: Float32Array.from(u), v: Float32Array.from(v), nx: Float32Array.from(nx), ny: Float32Array.from(ny), nz: Float32Array.from(nz), rim: Float32Array.from(rim) };
  lutCache.set(r, L);
  return L;
}

/* ---------- render do planeta para um canvas (no referencial local) ---------- */
const planetCanvases = new Map(); // id -> {cv, ctx, img, r, t}
function renderPlanetCanvas(p, r, lx, ly, time, force = false) {
  const T = planetTex(p, 1);
  const ck = p.id + '|' + r;
  let P = planetCanvases.get(ck);
  if (!P) {
    const L = sphereLUT(r), cv = mkCanvas(L.size, L.size), g = cv.getContext('2d');
    P = { cv, g, img: g.createImageData(L.size, L.size), r, t: -1, rows: -1 };
    planetCanvases.set(ck, P);
    if (planetCanvases.size > 24) planetCanvases.delete(planetCanvases.keys().next().value);
  }
  if (P.t === time && !force) return P.cv;
  P.t = time;
  const L = sphereLUT(r), d = P.img.data, pt = PLANET_TYPES[p.type];
  // render fatiado: planetas grandes são atualizados em partes ao longo de vários quadros
  const nAll = L.idx.length;
  let from = 0, to = nAll;
  if (!force && P.full) {
    const chunk = Math.ceil(nAll / (r > 150 ? 4 : r > 80 ? 2 : 1));
    from = P.cursor || 0; to = Math.min(nAll, from + chunk); P.cursor = to >= nAll ? 0 : to;
  }
  P.full = true;
  // luz no referencial do planeta (desfaz a inclinação axial)
  const ct = Math.cos(-p.tilt), st = Math.sin(-p.tilt);
  let Lx = lx * ct - ly * st, Ly = lx * st + ly * ct, Lz = 0.42;
  const ln = Math.hypot(Lx, Ly, Lz); Lx /= ln; Ly /= ln; Lz /= ln;
  const Hx = Lx, Hy = Ly, Hz = Lz + 1, hn = Math.hypot(Hx, Hy, Hz); // meio-vetor para especular (vista em +z)
  const hx = Hx / hn, hy = Hy / hn, hz = Hz / hn;
  const rot = ((time * p.spin * TEX_W) % TEX_W + TEX_W) % TEX_W;
  const crot = ((time * p.spin * 1.35 * TEX_W) % TEX_W + TEX_W) % TEX_W;
  const ac = pt.atmo ? hexRgb(pt.atmo) : [0, 0, 0], aA = pt.atmoA;
  const em = p.type === 'exotico' ? EXO_EMIS[p.variant % 3] : EMIS_COL[p.type] || [255, 200, 120];
  const tex = T.tex, spec = T.spec, emis = T.emis, cloud = T.cloud, rowsReady = T.rows;
  const avg = T.avg || [90, 90, 100], MASK = TEX_W - 1;
  for (let k = from; k < to; k++) {
    const nx = L.nx[k], ny = L.ny[k], nz = L.nz[k], vf = L.v[k];
    const y0 = vf | 0, fy = vf - y0, y1 = y0 + 1;
    let r0, g0, b0, sp = 0, em0 = 0, ca = 0;
    if (y1 < rowsReady) {
      // amostragem bilinear da textura
      const uu = L.u[k] + rot, ui = uu | 0, fx = uu - ui, x0 = ui & MASK, x1 = (ui + 1) & MASK;
      const a00 = (y0 * TEX_W + x0) * 3, a10 = (y0 * TEX_W + x1) * 3, a01 = (y1 * TEX_W + x0) * 3, a11 = (y1 * TEX_W + x1) * 3;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      r0 = tex[a00] * w00 + tex[a10] * w10 + tex[a01] * w01 + tex[a11] * w11;
      g0 = tex[a00 + 1] * w00 + tex[a10 + 1] * w10 + tex[a01 + 1] * w01 + tex[a11 + 1] * w11;
      b0 = tex[a00 + 2] * w00 + tex[a10 + 2] * w10 + tex[a01 + 2] * w01 + tex[a11 + 2] * w11;
      const ti = (fy < 0.5 ? y0 : y1) * TEX_W + (fx < 0.5 ? x0 : x1);
      sp = spec[ti]; em0 = emis[ti];
      if (pt.clouds) {
        const cu = L.u[k] + crot, ci = cu | 0, cfx = cu - ci, c0 = ci & MASK, c1 = (ci + 1) & MASK;
        ca = ((cloud[y0 * TEX_W + c0] * (1 - cfx) + cloud[y0 * TEX_W + c1] * cfx) * (1 - fy) + (cloud[y1 * TEX_W + c0] * (1 - cfx) + cloud[y1 * TEX_W + c1] * cfx) * fy) / 255;
      }
    } else { r0 = avg[0]; g0 = avg[1]; b0 = avg[2]; }
    const dl = nx * Lx + ny * Ly + nz * Lz;
    const diff = dl > 0 ? dl : 0;
    let day = (dl + 0.12) / 0.32; day = day < 0 ? 0 : day > 1 ? 1 : day * day * (3 - 2 * day);
    // nuvens projetam sombra suave e clareiam
    const light = 0.025 + diff * 1.08 * (1 - ca * 0.15);
    let R = lerp(r0, 238, ca) * light, Gc = lerp(g0, 242, ca) * light, B = lerp(b0, 248, ca) * light;
    if (sp) {
      const sh = nx * hx + ny * hy + nz * hz;
      if (sh > 0.85) { const s = Math.pow(sh, 60) * sp * (1 - ca) * 1.1; R += s; Gc += s; B += s * 0.95; }
    }
    if (em0) { const e = (em0 / 255) * (1 - day) * (1 - ca * 0.8); R += em[0] * e; Gc += em[1] * e; B += em[2] * e; }
    if (aA) { // espalhamento atmosférico na borda
      let sr = (dl + 0.25) / 0.6; sr = sr < 0 ? 0 : sr > 1 ? 1 : sr * sr * (3 - 2 * sr);
      const rim = L.rim[k] * aA * sr;
      R += ac[0] * rim; Gc += ac[1] * rim; B += ac[2] * rim;
    }
    const o = L.idx[k] * 4;
    d[o] = R; d[o + 1] = Gc; d[o + 2] = B;
    d[o + 3] = nz < 0.12 ? clamp(255 * (nz * r) / 1.6, 0, 255) : 255;
  }
  P.g.putImageData(P.img, 0, 0);
  return P.cv;
}

/* ---------- anéis ---------- */
const ringCache = new Map();
function ringCanvas(p) {
  let c = ringCache.get(p.id);
  if (c) return c;
  const rng = makeRng(p.seed ^ 777), size = 512, cv = mkCanvas(size, size), g = cv.getContext('2d');
  const img = g.createImageData(size, size), d = img.data;
  const inner = rng.range(0.52, 0.62), outer = rng.range(0.85, 0.98);
  const prof = new Float32Array(256);
  const N = new Simplex(p.seed ^ 31);
  for (let i = 0; i < 256; i++) prof[i] = clamp(0.5 + 0.5 * N.fbm(i / 40, 0.5, 0.5, 5) + (rng() - 0.5) * 0.25, 0, 1);
  const base = PLANET_TYPES[p.type] && p.type === 'gasoso' ? hexRgb(['#d9c7a3', '#e8d6a8', '#a8c4e8', '#bfe4de', '#e8b0c0'][p.variant % 5]) : [200, 195, 185];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x - size / 2) / (size / 2), dy = (y - size / 2) / (size / 2), rr = Math.sqrt(dx * dx + dy * dy);
    if (rr < inner || rr > outer) continue;
    const t = (rr - inner) / (outer - inner), a = prof[(t * 255) | 0] * smooth(0, 0.06, t) * smooth(1, 0.94, t);
    const o = (y * size + x) * 4, sh = 0.75 + 0.35 * prof[(t * 255) | 0];
    d[o] = base[0] * sh; d[o + 1] = base[1] * sh; d[o + 2] = base[2] * sh; d[o + 3] = a * 210;
  }
  g.putImageData(img, 0, 0);
  ringCache.set(p.id, cv);
  return cv;
}

/* ---------- desenho do planeta no mundo ---------- */
const RR_LEVELS = [14, 20, 28, 40, 56, 76, 100, 130, 168, 200, 228];
function drawPlanet(ctx, p, sx, sy, R, lightAng, time, slot = 'w') {
  const pt = PLANET_TYPES[p.type];
  // tamanho de render com histerese: evita refazer a esfera a cada pequena variação de zoom
  const need = Math.min(R, 228), key = '_rr' + slot;
  let rr = p[key];
  if (!rr || need > rr * 1.12 || need < rr * 0.62) rr = p[key] = RR_LEVELS.find(l => l >= need) || 228;
  const lx = Math.cos(lightAng), ly = Math.sin(lightAng);
  const ringR = R * 2.25;
  // anel: metade de trás
  if (p.ring) drawRingHalf(ctx, p, sx, sy, ringR, true, lightAng);
  // brilho atmosférico externo
  if (pt.atmo) {
    const c = hexRgb(pt.atmo);
    const gx = sx + lx * R * 0.25, gy = sy + ly * R * 0.25;
    const gr = ctx.createRadialGradient(gx, gy, R * 0.9, sx, sy, R * 1.22);
    gr.addColorStop(0, rgba(c, 0.45 * pt.atmoA)); gr.addColorStop(0.35, rgba(c, 0.18 * pt.atmoA)); gr.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, sy, R * 1.25, 0, TAU); ctx.fill();
  }
  const cv = renderPlanetCanvas(p, rr, lx, ly, time);
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(p.tilt);
  const s = (R * 2 * (cv.width / (rr * 2))) / cv.width;
  ctx.drawImage(cv, -cv.width * s / 2, -cv.height * s / 2, cv.width * s, cv.height * s);
  ctx.restore();
  if (p.ring) drawRingHalf(ctx, p, sx, sy, ringR, false, lightAng);
}
function drawRingHalf(ctx, p, sx, sy, ringR, back) {
  const rc = ringCanvas(p);
  ctx.save();
  ctx.translate(sx, sy); ctx.rotate(p.ringTilt);
  ctx.beginPath();
  if (back) ctx.rect(-ringR, -ringR, ringR * 2, ringR); else ctx.rect(-ringR, 0, ringR * 2, ringR);
  ctx.clip();
  ctx.scale(1, 0.32);
  ctx.globalAlpha = back ? 0.75 : 0.95;
  ctx.drawImage(rc, -ringR, -ringR, ringR * 2, ringR * 2);
  ctx.restore();
}

/* ---------- estrelas ---------- */
const starCache = new Map();
function starSurface(s) {
  let c = starCache.get(s.id);
  if (c) return c;
  const sc = STAR_CLASSES[s.cls], size = 256, cv = mkCanvas(size, size), g = cv.getContext('2d');
  const img = g.createImageData(size, size), d = img.data, N = new Simplex(s.seed);
  const core = hexRgb(sc.core), col = hexRgb(sc.col);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x - size / 2 + 0.5) / (size / 2), dy = (y - size / 2 + 0.5) / (size / 2), r2 = dx * dx + dy * dy;
    if (r2 > 1) continue;
    const z = Math.sqrt(1 - r2);
    const gran = 0.5 + 0.5 * N.fbm(dx * 6 / (z + 0.4), dy * 6 / (z + 0.4), z * 3, 5);
    const limb = Math.pow(z, 0.45);
    const k = clamp(limb * (0.82 + gran * 0.3), 0, 1.2);
    const o = (y * size + x) * 4;
    d[o] = lerp(col[0], core[0], k) * Math.min(1, k + 0.35);
    d[o + 1] = lerp(col[1], core[1], k) * Math.min(1, k + 0.3);
    d[o + 2] = lerp(col[2], core[2], k) * Math.min(1, k + 0.25);
    d[o + 3] = 255 * smooth(1, 0.97, Math.sqrt(r2));
  }
  g.putImageData(img, 0, 0);
  starCache.set(s.id, cv);
  return cv;
}
function drawStarGlow(ctx, s, x, y, R, t) {
  const sc = STAR_CLASSES[s.cls], gc = hexRgb(sc.glow), cc = hexRgb(sc.col);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 1 + Math.sin(t * 1.3 + s.seed) * 0.03;
  let g = ctx.createRadialGradient(x, y, R * 0.8, x, y, R * 9 * pulse);
  g.addColorStop(0, rgba(gc, 0.55)); g.addColorStop(0.12, rgba(gc, 0.22)); g.addColorStop(0.4, rgba(gc, 0.06)); g.addColorStop(1, rgba(gc, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * 9 * pulse, 0, TAU); ctx.fill();
  g = ctx.createRadialGradient(x, y, R * 0.9, x, y, R * 1.9);
  g.addColorStop(0, rgba(cc, 0.9)); g.addColorStop(1, rgba(cc, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * 1.9, 0, TAU); ctx.fill();
  // raios de difração suaves
  ctx.translate(x, y); ctx.rotate(0.3);
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    const L = R * 3.2 * pulse;
    const lg = ctx.createLinearGradient(0, 0, L, 0);
    lg.addColorStop(0, rgba(cc, 0.22)); lg.addColorStop(1, rgba(cc, 0));
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.moveTo(0, -R * 0.08); ctx.lineTo(L, 0); ctx.lineTo(0, R * 0.08); ctx.fill();
  }
  ctx.restore();
}
function drawStar(ctx, s, x, y, R, t) {
  drawStarGlow(ctx, s, x, y, R, t);
  const surf = starSurface(s);
  ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.01);
  ctx.drawImage(surf, -R, -R, R * 2, R * 2);
  ctx.restore();
}

/* ---------- buraco negro ---------- */
const diskCache = new Map();
function accretionDisk(b) {
  let c = diskCache.get(b.id);
  if (c) return c;
  const size = 512, cv = mkCanvas(size, size), g = cv.getContext('2d');
  const img = g.createImageData(size, size), d = img.data, N = new Simplex(b.seed);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x - size / 2) / (size / 2), dy = (y - size / 2) / (size / 2), rr = Math.sqrt(dx * dx + dy * dy);
    if (rr < 0.28 || rr > 1) continue;
    const a = Math.atan2(dy, dx);
    const swirl = 0.5 + 0.5 * N.fbm(Math.cos(a + rr * 6) * 2, Math.sin(a + rr * 6) * 2, rr * 4, 5);
    const t = (rr - 0.28) / 0.72, heat = Math.pow(1 - t, 1.6);
    const al = smooth(0, 0.06, t) * smooth(1, 0.55, t) * (0.35 + swirl * 0.9);
    const o = (y * size + x) * 4;
    d[o] = 255 * Math.min(1, 0.7 + heat); d[o + 1] = 255 * Math.min(1, 0.25 + heat * 0.9); d[o + 2] = 255 * Math.min(1, 0.05 + heat * 0.85);
    d[o + 3] = clamp(al * 255, 0, 255);
  }
  g.putImageData(img, 0, 0);
  diskCache.set(b.id, cv);
  return cv;
}
function drawBlackHole(ctx, b, x, y, R, t) {
  const disk = accretionDisk(b), DR = R * 5;
  ctx.save();
  // lente gravitacional (halo)
  ctx.globalCompositeOperation = 'lighter';
  let g = ctx.createRadialGradient(x, y, R, x, y, DR * 1.6);
  g.addColorStop(0, 'rgba(255,170,90,0.25)'); g.addColorStop(0.3, 'rgba(255,120,60,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, DR * 1.6, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  const half = (back) => {
    ctx.save(); ctx.translate(x, y);
    ctx.beginPath(); if (back) ctx.rect(-DR, -DR, DR * 2, DR); else ctx.rect(-DR, 0, DR * 2, DR); ctx.clip();
    ctx.scale(1, 0.3); ctx.rotate(t * 0.25);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(disk, -DR, -DR, DR * 2, DR * 2);
    ctx.restore();
  };
  half(true);
  // disco "dobrado" pela lente, por cima do horizonte
  ctx.save(); ctx.translate(x, y); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6;
  ctx.scale(1, 0.95); ctx.rotate(-t * 0.18);
  ctx.drawImage(disk, -R * 2.2, -R * 2.2, R * 4.4, R * 4.4);
  ctx.restore();
  // horizonte de eventos
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
  // anel de fótons
  ctx.globalCompositeOperation = 'lighter';
  g = ctx.createRadialGradient(x, y, R * 0.98, x, y, R * 1.12);
  g.addColorStop(0, 'rgba(255,230,200,0.9)'); g.addColorStop(1, 'rgba(255,150,80,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * 1.12, 0, TAU); ctx.arc(x, y, R * 0.98, 0, TAU, true); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  half(false);
  ctx.restore();
}

/* ---------- asteroides ---------- */
const astCache = new Map();
const ORE_TINT = { ferro: [150, 110, 80], titanio: [140, 160, 185], platina: [205, 205, 215], cristal: [150, 90, 210] };
function asteroidSprite(a) {
  const key = a.seed + ':' + Math.round(a.r);
  let c = astCache.get(key);
  if (c) return c;
  const R = Math.ceil(a.r), size = R * 2 + 4, cv = mkCanvas(size, size), g = cv.getContext('2d');
  const img = g.createImageData(size, size), d = img.data, N = new Simplex(a.seed);
  const rng = makeRng(a.seed), lobes = [];
  for (let i = 0; i < 5; i++) lobes.push([rng.range(0, TAU), rng.range(0.08, 0.22), rng.int(1, 3)]);
  const shape = ang => { let s = 0.78; for (const l of lobes) s += Math.cos(ang * l[2] + l[0]) * l[1] * 0.5; return s + N.noise3(Math.cos(ang) * 1.5, Math.sin(ang) * 1.5, 3) * 0.12; };
  const base = [92 + rng.range(-10, 10), 86, 80 + rng.range(-10, 10)], tint = ORE_TINT[a.ore];
  const Lx = -0.55, Ly = -0.6, Lz = 0.58;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x - size / 2 + 0.5) / R, dy = (y - size / 2 + 0.5) / R, rr = Math.sqrt(dx * dx + dy * dy);
    const lim = shape(Math.atan2(dy, dx));
    if (rr > lim) continue;
    const q = rr / lim, z = Math.sqrt(Math.max(0, 1 - q * q));
    // relevo: gradiente do ruído para "bump"
    const e = 0.02, h = N.fbm(dx * 2.2, dy * 2.2, 1.3, 5);
    const hx = (N.fbm((dx + e) * 2.2, dy * 2.2, 1.3, 4) - h) / e, hy = (N.fbm(dx * 2.2, (dy + e) * 2.2, 1.3, 4) - h) / e;
    let nx = dx / lim * 0.9 - hx * 0.12, ny = dy / lim * 0.9 - hy * 0.12, nz = z + 0.15;
    const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    const dif = Math.max(0, nx * Lx + ny * Ly + nz * Lz);
    const crater = N.noise3(dx * 5, dy * 5, 7) > 0.55 ? 0.75 : 1;
    const vein = N.ridged(dx * 4, dy * 4, 11, 3) > 0.9 ? 1 : 0;
    const lit = (0.08 + dif * 1.05) * crater * (0.9 + h * 0.2);
    const o = (y * size + x) * 4;
    const c0 = vein ? tint[0] * 1.4 : base[0], c1 = vein ? tint[1] * 1.4 : base[1], c2 = vein ? tint[2] * 1.4 : base[2];
    d[o] = c0 * lit; d[o + 1] = c1 * lit; d[o + 2] = c2 * lit;
    d[o + 3] = 255 * smooth(1, 0.94, q);
  }
  g.putImageData(img, 0, 0);
  astCache.set(key, cv);
  if (astCache.size > 400) astCache.delete(astCache.keys().next().value);
  return cv;
}

/* ---------- naves (desenho vetorial com metal sombreado) ---------- */
const shipCache = new Map();
function shipSprite(design, scale = 2) {
  const key = JSON.stringify(design) + scale;
  let c = shipCache.get(key);
  if (c) return c;
  const L = design.len, span = design.span, size = Math.ceil(Math.max(L, span * 2) * 1.25 * scale);
  const cv = mkCanvas(size, size), g = cv.getContext('2d');
  g.translate(size / 2, size / 2); g.scale(scale, scale);
  paintShip(g, design);
  c = { cv, size, scale, design };
  shipCache.set(key, c);
  return c;
}
function metal(g, y0, y1, base, accent = 1) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  const c = hexRgb(base);
  const s = (k) => `rgb(${clamp(c[0] * k, 0, 255) | 0},${clamp(c[1] * k, 0, 255) | 0},${clamp(c[2] * k, 0, 255) | 0})`;
  gr.addColorStop(0, s(0.45)); gr.addColorStop(0.28, s(1.25 * accent)); gr.addColorStop(0.5, s(1.0)); gr.addColorStop(0.75, s(0.7)); gr.addColorStop(1, s(0.35));
  return gr;
}
function paintShip(g, D) {
  const L = D.len, W = D.width, S = D.span, hull = D.hull, acc = D.accent;
  const nose = L * 0.5, tail = -L * 0.5;
  // asas (atrás da fuselagem)
  const wing = (sgn) => {
    g.beginPath();
    g.moveTo(L * 0.12, sgn * W * 0.45);
    g.lineTo(-L * D.sweep, sgn * S);
    g.lineTo(-L * (D.sweep + 0.12), sgn * S);
    g.lineTo(-L * 0.38, sgn * W * 0.5);
    g.closePath();
  };
  for (const sgn of [-1, 1]) {
    wing(sgn);
    g.fillStyle = metal(g, sgn < 0 ? -S : W * 0.4, sgn < 0 ? -W * 0.4 : S, D.wingCol); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 0.6; g.stroke();
    // faixa de cor
    g.beginPath();
    g.moveTo(-L * (D.sweep - 0.02), sgn * S * 0.92); g.lineTo(-L * (D.sweep + 0.1), sgn * S * 0.92);
    g.lineTo(-L * (D.sweep + 0.08), sgn * S * 0.8); g.lineTo(-L * (D.sweep - 0.04), sgn * S * 0.8); g.closePath();
    g.fillStyle = acc; g.globalAlpha = 0.85; g.fill(); g.globalAlpha = 1;
    // armas nas pontas
    for (let k = 0; k < D.wingGuns; k++) {
      const yy = sgn * (S * (0.55 + 0.35 * (k / Math.max(1, D.wingGuns - 1 || 1))));
      g.fillStyle = '#3a3f48'; g.fillRect(-L * 0.1, yy - 1.2, L * 0.28, 2.4);
      g.fillStyle = '#9aa3b0'; g.fillRect(L * 0.12, yy - 0.7, L * 0.08, 1.4);
    }
  }
  // naceles de motor
  const engY = D.engines;
  for (const ey of engY) {
    g.beginPath();
    g.roundRect(tail - 2, ey - D.engR, L * 0.42, D.engR * 2, D.engR);
    g.fillStyle = metal(g, ey - D.engR, ey + D.engR, '#6a707a'); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 0.5; g.stroke();
    g.fillStyle = '#1a1c22'; g.beginPath(); g.ellipse(tail - 2, ey, 1.6, D.engR * 0.8, 0, 0, TAU); g.fill();
  }
  // fuselagem
  g.beginPath();
  g.moveTo(nose, 0);
  g.bezierCurveTo(L * 0.3, -W * 0.35, L * 0.05, -W * 0.5, tail + L * 0.06, -W * 0.52);
  g.lineTo(tail, -W * 0.35); g.lineTo(tail, W * 0.35); g.lineTo(tail + L * 0.06, W * 0.52);
  g.bezierCurveTo(L * 0.05, W * 0.5, L * 0.3, W * 0.35, nose, 0);
  g.closePath();
  g.fillStyle = metal(g, -W * 0.52, W * 0.52, hull); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 0.7; g.stroke();
  // linhas de painel
  g.save(); g.clip();
  g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 0.4;
  for (let i = 1; i < 6; i++) { const xx = tail + (L * i) / 6; g.beginPath(); g.moveTo(xx, -W); g.lineTo(xx, W); g.stroke(); }
  g.beginPath(); g.moveTo(nose, 0); g.lineTo(tail, 0); g.strokeStyle = 'rgba(255,255,255,0.12)'; g.stroke();
  // listra de destaque
  g.fillStyle = acc; g.globalAlpha = 0.9;
  g.fillRect(-L * 0.05, -W * 0.6, L * 0.04, W * 1.2); g.fillRect(-L * 0.12, -W * 0.6, L * 0.02, W * 1.2);
  g.globalAlpha = 1;
  // greebles
  const rng = makeRng(D.seed);
  for (let i = 0; i < 6 + D.tier * 2; i++) {
    const gx = rng.range(tail + 3, L * 0.15), gy = rng.range(-W * 0.35, W * 0.35);
    g.fillStyle = rng.chance(0.5) ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.12)';
    g.fillRect(gx, gy, rng.range(1, 4), rng.range(0.6, 2));
  }
  g.restore();
  // cabine
  const cx = L * 0.17;
  const cg = g.createRadialGradient(cx + 2, -W * 0.12, 0.5, cx, 0, W * 0.4);
  cg.addColorStop(0, '#e8fbff'); cg.addColorStop(0.25, '#6fd6ff'); cg.addColorStop(0.7, '#0e3a5e'); cg.addColorStop(1, '#06121e');
  g.fillStyle = cg; g.beginPath(); g.ellipse(cx, 0, L * 0.11, W * 0.2, 0, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 0.6; g.stroke();
  // canhão frontal
  g.fillStyle = '#2e333b'; g.fillRect(nose - 4, -0.8, 6, 1.6);
}

function makeShipDesign(tier, hull = '#b9c2cf', accent = '#ff7a2f', seed = 7) {
  const t = Math.max(1, tier), k = Math.log2(t + 1);
  const len = 46 + k * 14, width = 13 + k * 3.5, span = 16 + k * 9;
  const nEng = 1 + Math.min(4, Math.floor(t / 2));
  const engR = 3.2 + k * 0.6, engines = [];
  for (let i = 0; i < nEng; i++) engines.push(nEng === 1 ? 0 : -width * 0.45 + (width * 0.9 * i) / (nEng - 1));
  return { tier: t, len, width, span, sweep: 0.3 + Math.min(0.12, k * 0.03), hull, wingCol: '#8a929e', accent, engines, engR, wingGuns: Math.min(3, Math.floor(t / 3)), seed };
}
function drawEngineFlames(ctx, D, x, y, ang, thrust, zoom, t, col = [120, 190, 255]) {
  if (thrust <= 0.02) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(zoom, zoom);
  ctx.globalCompositeOperation = 'lighter';
  for (const ey of D.engines) {
    const len = (14 + D.engR * 5) * thrust * (0.85 + Math.random() * 0.3), ex = -D.len * 0.5 - 2;
    const g = ctx.createLinearGradient(ex, 0, ex - len, 0);
    g.addColorStop(0, `rgba(255,255,255,${0.95 * thrust})`); g.addColorStop(0.15, rgba(col, 0.85 * thrust)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(ex, ey - D.engR * 0.8); ctx.quadraticCurveTo(ex - len * 0.4, ey - D.engR * 0.5, ex - len, ey); ctx.quadraticCurveTo(ex - len * 0.4, ey + D.engR * 0.5, ex, ey + D.engR * 0.8); ctx.fill();
    const rg = ctx.createRadialGradient(ex, ey, 0, ex, ey, D.engR * 3);
    rg.addColorStop(0, rgba(col, 0.6 * thrust)); rg.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(ex, ey, D.engR * 3, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

/* ---------- fundo: camadas de estrelas e nebulosas ---------- */
const STAR_TILE = 1024;
function makeStarTile(seed, count, maxSize, dimness) {
  const cv = mkCanvas(STAR_TILE, STAR_TILE), g = cv.getContext('2d'), rng = makeRng(seed);
  const temps = ['#9bb0ff', '#aabfff', '#cad7ff', '#f8f7ff', '#fff4ea', '#ffd2a1', '#ffcc6f'];
  for (let i = 0; i < count; i++) {
    const x = rng() * STAR_TILE, y = rng() * STAR_TILE, s = Math.pow(rng(), 3) * maxSize + 0.4;
    const c = hexRgb(rng.pick(temps)), a = (0.35 + rng() * 0.65) * dimness;
    if (s > 1.4) {
      const gr = g.createRadialGradient(x, y, 0, x, y, s * 3);
      gr.addColorStop(0, rgba(c, a)); gr.addColorStop(0.25, rgba(c, a * 0.35)); gr.addColorStop(1, rgba(c, 0));
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, s * 3, 0, TAU); g.fill();
    }
    g.fillStyle = rgba(c, a); g.beginPath(); g.arc(x, y, Math.min(s, 1.6) * 0.7, 0, TAU); g.fill();
  }
  return cv;
}
const nebCache = new Map();
const NEB_CHUNK = 1024, NEB_RES = 128;
let nebNoise = null;
function nebulaChunk(cx, cy) {
  const key = cx + ',' + cy;
  let c = nebCache.get(key);
  if (c) return c;
  c = { cv: mkCanvas(NEB_RES + 2, NEB_RES + 2), ready: false };
  nebCache.set(key, c);
  if (nebCache.size > 40) nebCache.delete(nebCache.keys().next().value);
  Jobs.add(genNebula(cx, cy, c), 2);
  return c;
}
function* genNebula(cx, cy, c) {
  const N = nebNoise || (nebNoise = new Simplex(G.seed ^ 0x51ed));
  const NR = NEB_RES + 2, g = c.cv.getContext('2d'), img = g.createImageData(NR, NR), d = img.data;
  for (let y = 0; y < NR; y++) {
    for (let x = 0; x < NR; x++) {
      const wx = (cx * NEB_CHUNK + ((x - 1 + 0.5) / NEB_RES) * NEB_CHUNK) / 900, wy = (cy * NEB_CHUNK + ((y - 1 + 0.5) / NEB_RES) * NEB_CHUNK) / 900;
      const warp = N.fbm(wx * 0.7, wy * 0.7, 5, 3);
      const n = N.fbm(wx + warp * 1.5, wy - warp * 1.2, 1.7, 6);
      const dens = smooth(0.05, 0.65, n) * smooth(-0.3, 0.4, N.fbm(wx * 0.25, wy * 0.25, 9, 2));
      const hue = N.noise3(wx * 0.12, wy * 0.12, 3) * 0.5 + 0.5;
      // paleta: magenta → violeta → azul → verde-água
      const r = lerp(170, 40, hue) + 50 * warp, gg = lerp(40, 120, hue * hue) + 20, b = lerp(150, 200, hue);
      const dust = smooth(0.2, 0.5, N.fbm(wx * 3, wy * 3, 4, 4));
      const o = (y * NR + x) * 4;
      d[o] = r * (1 - dust * 0.6); d[o + 1] = gg * (1 - dust * 0.6); d[o + 2] = b * (1 - dust * 0.5);
      d[o + 3] = clamp(dens * 120, 0, 255);
    }
    if ((y & 7) === 7) yield;
  }
  g.putImageData(img, 0, 0);
  c.ready = true;
}
