// Where a people can still settle: at the end of history, for each town of the people, whether a free spot lies within
// its settlers' reach, and how full it is. `node tools/spot-probe.mjs <seed> <people>` → JSON line.
import {newAtlas, runNextStage} from '../src/atlas/generate.js';
import {settleSpot} from '../src/atlas/peoples.js';
import {townFx, room} from '../src/atlas/towns.js';

const [seed = 'macro0', people = 'elves'] = process.argv.slice(2);
const a = newAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
while (runNextStage(a)) { /* history */ }
const ts = a.towns.filter(t => t.alive && t.people === people).map(t => ({pop: Math.round(t.pop), room: Math.round(room(townFx(t))), spot: settleSpot(a, t) >= 0}));
console.log(JSON.stringify({seed, people, towns: ts.length, withSpot: ts.filter(t => t.spot).length, bigNoSpot: ts.filter(t => !t.spot && t.pop >= 150).length, ts}));
