// What holds the Dwarves back from one start (as tools/race-start-probe.mjs: all peoples arrive at the end of the wild era):
// the same world with one change at a time (several through «+»), and a yearly ledger of the people — born, dead, levied,
// towns, room, what feeds them, the towns big enough to send settlers and those of them that see a spot.
// `node tools/dwarf-whatif.mjs [seed] [case]` → JSON on stdout. Cases:
//   base; breed13 (breed 0.9 → 1.3); from100 (settlers from 100, keep 60, 20 leave); space12 (spacing 14 → 12);
//   reach35 (settlers' reach 2.5 → 3.5); site (a spot less bound to ores: ores 0.8 → 0.4, fert 0.05 → 0.25);
//   tools2 (the dwarves' tools × 2.5 out); mush15 (mushroom caves × 1.5 raw); take1 (strangers taken in at the usual pace);
//   avoid1, avoid0 (keep off the Greenskins' towns by 1 spacing, or not at all); bunks10 (10 bunks a work at every step)
import {newAtlas, runNextStage} from '../src/atlas/generate.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';
import {TOWN_BUILDINGS} from '../src/data/townBuildings.js';
import {townFx, room} from '../src/atlas/towns.js';
import {settleSpot} from '../src/atlas/peoples.js';

const seed = process.argv[2] || 'start376615', kase = process.argv[3] || 'base', who = 'dwarves', size = 'small';
const P = WORLD_PEOPLES.get(who);
const CASES = {
  base: () => {},
  breed13: () => { P.breed = 1.3; },
  breed11: () => { P.breed = 1.1; },
  from100: () => { P.settlers = {...P.settlers, from: 100, keep: 60, pop: 20}; },
  space12: () => { P.spacing = 12; },
  reach35: () => { P.settlers = {...P.settlers, reach: 3.5}; },
  site: () => { P.site = {...P.site, ores: 0.4, fert: 0.25}; },
  tools2: () => { P.flows = {...P.flows, tools: 2.5 * (P.flows.tools || 1) / 1.25}; },
  mush15: () => { const b = TOWN_BUILDINGS.get('mushrooms'); b.out = {...b.out, raw: b.out.raw * 1.5}; },
  avoid1: () => { P.settlers = {...P.settlers, avoid: {orcs: 1}}; },
  avoid0: () => { P.settlers = {...P.settlers, avoid: null}; },
  bunks10: () => { P.bunks = 10; },
  take1: () => { P.folk = {...P.folk, take: 1, expel: 0}; },
  // the Greenskins' cult of war off; every Dwarf building's defence doubled (fxBy: the Dwarves' own share on top)
  nocult: () => { const O = WORLD_PEOPLES.get('orcs'); O.warCult = {...O.warCult, chance: 0}; },
  fort: () => { for (const b of TOWN_BUILDINGS.all()) if (b.fx?.defence && (!b.peoples || b.peoples.includes(who))) b.fxBy = {...b.fxBy, [who]: {...b.fxBy?.[who], defence: (b.fxBy?.[who]?.defence || 0) + b.fx.defence}}; },
};
for (const k of kase.split('+')) CASES[k]();
for (const Q of WORLD_PEOPLES.all()) Q.era = 'elder';
const a = newAtlas({seed, size, land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
const PE = WORLD_PEOPLES.all().map(Q => Q.id);
const years = [];
let last = 0;
while (true) {
  const st = runNextStage(a);
  if (!st) break;
  if (!a.hist || !a.towns?.length) continue;
  if (a.hist.season === 0 && a.hist.year !== last) {
    last = a.hist.year;
    const by = {};
    for (const p of PE) by[p] = {pop: 0, towns: 0, t2: 0, room: 0, feeds: 0, born: 0, dead: 0, want: 0, big: 0, spot: 0, basic: 0};
    for (const t of a.towns) if (t.alive) {
      const B = by[t.people];
      B.pop += t.pop; B.towns++; if (t.tier === 2) B.t2++; B.room += room(townFx(t)); B.feeds += t.wants?.feeds || 0;
      B.basic += (t.needs?.basic ?? 1) * t.pop;
      if (t.vital) { B.born += t.vital.born; B.dead += t.vital.dead + t.vital.brawl; B.want += t.vital.want; }
      const S = WORLD_PEOPLES.get(t.people).settlers;
      if (t.people === who && S && t.pop >= S.from) { B.big++; if (settleSpot(a, t) >= 0) B.spot++; }
    }
    for (const B of Object.values(by)) { B.basic = B.pop ? Math.round(B.basic / B.pop * 100) / 100 : 0; for (const k of Object.keys(B)) if (k !== 'basic') B[k] = Math.round(B[k]); }
    years.push({y: a.hist.year, by});
  }
}
const lost = (a.ruins || []).filter(r => r.people === who).map(r => ({year: r.year, how: r.how}));
console.log(JSON.stringify({seed, kase, who, years, lost}));
