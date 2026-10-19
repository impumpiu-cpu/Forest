// The seam: a cell of the world map becomes a local map. For land cells of a small world — the plan
// of a cell is plain data and the same every time; its region is in the terms of data/regions.js
// (biomes add up, levels are levels, the ores are the cell's geology); its climate is finite; its gates
// follow the world's roads and rivers and the local map lays them; the camp reaches the edge; the
// neighbours name only bands that exist and raid only from close by. Then a game on a cell: only the
// neighbours' bands raid, a save goes on as the original; and the polygon's threat settings work.
// Usage: node tools/seam-check.mjs [cells=24] [size=small]
import {generateAtlas} from '../src/atlas/generate.js';
import {cellPlan, settleable} from '../src/seam/cell.js';
import {cellGeology} from '../src/atlas/geology.js';
import {riverKind} from '../src/atlas/hydrology.js';
import {makeTerrain} from '../src/world/generate.js';
import {newGame, step} from '../src/sim.js';
import {saveWorld, loadWorld, worldHash} from '../src/world/save.js';
import {pickBand, raidOdds, scripted} from '../src/outside/scripted.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {BIOMES} from '../src/data/biomes.js';
import {LEVELS} from '../src/data/regions.js';
import {RAID_BANDS} from '../src/data/raids.js';
import {SPECIES} from '../src/data/species.js';
import {SEAM} from '../src/data/seam.js';
import {WALKABLE} from '../src/data/terrain.js';
import {FAR} from '../src/nav/navigation.js';
import {mulberry} from '../src/core/rng.js';
import {DAY} from '../src/core/time.js';

const cells = +(process.argv[2] || 24), size = process.argv[3] || 'small';
let ok = true;
const check = (what, pass, info = '') => { ok &&= pass; if (!pass || info) console.log(`${pass ? 'ok  ' : 'FAIL'} ${what}${info ? ': ' + info : ''}`); return pass; };
const SIDES = ['north', 'south', 'east', 'west'];

const a = generateAtlas({seed: '4100', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
// the cells to try: those with a river, with a road, with raiders near, and the rest evenly
const land = []; for (let i = 0; i < a.n; i++) if (settleable(a, i)) land.push(i);
const plans = new Map(), planOf = i => { if (!plans.has(i)) plans.set(i, cellPlan(a, i, {name: 'проверка'})); return plans.get(i); };
const pickBy = (fn, k) => land.filter(fn).filter((_, n, arr) => n % Math.max(1, Math.floor(arr.length / k)) === 0).slice(0, k);
const k4 = Math.max(1, Math.floor(cells / 4));
const tried = [...new Set([
  ...pickBy(i => ['river', 'great'].includes(riverKind(a, i)), k4),
  ...pickBy(i => planOf(i).extra.gates.some(g => g.kind === 'road'), k4),
  ...pickBy(i => !!planOf(i).extra.neighbours.hostile, k4),
  ...pickBy(() => true, cells - 3 * k4),
])];

const bad = [], stat = {river: 0, road: 0, hostile: 0, kin: 0};
let reachBad = 0, ms = 0;
for (const i of tried) {
  const p = planOf(i), R = p.region, X = p.extra, tag = `клетка ${p.ref.x},${p.ref.y}`;
  const same = JSON.stringify(cellPlan(a, i, {name: 'проверка'})) === JSON.stringify(p);
  if (!same) bad.push(`${tag}: план клетки не повторяется`);
  if (JSON.stringify(JSON.parse(JSON.stringify(p))) !== JSON.stringify(p)) bad.push(`${tag}: план — не простые данные`);
  const sum = Object.values(R.biomes).reduce((s, v) => s + v, 0);
  if (Math.abs(sum - 1) > 0.04 || Object.keys(R.biomes).some(b => !BIOMES.has(b))) bad.push(`${tag}: биомы ${JSON.stringify(R.biomes)}`);
  for (const v of [...Object.values(R.ores), ...Object.values(R.flora), R.placer]) if (!LEVELS.includes(v)) { bad.push(`${tag}: уровень ${v} не из LEVELS`); break; }
  const geo = cellGeology(a, i);
  for (const [k, v] of Object.entries(geo.ores)) if (R.ores[k] !== v) bad.push(`${tag}: руда ${k} ${R.ores[k]} ≠ ${v} в мире`);
  for (const key of ['meanT', 'trange', 'rain', 'regrow', 'ign', 'daylight']) if (!Number.isFinite(X.climate[key])) bad.push(`${tag}: климат ${key} = ${X.climate[key]}`);
  for (const g of X.gates) if (!SIDES.includes(g.side) || !(g.at >= 0 && g.at <= 1)) bad.push(`${tag}: ворота ${JSON.stringify(g)}`);
  const rv = X.gates.filter(g => g.kind === 'river');
  if (rv.length && (rv.length !== 2 || rv[0].side === rv[1].side)) bad.push(`${tag}: речные ворота ${JSON.stringify(rv)}`);
  if (['river', 'great'].includes(riverKind(a, i)) !== (rv.length === 2) && a.f.down[i] >= 0) bad.push(`${tag}: река в мире ${riverKind(a, i)}, ворот ${rv.length}`);
  const H = X.neighbours.hostile;
  if (H) {
    stat.hostile++;
    if (!(H.dist <= SEAM.raidDays) || Object.keys(H.bands).some(b => !RAID_BANDS.has(b)) || !Object.keys(H.bands).length) bad.push(`${tag}: враги ${JSON.stringify(H)}`);
  }
  if (X.neighbours.kin) stat.kin++;
  if (rv.length) stat.river++;
  if (X.gates.some(g => g.kind === 'road')) stat.road++;
  // the local map from the plan: the gates are laid, the river runs
  const t0 = Date.now(), t = makeTerrain({...DEFAULT_CFG, size, seed: p.seed, cell: p}); ms += Date.now() - t0;
  if (rv.length && !t.river) bad.push(`${tag}: река не легла на карту`);
  if (t.gates.filter(g => g.kind === 'road').length !== X.gates.filter(g => g.kind === 'road').length) bad.push(`${tag}: дорожных ворот на карте ${t.gates.filter(g => g.kind === 'road').length}, в плане ${X.gates.filter(g => g.kind === 'road').length}`);
  if (t.site.world?.x !== p.ref.x) bad.push(`${tag}: участок не знает своей клетки`);
}
check(`план ${tried.length} клеток суши: данные, биомы, руды, климат, ворота, соседи`, !bad.length, bad.slice(0, 6).join('; ') || `с рекой ${stat.river}, с дорогой ${stat.road}, с врагами рядом ${stat.hostile}, со своими ${stat.kin}; карта за ${Math.round(ms / tried.length)} мс`);
check('среди клеток есть реки, дороги и враги', stat.river > 0 && stat.road > 0 && stat.hostile > 0);

// ── a game on a cell with raiders near
const hostileCell = tried.find(i => planOf(i).extra.neighbours.hostile);
{
  const p = planOf(hostileCell), cfg = {...DEFAULT_CFG, size, seed: p.seed, cell: p};
  const w = newGame(cfg), H = p.extra.neighbours.hostile, rng = mulberry(7), seen = new Set();
  for (let k = 0; k < 300; k++) seen.add(pickBand(w, rng));
  check(`игра на клетке ${p.ref.x},${p.ref.y}: банды только от соседей`, [...seen].every(b => H.bands[b] > 0), `${[...seen].join(', ')} из ${Object.keys(H.bands).join(', ')}`);
  check('набеги ходят на расстояние соседей', raidOdds(w).dist === H.dist && scripted.distance(w, 'hostile') === H.dist, `${raidOdds(w).dist} дн.`);
  // the edge is reachable from the camp
  const d = w.nav.get('camp');
  let edge = 0; for (let x = 0; x < w.w; x++) { if (d[x] < FAR) edge++; if (d[(w.h - 1) * w.w + x] < FAR) edge++; }
  for (let y = 0; y < w.h; y++) { if (d[y * w.w] < FAR) edge++; if (d[y * w.w + w.w - 1] < FAR) edge++; }
  check('от лагеря есть путь к краю карты', edge > 0);
  for (let t = 0; t < DAY / 2; t++) step(w);
  const c = loadWorld(JSON.parse(JSON.stringify(saveWorld(w))));
  check('сохранение игры на клетке хранит соседей', JSON.stringify(c.site.neighbours) === JSON.stringify(w.site.neighbours));
  for (let t = 0; t < DAY / 2; t++) { step(w); step(c); }
  check('загруженная игра на клетке идёт так же', worldHash(c) === worldHash(w), worldHash(w));
  const peace = tried.find(i => !planOf(i).extra.neighbours.hostile);
  if (peace != null) { const q = planOf(peace), wp = newGame({...DEFAULT_CFG, size, seed: q.seed, cell: q}); check('без врагов рядом набегов нет', raidOdds(wp).dist == null && wp.outside.next.raiders === Infinity); }
}

// ── the polygon's threats
{
  const w = newGame({...DEFAULT_CFG, size, raids: 'often', bands: ['orcs', 'goblins'], monsters: 'none', spirits: false}), rng = mulberry(3), seen = new Set();
  for (let k = 0; k < 300; k++) seen.add(pickBand(w, rng));
  check('полигон: приходят только выбранные банды', [...seen].every(b => ['orcs', 'goblins'].includes(b)), [...seen].join(', '));
  const monster = SPECIES.filter(s => s.arrive && s.kind === 'monster').map(s => s.id), spirit = SPECIES.filter(s => s.arrive && s.resident).map(s => s.id);
  const offers = ids => ids.reduce((s, id) => { let n = 0; for (let k = 0; k < 50; k++) n += +!!scripted.flows[id].offer(w, rng); return s + n; }, 0);
  check('полигон: «Чудища: нет» и без нечисти — никто из них не приходит', offers(monster) === 0 && offers(spirit) === 0);
  const none = newGame({...DEFAULT_CFG, size, raids: 'often', bands: []});
  check('полигон: ни одной банды — набегов нет', raidOdds(none).dist == null);
}
if (!ok) process.exit(1);
