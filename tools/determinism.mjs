// Determinism check: the same seed gives the same story, and a saved game continues exactly
// as the original would have. Usage: node tools/determinism.mjs [days=2] [seed]
import {newGame, step} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {saveWorld, loadWorld, worldHash} from '../src/world/save.js';
import {DAY} from '../src/core/time.js';

const days = +(process.argv[2] || 2), seed = process.argv[3] || DEFAULT_CFG.seed;
const cfg = {...DEFAULT_CFG, seed, raids: 'often', wildlife: 'many', predators: 'many'};
const run = (w, n) => { for (let t = 0; t < n && !w.over; t++) step(w); return w; };
const half = Math.round(days * DAY / 2);

const a = run(newGame(cfg), half), b = run(newGame(cfg), half);
const save = JSON.stringify(saveWorld(a));
const c = loadWorld(JSON.parse(save));
let ok = true;
const check = (what, x, y) => { const pass = x === y; ok &&= pass; console.log(`${pass ? 'ok  ' : 'FAIL'} ${what}: ${x}${pass ? '' : ' ≠ ' + y}`); };
check(`same seed, tick ${a.tick}`, worldHash(a), worldHash(b));
check('save → load', worldHash(a), worldHash(c));
run(a, half); run(c, half);
check(`loaded game continued to tick ${a.tick}`, worldHash(a), worldHash(c));
console.log(`save: ${(save.length / 1e6).toFixed(2)} MB of JSON, ${a.agents.length} agents, ${a.logLines.length} log lines`);
if (!ok) process.exit(1);
