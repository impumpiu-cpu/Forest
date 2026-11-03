// Why a people's big towns find no spot for settlers (atlas/peoples.js settleSpot): at years 60…120, for every town of the people
// from its settlers' threshold, the cells of the ring [spacing, reach × spacing] — how many pass the site bar, how many of
// those have the Dwarves' land (people field ≥ foundLand), how many of those are far enough from every town, and whose
// towns stand on the rest. `node tools/spot-probe.mjs [seed] [people]` → JSON on stdout
import {newAtlas, runNextStage} from '../src/atlas/generate.js';
import {WORLD_PEOPLES, TOWN_LIFE as TL} from '../src/data/peoples.js';
import {scaleOf} from '../src/atlas/tectonics.js';
import {faunaCell} from '../src/atlas/fauna.js';

const seed = process.argv[2] || 'start376615', who = process.argv[3] || 'humans';
for (const Q of WORLD_PEOPLES.all()) Q.era = 'elder';
const a = newAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
const out = [];
let last = 0;
while (true) {
  const st = runNextStage(a);
  if (!st) break;
  if (!a.hist || !a.towns?.length || a.hist.season !== 0 || a.hist.year === last) continue;
  last = a.hist.year;
  if (last % 10) continue;
  const pe = a.peoples.find(p => p.id === who), S = pe.P.settlers, k = scaleOf(a), sp = pe.P.spacing * k, R = S.reach * sp;
  const row = {y: last, towns: []};
  for (const t of a.towns) if (t.alive && t.people === who && t.pop >= S.from) {
    const c = {pop: Math.round(t.pop), ring: 0, site: 0, land: 0, free: 0, blockBy: {}, noLandSite: 0, bestSite: 0};
    for (let y = Math.max(0, Math.floor(t.y - R)); y <= Math.min(a.h - 1, Math.ceil(t.y + R)); y++) for (let x = Math.max(0, Math.floor(t.x - R)); x <= Math.min(a.w - 1, Math.ceil(t.x + R)); x++) {
      const d = Math.hypot(x - t.x, y - t.y);
      if (d > R || d < sp) continue;
      const i = y * a.w + x, v = pe.site[i];
      if (v === -Infinity) continue;
      c.ring++; c.bestSite = Math.max(c.bestSite, v);
      if (!(v > TL.siteBar)) continue;
      c.site++;
      if (pe.K[faunaCell(a, i)] < TL.foundLand) { c.noLandSite++; continue; }
      c.land++;
      const near = a.towns.find(o => o.alive && Math.hypot(o.x - x, o.y - y) < sp * (o.people !== who ? pe.P.strangers?.near ?? 1 : 1));   // as farFromTowns (atlas/peoples.js)
      if (!near) c.free++; else c.blockBy[near.people] = (c.blockBy[near.people] || 0) + 1;
    }
    c.bestSite = Math.round(c.bestSite * 100) / 100;
    row.towns.push(c);
  }
  out.push(row);
}
console.log(JSON.stringify({seed, out}));
