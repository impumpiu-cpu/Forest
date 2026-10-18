// Local map check: the same site gives the same map, the terrain follows the site (water and rock
// shares, every biome of the region present and lying where the moisture puts it, forest within the
// biomes' tree cover), the camp stands on open ground and is joined to every edge of the map, every
// ore the region has shows on a rock face, lakes are where fish can live, and all the terrain records
// hold together. Prints the terrain shares of each map.
// Usage: node tools/map-check.mjs [seeds=4] [size=medium]
import {makeTerrain} from '../src/world/generate.js';
import {makeSite} from '../src/world/site.js';
import {newGame} from '../src/sim.js';
import {DEFAULT_CFG, SIZES} from '../src/data/presets.js';
import {TERRAIN, BY_CODE, T, WALKABLE, OPEN} from '../src/data/terrain.js';
import {BIOMES} from '../src/data/biomes.js';
import {PLANTS} from '../src/data/plants.js';
import {REGIONS} from '../src/data/regions.js';
import {exposedOre} from '../src/world/ores.js';
import {FISHING} from '../src/world/lakes.js';
import {FAR} from '../src/nav/navigation.js';

const seeds = +(process.argv[2] || 4), size = process.argv[3] || 'medium';
let ok = true;
const check = (what, pass, info = '') => { ok &&= pass; if (!pass || info) console.log(`${pass ? 'ok  ' : 'FAIL'} ${what}${info ? ': ' + info : ''}`); return pass; };
const pct = v => (v * 100).toFixed(0) + '%';
const hashOf = arr => { let h = 0x811c9dc5; for (let i = 0; i < arr.length; i++) h = Math.imul(h ^ arr[i], 16777619); return (h >>> 0).toString(16); };

// ── the records hold together
{
  const bad = [];
  for (const d of TERRAIN.all()) {
    if (!['ground', 'wood', 'rock', 'water'].includes(d.kind)) bad.push(`${d.id}: неизвестный kind ${d.kind}`);
    if (d.open && d.kind !== 'ground') bad.push(`${d.id}: строить можно только на земле`);
    if (d.open && !d.walkable) bad.push(`${d.id}: открытая земля должна быть проходимой`);
    if (BY_CODE[d.code] !== d) bad.push(`${d.id}: код ${d.code} занят`);
  }
  for (const b of BIOMES.all()) {
    if (!TERRAIN.has(b.ground)) bad.push(`биом ${b.id}: нет местности ${b.ground}`);
    else if (BY_CODE[TERRAIN.get(b.ground).code].kind !== 'ground') bad.push(`биом ${b.id}: земля ${b.ground} не ground`);
    if (!(b.fert > 0) || b.rock < 0 || b.rock > 1 || b.pools < 0 || b.pools > 1 || !(b.dry >= 0)) bad.push(`биом ${b.id}: fert / rock / pools / dry вне пределов`);
  }
  for (const p of PLANTS.all()) for (const t of p.terrain) if (!TERRAIN.has(t)) bad.push(`грядка ${p.id}: нет местности ${t}`);
  for (const r of REGIONS.all()) {
    const sum = Object.values(r.biomes).reduce((s, v) => s + v, 0);
    if (Math.abs(sum - 1) > 0.01) bad.push(`регион ${r.id}: доли биомов дают ${sum.toFixed(2)}`);
    for (const b of Object.keys(r.biomes)) if (!BIOMES.has(b)) bad.push(`регион ${r.id}: нет биома ${b}`);
  }
  check('местность, биомы, грядки и регионы сходятся', !bad.length, bad.length ? bad.slice(0, 5).join('; ') : `${TERRAIN.all().length} видов местности, ${BIOMES.all().length} биомов, ${REGIONS.all().length} регионов`);
}

const stats = {forestInBiome: {}, cellsInBiome: {}, moist: {}, maps: 0};
for (let s = 1; s <= seeds; s++) {
  const cfg = {...DEFAULT_CFG, seed: `map${s}`, size};
  const tag = `сид ${cfg.seed}`;
  const site = makeSite(cfg), t1 = makeTerrain(site), t2 = makeTerrain(site), t3 = makeTerrain(cfg);
  const n = t1.w * t1.h, cnt = {};
  for (const v of t1.terr) cnt[BY_CODE[v].id] = (cnt[BY_CODE[v].id] || 0) + 1;
  const share = id => (cnt[id] || 0) / n;
  const shares = Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v / n)}`).join(', ');
  check(`${tag} (${site.region.label}): тот же участок даёт ту же карту`, hashOf(t1.terr) === hashOf(t2.terr) && hashOf(t1.terr) === hashOf(t3.terr) && hashOf(t1.fert.map(v => Math.round(v * 1e4))) === hashOf(t2.fert.map(v => Math.round(v * 1e4))), hashOf(t1.terr));
  console.log(`     ${shares}`);
  // water and rock as the site asked (pools of the bogs come on top of the water)
  const pools = Object.entries(site.biomes).reduce((s, [b, v]) => s + (b === 'water' ? 0 : BIOMES.get(b).pools * v), 0);
  const riverShare = (t1.river?.cells.length || 0) / n;
  check(`${tag}: воды столько, сколько просит участок`, share('water') >= site.water - 0.01 && share('water') <= site.water + pools + riverShare + 0.03, `${pct(share('water'))} при ${pct(site.water)} + заводи ${pct(pools)} + река ${pct(riverShare)}`);
  check(`${tag}: скал столько, сколько просит участок`, share('rock') >= site.rock - 0.01 && share('rock') <= site.rock + 0.3, `${pct(share('rock'))} при ${pct(site.rock)}`);
  // every land biome of the region is on the map, with about its share of the land, and each land cell has a biome
  const landN = n - cnt.water - cnt.rock, byBiome = {}, forestIn = {};
  let noBiome = 0;
  for (let i = 0; i < n; i++) {
    const code = t1.terr[i]; if (BY_CODE[code].kind === 'water' || BY_CODE[code].kind === 'rock') continue;
    const b = t1.biome[i] ? BIOMES.all()[t1.biome[i] - 1].id : null;
    if (!b) { noBiome++; continue; }
    byBiome[b] = (byBiome[b] || 0) + 1;
    if (code === T.FOREST) forestIn[b] = (forestIn[b] || 0) + 1;
  }
  check(`${tag}: у каждой клетки суши есть биом`, noBiome === 0, noBiome ? `без биома ${noBiome}` : '');
  const landBiomes = Object.entries(site.biomes).filter(([b]) => b !== 'water');
  const landTotal = landBiomes.reduce((s, [, v]) => s + v, 0);
  const off = landBiomes.filter(([b, v]) => Math.abs((byBiome[b] || 0) / landN - v / landTotal) > 0.12).map(([b, v]) => `${b} ${pct((byBiome[b] || 0) / landN)} вместо ${pct(v / landTotal)}`);
  check(`${tag}: биомы региона лежат на карте в своих долях`, !off.length, off.length ? off.join('; ') : landBiomes.map(([b]) => `${b} ${pct((byBiome[b] || 0) / landN)}`).join(', '));
  // forest covers a biome up to its tree cover, and a biome's ground is its own
  const over = [], wrongGround = [];
  for (const [b] of landBiomes) {
    const B = BIOMES.get(b), cells = byBiome[b] || 0; if (!cells) continue;
    const f = (forestIn[b] || 0) / cells, lim = Math.min(1, B.trees * site.trees) + 0.08;
    if (f > lim) over.push(`${b} ${pct(f)} > ${pct(lim)}`);
    stats.forestInBiome[b] = (stats.forestInBiome[b] || 0) + (forestIn[b] || 0); stats.cellsInBiome[b] = (stats.cellsInBiome[b] || 0) + cells;
    const ground = TERRAIN.get(B.ground).code;
    let bad = 0; for (let i = 0; i < n; i++) if (t1.biome[i] === BIOMES.all().indexOf(B) + 1 && BY_CODE[t1.terr[i]].kind === 'ground' && t1.terr[i] !== ground && t1.terr[i] !== T.BURNT && t1.terr[i] !== T.ROAD) bad++;
    if (bad > 0.02 * cells) wrongGround.push(`${b}: ${bad} клеток не ${B.ground}`);
  }
  check(`${tag}: лес не гуще, чем допускает биом`, !over.length, over.join('; '));
  check(`${tag}: земля биома — его собственная (лагерь и дорога не в счёт)`, !wrongGround.length, wrongGround.join('; '));
  // the driest biome lies on drier cells than the wettest (the painter put them by moisture)
  const order = landBiomes.map(([b]) => BIOMES.get(b)).sort((a, b) => a.dry - b.dry);
  if (order.length >= 2 && !order.every(b => b.kind === 'altitude')) {
    const mean = b => { let s = 0, k = 0; for (let i = 0; i < n; i++) if (t1.biome[i] === BIOMES.all().indexOf(b) + 1) { s += t1.fert[i]; k++; } return k ? s / k : 0; };
    const dryB = order.find(b => b.kind !== 'altitude'), wetB = [...order].reverse().find(b => b.kind !== 'altitude');
    if (dryB !== wetB && dryB.dry !== wetB.dry) check(`${tag}: ${dryB.label} суше, чем ${wetB.label} (по плодородию)`, mean(dryB) <= mean(wetB) + 0.05, `${pct(mean(dryB))} / ${pct(mean(wetB))}`);
  }
  // the camp: open ground, nothing in the way around it
  const campOk = [-3, 3].every(dy => [-3, 3].every(dx => WALKABLE[t1.terr[(t1.cy + dy) * t1.w + t1.cx + dx]])) && OPEN[t1.terr[t1.cy * t1.w + t1.cx]];
  check(`${tag}: лагерь на открытой земле с проходом вокруг`, campOk, `(${t1.cx}, ${t1.cy}) ${BY_CODE[t1.terr[t1.cy * t1.w + t1.cx]].label}`);
  // the full world: the camp reaches every edge, ores show on the rock face, lakes can hold fish
  const w = newGame({...cfg, colonists: 3});
  const d = w.nav.get('camp'), edges = {'запад': 0, 'восток': 0, 'север': 0, 'юг': 0};
  for (let y = 0; y < w.h; y++) { if (d[y * w.w] < FAR) edges['запад']++; if (d[y * w.w + w.w - 1] < FAR) edges['восток']++; }
  for (let x = 0; x < w.w; x++) { if (d[x] < FAR) edges['север']++; if (d[(w.h - 1) * w.w + x] < FAR) edges['юг']++; }
  const closed = Object.entries(edges).filter(([, v]) => v === 0).map(([k]) => k);
  let reach = 0; for (let i = 0; i < w.n; i++) if (WALKABLE[w.grid.terr[i]] && d[i] < FAR) reach++;
  let walk = 0; for (let i = 0; i < w.n; i++) if (WALKABLE[w.grid.terr[i]]) walk++;
  check(`${tag}: от лагеря есть путь к краю карты`, closed.length < 4, `края ${Object.entries(edges).map(([k, v]) => `${k} ${v}`).join(', ')}; досягаемо ${pct(reach / walk)} проходимых клеток`);
  check(`${tag}: с лагеря досягаема большая часть суши`, reach / walk > 0.7, pct(reach / walk));
  // gates: on the edge, passable, joined to the camp; a road gate has a road that reaches the camp
  const gateBad = [];
  for (const g of w.gates || []) {
    if (g.kind === 'river') continue;   // water by design, checked with the river
    const onEdge = g.x === 0 || g.y === 0 || g.x === w.w - 1 || g.y === w.h - 1;
    if (!onEdge || !WALKABLE[w.grid.terr[g.i]] || !(d[g.i] < FAR)) gateBad.push(`${g.kind} ${g.side}: ${!onEdge ? 'не на краю' : !WALKABLE[w.grid.terr[g.i]] ? 'непроходимы' : 'нет пути к лагерю'}`);
    if (g.kind === 'road' && !g.road) gateBad.push(`${g.side}: дорога не проложена`);
  }
  const roadCells = w.grid.terr.reduce((s, t) => s + (t === T.ROAD), 0), roadGates = (w.gates || []).filter(g => g.kind === 'road').length;
  check(`${tag}: ворота на краю, проходимы и связаны с лагерем`, !gateBad.length, gateBad.length ? gateBad.join('; ') : `ворот ${(w.gates || []).length}, дорог ${roadGates} (тракт ${w.region.road}), клеток дороги ${roadCells}`);
  check(`${tag}: дорога есть ровно у дорожных ворот`, (roadGates > 0) === (roadCells > 0), '');
  // the river: runs from its source gate to its mouth gate over water and fords, has at least one ford, holds fish
  if (w.river) {
    const cellsSet = new Set(w.river.cells), src = w.gates.find(g => g.kind === 'river' && g.role === 'source'), mouth = w.gates.find(g => g.kind === 'river' && g.role === 'mouth');
    const wet = w.river.cells.every(j => w.grid.terr[j] === T.WATER || w.grid.terr[j] === T.FORD);
    const fords = w.river.cells.filter(j => w.grid.terr[j] === T.FORD).length;
    // joined: a flood fill over the river's own cells from the source reaches the mouth
    const seen = new Set([w.river.source]), stack = [w.river.source];
    while (stack.length) { const i = stack.pop(); for (const d of [1, -1, w.w, -w.w]) { const j = i + d; if (cellsSet.has(j) && !seen.has(j) && Math.abs((j % w.w) - (i % w.w)) <= 1) { seen.add(j); stack.push(j); } } }
    const onEdge = g => g && (g.x === 0 || g.y === 0 || g.x === w.w - 1 || g.y === w.h - 1);
    check(`${tag}: река идёт от истока к устью по воде и бродам`, wet && seen.has(w.river.mouth) && onEdge(src) && onEdge(mouth), `клеток ${w.river.cells.length}${w.river.wide ? ', широкая' : ''}, бродов ${fords}`);
    check(`${tag}: через реку есть брод`, fords > 0, '');
    const lakeIds = new Set(w.river.cells.map(j => w.grid.lake[j]).filter(v => v >= 0));
    check(`${tag}: в реке водится рыба`, [...lakeIds].some(id => w.lakes[id].cap > 0), `водоёмов на реке ${lakeIds.size}, рыбы ${[...lakeIds].reduce((s, id) => s + w.lakes[id].cap, 0)}`);
  }
  const ore = exposedOre(w), missing = Object.entries(w.region.ores).filter(([id, lvl]) => lvl > 0 && !(ore[id] > 0)).map(([id]) => id);
  check(`${tag}: каждая руда региона выходит на склон`, !missing.length, missing.length ? `нет на склоне: ${missing.join(', ')}` : Object.entries(ore).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${Math.round(v)}`).join(', '));
  const fishy = w.lakes.filter(l => l.cap > 0);
  check(`${tag}: озёра по размеру: с рыбой те, что не меньше ${FISHING.minCells} клеток`, w.lakes.every(l => (l.cap > 0) === (l.size >= FISHING.minCells)), `озёр ${w.lakes.length}, с рыбой ${fishy.length}`);
  stats.maps++;
}
console.log(`\nлесистость по биомам на ${stats.maps} картах: ` + Object.entries(stats.cellsInBiome).map(([b, c]) => `${b} ${pct((stats.forestInBiome[b] || 0) / c)} (предел ${pct(BIOMES.get(b).trees)})`).join(', '));
if (!ok) { console.log('\nFAIL: проверка карты не прошла'); process.exit(1); }
console.log('\nok   локальная карта: проверка пройдена');
