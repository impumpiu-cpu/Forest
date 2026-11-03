// What drives and holds the Humans from one start (as tools/race-start-probe.mjs: all peoples arrive at the end of the wild
// era): the same world with one change at a time (several through «+»), and a yearly ledger of every people — born, dead,
// towns, room, what feeds them, the Humans' towns big enough to send settlers and those of them that see a spot.
// `node tools/human-whatif.mjs [seed] [case]` → JSON on stdout. Cases:
//   base; breed1 (breed 1.3 → 1); from100 (settlers from 100, keep 60, 20 leave); space9 (spacing 11 → 9);
//   reach35 (settlers' reach 2.5 → 3.5); food13 (the Humans' raw food × 1.3, as the ploughland gave); tools2 (their tools
//   × 2 out); near1 (they no longer settle among others: strangers.near 0.7 → 1, mix 0.5 → 0); old (they live 75…100, not
//   60…80); nocult (the Greenskins' cult of war off); fort (every Human building's defence doubled)
import {newAtlas, runNextStage} from '../src/atlas/generate.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';
import {TOWN_BUILDINGS} from '../src/data/townBuildings.js';
import {RACES} from '../src/data/races.js';
import {townFx, room} from '../src/atlas/towns.js';
import {settleSpot} from '../src/atlas/peoples.js';

const seed = process.argv[2] || 'start376615', kase = process.argv[3] || 'base', who = 'humans', size = 'small';
const P = WORLD_PEOPLES.get(who);
const CASES = {
  base: () => {},
  breed1: () => { P.breed = 1; },
  from100: () => { P.settlers = {...P.settlers, from: 100, keep: 60, pop: 20}; },
  space9: () => { P.spacing = 9; },
  reach35: () => { P.settlers = {...P.settlers, reach: 3.5}; },
  food13: () => { P.flows = {...P.flows, raw: 1.3 * (P.flows?.raw || 1)}; },
  tools2: () => { P.flows = {...P.flows, tools: 2 * (P.flows?.tools || 1)}; },
  near1: () => { P.strangers = {...P.strangers, near: 1, mix: 0}; },
  old: () => { const R = RACES.find(r => r.id === 'human'); R.body = {...R.body, lifeFrom: 75, life: 100}; },
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
