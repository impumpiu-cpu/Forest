// World map check: the same seed gives the same world, every stage runs, the land share is what
// was asked, and the edge of the world is sea. Usage: node tools/atlas-check.mjs [seeds=3] [size=small]
import {generateAtlas, atlasHash} from '../src/atlas/generate.js';
import {ATLAS_LAND} from '../src/data/atlas.js';

const seeds = +(process.argv[2] || 3), size = process.argv[3] || 'small';
let ok = true;
const check = (what, pass, info = '') => { ok &&= pass; console.log(`${pass ? 'ok  ' : 'FAIL'} ${what}${info ? ': ' + info : ''}`); };

for (let s = 1; s <= seeds; s++) for (let land = 0; land < ATLAS_LAND.length; land++) {
  const cfg = {seed: String(s), size, land};
  const t0 = Date.now(), a = generateAtlas(cfg), ms = Date.now() - t0, b = generateAtlas(cfg);
  const tag = `сид ${s}, ${ATLAS_LAND[land].label}`;
  check(`${tag}: тот же мир`, atlasHash(a) === atlasHash(b), `${atlasHash(a)}, ${ms} мс`);
  let landCnt = 0, edgeLand = 0;
  for (let i = 0; i < a.n; i++) {
    landCnt += a.f.land[i];
    const x = i % a.w, y = (i / a.w) | 0;
    if ((x === 0 || y === 0 || x === a.w - 1 || y === a.h - 1) && a.f.land[i]) edgeLand++;
  }
  const share = landCnt / a.n;
  check(`${tag}: доля суши`, Math.abs(share - ATLAS_LAND[land].share) < 0.02, `${(share * 100).toFixed(1)}%`);
  check(`${tag}: по краю мира море`, edgeLand === 0, edgeLand ? `${edgeLand} клеток суши на краю` : '');
}
if (!ok) process.exit(1);
