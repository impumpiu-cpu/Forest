// World map check: the same seed gives the same world, every stage runs, the land share is what
// was asked, the edge of the world is sea, plates are whole, rocks and ores follow the geology, and
// the climate bands lie as the «Широты» setting says. Prints the shares of rocks and ores.
// Usage: node tools/atlas-check.mjs [seeds=3] [size=small]
import {generateAtlas, atlasHash} from '../src/atlas/generate.js';
import {ATLAS_LAND} from '../src/data/atlas.js';
import {ROCK_BY_CODE, ROCK_KINDS, ORE_GENESIS, PLATE_COUNTS} from '../src/data/geology.js';
import {levelOf} from '../src/atlas/geology.js';

const seeds = +(process.argv[2] || 3), size = process.argv[3] || 'small';
let ok = true;
const check = (what, pass, info = '') => { ok &&= pass; if (!pass || info) console.log(`${pass ? 'ok  ' : 'FAIL'} ${what}${info ? ': ' + info : ''}`); return pass; };
const kinds = {}, ores = {}, coalOnSed = [0, 0];
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
  const shareOk = Math.abs(share - ATLAS_LAND[land].share) < 0.02;
  check(`${tag}: доля суши`, shareOk, shareOk ? '' : `${(share * 100).toFixed(1)}%`);
  check(`${tag}: по краю мира море`, edgeLand === 0, edgeLand ? `${edgeLand} клеток суши на краю` : '');
  check(`${tag}: каждая клетка на плите, плиты целые`, unplated === 0 && platesWhole(a));
  check(`${tag}: у каждой клетки суши есть порода`, noRock === 0, noRock ? `${noRock} без породы` : '');
  check(`${tag}: магма только у живых вулканов`, magmaCold === 0, magmaCold ? `${magmaCold} клеток` : '');
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
if (!ok) process.exit(1);
