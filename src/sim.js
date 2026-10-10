// One simulation tick, in a fixed order: fields → weather → navigation → agents → settlement.
import {createWorld} from './world/generate.js';
import {stepFields} from './world/fields.js';
import {stepWeather} from './world/weather.js';
import {Navigation} from './nav/navigation.js';
import {BRAINS} from './agents/brains/index.js';
import {separate} from './agents/movement.js';
import {stepCouncil} from './settlement/council.js';
import {stepMigration} from './settlement/migration.js';
import {createAgent} from './agents/agent.js';
import {log} from './core/log.js';
import {plural, esc} from './core/util.js';

export function newGame(cfg) {
  const w = createWorld(cfg);
  w.nav = new Navigation(w);
  w.nav.buildAll();
  w.perf = {fields: 0, nav: 0, agents: 0, render: 0};
  const n = cfg.colonists;
  for (let k = 0; k < n; k++) createAgent(w, 'human', 'colony', w.camp.x + 0.5 + (w.rng() * 5 - 2.5), w.camp.y + 0.5 + (w.rng() * 5 - 2.5));
  log(w, `${n} ${plural(n, 'поселенец', 'поселенца', 'поселенцев')} ${n === 1 ? 'разбил' : 'разбили'} лагерь «${esc(cfg.name)}».`);
  return w;
}

const ema = (old, v) => old * 0.95 + v * 0.05;

export function step(w) {
  const t0 = performance.now();
  stepFields(w);
  stepWeather(w);
  const t1 = performance.now();
  w.nav.step();
  const t2 = performance.now();
  for (const a of w.agents) { if (!a.dead) BRAINS.get(a.brain).step(w, a); if (a.flash) a.flash--; }
  w.agents = w.agents.filter(a => !a.dead && !a.gone);
  separate(w);
  stepCouncil(w);
  stepMigration(w);
  const t3 = performance.now();
  w.perf.fields = ema(w.perf.fields, t1 - t0); w.perf.nav = ema(w.perf.nav, t2 - t1); w.perf.agents = ema(w.perf.agents, t3 - t2);
  w.tick++;
}
