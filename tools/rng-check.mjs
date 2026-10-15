// Random streams by subsystem (core/rng.js): a change in one part of the game must not reshuffle the
// randomness of the others. Two runs of one seed, the second with the colonists' stream knocked off by
// one draw: the weather (rain, storms, wildfires) must come out the same, the colony's story need not.
// Usage: node tools/rng-check.mjs [days=3] [seed]
import {newGame, step} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {DAY} from '../src/core/time.js';

const days = +(process.argv[2] || 3), seed = process.argv[3] || DEFAULT_CFG.seed;
const cfg = {...DEFAULT_CFG, seed, wildlife: 'many', predators: 'many', lightning: true};
const weather = w => w.logLines.filter(l => l.topic === 'weather').map(l => l.when + ' ' + l.html).reverse();
function run(nudge) {
  const w = newGame(cfg);
  if (nudge) w.rngs[nudge]();
  for (let t = 0; t < days * DAY; t++) step(w);
  return w;
}
const a = run(null), b = run('colony');
const wa = weather(a), wb = weather(b);
const same = wa.length > 0 && wa.join('\n') === wb.join('\n');
console.log(`${same ? 'ok  ' : 'FAIL'} погода не зависит от случайности поселенцев: ${wa.length} событий погоды${same ? '' : ` ≠ ${wb.length}`}`);
const story = a.logLines.length !== b.logLines.length || a.logLines.some((l, k) => l.html !== b.logLines[k]?.html);
console.log(`info история поселения ${story ? 'разошлась, как и ожидалось' : 'совпала (сдвиг не повлиял)'}`);
if (!same) process.exit(1);
