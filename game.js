(() => {
'use strict';
// ───────────────────────────── constants
const WATER = 0, GRASS = 1, FOREST = 2, ROCK = 3, BURNT = 4;
const TCAP = 400, HEAT = 50, P_F = 0.02, P_G = 0.008;
const DAY = 1200, HOUR = DAY / 24;
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
const NAMES = ['Милава','Ждан','Горислав','Веселина','Тихон','Любава','Мирон','Злата','Ярослав','Дарина','Ратибор','Снежана','Боян','Забава','Светозар','Агния','Велимир','Олеся','Добрыня','Василиса','Радим','Ведана'];
const TASK_RU = {eat:'ест', sleep:'спит', warm:'греется у костра', gather:'собирает ягоды', chop:'рубит лес', douse:'тушит пожар', fight:'дерётся', flee:'бежит от огня', haul:'несёт на склад', idle:'думает', camp:'идёт в лагерь', leave:'уходит с добычей', build:'строит', mine:'добывает камень'};

// Buildings: cost is paid when the site is laid, then colonists build it with labour (agent-ticks)
const BUILDINGS = {
  hut:       {name: 'Шалаш',       cost: {wood: 18},            work: 160, max: 4, wooden: true,  color: '#b88a52', mark: 'Ш',
              effect: 'Сон на 60% быстрее, ночью спящие не мёрзнут. +4 к числу жителей, которых примет лагерь.'},
  granary:   {name: 'Амбар',       cost: {wood: 25},            work: 200, max: 1, wooden: true,  color: '#c9a24a', mark: 'А',
              effect: 'Еда на складе портится в 6 раз медленнее.'},
  garden:    {name: 'Ягодный огород', cost: {wood: 12, food: 10}, work: 140, max: 2, wooden: false, color: '#c45c95', mark: 'О',
              effect: 'Рядом высаживаются 12 кустов, они плодоносят втрое быстрее диких.'},
  quarry:    {name: 'Каменоломня', cost: {wood: 20},            work: 180, max: 1, wooden: true,  color: '#9b9688', mark: 'К',
              effect: 'Открывает добычу камня у скал. Камень нужен для сложных построек.'},
  sawmill:   {name: 'Лесопилка',   cost: {wood: 30, stone: 10}, work: 240, max: 1, wooden: true,  color: '#8a6a3c', mark: 'Л',
              effect: 'Рубка идёт на 40% быстрее, каждое бревно даёт в полтора раза больше дров.', needs: 'quarry'},
  smokehouse:{name: 'Коптильня',   cost: {wood: 15, stone: 15}, work: 220, max: 1, wooden: false, color: '#a85a3a', mark: 'Кп',
              effect: 'Собранные ягоды перерабатываются: +40% еды, порча вдвое медленнее.', needs: 'quarry'},
  well:      {name: 'Колодец',     cost: {stone: 25},           work: 200, max: 1, wooden: false, color: '#5d93b8', mark: 'В',
              effect: 'Тушение вдвое эффективнее, клетки у лагеря остывают быстрее.', needs: 'quarry'},
  palisade:  {name: 'Частокол',    cost: {wood: 45, stone: 10}, work: 300, max: 1, wooden: true,  color: '#6f5a3c', mark: 'Ч',
              effect: 'В лагере защитники получают на 40% меньше урона, налётчики уносят вдвое меньше.', needs: 'quarry'},
};
const GENDER = {quarry: 'f', sawmill: 'f', smokehouse: 'f'};
const ending = key => GENDER[key] === 'f' ? 'а' : '';
const RES_RU = {food: 'еда', wood: 'дрова', stone: 'камень'};

// World settings chosen in the start menu
const SIZES = {
  small:  {w: 96,  h: 72,  label: 'Малый', note: '96 × 72, быстрый'},
  medium: {w: 128, h: 96,  label: 'Средний', note: '128 × 96, как в прототипе'},
  large:  {w: 192, h: 144, label: 'Большой', note: '192 × 144'},
  huge:   {w: 256, h: 192, label: 'Огромный', note: '256 × 192, тяжелее для навигации'},
};
const CLIMATES = {
  cold:      {label: 'Холодный', note: 'ночи у нуля, костёр нужен всегда', tOff: -8, ign: 25, regrow: 0.7},
  temperate: {label: 'Умеренный', note: 'тёплые дни, прохладные ночи', tOff: 0, ign: 0, regrow: 1},
  dry:       {label: 'Засушливый', note: 'жарко, лес вспыхивает легче', tOff: 7, ign: -20, regrow: 0.75},
};
const LEVELS3 = ['мало', 'обычно', 'много'];
const STOCKS = {poor: {food: 8, wood: 6, label: 'Скудные'}, normal: {food: 22, wood: 16, label: 'Обычные'}, rich: {food: 45, wood: 35, label: 'Щедрые'}};
const RAIDS = {off: {label: 'Нет', every: 0}, rare: {label: 'Редкие', every: 3 * DAY}, often: {label: 'Частые', every: 1.4 * DAY}};
const DEFAULT_CFG = {name: 'Тёплый Брод', seed: '20261010', size: 'medium', water: 1, forest: 1, rock: 1, climate: 'temperate', colonists: 8, stock: 'normal', raids: 'off', lightning: false, windDir: 20, windStr: 35};

// ───────────────────────────── state
let W = 128, H = 96, N = W * H, S = 8;
let cfg = {...DEFAULT_CFG}, clim = CLIMATES.temperate, IGN_F = 80, IGN_G = 120;
let rand, terr, hgt, fert, food, wood, fuel, fire, temp, temp2, smoke, smoke2, bush, costCache;
let dCamp, dFood, dWood, dEdge, dFire, dSafe, dSite, dRock;
let bld, buildings, bldSeq, gardenCells;
let hpI, hpD, closed, hn = 0, popI = 0, popD = 0;
let camp = {x: 64, y: 48, cells: []};
let lastSteal = -999, stock, agents, tick, nextId, logLines, fireCount, fireNearCamp, campLit, selected, nameIdx, nextRaid, navEvery;
let wind = {x: 0, y: 0, dir: 20, str: 0.35};
let speed = 1, tool = 'inspect', layer = 'world', running = false;
const perf = {f: 0, n: 0, a: 0, r: 0, tps: 0};
const dirty = {camp: true, food: true, wood: true, edge: true, fire: true, safe: true, site: true, rock: true};

function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
// any text works as a seed: digits are used as is, words are hashed (FNV-1a)
function seedNumber(text) {
  const t = String(text).trim();
  if (/^\d{1,9}$/.test(t)) return +t;
  let h = 2166136261; for (const ch of t) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0;
}

// ───────────────────────────── world generation (pure: also used by the menu preview)
function noiseLayer(rnd, w, h, cell) {
  const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2;
  const g = new Float32Array(gw * gh); for (let i = 0; i < g.length; i++) g[i] = rnd();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = x / cell, fy = y / cell, ix = fx | 0, iy = fy | 0;
    let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
    out[y * w + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  return out;
}
function fbm(rnd, w, h) {
  // feature size grows with the map so a big map has more lakes, not bigger ones
  const k = Math.sqrt(w * h / (128 * 96));
  const a = noiseLayer(rnd, w, h, 36 * Math.min(k, 1.3)), b = noiseLayer(rnd, w, h, 18), c = noiseLayer(rnd, w, h, 9), d = noiseLayer(rnd, w, h, 4);
  const n = w * h, o = new Float32Array(n); let mn = 1e9, mx = -1e9;
  for (let i = 0; i < n; i++) { o[i] = a[i] * .5 + b[i] * .27 + c[i] * .15 + d[i] * .08; mn = Math.min(mn, o[i]); mx = Math.max(mx, o[i]); }
  for (let i = 0; i < n; i++) o[i] = (o[i] - mn) / (mx - mn);
  return o;
}
function makeTerrain(c) {
  const sz = SIZES[c.size], w = sz.w, h = sz.h, n = w * h;
  const rnd = mulberry(seedNumber(c.seed));
  const ht = fbm(rnd, w, h), moist = fbm(rnd, w, h);
  const waterLvl = [0.2, 0.3, 0.4][c.water], rockLvl = [0.88, 0.8, 0.7][c.rock], forestLvl = [0.66, 0.56, 0.44][c.forest];
  const tr = new Uint8Array(n), fe = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const hh = ht[i], m = moist[i];
    tr[i] = hh < waterLvl ? WATER : hh > rockLvl ? ROCK : m > forestLvl ? FOREST : GRASS;
    fe[i] = clamp(m * 1.25 - (hh - 0.5) * 0.6, 0.05, 1);
  }
  // camp: walkable spot nearest to the centre, cleared 7×7
  let best = -1, bd = 1e9;
  const mx = Math.round(w * 0.12), my = Math.round(h * 0.12);
  for (let y = my; y < h - my; y++) for (let x = mx; x < w - mx; x++) {
    const i = y * w + x; if (tr[i] === WATER || tr[i] === ROCK) continue;
    let ok = true; for (let yy = -3; yy <= 3 && ok; yy++) for (let xx = -3; xx <= 3; xx++) { const t = tr[(y + yy) * w + x + xx]; if (t === WATER || t === ROCK) { ok = false; break; } }
    if (!ok) continue;
    const d = (x - w / 2) ** 2 + (y - h / 2) ** 2; if (d < bd) { bd = d; best = i; }
  }
  if (best < 0) best = (h >> 1) * w + (w >> 1);
  const cx = best % w, cy = (best / w) | 0;
  for (let yy = -3; yy <= 3; yy++) for (let xx = -3; xx <= 3; xx++) tr[(cy + yy) * w + cx + xx] = GRASS;
  return {w, h, terr: tr, hgt: ht, fert: fe, cx, cy, rnd};
}

function generate(c) {
  cfg = {...c}; clim = CLIMATES[cfg.climate];
  IGN_F = 80 + clim.ign; IGN_G = 120 + clim.ign;
  const t = makeTerrain(cfg);
  W = t.w; H = t.h; N = W * H; S = Math.max(4, Math.floor(1024 / W));
  rand = t.rnd; terr = t.terr; hgt = t.hgt; fert = t.fert;
  food = new Float32Array(N); wood = new Float32Array(N);
  fuel = new Float32Array(N); fire = new Float32Array(N); temp = new Float32Array(N); temp2 = new Float32Array(N);
  smoke = new Float32Array(N); smoke2 = new Float32Array(N); bush = new Uint8Array(N); costCache = new Float32Array(N);
  dCamp = new Float64Array(N); dFood = new Float64Array(N); dWood = new Float64Array(N); dEdge = new Float64Array(N); dFire = new Float64Array(N); dSafe = new Float64Array(N); dSite = new Float64Array(N); dRock = new Float64Array(N);
  bld = new Int16Array(N).fill(-1); buildings = []; bldSeq = 0; gardenCells = [];
  hpI = new Int32Array(N * 9); hpD = new Float64Array(N * 9); closed = new Uint8Array(N);
  // bigger maps rebuild each flow field less often, so a tick stays cheap
  navEvery = Math.max(1, Math.round(N / 12288));
  camp.x = t.cx; camp.y = t.cy; camp.cells = [];
  for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) camp.cells.push((camp.y + yy) * W + camp.x + xx);
  for (let i = 0; i < N; i++) {
    const tt = terr[i];
    if (tt === FOREST) { wood[i] = 0.6 + 0.4 * rand(); fuel[i] = 1.2 + wood[i]; }
    else if (tt === GRASS) { fuel[i] = 0.4; if (rand() < 0.07 * fert[i] && !isCampArea(i)) { bush[i] = 1; food[i] = 0.5 + 0.5 * rand(); fuel[i] += 0.2; } }
    temp[i] = ambientTemp(7 * HOUR);
  }
  const st = STOCKS[cfg.stock]; stock = {food: st.food, wood: st.wood, stone: 0};
  agents = []; nextId = 1; tick = 7 * HOUR; logLines = []; selected = null; nameIdx = 0; fireCount = 0; fireNearCamp = 0; campLit = false; lastSteal = -999;
  nextRaid = RAIDS[cfg.raids].every ? tick + RAIDS[cfg.raids].every * (0.6 + rand() * 0.6) : Infinity;
  wind.dir = cfg.windDir; wind.str = cfg.windStr / 100; setWind();
  for (let k = 0; k < cfg.colonists; k++) spawnColonist(camp.x + 0.5 + (rand() * 5 - 2.5), camp.y + 0.5 + (rand() * 5 - 2.5));
  for (const k in dirty) dirty[k] = true;
  rebuildAll();
  setupRender();
  const n = cfg.colonists;
  log(`${n} ${plural(n, 'поселенец', 'поселенца', 'поселенцев')} ${n === 1 ? 'разбил' : 'разбили'} лагерь «${esc(cfg.name)}».`);
}
function isCampArea(i) { const x = i % W, y = (i / W) | 0; return Math.abs(x - camp.x) <= 3 && Math.abs(y - camp.y) <= 3; }

// ───────────────────────────── time & weather
function hourOf(t) { return (t % DAY) / HOUR; }
function ambientTemp(t = tick) { const h = hourOf(t); return 11 + clim.tOff + 9 * Math.sin(2 * Math.PI * (h - 9) / 24); }
function nightness(t = tick) { const sun = Math.sin(2 * Math.PI * (hourOf(t) - 6) / 24); return clamp((0.2 - sun) * 2.2, 0, 1); }
function clockStr(t = tick) { const d = Math.floor(t / DAY) + 1, h = hourOf(t), hh = Math.floor(h), mm = Math.floor((h - hh) * 60 / 10) * 10; return `День ${d}, ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
function setWind() { const ar = document.getElementById('windArrow'); if (ar) ar.style.transform = `rotate(${wind.dir}deg)`; const a = wind.dir * Math.PI / 180; wind.x = Math.cos(a) * wind.str * 0.5; wind.y = Math.sin(a) * wind.str * 0.5; }

// ───────────────────────────── layer 1: fields
function advect(src, dst, ux, uy) {
  if (ux === 0 && uy === 0) { dst.set(src); return; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = clamp(x - ux, 0, W - 1.001), sy = clamp(y - uy, 0, H - 1.001);
    const x0 = sx | 0, y0 = sy | 0, tx = sx - x0, ty = sy - y0, i0 = y0 * W + x0;
    dst[y * W + x] = (src[i0] * (1 - tx) + src[i0 + 1] * tx) * (1 - ty) + (src[i0 + W] * (1 - tx) + src[i0 + W + 1] * tx) * ty;
  }
}
function stepFields() {
  const amb = ambientTemp();
  advect(smoke, smoke2, wind.x, wind.y); [smoke, smoke2] = [smoke2, smoke];
  advect(temp, temp2, wind.x * 0.35, wind.y * 0.35); [temp, temp2] = [temp2, temp];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, l = x > 0 ? i - 1 : i, r = x < W - 1 ? i + 1 : i, u = y > 0 ? i - W : i, d = y < H - 1 ? i + W : i;
    const T = temp[i];
    const relax = terr[i] === WATER ? 0.05 : 0.012;
    let Tn = T + 0.15 * (temp[l] + temp[r] + temp[u] + temp[d] - 4 * T) + relax * (amb - T) + fire[i] * HEAT;
    temp2[i] = Tn > TCAP ? TCAP : Tn;
    const Sm = smoke[i];
    const Sn = Sm + 0.12 * (smoke[l] + smoke[r] + smoke[u] + smoke[d] - 4 * Sm) - 0.012 * Sm + fire[i] * 0.25;
    smoke2[i] = Sn > 4 ? 4 : Sn;
  }
  [temp, temp2] = [temp2, temp]; [smoke, smoke2] = [smoke2, smoke];

  // campfire: a heat source fed by the wood stock
  const anyCold = agents.some(a => a.tribe === 0 && a.warm < 0.6);
  campLit = stock.wood > 0.05 && (nightness() > 0.3 || anyCold);
  if (campLit) { stock.wood = Math.max(0, stock.wood - 0.004); for (const c of camp.cells) if (temp[c] < 30) temp[c] += 3.2; }

  // fire: burns fuel, heats neighbours, ignites overheated cells
  fireCount = 0; fireNearCamp = 0;
  for (let i = 0; i < N; i++) {
    const f = fire[i];
    if (f > 0) {
      fuel[i] -= 0.018 * f;
      if (fuel[i] <= 0) {
        fuel[i] = 0; fire[i] = f * 0.85;
        if (fire[i] < 0.03) { fire[i] = 0; if (terr[i] !== WATER && terr[i] !== ROCK) terr[i] = BURNT; wood[i] = 0; food[i] = 0; bush[i] = 0; dirty.wood = dirty.food = true; if (bld[i] >= 0) burnBuilding(bld[i]); }
      } else fire[i] = Math.min(1, f + 0.06);
      if (fire[i] > 0) {
        fireCount++;
        const x = i % W, y = (i / W) | 0;
        if ((x - camp.x) ** 2 + (y - camp.y) ** 2 < 20 * 20) fireNearCamp++;
        if (isCampArea(i)) { stock.wood = Math.max(0, stock.wood - 0.02); stock.food = Math.max(0, stock.food - 0.01); }
      }
    } else if (fuel[i] > 0.12) {
      const forest = fuel[i] > 1;
      if (temp[i] > (forest ? IGN_F : IGN_G) && Math.random() < (forest ? P_F : P_G)) { fire[i] = 0.2; dirty.fire = true; }
    }
  }
  // planted garden bushes regrow fast; the well cools the camp area
  for (const g of gardenCells) if (bush[g] && fire[g] === 0 && food[g] < 1) { food[g] = Math.min(1, food[g] + 0.0035); if (food[g] > 0.35 && food[g] < 0.354) dirty.food = true; }
  if (has('well')) for (let yy = -6; yy <= 6; yy++) for (let xx = -6; xx <= 6; xx++) {
    const x = camp.x + xx, y = camp.y + yy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const j = y * W + x; if (temp[j] > 40) temp[j] -= (temp[j] - 40) * 0.08;
  }
  // stored food spoils unless there is a granary (and slower with a smokehouse)
  stock.food = Math.max(0, stock.food - stock.food * 0.00015 * (has('granary') ? 1 / 6 : 1) * (has('smokehouse') ? 0.5 : 1));
  // slow regrowth: sample random cells
  const samples = Math.round(160 * N / 12288 * clim.regrow);
  for (let k = 0; k < samples; k++) {
    const i = (Math.random() * N) | 0; if (fire[i] > 0 || bld[i] >= 0) continue;
    const t = terr[i];
    if (t === BURNT) { if (Math.random() < 0.02) { terr[i] = GRASS; fuel[i] = 0.1; } }
    else if (t === GRASS) {
      if (fuel[i] < 0.4) fuel[i] = Math.min(0.4, fuel[i] + 0.02);
      if (bush[i]) { food[i] = Math.min(1, food[i] + 0.05 * fert[i]); if (food[i] > 0.35) dirty.food = true; }
      else if (!isCampArea(i) && Math.random() < 0.0025 * fert[i]) { bush[i] = 1; food[i] = 0.1; fuel[i] += 0.2; }
      if (Math.random() < 0.0015 * fert[i] && fert[i] > 0.55 && !isCampArea(i)) { terr[i] = FOREST; wood[i] = 0.3; fuel[i] = 1.5; bush[i] = 0; }
    } else if (t === FOREST && wood[i] < 1) { wood[i] = Math.min(1, wood[i] + 0.03); fuel[i] = 1.2 + wood[i]; }
  }
}

// ───────────────────────────── layer 2: navigation (Dijkstra flow fields)
function hpush(i, d) { let k = hn++; while (k > 0) { const p = (k - 1) >> 1; if (hpD[p] <= d) break; hpI[k] = hpI[p]; hpD[k] = hpD[p]; k = p; } hpI[k] = i; hpD[k] = d; }
function hpop() { popI = hpI[0]; popD = hpD[0]; hn--; const li = hpI[hn], ld = hpD[hn]; let k = 0; for (;;) { let c = 2 * k + 1; if (c >= hn) break; if (c + 1 < hn && hpD[c + 1] < hpD[c]) c++; if (hpD[c] >= ld) break; hpI[k] = hpI[c]; hpD[k] = hpD[c]; k = c; } hpI[k] = li; hpD[k] = ld; }
function walkable(i) { const t = terr[i]; return t !== WATER && t !== ROCK; }
function cellCost(i, hazard) {
  if (!walkable(i)) return -1;
  let c = terr[i] === FOREST ? 1.6 : 1;
  c += (fire[i] * 60 + smoke[i] * 1.5) * hazard;
  if (temp[i] > 45) c += (temp[i] - 45) * 0.3 * hazard;
  return c;
}
function buildMap(dist, isSeed, hazard = 1) {
  for (let i = 0; i < N; i++) costCache[i] = cellCost(i, hazard);
  dist.fill(1e9); closed.fill(0); hn = 0;
  for (let i = 0; i < N; i++) if (isSeed(i) && costCache[i] >= 0) { dist[i] = 0; hpush(i, 0); }
  while (hn > 0) {
    hpop(); const i = popI, d = popD; if (closed[i] || d > dist[i]) continue; closed[i] = 1;
    const x = i % W, y = (i / W) | 0;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k], ny = y + DY[k]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx; let c = costCache[j]; if (c < 0) continue;
      if (k >= 4) { if (costCache[y * W + nx] < 0 || costCache[ny * W + x] < 0) continue; c *= 1.414; }
      const nd = d + c; if (nd < dist[j]) { dist[j] = nd; hpush(j, nd); }
    }
  }
}
const MAPS = {
  camp: () => buildMap(dCamp, i => camp.cells.includes(i)),
  food: () => buildMap(dFood, i => food[i] > 0.35 && fire[i] === 0),
  wood: () => buildMap(dWood, i => terr[i] === FOREST && wood[i] > 0.3 && fire[i] === 0),
  edge: () => buildMap(dEdge, i => { const x = i % W, y = (i / W) | 0; return x === 0 || y === 0 || x === W - 1 || y === H - 1; }),
  // only fires that threaten the camp are worth fighting
  fire: () => buildMap(dFire, i => fire[i] > 0.05 && ((i % W) - camp.x) ** 2 + (((i / W) | 0) - camp.y) ** 2 < 20 * 20),
  site: () => buildMap(dSite, i => bld[i] >= 0 && !bById(bld[i]).done),
  rock: () => buildMap(dRock, i => fire[i] === 0 && bld[i] < 0 && nextToRock(i)),
  // escape map: seeds are cells barely warmer than the air; fire is made almost impassable
  safe: () => { const lim = ambientTemp() + 14; buildMap(dSafe, i => temp[i] < lim && fire[i] === 0 && smoke[i] < 0.6, 25); },
};
const ORDER = ['camp', 'food', 'wood', 'edge', 'fire', 'safe', 'site', 'rock'];
function rebuildAll() { for (const k of ORDER) { MAPS[k](); dirty[k] = false; } }
function stepNav() {
  // one scheduled map every navEvery ticks (1 on the medium map), plus one dirty map if any
  if (tick % navEvery !== 0) return;
  const slot = (tick / navEvery) | 0, k = ORDER[slot % ORDER.length];
  const idle = (k === 'fire' || k === 'safe') && fireCount === 0 || k === 'site' && !buildings.some(b => !b.done) || k === 'rock' && !has('quarry');
  if (!idle || dirty[k]) { MAPS[k](); dirty[k] = false; }
  for (const d of ORDER) if (dirty[d]) { MAPS[d](); dirty[d] = false; break; }
  // while something burns, the escape map is refreshed every other slot
  if (fireCount > 0 && k !== 'safe' && slot % 2 === 0) MAPS.safe();
}

// ───────────────────────────── buildings
function count(key, any = false) { return buildings.filter(b => b.key === key && (any || b.done)).length; }
function has(key) { return buildings.some(b => b.key === key && b.done); }
function bById(id) { return buildings.find(b => b.id === id); }
function nextToRock(i) {
  if (!walkable(i)) return false; const x = i % W, y = (i / W) | 0;
  for (let k = 0; k < 4; k++) { const nx = x + DX[k], ny = y + DY[k]; if (nx >= 0 && ny >= 0 && nx < W && ny < H && terr[ny * W + nx] === ROCK) return true; }
  return false;
}
function canAfford(cost) { return Object.entries(cost).every(([r, v]) => stock[r] >= v); }
function buildStatus(key) {
  const d = BUILDINGS[key];
  if (count(key, true) >= d.max) return {ok: false, why: d.max === 1 ? 'уже есть' : 'предел ' + d.max};
  if (d.needs && !has(d.needs)) return {ok: false, why: 'нужна ' + BUILDINGS[d.needs].name.toLowerCase()};
  if (!canAfford(d.cost)) return {ok: false, why: 'не хватает ресурсов'};
  return {ok: true, why: ''};
}
// a 2×2 lot on dry land, in a ring around the camp, away from other buildings
function findLot() {
  let best = -1, bd = 1e9;
  for (let y = camp.y - 14; y <= camp.y + 13; y++) for (let x = camp.x - 14; x <= camp.x + 13; x++) {
    if (x < 1 || y < 1 || x >= W - 2 || y >= H - 2) continue;
    const d = (x + 1 - camp.x) ** 2 + (y + 1 - camp.y) ** 2; if (d < 25 || d >= bd) continue;
    let ok = true;
    for (let yy = -1; yy <= 2 && ok; yy++) for (let xx = -1; xx <= 2; xx++) {
      const j = (y + yy) * W + x + xx, inner = xx >= 0 && xx <= 1 && yy >= 0 && yy <= 1;
      if (bld[j] >= 0 || (inner && (!walkable(j) || fire[j] > 0 || isCampArea(j)))) { ok = false; break; }
    }
    if (ok) { bd = d; best = y * W + x; }
  }
  return best;
}
function orderBuilding(key) {
  const d = BUILDINGS[key]; if (!buildStatus(key).ok) return false;
  const lot = findLot(); if (lot < 0) { log('Вокруг лагеря не осталось места под постройку.'); return false; }
  for (const [r, v] of Object.entries(d.cost)) stock[r] -= v;
  const b = {id: bldSeq++, key, x: lot % W, y: (lot / W) | 0, progress: 0, done: false, cells: []};
  for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) {
    const j = (b.y + yy) * W + b.x + xx; b.cells.push(j);
    bld[j] = b.id; terr[j] = GRASS; bush[j] = 0; food[j] = 0; wood[j] = 0; fuel[j] = d.wooden ? 0.9 : 0;
  }
  buildings.push(b); dirty.site = dirty.food = dirty.wood = true;
  log(`Заложен${ending(key)} ${d.name.toLowerCase()}. Нужно ${d.work} человеко-тиков работы.`);
  renderBuildPanel(true);
  return true;
}
function finishBuilding(b) {
  b.done = true; dirty.site = true;
  const d = BUILDINGS[b.key];
  log(`Построен${ending(b.key)} <b>${d.name.toLowerCase()}</b>. ${d.effect}`);
  if (b.key === 'garden') {
    // plant bushes on free grass around the garden
    const cand = [];
    for (let yy = -4; yy <= 5; yy++) for (let xx = -4; xx <= 5; xx++) {
      const x = b.x + xx, y = b.y + yy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const j = y * W + x; if ((terr[j] === GRASS || terr[j] === BURNT) && bld[j] < 0 && !isCampArea(j) && !bush[j]) cand.push([j, xx * xx + yy * yy]);
    }
    cand.sort((p, q) => p[1] - q[1]);
    for (const [j] of cand.slice(0, 12)) { terr[j] = GRASS; bush[j] = 1; food[j] = 0.5; fuel[j] = 0.6; fert[j] = 1; gardenCells.push(j); }
    dirty.food = true;
  }
  if (b.key === 'quarry') dirty.rock = true;
  renderBuildPanel(true);
}
function burnBuilding(id) {
  const b = bById(id); if (!b) return;
  for (const j of b.cells) bld[j] = -1;
  buildings = buildings.filter(x => x !== b); dirty.site = true;
  if (b.key === 'garden') { const own = new Set(); for (let yy = -4; yy <= 5; yy++) for (let xx = -4; xx <= 5; xx++) own.add((b.y + yy) * W + b.x + xx); gardenCells = gardenCells.filter(j => !own.has(j)); }
  log(`${b.done ? 'Сгорел' + ending(b.key) : 'Сгорела стройка:'} <b>${BUILDINGS[b.key].name.toLowerCase()}</b>.`);
  renderBuildPanel(true);
}
function yieldOf(kind) { return kind === 'food' ? (has('smokehouse') ? 1.4 : 1) : kind === 'wood' ? (has('sawmill') ? 1.5 : 1) : 1; }
function popCap() { return 8 + 4 * count('hut'); }

// ───────────────────────────── layer 3: agents
function spawnColonist(x, y) {
  const a = {id: nextId++, tribe: 0, name: NAMES[nameIdx++ % NAMES.length], x, y, hp: 1, food: 0.6 + rand() * 0.4, rest: 0.6 + rand() * 0.4, warm: 0.9,
    task: null, tgt: null, work: 0, carry: null, n: 0, eatDirect: false, cd: 0, think: (rand() * 15) | 0, bias: {gather: rand() * 0.15, chop: rand() * 0.15, build: rand() * 0.15, mine: rand() * 0.15}};
  agents.push(a); return a;
}
function spawnRaider(x, y) { const a = {id: nextId++, tribe: 1, name: 'Волк', x, y, hp: 0.75, task: 'camp', tgt: null, cd: 0, stolen: false, think: 0}; agents.push(a); return a; }
function cellOf(a) { return clamp(a.y | 0, 0, H - 1) * W + clamp(a.x | 0, 0, W - 1); }
function moveToward(a, tx, ty, mul = 1) {
  const dx = tx - a.x, dy = ty - a.y, len = Math.hypot(dx, dy);
  const sp = 0.13 * mul * (terr[cellOf(a)] === FOREST ? 0.7 : 1);
  if (len <= sp) { a.x = tx; a.y = ty; } else { a.x += dx / len * sp; a.y += dy / len * sp; }
}
function follow(a, dist, mul = 1) {
  const i = cellOf(a); if (dist[i] === 0) return 'arrived';
  const x = i % W, y = (i / W) | 0; let best = dist[i], bj = -1;
  for (let k = 0; k < 8; k++) {
    const nx = x + DX[k], ny = y + DY[k]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const j = ny * W + nx; if (dist[j] < best) { best = dist[j]; bj = j; }
  }
  if (bj < 0) return dist[i] >= 1e8 ? 'none' : 'stuck';
  moveToward(a, (bj % W) + 0.5, ((bj / W) | 0) + 0.5, mul);
  return 'moving';
}
function fleeLocal(a, i) {
  const x = i % W, y = (i / W) | 0; let bj = i, bd = danger(i);
  for (let k = 0; k < 8; k++) { const nx = x + DX[k], ny = y + DY[k]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; if (walkable(j) && danger(j) < bd) { bd = danger(j); bj = j; } }
  moveToward(a, (bj % W) + 0.5, ((bj / W) | 0) + 0.5, 1.3);
}
function danger(i) { return temp[i] + fire[i] * 400 + smoke[i] * 6; }
function nearFire(a, r) {
  const cx = a.x | 0, cy = a.y | 0, R = Math.ceil(r);
  for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    if (fire[y * W + x] > 0.05 && (x + 0.5 - a.x) ** 2 + (y + 0.5 - a.y) ** 2 <= r * r) return true;
  }
  return false;
}
function nearestEnemy(a, r) { let b = null, bd = r * r; for (const o of agents) { if (o.tribe === a.tribe || o.hp <= 0) continue; const d = (o.x - a.x) ** 2 + (o.y - a.y) ** 2; if (d < bd) { bd = d; b = o; } } return b; }
function colonistPop() { return agents.filter(a => a.tribe === 0).length; }

function decide(a) {
  const pop = colonistPop();
  const enemy = nearestEnemy(a, 16);
  const night = nightness();
  // a burning or overheated camp is no place to eat or sleep
  let campHot = 0; for (const c of camp.cells) campHot = Math.max(campHot, temp[c] + fire[c] * 400);
  const campOk = campHot < 40 ? 1 : 0.1;
  const opts = [
    ['eat', (1 - a.food) ** 2 * 2.2 * campOk],
    ['sleep', ((1 - a.rest) ** 2 * 1.8 + (night > 0.6 && a.rest < 0.75 ? 0.35 : 0)) * campOk],
    ['warm', (1 - a.warm) ** 2 * 2.0 * campOk],
    ['gather', (stock.food < pop * 8 ? 0.25 : 0.04) + (stock.food < pop * 4 ? 0.45 : 0) + a.bias.gather - night * 0.2],
    ['chop', (stock.wood < 40 ? 0.2 : 0.03) + (stock.wood < 25 ? 0.35 : 0) + a.bias.chop - night * 0.2],
    ['idle', 0.15],
  ];
  if (buildings.some(b => !b.done)) opts.push(['build', 0.62 + a.bias.build - night * 0.3]);
  if (has('quarry')) opts.push(['mine', (stock.stone < 40 ? 0.18 : 0.03) + (stock.stone < 20 ? 0.3 : 0) + a.bias.mine - night * 0.2]);
  if (fireNearCamp > 0 && a.hp > 0.6) opts.push(['douse', 0.8]);
  if (enemy && a.hp > 0.3) opts.push(['fight', 1.1]);
  let best = null, bs = -1;
  for (const [k, s] of opts) { const sc = s + (k === a.task ? 0.12 : 0); if (sc > bs) { bs = sc; best = k; } }
  if (best !== a.task) { a.task = best; a.work = 0; a.eatDirect = false; }
  if (best === 'fight') a.tgt = enemy;
}

function attack(a, t) {
  if (a.cd > 0) return;
  // defenders fight harder next to their own camp
  const home = a.tribe === 0 && dCamp[cellOf(a)] < 8 ? 1.5 : 1;
  const wall = t.tribe === 0 && has('palisade') && dCamp[cellOf(t)] < 8 ? 0.6 : 1;
  a.cd = 12; t.hp -= (0.1 + Math.random() * 0.12) * home * wall; a.flash = 4;
  if (t.hp <= 0) log(t.tribe === 0 ? `<b>${t.name}</b> погиб(ла) в бою.` : `Налётчик убит, его сразил(а) <b>${a.name}</b>.`);
}

function stepColonist(a) {
  const i = cellOf(a), T = temp[i];
  // needs: the body reads the temperature field directly
  a.food -= 0.0006;
  if (a.task !== 'sleep' || dCamp[i] !== 0) a.rest -= 0.00045;
  if (T < 14) a.warm -= (14 - T) * 0.00012; else if (T > 18) a.warm = Math.min(1, a.warm + 0.003);
  a.food = Math.max(0, a.food); a.rest = Math.max(0, a.rest); a.warm = clamp(a.warm, 0, 1);
  if (a.food <= 0) a.hp -= 0.0008;
  if (a.warm < 0.15) a.hp -= 0.0007;
  if (T > 70) a.hp -= Math.min(0.005, (T - 70) * 0.00004);
  if (a.food > 0.4 && a.warm > 0.4 && T < 45) a.hp = Math.min(1, a.hp + 0.0003);
  if (a.hp <= 0) { log(`<b>${a.name}</b> не пережил(а) ${a.food <= 0 ? 'голода' : a.warm < 0.15 ? 'холода' : T > 60 ? 'пожара' : 'ран'}.`); return; }
  a.sleeping = false;

  // reflex: fire overrides everything
  if (a.task !== 'douse' && (T > 55 || nearFire(a, 1.5))) a.task = 'flee';
  if (a.task === 'douse' && (T > 58 || a.hp < 0.6)) a.task = 'flee';
  if (a.task !== 'flee' && --a.think <= 0) { a.think = 15; const busy = (a.task === 'gather' || a.task === 'chop') && a.carry && a.n > 0; if (!busy) decide(a); }
  if (!a.task) decide(a);

  switch (a.task) {
    case 'flee': {
      // escape along the "safe" flow field: it routes around burning and hot cells
      const r = follow(a, dSafe, 1.35);
      if (r !== 'moving') fleeLocal(a, i);
      if (T < ambientTemp() + 16 && !nearFire(a, 3)) { a.task = null; a.think = 0; }
      break;
    }
    case 'fight': {
      const t = a.tgt;
      if (!t || t.hp <= 0 || !agents.includes(t)) { a.task = null; a.think = 0; break; }
      const d = Math.hypot(t.x - a.x, t.y - a.y);
      if (d > 0.9) { moveToward(a, t.x, t.y, 1.1); if (!walkable(cellOf(a))) follow(a, dCamp); } else attack(a, t);
      break;
    }
    case 'eat': {
      const r = follow(a, dCamp);
      if (r === 'arrived') {
        if (stock.food >= 1) { stock.food -= 1; a.food = 1; a.task = null; a.think = 0; }
        else { a.task = 'gather'; a.eatDirect = true; }
      }
      break;
    }
    case 'sleep': case 'warm': {
      const r = follow(a, dCamp);
      if (r === 'arrived') {
        if (a.task === 'sleep') {
          const beds = Math.min(1, 4 * count('hut') / Math.max(1, colonistPop()));
          a.sleeping = true; a.rest = Math.min(1, a.rest + 0.004 * (1 + 0.6 * beds));
          if (beds > 0) a.warm = Math.min(1, a.warm + 0.002 * beds);
          if (a.rest >= 1) { a.task = null; a.think = 0; }
        }
        else if (a.warm > 0.92) { a.task = null; a.think = 0; }
        // drift inside the camp so people don't stack
        if (Math.random() < 0.05) { const c = camp.cells[(Math.random() * camp.cells.length) | 0]; a.tx = (c % W) + 0.2 + Math.random() * 0.6; a.ty = ((c / W) | 0) + 0.2 + Math.random() * 0.6; }
        if (a.tx != null) moveToward(a, a.tx, a.ty, 0.5);
      }
      break;
    }
    case 'gather': case 'chop': {
      const isFood = a.task === 'gather', cap = isFood ? 3 : 2, kind = isFood ? 'food' : 'wood';
      if (a.carry === kind && (a.n >= cap || (a.eatDirect && a.n >= 1))) {
        if (a.eatDirect) { a.food = Math.min(1, a.food + 0.4 * a.n); a.n = 0; a.carry = null; a.task = null; a.think = 0; break; }
        if (follow(a, dCamp) === 'arrived') { stock[kind] += a.n * yieldOf(kind); a.n = 0; a.carry = null; a.task = null; a.think = 0; }
        break;
      }
      const field = isFood ? food : wood, dist = isFood ? dFood : dWood;
      const r = follow(a, dist);
      if (r === 'arrived') {
        if (field[i] > (isFood ? 0.3 : 0.25) && fire[i] === 0) {
          if (++a.work >= (isFood ? 12 : has('sawmill') ? 16 : 26)) {
            a.work = 0; field[i] -= isFood ? 0.34 : 0.35; a.carry = kind; a.n++;
            if (!isFood && wood[i] < 0.1) { terr[i] = GRASS; fuel[i] = 0.4; wood[i] = 0; }
            dirty[kind] = true;
          }
        } else { dirty[kind] = true; a.work = 0; }
      } else if (r === 'none') { if (a.n > 0) a.n = isFood ? 3 : 2; else { a.task = 'idle'; a.think = 20; } }
      break;
    }
    case 'build': {
      const site = bld[i] >= 0 ? bById(bld[i]) : null;
      if (site && !site.done && fire[i] === 0) {
        site.progress++; a.work++;
        if (site.progress >= BUILDINGS[site.key].work) finishBuilding(site);
      } else {
        const r = follow(a, dSite);
        if (r === 'none' || (r === 'arrived' && !site)) { dirty.site = true; a.task = null; a.think = 10; }
        else if (r === 'arrived' && site && site.done) { a.task = null; a.think = 0; }
      }
      break;
    }
    case 'mine': {
      if (a.carry === 'stone' && a.n >= 2) {
        if (follow(a, dCamp) === 'arrived') { stock.stone += a.n; a.n = 0; a.carry = null; a.task = null; a.think = 0; }
        break;
      }
      const r = follow(a, dRock);
      if (r === 'arrived') { if (++a.work >= 30) { a.work = 0; a.carry = 'stone'; a.n++; } }
      else if (r === 'none') { a.task = 'idle'; a.think = 30; }
      break;
    }
    case 'douse': {
      if (fireNearCamp === 0) { a.task = null; a.think = 0; break; }
      if (nearFire(a, 1.7)) {
        const cx = a.x | 0, cy = a.y | 0;
        for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue; const j = y * W + x;
          if ((x + 0.5 - a.x) ** 2 + (y + 0.5 - a.y) ** 2 > 2.9) continue;
          if (fire[j] > 0) { fire[j] = Math.max(0, fire[j] - (has('well') ? 0.1 : 0.05)); temp[j] -= 6; if (fire[j] === 0) temp[j] = Math.min(temp[j], 60); }
        }
      } else if (follow(a, dFire) !== 'moving') { a.task = null; a.think = 10; }
      break;
    }
    case 'idle': default: {
      if (follow(a, dCamp) === 'arrived' && Math.random() < 0.03) { a.tx = camp.x - 2 + Math.random() * 5; a.ty = camp.y - 2 + Math.random() * 5; }
      if (a.tx != null && dCamp[i] < 4) moveToward(a, a.tx, a.ty, 0.4);
      break;
    }
  }
  if (a.cd > 0) a.cd--;
}

function stepRaider(a) {
  const i = cellOf(a), T = temp[i];
  if (T > 60) a.hp -= Math.min(0.006, (T - 60) * 0.00005);
  if (a.hp <= 0) return;
  if (T > 50 || nearFire(a, 1.5)) { if (follow(a, dSafe, 1.35) !== 'moving') fleeLocal(a, i); return; }
  if (a.hp < 0.3 && a.task !== 'leave') { a.task = 'leave'; }
  if (a.task !== 'leave') { const e = nearestEnemy(a, 10); if (e) { a.task = 'fight'; a.tgt = e; } else if (a.task === 'fight') a.task = a.stolen ? 'leave' : 'camp'; }
  if (a.task === 'fight') {
    const t = a.tgt; if (!t || t.hp <= 0 || !agents.includes(t)) { a.task = a.stolen ? 'leave' : 'camp'; }
    else { const d = Math.hypot(t.x - a.x, t.y - a.y); if (d > 0.9) { moveToward(a, t.x, t.y, 1.05); if (!walkable(cellOf(a))) follow(a, dCamp); } else attack(a, t); }
  } else if (a.task === 'camp') {
    if (follow(a, dCamp) === 'arrived') {
      const loot = has('palisade') ? 0.5 : 1, tf = Math.min(stock.food, 5 * loot), tw = Math.min(stock.wood, 4 * loot), ts = Math.min(stock.stone, 3 * loot); stock.stone -= ts; stock.food -= tf; stock.wood -= tw; a.stolen = true; if (tf + tw > 0.5 && tick - lastSteal > 40) log(`Налётчики грабят склад.`); lastSteal = tick; a.task = 'leave';
    }
  } else if (a.task === 'leave') {
    if (follow(a, dEdge) === 'arrived') a.gone = true;
  }
  if (a.cd > 0) a.cd--;
}

function separate() {
  for (let p = 0; p < agents.length; p++) for (let q = p + 1; q < agents.length; q++) {
    const A = agents[p], B = agents[q]; const dx = B.x - A.x, dy = B.y - A.y, d2 = dx * dx + dy * dy;
    if (d2 < 0.16 && d2 > 1e-6) { const d = Math.sqrt(d2), push = (0.4 - d) * 0.25, ux = dx / d * push, uy = dy / d * push;
      const ax = A.x - ux, ay = A.y - uy, bx = B.x + ux, by = B.y + uy;
      if (walkable(clamp(ay | 0, 0, H - 1) * W + clamp(ax | 0, 0, W - 1))) { A.x = ax; A.y = ay; }
      if (walkable(clamp(by | 0, 0, H - 1) * W + clamp(bx | 0, 0, W - 1))) { B.x = bx; B.y = by; } }
  }
}

function stepAgents() {
  for (const a of agents) { if (a.tribe === 0) stepColonist(a); else stepRaider(a); if (a.flash) a.flash--; }
  agents = agents.filter(a => a.hp > 0 && !a.gone);
  if (selected && !agents.includes(selected)) selected = null;
  separate();
  // newcomers arrive while the colony is fed
  if (tick % 900 === 0 && stock.food > colonistPop() * 5 && colonistPop() < popCap()) {
    const e = randomEdgeCell(); if (e >= 0) { const a = spawnColonist((e % W) + 0.5, ((e / W) | 0) + 0.5); log(`К лагерю пришла новая душа: <b>${a.name}</b>.`); }
  }
}
function plural(n, one, few, many) { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many; }
function randomEdgeCell() {
  for (let k = 0; k < 200; k++) {
    const s = (Math.random() * 4) | 0, t = Math.random();
    const x = s === 0 ? 0 : s === 1 ? W - 1 : (t * W) | 0, y = s === 2 ? 0 : s === 3 ? H - 1 : (t * H) | 0;
    const i = y * W + x; if (walkable(i) && dCamp[i] < 1e8 && dCamp[i] > 40) return i;
  }
  return -1;
}
function raid() {
  const e = randomEdgeCell(); if (e < 0) { log('Налётчики не нашли дороги к лагерю.'); return; }
  const n = 2 + Math.floor(colonistPop() / 4), ex = e % W, ey = (e / W) | 0;
  for (let k = 0; k < n; k++) spawnRaider(clamp(ex + Math.random() * 3 - 1.5, 0.2, W - 0.2), clamp(ey + Math.random() * 3 - 1.5, 0.2, H - 0.2));
  const side = ex === 0 ? 'запада' : ex === W - 1 ? 'востока' : ey === 0 ? 'севера' : 'юга';
  log(`Набег! ${n} ${plural(n, 'налётчик', 'налётчика', 'налётчиков')} из «Серых волков» ${n === 1 ? 'идёт' : 'идут'} с ${side}.`);
}

// ───────────────────────────── world events from the start menu
function stepEvents() {
  if (tick >= nextRaid) {
    if (colonistPop() > 0) raid();
    nextRaid = tick + RAIDS[cfg.raids].every * (0.6 + Math.random() * 0.8);
  }
  if (cfg.lightning) {
    const h = hourOf(tick), dry = cfg.climate === 'dry' ? 2 : cfg.climate === 'cold' ? 0.4 : 1;
    if (h > 11 && h < 19 && Math.random() < 0.00025 * dry * N / 12288) {
      for (let k = 0; k < 40; k++) {
        const i = (Math.random() * N) | 0, x = i % W, y = (i / W) | 0;
        if (terr[i] !== FOREST || fire[i] > 0 || (x - camp.x) ** 2 + (y - camp.y) ** 2 < 22 * 22) continue;
        fire[i] = 0.7; temp[i] = 350; dirty.fire = true;
        log(`Молния ударила в лес в ${Math.round(Math.hypot(x - camp.x, y - camp.y))} клетках от лагеря.`);
        break;
      }
    }
  }
}

// ───────────────────────────── tick
function stepSim() {
  let t0 = performance.now(); stepFields(); let t1 = performance.now();
  stepNav(); let t2 = performance.now();
  stepAgents(); stepEvents(); let t3 = performance.now();
  perf.f = perf.f * 0.95 + (t1 - t0) * 0.05; perf.n = perf.n * 0.95 + (t2 - t1) * 0.05; perf.a = perf.a * 0.95 + (t3 - t2) * 0.05;
  tick++;
}

// ───────────────────────────── tools
function applyTool(cx, cy) {
  if (tool === 'ignite') {
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) { if (x < 0 || y < 0 || x >= W || y >= H) continue; const i = y * W + x; if (fuel[i] > 0.05) { fire[i] = 0.6; temp[i] = 300; } }
    dirty.fire = true; log('Кто-то поджёг траву.');
  } else if (tool === 'rain') {
    for (let y = cy - 7; y <= cy + 7; y++) for (let x = cx - 7; x <= cx + 7; x++) { if (x < 0 || y < 0 || x >= W || y >= H) continue; if ((x - cx) ** 2 + (y - cy) ** 2 > 49) continue; const i = y * W + x; fire[i] = 0; temp[i] = Math.min(temp[i], ambientTemp() - 2); smoke[i] *= 0.3; }
    dirty.fire = true; log('Прошёл короткий ливень.');
  } else {
    let b = null, bd = 4; for (const a of agents) { const d = (a.x - cx - 0.5) ** 2 + (a.y - cy - 0.5) ** 2; if (d < bd) { bd = d; b = a; } }
    selected = b; renderPeople(true);
  }
}

// ───────────────────────────── rendering
const cv = document.getElementById('map'), ctx = cv.getContext('2d');
let off, octx, terrImg, offF, fctx, fieldImg, offG, gctx, glowImg, offS, sctx, smokeImg;
function mkLayer() { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); return [c, x, x.createImageData(W, H)]; }
// called after every world generation: offscreen layers are 1 px per cell, the main canvas is W·S × H·S
function setupRender() {
  [off, octx, terrImg] = mkLayer(); [offF, fctx, fieldImg] = mkLayer(); [offG, gctx, glowImg] = mkLayer(); [offS, sctx, smokeImg] = mkLayer();
  cv.width = W * S; cv.height = H * S;
}
const TSTOPS = [[-5, 52, 84, 196], [8, 64, 150, 186], [16, 104, 186, 102], [24, 222, 206, 84], [45, 240, 132, 46], [120, 220, 44, 40], [500, 255, 236, 214]];
function tempColor(t) {
  if (t <= TSTOPS[0][0]) return TSTOPS[0].slice(1);
  for (let k = 1; k < TSTOPS.length; k++) if (t <= TSTOPS[k][0]) { const a = TSTOPS[k - 1], b = TSTOPS[k], f = (t - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f]; }
  return TSTOPS[TSTOPS.length - 1].slice(1);
}
function paintTerrain() {
  const d = terrImg.data;
  for (let i = 0; i < N; i++) {
    const t = terr[i], h = hgt[i], f = fert[i]; let r, g, b;
    if (t === WATER) { r = 30 + h * 40; g = 64 + h * 60; b = 86 + h * 50; }
    else if (t === GRASS) { r = 98 - f * 26 + h * 20; g = 112 + f * 18 + h * 16; b = 56 - f * 8; }
    else if (t === FOREST) { const w = wood[i]; r = 40 + (1 - w) * 30; g = 70 + (1 - w) * 30; b = 40 + (1 - w) * 8; }
    else if (t === ROCK) { r = 100 + h * 30; g = 97 + h * 28; b = 88 + h * 24; }
    else { r = 50; g = 43; b = 37; }
    if (bush[i] && food[i] > 0.2) { const k = food[i] * 0.55; r = r * (1 - k) + 196 * k; g = g * (1 - k) + 92 * k; b = b * (1 - k) + 149 * k; }
    const o = i * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
  }
  octx.putImageData(terrImg, 0, 0);
}
function paintGlowSmoke() {
  const g = glowImg.data, s = smokeImg.data;
  for (let i = 0; i < N; i++) {
    const f = fire[i], o = i * 4, hot = clamp((temp[i] - 60) / 400, 0, 1);
    g[o] = 255; g[o + 1] = 120 + f * 90; g[o + 2] = 40 + f * 40; g[o + 3] = Math.min(255, f * 255 + hot * 120);
    const sm = Math.min(1, smoke[i] * 0.6); s[o] = 150; s[o + 1] = 150; s[o + 2] = 144; s[o + 3] = sm * 190;
  }
  gctx.putImageData(glowImg, 0, 0); sctx.putImageData(smokeImg, 0, 0);
}
function paintField() {
  const d = fieldImg.data;
  for (let i = 0; i < N; i++) {
    const o = i * 4; let r = 0, g = 0, b = 0, a = 0;
    if (layer === 'temp') { [r, g, b] = tempColor(temp[i]); a = 205; }
    else if (layer === 'res') {
      if (food[i] > 0.05) { r = 214; g = 84; b = 160; a = 60 + food[i] * 190; }
      else if (terr[i] === FOREST) { r = 120; g = 210; b = 90; a = wood[i] * 170; }
      else { r = 20; g = 20; b = 16; a = 150; }
    } else if (layer === 'nav') {
      const v = dCamp[i]; if (v >= 1e8) { r = 20; g = 16; b = 16; a = 170; }
      else { const band = Math.floor(v / 8) % 2; const k = clamp(v / 140, 0, 1); r = 98 + 120 * k; g = 198 - 90 * k; b = 185 - 100 * k; a = band ? 120 : 70; }
    }
    d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a;
  }
  fctx.putImageData(fieldImg, 0, 0);
}
function render() {
  const t0 = performance.now();
  paintTerrain(); paintGlowSmoke();
  ctx.imageSmoothingEnabled = false; ctx.drawImage(off, 0, 0, W * S, H * S);
  ctx.imageSmoothingEnabled = true;
  if (layer !== 'world') { paintField(); ctx.drawImage(offF, 0, 0, W * S, H * S); }
  ctx.drawImage(offS, 0, 0, W * S, H * S);
  // night
  const night = nightness();
  if (layer === 'world' && night > 0) { ctx.fillStyle = `rgba(8,12,30,${night * 0.62})`; ctx.fillRect(0, 0, W * S, H * S); }
  // light: fire glow (two passes: crisp + soft halo) and the campfire
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(offG, 0, 0, W * S, H * S);
  ctx.globalAlpha = 0.55; ctx.drawImage(offG, -S * 1.5, -S * 1.5, W * S + S * 3, H * S + S * 3); ctx.globalAlpha = 1;
  if (campLit) {
    const cx = (camp.x + 0.5) * S, cy = (camp.y + 0.5) * S, fl = 0.9 + Math.random() * 0.1;
    const gr = ctx.createRadialGradient(cx, cy, 2, cx, cy, S * 9 * fl);
    gr.addColorStop(0, `rgba(255,160,70,${0.55 + night * 0.25})`); gr.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, S * 9, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  // camp ring
  ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(231,227,207,0.55)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc((camp.x + 0.5) * S, (camp.y + 0.5) * S, S * 3.4, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  ctx.fillStyle = campLit ? '#ffb15a' : '#5a4a3a'; ctx.beginPath(); ctx.arc((camp.x + 0.5) * S, (camp.y + 0.5) * S, S * 0.55, 0, Math.PI * 2); ctx.fill();
  // flow arrows toward camp
  if (layer === 'nav') {
    ctx.strokeStyle = 'rgba(240,236,220,0.75)'; ctx.lineWidth = 1;
    for (let y = 2; y < H; y += 4) for (let x = 2; x < W; x += 4) {
      const i = y * W + x; if (dCamp[i] >= 1e8 || dCamp[i] === 0) continue;
      let bj = -1, bd = dCamp[i]; for (let k = 0; k < 8; k++) { const nx = x + DX[k], ny = y + DY[k]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; if (dCamp[j] < bd) { bd = dCamp[j]; bj = j; } }
      if (bj < 0) continue; const ddx = (bj % W) - x, ddy = ((bj / W) | 0) - y, l = Math.hypot(ddx, ddy);
      const px = (x + 0.5) * S, py = (y + 0.5) * S, ux = ddx / l, uy = ddy / l, L = S * 1.4;
      ctx.beginPath(); ctx.moveTo(px - ux * L, py - uy * L); ctx.lineTo(px + ux * L, py + uy * L);
      ctx.lineTo(px + ux * L - (ux * 0.8 - uy * 0.5) * S * 0.8, py + uy * L - (uy * 0.8 + ux * 0.5) * S * 0.8); ctx.stroke();
    }
  }
  // buildings: finished ones are solid blocks with a letter, sites are dashed with a progress bar
  for (const b of buildings) {
    const d = BUILDINGS[b.key], x = b.x * S, y = b.y * S, w = 2 * S;
    if (b.done) {
      ctx.fillStyle = d.color; ctx.fillRect(x + 1, y + 1, w - 2, w - 2);
      ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 1, y + 1, w - 2, w - 2);
      if (S >= 5) { ctx.fillStyle = '#14160f'; ctx.font = `bold ${Math.max(8, S * 0.95)}px "PT Sans", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d.mark, x + w / 2, y + w / 2 + 1); ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic'; }
    } else {
      ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = d.color; ctx.lineWidth = 1.5; ctx.strokeRect(x + 1, y + 1, w - 2, w - 2); ctx.restore();
      ctx.fillStyle = 'rgba(20,22,15,0.7)'; ctx.fillRect(x, y + w + 1, w, 3);
      ctx.fillStyle = d.color; ctx.fillRect(x, y + w + 1, w * b.progress / d.work, 3);
    }
  }
  // agents
  for (const a of agents) {
    const px = a.x * S, py = a.y * S, r = Math.max(S * 0.62, 3.4);
    if (a === selected) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, r + 4, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = a.tribe === 0 ? (a.sleeping ? '#3f8a80' : '#62c6b9') : '#d9585e';
    ctx.strokeStyle = '#0e100b'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (a.flash) { ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, r + 2, 0, Math.PI * 2); ctx.stroke(); }
    if (a.carry && a.n > 0) { ctx.fillStyle = a.carry === 'food' ? '#c45c95' : a.carry === 'stone' ? '#b9b4a6' : '#a5794a'; ctx.fillRect(px + r * 0.4, py - r * 1.1, S * 0.55, S * 0.55); }
    if (a.hp < 0.999) { ctx.fillStyle = '#2a1414'; ctx.fillRect(px - S, py + r + 2, S * 2, 2); ctx.fillStyle = a.hp > 0.5 ? '#8fbf5a' : '#e0b040'; ctx.fillRect(px - S, py + r + 2, S * 2 * clamp(a.hp, 0, 1), 2); }
    if (a.task === 'flee') { ctx.fillStyle = '#ffe0a0'; ctx.font = `bold ${S * 1.6}px PT Sans, sans-serif`; ctx.fillText('!', px + r, py - r); }
  }
  perf.r = perf.r * 0.9 + (performance.now() - t0) * 0.1;
}

// ───────────────────────────── panel
const $ = id => document.getElementById(id);
function esc(s) { return String(s).replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c])); }
function log(html) { logLines.unshift(`<div><span>${clockStr()}</span> · <b>${html}</b></div>`); if (logLines.length > 40) logLines.pop(); const el = $('log'); if (el) el.innerHTML = logLines.join(''); }
const DIRS = ['восточный', 'юго-восточный', 'южный', 'юго-западный', 'западный', 'северо-западный', 'северный', 'северо-восточный'];
function bar(v, c) { return `<div class="bar"><i style="width:${(clamp(v, 0, 1) * 100).toFixed(0)}%;background:${c}"></i></div>`; }
function renderPeople(force) {
  const col = agents.filter(a => a.tribe === 0);
  $('people').innerHTML = col.map(a => `<div class="person${a === selected ? ' sel' : ''}" data-id="${a.id}">
    <span class="nm">${esc(a.name)}</span><span class="task">${TASK_RU[a.task || 'idle']}${a.carry && a.n ? ` · несёт ${a.n}` : ''}</span>
    <div class="bars" title="сытость · бодрость · тепло · здоровье">${bar(a.food, 'var(--food)')}${bar(a.rest, '#7d9be0')}${bar(a.warm, 'var(--ember)')}${bar(a.hp, 'var(--good)')}</div></div>`).join('') || '<div class="task">Колония погибла. Откройте «Меню мира», чтобы начать заново.</div>';
}
let buildSig = '';
function costHtml(cost) {
  return Object.entries(cost).map(([r, v]) => `<span class="cost${stock[r] >= v ? '' : ' short'}">${v} ${RES_RU[r]}</span>`).join('');
}
// rebuilt only when something visible changes, so buttons are not replaced under the cursor
function renderBuildPanel(force) {
  const rows = Object.keys(BUILDINGS).map(k => {
    const st = buildStatus(k), site = buildings.find(b => b.key === k && !b.done);
    return [k, st.ok, st.why, count(k), site ? Math.floor(site.progress / BUILDINGS[k].work * 20) : -1];
  });
  const sig = JSON.stringify(rows) + Object.values(BUILDINGS).map(d => Object.entries(d.cost).map(([r, v]) => stock[r] >= v)).join();
  if (!force && sig === buildSig) return; buildSig = sig;
  $('build').innerHTML = rows.map(([k, ok, why, n, prog]) => {
    const d = BUILDINGS[k];
    const state = prog >= 0 ? `<span class="bstate">строится ${prog * 5}%</span>` : n ? `<span class="bstate done">построено${d.max > 1 ? ' ×' + n : ''}</span>` : '';
    return `<div class="bcard"><div class="bhead"><i class="bmark" style="background:${d.color}">${d.mark}</i><b>${d.name}</b>${state}</div>
      <p>${d.effect}</p>
      <div class="bfoot"><span class="costs">${costHtml(d.cost)}</span>
      <button type="button" data-b="${k}" ${ok ? '' : 'disabled'} title="${why}">${ok ? 'Заложить' : why}</button></div></div>`;
  }).join('');
}
let lastTicks = 0, lastTpsT = performance.now();
function renderPanel() {
  $('clock').textContent = clockStr();
  $('amb').textContent = ambientTemp().toFixed(1) + ' °C';
  $('windTxt').textContent = wind.str < 0.03 ? 'штиль' : `${DIRS[Math.round((((wind.dir + 180) % 360) / 45)) % 8]}, ${(wind.str * 10).toFixed(1)} м/с`;
  $('fires').textContent = fireCount;
  const pop = colonistPop(), raiders = agents.length - pop;
  $('sFood').textContent = stock.food.toFixed(1); $('sWood').textContent = stock.wood.toFixed(1); $('sStone').textContent = stock.stone.toFixed(1);
  $('pop').title = `лагерь примет до ${popCap()} жителей`;
  $('sFire').textContent = campLit ? 'горит' : stock.wood > 0.05 ? 'не нужен' : 'нет дров';
  $('pop').textContent = pop + (raiders ? ` · налётчиков ${raiders}` : '');
  $('pFlabel').textContent = `Поля (${N.toLocaleString('ru-RU')} клеток)`;
  $('pF').textContent = perf.f.toFixed(2); $('pN').textContent = perf.n.toFixed(2); $('pA').textContent = perf.a.toFixed(2); $('pR').textContent = perf.r.toFixed(2);
  const now = performance.now(); const tps = (tick - lastTicks) / ((now - lastTpsT) / 1000); lastTicks = tick; lastTpsT = now; perf.tps = tps; $('pT').textContent = speed ? tps.toFixed(0) : '0';
  renderPeople();
  renderBuildPanel();
}

// ───────────────────────────── input
let hoverCell = -1;
function eventCell(e) { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / r.width * W), Math.floor((e.clientY - r.top) / r.height * H)]; }
cv.addEventListener('pointermove', e => { const [x, y] = eventCell(e); hoverCell = x >= 0 && y >= 0 && x < W && y < H ? y * W + x : -1; });
cv.addEventListener('pointerleave', () => { hoverCell = -1; });
cv.addEventListener('pointerdown', e => { const [x, y] = eventCell(e); if (x >= 0 && y >= 0 && x < W && y < H) applyTool(x, y); });
const TN = ['вода', 'трава', 'лес', 'скала', 'гарь'];
function renderReadout() {
  const el = $('readout');
  if (selected) { const a = selected; el.textContent = `${a.name}: ${TASK_RU[a.task || 'idle']} · сытость ${(a.food * 100) | 0}% · бодрость ${(a.rest * 100) | 0}% · тепло ${(a.warm * 100) | 0}% · здоровье ${(a.hp * 100) | 0}% · под ногами ${temp[cellOf(a)].toFixed(1)} °C`; return; }
  if (hoverCell < 0) return;
  const i = hoverCell;
  el.textContent = `(${i % W}, ${(i / W) | 0}) ${TN[terr[i]]} · ${temp[i].toFixed(1)} °C · топливо ${fuel[i].toFixed(2)} · огонь ${fire[i].toFixed(2)} · дым ${smoke[i].toFixed(2)} · ягоды ${food[i].toFixed(2)} · древесина ${wood[i].toFixed(2)} · путь до лагеря ${dCamp[i] >= 1e8 ? 'нет' : dCamp[i].toFixed(0)}`;
}
function seg(id, attr, cb) {
  const box = $(id);
  box.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; box.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); cb(b.dataset[attr]); });
}
seg('tools', 'tool', v => { tool = v; if (v !== 'inspect') { selected = null; } });
seg('layers', 'layer', v => { layer = v; });
seg('speeds', 'speed', v => { speed = +v; });
$('people').addEventListener('click', e => { const p = e.target.closest('.person'); if (!p) return; const a = agents.find(x => x.id === +p.dataset.id); selected = selected === a ? null : a; renderPeople(); });
$('windDir').addEventListener('input', e => { wind.dir = +e.target.value; setWind(); });
$('windStr').addEventListener('input', e => { wind.str = +e.target.value / 100; setWind(); });
$('raid').addEventListener('click', raid);
$('build').addEventListener('click', e => { const b = e.target.closest('button[data-b]'); if (b && !b.disabled) orderBuilding(b.dataset.b); });
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && running && e.target === document.body) { e.preventDefault(); const nv = speed ? 0 : 1; speed = nv; $('speeds').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.speed === nv)); }
});

// ───────────────────────────── start menu
const OPTS = {
  size: Object.entries(SIZES).map(([k, v]) => [k, v.label]),
  water: LEVELS3.map((l, i) => [i, l]), forest: LEVELS3.map((l, i) => [i, l]), rock: LEVELS3.map((l, i) => [i, l]),
  climate: Object.entries(CLIMATES).map(([k, v]) => [k, v.label]),
  stock: Object.entries(STOCKS).map(([k, v]) => [k, v.label]),
  raids: Object.entries(RAIDS).map(([k, v]) => [k, v.label]),
};
let menuCfg = loadCfg();
function loadCfg() {
  try { const raw = localStorage.getItem('forest.cfg'); if (raw) return {...DEFAULT_CFG, ...JSON.parse(raw)}; } catch (e) { /* storage unavailable */ }
  return {...DEFAULT_CFG};
}
function saveCfg() { try { localStorage.setItem('forest.cfg', JSON.stringify(menuCfg)); } catch (e) { /* storage unavailable */ } }
function syncMenu() {
  $('cfgName').value = menuCfg.name; $('cfgSeed').value = menuCfg.seed;
  $('cfgColonists').value = menuCfg.colonists; $('colonistsOut').textContent = menuCfg.colonists;
  $('cfgLightning').checked = !!menuCfg.lightning;
  document.querySelectorAll('#menu .seg[data-key]').forEach(box => {
    const key = box.dataset.key;
    box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val) === String(menuCfg[key])));
  });
  $$note('size', `${SIZES[menuCfg.size].note}`);
  $$note('climate', CLIMATES[menuCfg.climate].note);
  schedulePreview();
}
function $$note(key, text) { const el = document.querySelector(`[data-note="${key}"]`); if (el) el.textContent = text; }
function buildMenu() {
  document.querySelectorAll('#menu .seg[data-key]').forEach(box => {
    const key = box.dataset.key;
    box.innerHTML = OPTS[key].map(([v, l]) => `<button type="button" data-val="${v}" aria-pressed="false">${l}</button>`).join('');
    box.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const v = b.dataset.val; menuCfg[key] = typeof DEFAULT_CFG[key] === 'number' ? +v : v;
      saveCfg(); syncMenu();
    });
  });
  $('cfgName').addEventListener('input', e => { menuCfg.name = e.target.value.trim() || DEFAULT_CFG.name; saveCfg(); });
  $('cfgSeed').addEventListener('input', e => { menuCfg.seed = e.target.value.trim() || '1'; saveCfg(); schedulePreview(); });
  $('seedRandom').addEventListener('click', () => { menuCfg.seed = String(100000 + Math.floor(Math.random() * 899999)); saveCfg(); syncMenu(); });
  $('cfgColonists').addEventListener('input', e => { menuCfg.colonists = +e.target.value; $('colonistsOut').textContent = menuCfg.colonists; saveCfg(); });
  $('cfgLightning').addEventListener('change', e => { menuCfg.lightning = e.target.checked; saveCfg(); });
  $('resetCfg').addEventListener('click', () => { menuCfg = {...DEFAULT_CFG}; saveCfg(); syncMenu(); });
  $('startGame').addEventListener('click', startGame);
  $('backToGame').addEventListener('click', () => showGame());
  $('openMenu').addEventListener('click', showMenu);
}
// terrain preview: same generator as the game, so the preview is exactly the world you get
let previewTimer = 0;
function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(drawPreview, 60); }
function drawPreview() {
  const t = makeTerrain(menuCfg), pc = $('preview'), px = pc.getContext('2d');
  pc.width = t.w; pc.height = t.h;
  const img = px.createImageData(t.w, t.h), d = img.data, n = t.w * t.h; const cnt = [0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const tt = t.terr[i], h = t.hgt[i], f = t.fert[i]; cnt[tt]++;
    let r, g, b;
    if (tt === WATER) { r = 30 + h * 40; g = 64 + h * 60; b = 86 + h * 50; }
    else if (tt === GRASS) { r = 98 - f * 26 + h * 20; g = 112 + f * 18 + h * 16; b = 56 - f * 8; }
    else if (tt === FOREST) { r = 46; g = 76; b = 42; }
    else { r = 100 + h * 30; g = 97 + h * 28; b = 88 + h * 24; }
    const o = i * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
  }
  px.putImageData(img, 0, 0);
  px.strokeStyle = '#ffffff'; px.lineWidth = Math.max(1, t.w / 128);
  px.beginPath(); px.arc(t.cx + 0.5, t.cy + 0.5, 4.5, 0, Math.PI * 2); px.stroke();
  const pct = k => (cnt[k] / n * 100).toFixed(0) + '%';
  $('previewStats').innerHTML = `<dt>Клеток</dt><dd>${n.toLocaleString('ru-RU')}</dd><dt>Вода</dt><dd>${pct(WATER)}</dd><dt>Лес</dt><dd>${pct(FOREST)}</dd><dt>Луга</dt><dd>${pct(GRASS)}</dd><dt>Скалы</dt><dd>${pct(ROCK)}</dd><dt>Числовой сид</dt><dd>${seedNumber(menuCfg.seed)}</dd>`;
}
function showMenu() {
  running = false;
  $('menu').hidden = false; $('game').hidden = true; $('explain').hidden = true;
  $('backToGame').hidden = !agents;
  $('colonyName').textContent = 'Тёплый Брод';
  $('worldInfo').textContent = 'Выберите размер мира, сид и условия жизни. На превью — карта, которая получится.';
  syncMenu();
}
function showGame() {
  $('menu').hidden = true; $('game').hidden = false; $('explain').hidden = false;
  $('colonyName').textContent = cfg.name;
  const sz = SIZES[cfg.size];
  $('worldInfo').textContent = `Мир ${sz.w} × ${sz.h}, сид «${cfg.seed}», климат ${CLIMATES[cfg.climate].label.toLowerCase()}, набеги: ${RAIDS[cfg.raids].label.toLowerCase()}${cfg.lightning ? ', молнии' : ''}.`;
  $('windDir').value = wind.dir; $('windStr').value = Math.round(wind.str * 100);
  running = true; last = performance.now(); acc = 0;
  renderPanel();
}
function startGame() { saveCfg(); generate(menuCfg); showGame(); }

// ───────────────────────────── main loop: fixed 20 ticks/s at 1×, render every frame
let acc = 0, last = performance.now(), panelT = 0;
function frame(now) {
  if (running) {
    const dt = Math.min(250, now - last); last = now;
    acc += dt * speed; let n = 0;
    // a time budget keeps the page responsive on the biggest maps at 10×
    const budget = now + 22;
    while (acc >= 50 && n < 40 && performance.now() < budget) { stepSim(); acc -= 50; n++; }
    if (acc > 500) acc = 0;
    render(); renderReadout();
    if (now - panelT > 300) { panelT = now; renderPanel(); }
  }
  requestAnimationFrame(frame);
}
buildMenu();
showMenu();
window.__forest = {orderBuilding, stepSim, generate, ignite: (x, y) => { const t = tool; tool = 'ignite'; applyTool(x, y); tool = t; }, state: () => ({stock, buildings, agents, tick})};
requestAnimationFrame(frame);
})();
