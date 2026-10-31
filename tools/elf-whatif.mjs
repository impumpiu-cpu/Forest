// What holds a people back from one start (as tools/race-start-probe.mjs: all peoples arrive at the end of the wild era):
// the same world with one change at a time, and a yearly ledger of the people — born, dead, levied into armies, the people
// in its towns and in its armies, towns, room and what feeds them.
// `node tools/elf-whatif.mjs [seed] [case] [people]` → JSON on stdout. Cases: base, nocult (the greenskins' cult of war off),
// stay (the people never migrates), breed1 (breed 1), space14 (spacing 14), reach35 (settlers' reach 3.5),
// house12 (treehouses and halls up to 12), from100 (settlers from 100 people, keep 60)
import {newAtlas, runNextStage} from '../src/atlas/generate.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';
import {TOWN_BUILDINGS} from '../src/data/townBuildings.js';
import {townFx, room} from '../src/atlas/towns.js';

const seed = process.argv[2] || 'start376615', kase = process.argv[3] || 'base', who = process.argv[4] || 'elves', size = 'small';
const P = WORLD_PEOPLES.get(who);
const CASES = {
  base: () => {},
  nocult: () => { const O = WORLD_PEOPLES.get('orcs'); O.warCult = {...O.warCult, chance: 0}; },
  stay: () => { P.migrate = 0; for (const o of WORLD_PEOPLES.all()) o.welcome = (o.welcome || []).filter(x => x !== who); },
  breed1: () => { P.breed = 1; },
  space14: () => { P.spacing = 14; },
  reach35: () => { P.settlers = {...P.settlers, reach: 3.5}; },
  house12: () => { for (const id of ['treehouse', 'elfhall']) TOWN_BUILDINGS.get(id).max = 12; },
  from100: () => { P.settlers = {...P.settlers, from: 100, keep: 60}; },
};
for (const k of kase.split('+')) CASES[k]();
for (const Q of WORLD_PEOPLES.all()) Q.era = 'elder';
const a = newAtlas({seed, size, land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
const PE = WORLD_PEOPLES.all().map(Q => Q.id);
const realmPeople = id => a.realms?.find(r => r.id === id)?.people;
const years = [];
let last = 0, seen = 0, levy = 0, levies = 0;
while (true) {
  const st = runNextStage(a);
  if (!st) break;
  if (!a.hist || !a.towns?.length) continue;
  // the musters of the people's realms since the last stage (atlas/diplomacy.js muster says «… войско в N бойцов …»)
  for (const c of a.chronicle.slice(seen)) { const m = /собрали в .* войско в (\d+) бойцов/.exec(c.text || ''); if (m && /эльф/.test(c.text) === (who === 'elves')) { levy += +m[1]; levies++; } }
  seen = a.chronicle.length;
  if (a.hist.season === 0 && a.hist.year !== last) {
    last = a.hist.year;
    const by = {};
    for (const p of PE) by[p] = {pop: 0, towns: 0, t2: 0, room: 0, feeds: 0, born: 0, dead: 0, want: 0, army: 0, spot: 0};
    for (const t of a.towns) if (t.alive) {
      const B = by[t.people];
      B.pop += t.pop; B.towns++; if (t.tier === 2) B.t2++; B.room += room(townFx(t)); B.feeds += t.wants?.feeds || 0;
      if (t.vital) { B.born += t.vital.born; B.dead += t.vital.dead + t.vital.brawl; B.want += t.vital.want; }
    }
    for (const p of a.parties || []) if (p.kind === 'army') { const pp = realmPeople(p.owner); if (pp) by[pp].army += p.men || 0; }
    for (const B of Object.values(by)) for (const k of Object.keys(B)) B[k] = Math.round(B[k]);
    by[who].levy = levy; by[who].levies = levies; levy = 0; levies = 0;
    years.push({y: a.hist.year, by});
  }
}
const lost = (a.ruins || []).filter(r => r.people === who).map(r => ({year: r.year, how: r.how, by: r.by != null ? realmPeople(r.by) : null}));
console.log(JSON.stringify({seed, kase, who, years, lost}));
