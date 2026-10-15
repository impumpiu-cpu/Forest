// Bestiary check: who lives in each region, and every beast of the bestiary brought onto an ordinary
// colony's map for a few days — it must arrive, behave and not break anything.
// Usage: node tools/bestiary-check.mjs [days]
import {newGame, step} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {colonists} from '../src/settlement/query.js';
import {DAY, HOUR} from '../src/core/time.js';
import {SPECIES} from '../src/data/species.js';
import {REGIONS} from '../src/data/regions.js';
import {BIOMES, faunaWord, FAUNA_FLOOR} from '../src/data/biomes.js';
import {faunaFrom} from '../src/world/region.js';
import {arrive} from '../src/outside/index.js';
import {saveWorld, loadWorld} from '../src/world/save.js';

const days = +(process.argv[2] || 3);
for (const R of REGIONS.all()) {
  const live = SPECIES.filter(s => s.habitat).map(s => [s, faunaFrom(R.biomes, s.id)]).filter(([, v]) => v >= FAUNA_FLOOR).sort((a, b) => b[1] - a[1]);
  console.log(`${R.label}: ${Object.entries(R.biomes).map(([b, v]) => `${BIOMES.get(b).label} ${Math.round(v * 100)}%`).join(', ')}`);
  console.log(`   ${live.map(([s, v]) => `${s.label} (${faunaWord(v)})`).join(', ')}`);
}
// one ordinary colony on day 6, saved, then every beast brought onto it in turn
const base = newGame({...DEFAULT_CFG, seed: 'bestiary', raids: 'off'});
while (base.tick < 6 * DAY) step(base);
const save = JSON.stringify(saveWorld(base));
let failed = false;
for (const sp of SPECIES.filter(s => s.arrive)) {
  const w = loadWorld(JSON.parse(save));
  w.region.extra = {...w.region.extra, [sp.id]: 1};   // let it live here whatever the land
  w.agents = w.agents.filter(o => o.species !== sp.id);   // those that came on their own would fill its cap
  const pop0 = colonists(w).length;
  const group = arrive(w, sp.id, sp.arrive.group ? sp.arrive.group[1] : 1);
  if (!group.length) { console.log(`FAIL ${sp.id}: не пришёл`); failed = true; continue; }
  for (let t = 0; t < days * DAY && !w.over; t++) step(w);
  const alive = group.filter(a => !a.dead && !a.gone && w.agents.includes(a)).length;
  const lines = w.logLines.filter(l => l.t >= 6 * DAY && new RegExp(sp.label.slice(0, 4), 'i').test(l.html)).length;
  console.log(`ok   ${sp.id.padEnd(10)} пришло ${group.length}, через ${days} дн. на карте ${alive}; колонистов ${pop0}→${colonists(w).length}; записей в журнале ${lines}`);
}
if (failed) process.exit(1);
