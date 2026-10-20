// Races and raids check: every raid band arrives at an ordinary colony on day `days` and fights it out
// (sized by the threat in strength rating: the budget → what came, against the colony's own rating);
// settlers of other races come; nothing throws. Prints casualties per band, to compare with bandits.
// Usage: node tools/races-check.mjs [days] [seeds]
import {newGame, step} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {colonists} from '../src/settlement/query.js';
import {DAY, HOUR} from '../src/core/time.js';
import {RAID_BANDS} from '../src/data/raids.js';
import {arrive} from '../src/outside/index.js';
import {raidStrength, colonyStrength} from '../src/settlement/threat.js';
import {strengthOf} from '../src/agents/strength.js';
import {settlerSpecies} from '../src/settlement/relations.js';
import {SPECIES} from '../src/data/species.js';
import {raceLabel} from '../src/agents/special.js';

const days = +(process.argv[2] || 8), seeds = +(process.argv[3] || 2);
let failed = false;
// one colony per seed, saved at the moment before the raid and reused for every band
import {saveWorld, loadWorld} from '../src/world/save.js';
const saveGame = w => JSON.parse(JSON.stringify(saveWorld(w))), loadGame = s => loadWorld(JSON.parse(JSON.stringify(s)));
const bases = [];
for (let s = 0; s < seeds; s++) {
  const w = newGame({...DEFAULT_CFG, seed: 'races-' + s, raids: 'off'});
  // the raid comes at night: night bands (upyrs, vampires) need the dark
  while (w.tick < days * DAY + 22 * HOUR && !w.over) step(w);
  bases.push(saveGame(w));
}
for (const band of RAID_BANDS.all()) {
  const out = [];
  for (const base of bases) {
    const w = loadGame(base), pop0 = colonists(w).length, n = raidStrength(w);
    const group = arrive(w, 'raiders', {n, band: band.id});
    if (!group.length) { console.log(`FAIL ${band.id}: nobody came`); failed = true; continue; }
    const who = {}; for (const a of group) { const k = raceLabel(SPECIES.get(a.species), a); who[k] = (who[k] || 0) + 1; }
    const ks = Math.round(group.reduce((t, a) => t + strengthOf(a, {now: true}), 0)), home = Math.round(colonists(w).reduce((t, a) => t + strengthOf(a), 0));
    for (let t = 0; t < DAY && !w.over; t++) step(w);
    const killed = group.filter(a => a.dead).length;
    out.push(`[КС ${n}→${ks}, колония ${home}] ${Object.entries(who).map(([k, v]) => `${k} ${v}`).join(', ')}: убито ${killed}/${group.length}, колонистов ${pop0}→${colonists(w).length}${w.over ? ' ПАЛО' : ''}`);
  }
  console.log(`${band.id.padEnd(9)} ${out.join(' | ')}`);
}
const w = loadGame(bases[0]);
const tally = {}; for (let k = 0; k < 2000; k++) { const s = settlerSpecies(w, w.rng); tally[s] = (tally[s] || 0) + 1; }
console.log('settlers to this camp:', JSON.stringify(tally));
if (failed) process.exit(1);
