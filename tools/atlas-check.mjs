// World map check: the same seed gives the same world, every stage runs, the land share is what
// was asked, the edge of the world is sea, plates are whole, rocks and ores follow the geology, and
// the climate bands lie as the «Широты» setting says. Prints the shares of rocks and ores.
// Usage: node tools/atlas-check.mjs [seeds=3] [size=small]
import {generateAtlas, atlasHash} from '../src/atlas/generate.js';
import {ATLAS_LAND} from '../src/data/atlas.js';
import {ROCK_BY_CODE, ROCK_KINDS, ORE_GENESIS, PLATE_COUNTS} from '../src/data/geology.js';
import {levelOf} from '../src/atlas/geology.js';
import {latitude} from '../src/atlas/latitude.js';
import {biomeAt, soilAt, cellBiomes, dryness} from '../src/atlas/biomes.js';
import {BIOMES, KOPPEN} from '../src/data/biomes.js';
import {LAIRS} from '../src/data/lairs.js';
import {historyLength} from '../src/atlas/history.js';
import {scaleOf} from '../src/atlas/tectonics.js';

const seeds = +(process.argv[2] || 3), size = process.argv[3] || 'small';
let ok = true;
const check = (what, pass, info = '') => { ok &&= pass; if (!pass || info) console.log(`${pass ? 'ok  ' : 'FAIL'} ${what}${info ? ': ' + info : ''}`); return pass; };
const kinds = {}, ores = {}, coalOnSed = [0, 0];
const bands = {tropic: [0, 0], subtropic: [0, 0], temperate: [0, 0]}, shadow = {lee: [0, 0], windward: [0, 0]};
const addTo = (acc, v) => { acc[0] += v; acc[1]++; };
const lakeRain = {fresh: [0, 0], salt: [0, 0]};
let lakesAll = 0, saltAll = 0, placerCells = 0;
const bioLat = {}, bioTrees = {}, bioCount = {}, soilFert = {};
const hist = {lairs: 0, alive: 0, lines: 0, worlds: 0, kinds: {}};

// the wild era ran to its end; beasts stay where their biomes can hold them; lairs keep apart
function historyCheck(a, tag) {
  check(`${tag}: дикая эра прошла до конца`, a.hist && a.hist.step === historyLength(a));
  let nan = 0, outside = 0, total = 0;
  for (const s of a.fauna.list) for (let j = 0; j < s.N.length; j++) {
    const v = s.N[j]; if (!Number.isFinite(v) || v < 0) nan++;
    total += v; if (s.K[j] <= 0) outside += v;
  }
  check(`${tag}: численность зверей — конечные неотрицательные числа`, nan === 0, nan ? `${nan} плохих` : '');
  const home = outside <= 0.02 * total;
  check(`${tag}: звери живут в своих биомах`, home, home ? '' : `вне своих краёв ${(outside / (total || 1) * 100).toFixed(1)}%`);
  const alive = a.lairs.filter(l => l.alive);
  let close = 0;
  for (const p of alive) for (const q of alive) if (p.id < q.id && p.kind === q.kind && Math.hypot(p.x - q.x, p.y - q.y) < 2 * LAIRS.get(p.kind).radius * scaleOf(a) - 1) close++;
  check(`${tag}: логова одного рода не теснят друг друга`, close === 0, close ? `${close} пар` : '');
  hist.lairs += a.lairs.length; hist.alive += alive.length; hist.worlds++;
  hist.lines += a.chronicle.filter(c => c.season != null).length;
  for (const l of a.lairs) hist.kinds[l.kind] = (hist.kinds[l.kind] || 0) + 1;
}


// every land cell has a biome and a soil, and the biome agrees with its climate as Köppen has it
function biomeCheck(a, tag) {
  let none = 0, wrong = 0, sharesBad = 0, example = '';
  for (let i = 0; i < a.n; i++) {
    if (a.f.ocean[i]) continue;
    const b = biomeAt(a, i), s = soilAt(a, i);
    if (!b || !s) { none++; continue; }
    const T = a.f.temp[i], Tw = T + a.f.trange[i] / 2, Tc = T - a.f.trange[i] / 2, P = a.f.rain[i], Pd = Math.max(1, dryness(T));
    const bad = (b.id === 'jungle' && Tc < KOPPEN.tropics) || (b.id === 'taiga' && Tc >= KOPPEN.continental) ||
      (b.id === 'tundra' && Tw >= KOPPEN.treeline) || (b.id === 'ice' && Tw >= 0) || (b.id === 'desert' && P >= Pd / 2) ||
      ((b.id === 'forest' || b.id === 'taiga' || b.id === 'jungle') && (Tw < KOPPEN.treeline || P < Pd));
    if (bad) { wrong++; example ||= `${b.label}: ${T.toFixed(0)}°, лето ${Tw.toFixed(0)}°, зима ${Tc.toFixed(0)}°, ${Math.round(P)} мм`; }
    addTo(bioLat[b.id] ??= [0, 0], Math.abs(latitude(a, (i / a.w) | 0)));
    addTo(bioTrees[b.id] ??= [0, 0], a.f.trees[i]);
    bioCount[b.id] = (bioCount[b.id] || 0) + 1;
    addTo(soilFert[s.id] ??= [0, 0], a.f.fert[i]);
    if (i % 97 === 0) {
      const sh = cellBiomes(a, i), sum = Object.values(sh).reduce((x, v) => x + v, 0);
      if (Math.abs(sum - 1) > 0.06 || Object.keys(sh).some(id => !BIOMES.has(id))) sharesBad++;
    }
  }
  check(`${tag}: у каждой клетки суши биом и почва`, none === 0, none ? `${none} без` : '');
  check(`${tag}: биомы согласны с климатом по Кёппену`, wrong === 0, wrong ? `${wrong} клеток, например ${example}` : '');
  check(`${tag}: доли биомов клетки складываются в целое`, sharesBad === 0, sharesBad ? `${sharesBad} клеток` : '');
}


// every land cell drains to the ocean or into a salt lake, without loops, and the water only grows
// downstream (except into a salt lake, which keeps it)
function drainage(a) {
  const {down, ocean, flow, lake} = a.f, seen = new Int32Array(a.n).fill(-1);
  let bad = 0, shrink = 0;
  const salt = i => lake[i] >= 0 && a.lakes[lake[i]].salt;
  for (let s = 0; s < a.n; s++) {
    if (ocean[s]) continue;
    let i = s, steps = 0;
    while (!ocean[i] && !salt(i) && steps <= a.n) {
      if (seen[i] === s) { steps = a.n + 1; break; }
      seen[i] = s;
      const d = down[i];
      if (d < 0) break;
      if (!ocean[d] && !salt(d) && flow[d] + 1e-3 < flow[i]) shrink++;
      i = d; steps++;
    }
    if (steps > a.n || (!ocean[i] && !salt(i))) bad++;
  }
  return {bad, shrink};
}

const mean = acc => acc[0] / (acc[1] || 1);

// rain by belt (all cells, sea too): the rising belts are wet, the sinking ones at ~30° dry
function rainBelts(a) {
  for (let y = 0; y < a.h; y++) {
    const L = Math.abs(latitude(a, y)), b = L < 10 ? 'tropic' : L > 22 && L < 35 ? 'subtropic' : L > 40 && L < 60 ? 'temperate' : null;
    if (b) for (let x = 0; x < a.w; x++) addTo(bands[b], a.f.rain[y * a.w + x]);
  }
}

// rain shadow: land cells behind a ridge (looking upwind, the ground rises well above them) against
// land cells that get the wind straight off the sea
function rainShadow(a) {
  const rel = i => (a.f.elev[i] - a.sea) / (1 - a.sea), R = Math.round(10 * Math.min(a.w, a.h) / 192);
  for (let i = 0; i < a.n; i++) {
    if (!a.f.land[i]) continue;
    const u = a.f.windX[i], v = a.f.windY[i], sp = Math.hypot(u, v);
    if (sp < 0.3) continue;
    const x0 = i % a.w, y0 = (i / a.w) | 0;
    let ridge = 0, sea = false;
    for (let t = 1; t <= R; t++) {
      const x = Math.round(x0 - u / sp * t), y = Math.round(y0 - v / sp * t);
      if (x < 0 || y < 0 || x >= a.w || y >= a.h) break;
      const j = y * a.w + x;
      if (!a.f.land[j]) { sea = t <= 3; break; }
      ridge = Math.max(ridge, rel(j) - rel(i));
    }
    if (ridge > 0.25) addTo(shadow.lee, a.f.rain[i]);
    else if (sea && rel(i) < 0.15) addTo(shadow.windward, a.f.rain[i]);
  }
}

let landAll = 0, worlds = 0;

// every plate is one piece (plates grow over 8 neighbours, so a diagonal touch joins)
function platesWhole(a) {
  const seen = new Uint8Array(a.n);
  for (const p of a.plates) {
    const start = p.sy * a.w + p.sx, stack = [start]; let cnt = 0; seen[start] = 1;
    while (stack.length) {
      const i = stack.pop(); cnt++;
      const x = i % a.w, y = (i / a.w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= a.w || ny >= a.h) continue;
        const j = ny * a.w + nx;
        if (!seen[j] && a.f.plate[j] === p.id) { seen[j] = 1; stack.push(j); }
      }
    }
    if (cnt !== p.area) return false;
  }
  return true;
}

const rowTemp = (a, y) => { let s = 0; for (let x = 0; x < a.w; x++) s += a.f.temp[y * a.w + x]; return s / a.w; };

for (let s = 1; s <= seeds; s++) for (let land = 0; land < ATLAS_LAND.length; land++) for (const hemisphere of ['north', 'equator']) {
  const cfg = {seed: String(s), size, land, plates: (s + land) % PLATE_COUNTS.length, hemisphere};
  const t0 = Date.now(), a = generateAtlas(cfg), ms = Date.now() - t0, b = generateAtlas(cfg);
  const tag = `сид ${s}, ${ATLAS_LAND[land].label}, ${PLATE_COUNTS[cfg.plates].label.toLowerCase()} плит, ${hemisphere}`;
  worlds++;
  check(`${tag}: тот же мир`, atlasHash(a) === atlasHash(b), s === 1 && land === 1 ? `${atlasHash(a)}, ${ms} мс` : '');
  let landCnt = 0, edgeLand = 0, noRock = 0, magmaCold = 0, unplated = 0;
  for (let i = 0; i < a.n; i++) {
    if (a.f.plate[i] < 0) unplated++;
    if (!a.f.land[i]) continue;
    landCnt++;
    const x = i % a.w, y = (i / a.w) | 0;
    if (x === 0 || y === 0 || x === a.w - 1 || y === a.h - 1) edgeLand++;
    const rock = ROCK_BY_CODE[a.f.rock[i]];
    if (!rock) { noRock++; continue; }
    kinds[rock.kind] = (kinds[rock.kind] || 0) + 1;
    for (const o of ORE_GENESIS.all()) {
      const lv = levelOf(a.f[`ore_${o.id}`][i], o.levels);
      (ores[o.id] ??= [0, 0, 0, 0])[[0, 0.5, 1, 1.6].indexOf(lv)]++;
      if (o.id === 'coal' && lv >= 1) { coalOnSed[1]++; if (rock.kind === 'sedimentary') coalOnSed[0]++; }
      if (o.id === 'magma' && lv >= 1 && a.f.volc[i] < 0.05) magmaCold++;
    }
  }
  landAll += landCnt;
  const share = landCnt / a.n;
  // the ocean share jumps when a basin joins the sea through a strait, so the land share may miss by a few points
  const shareOk = Math.abs(share - ATLAS_LAND[land].share) < 0.05;
  check(`${tag}: доля суши`, shareOk, shareOk ? '' : `${(share * 100).toFixed(1)}%`);
  check(`${tag}: по краю мира море`, edgeLand === 0, edgeLand ? `${edgeLand} клеток суши на краю` : '');
  check(`${tag}: каждая клетка на плите, плиты целые`, unplated === 0 && platesWhole(a));
  check(`${tag}: у каждой клетки суши есть порода`, noRock === 0, noRock ? `${noRock} без породы` : '');
  check(`${tag}: магма только у живых вулканов`, magmaCold === 0, magmaCold ? `${magmaCold} клеток` : '');
  rainBelts(a); rainShadow(a);
  biomeCheck(a, tag);
  historyCheck(a, tag);
  const dr = drainage(a);
  check(`${tag}: вся вода стекает в море или в солёное озеро`, dr.bad === 0, dr.bad ? `${dr.bad} клеток без стока` : '');
  check(`${tag}: вниз по течению воды не меньше`, dr.shrink === 0, dr.shrink ? `${dr.shrink} мест` : '');
  lakesAll += a.lakes.length; saltAll += a.lakes.filter(L => L.salt).length;
  for (let i = 0; i < a.n; i++) {
    if (a.f.lake[i] >= 0) addTo(lakeRain[a.lakes[a.f.lake[i]].salt ? 'salt' : 'fresh'], a.f.rain[i]);
    if (levelOf(a.f.ore_placer[i], ORE_GENESIS.get('placer').levels) >= 1) {
      placerCells++;
      if (a.f.flow[i] < 1) check(`${tag}: золотой песок только в реках`, false, `клетка ${i}`);
    }
  }
  const top = rowTemp(a, 0), mid = rowTemp(a, a.h >> 1), bot = rowTemp(a, a.h - 1);
  const bands = hemisphere === 'equator' ? mid > top + 10 && mid > bot + 10 : bot > top + 20;
  check(`${tag}: пояса температуры`, bands, !bands || (s === 1 && land === 1) ? `верх ${top.toFixed(0)}°, середина ${mid.toFixed(0)}°, низ ${bot.toFixed(0)}°` : '');
}

console.log(`\nПороды суши (${worlds} миров):`);
for (const [k, l] of Object.entries(ROCK_KINDS)) {
  const v = (kinds[k] || 0) / landAll;
  check(`  ${l}`, v >= 0.04, `${(v * 100).toFixed(1)}%`);
}
console.log('Руды на суше: нет / бедно / есть / богато');
for (const o of ORE_GENESIS.all()) console.log(`     ${o.label.padEnd(14)} ${ores[o.id].map(v => (v / landAll * 100).toFixed(1).padStart(5) + '%').join(' ')}`);
const iron = 1 - ores.iron[0] / landAll;
check('железо есть хотя бы бедно на четверти суши', iron >= 0.25, `${(iron * 100).toFixed(0)}%`);
check('уголь (есть и богато) лежит в осадочных породах', coalOnSed[0] >= 0.7 * coalOnSed[1], `${(coalOnSed[0] / (coalOnSed[1] || 1) * 100).toFixed(0)}%`);
console.log('Осадки, мм в год:');
const r = v => Math.round(mean(v));
check('  экватор влажнее конских широт', mean(bands.tropic) > 1.5 * mean(bands.subtropic), `${r(bands.tropic)} против ${r(bands.subtropic)}`);
check('  умеренные широты влажнее конских', mean(bands.temperate) > 1.3 * mean(bands.subtropic), `${r(bands.temperate)} против ${r(bands.subtropic)}`);
check('  дождевая тень', mean(shadow.lee) < 0.6 * mean(shadow.windward), `за хребтом ${r(shadow.lee)}, на наветренном берегу ${r(shadow.windward)}`);
console.log('Биомы (доля суши, средняя широта, лес):');
let landBio = 0; for (const v of Object.values(bioCount)) landBio += v;
for (const b of BIOMES.all()) if (bioCount[b.id]) console.log(`     ${b.label.padEnd(26)} ${(bioCount[b.id] / landBio * 100).toFixed(1).padStart(5)}%  ${Math.round(mean(bioLat[b.id])).toString().padStart(3)}°  ${Math.round(mean(bioTrees[b.id]) * 100).toString().padStart(3)}%`);
const L = id => mean(bioLat[id] || [0, 0]), Tr = id => mean(bioTrees[id] || [0, 0]), F = id => mean(soilFert[id] || [0, 0]);
check('  зоны по широте: тундра севернее тайги, тайга севернее широколиственных, джунгли у экватора', L('tundra') > L('taiga') && L('taiga') > L('forest') && L('jungle') < 20, `${Math.round(L('tundra'))}° / ${Math.round(L('taiga'))}° / ${Math.round(L('forest'))}° / ${Math.round(L('jungle'))}°`);
check('  леса лесистые, степи и пустыни нет', Tr('forest') > 0.5 && Tr('taiga') > 0.5 && Tr('steppe') < 0.1 && Tr('desert') < 0.05, `лес ${Math.round(Tr('forest') * 100)}%, тайга ${Math.round(Tr('taiga') * 100)}%, степь ${Math.round(Tr('steppe') * 100)}%`);
check('  чернозём и поймы плодороднее подзола и латерита', F('chernozem') > F('podzol') && F('alluvial') > F('laterite'), `чернозём ${Math.round(F('chernozem') * 100)}%, пойма ${Math.round(F('alluvial') * 100)}%, подзол ${Math.round(F('podzol') * 100)}%, латерит ${Math.round(F('laterite') * 100)}%`);
console.log('Дикая эра:');
check('  логова чудовищ есть', hist.lairs > 0, `${hist.lairs} за эру на ${hist.worlds} миров, к концу живы ${hist.alive}; ` + LAIRS.all().map(L => `${L.label} ${hist.kinds[L.id] || 0}`).join(', '));
check('  летопись эры пишется', hist.lines >= 10 * hist.worlds, `${(hist.lines / hist.worlds).toFixed(0)} записей на мир`);
console.log('Вода:');
check('  озёра есть', lakesAll > 0, `${lakesAll} на ${worlds} миров, солёных ${saltAll}`);
if (lakeRain.salt[1] && lakeRain.fresh[1]) check('  солёные озёра в сухом климате', mean(lakeRain.salt) < mean(lakeRain.fresh), `у солёных ${Math.round(mean(lakeRain.salt))} мм, у пресных ${Math.round(mean(lakeRain.fresh))} мм`);
check('  золотой песок где-то есть', placerCells > 0, `${placerCells} клеток уровня «есть» и выше`);
if (!ok) process.exit(1);
