// One simulation tick, in a fixed order: fields → weather → navigation → agents → settlement.
import {createWorld} from './world/generate.js';
import {stepFields} from './world/fields.js';
import {stepWeather} from './world/weather.js';
import {stepLakes} from './world/lakes.js';
import {stepPlants} from './world/plants.js';
import {stepFarms} from './settlement/farming.js';
import {stepHerd} from './settlement/herd.js';
import {stepColonyGolems} from './settlement/golems.js';
import {stepLife} from './settlement/life.js';
import {stepCrafting} from './settlement/crafting.js';
import {stepEffects} from './agents/body.js';
import {stepPotions} from './settlement/potions.js';
import {sampleBehaviour} from './settlement/behaviour.js';
import {sweepReserve} from './settlement/reserve.js';
import {stepRelations} from './settlement/relations.js';
import {Navigation} from './nav/navigation.js';
import {stepFreedom} from './settlement/freedom.js';
import {stepMasters} from './settlement/masters.js';
import {stepEscape} from './settlement/escape.js';
import {BRAINS} from './agents/brains/index.js';
import {separate} from './agents/movement.js';
import {noteAttacker} from './agents/lookup.js';
import {stepBoard} from './settlement/board.js';
import {stepAttention} from './agents/attention.js';
import {stepHerds} from './agents/wildHerd.js';
import {stepSquads} from './agents/squad.js';
import {stepHunts, stepCarcasses} from './agents/carcass.js';
import {stepCouncil} from './settlement/council.js';
import {stepTrade} from './settlement/trade.js';
import {stepOutside, tell} from './outside/index.js';
import {colonyReport} from './outside/report.js';
import {sampleChronicle} from './settlement/chronicle.js';
import {checkEnd} from './settlement/ending.js';
import {createAgent} from './agents/agent.js';
import {newItem, outfit} from './agents/equipment.js';
import {think} from './agents/mind.js';
import {STOCKS, START} from './data/presets.js';
import {log} from './core/log.js';
import {plural, esc} from './core/util.js';
import {editsStamp} from './data/schema/layer.js';

export function newGame(cfg) {
  const w = createWorld(cfg);
  // the table edits it is made under (src/data/schema/layer.js): saved with it, warned of on loading
  const tables = editsStamp(); if (tables) w.tables = tables;
  w.nav = new Navigation(w);
  w.nav.buildAll();
  w.perf = {fields: 0, nav: 0, agents: 0, render: 0};
  const n = cfg.colonists;
  w.founding = true;
  for (let k = 0; k < n; k++) createAgent(w, 'human', 'colony', w.camp.x + 0.5 + (w.rngs.birth() * 5 - 2.5), w.camp.y + 0.5 + (w.rngs.birth() * 5 - 2.5));
  // starting gear: clothes for some or all, the kit goes to the store and is handed out at once
  const st = STOCKS[cfg.stock], clothes = Math.max(st.clothes, START[cfg.start]?.clothes ?? 0);   // nobody sets out in winter undressed
  for (let k = 0; k < Math.round(n * clothes); k++) w.armory.push(newItem('clothes'));
  for (const t of st.kit) w.armory.push(newItem(t));
  w.armoryVersion = 1;
  w.founding = false;
  for (const a of w.agents) { outfit(w, a); think(w, a, 'founded'); }
  tell(w, 'report', colonyReport(w));   // the world hears of the new camp
  log(w, `${n} ${plural(n, 'поселенец', 'поселенца', 'поселенцев')} ${n === 1 ? 'разбил' : 'разбили'} лагерь «${esc(cfg.name)}».`, 'people');
  return w;
}

const ema = (old, v) => old * 0.95 + v * 0.05;

export function step(w) {
  if (w.over) return;
  // the tick's caches (core/util.js perTick) start empty: the panel may have filled them between two
  // ticks from a state the tick itself then changes — a browser game must not drift from a headless one
  w.scratch = {tick: w.tick};
  const t0 = performance.now();
  stepFields(w);
  stepWeather(w);
  stepLakes(w);
  stepPlants(w);
  stepFarms(w);
  stepHerd(w);
  stepColonyGolems(w);   // a dwarven colony's golem forge (settlement/golems.js)
  stepLife(w);
  stepCrafting(w);
  stepPotions(w);   // the stock's healing potions into the people's slots (settlement/potions.js)
  stepRelations(w);
  stepBoard(w);   // the colony's lookouts, the cry, the flags (settlement/board.js)
  stepEscape(w);   // the captives' will to run: the council's rolls, the plot, the red alarm (settlement/escape.js)
  stepMasters(w);   // the council names masters; learners learn beside them (settlement/masters.js)
  stepFreedom(w);   // captives freed, former slaves who stay, leave or become members (settlement/freedom.js)
  stepAttention(w);   // the colony's events that make colonists think again (agents/attention.js)
  stepHerds(w);   // wild herds: pasture, lookouts, alarm (agents/wildHerd.js)
  const t1 = performance.now();
  w.nav.step();
  const t2 = performance.now();
  for (const a of w.agents) {
    if (!a.dead) stepEffects(w, a);
    if (!a.dead) BRAINS.get(a.brain).step(w, a);
    noteAttacker(w, a);   // who attacks whom (agents/lookup.js) follows the step that may have changed it
    if (a.flash) a.flash--;
  }
  w.agents = w.agents.filter(a => !a.dead && !a.gone);
  stepSquads(w);
  stepHunts(w);
  stepCarcasses(w);
  separate(w);
  if (w.fx.length) { for (const f of w.fx) f.t--; w.fx = w.fx.filter(f => f.t > 0); }   // shot traces fade
  // a campaign's camp (campaign/camp.js) is no settlement: no council, no trade
  if (!w.light) { stepCouncil(w); stepTrade(w); }
  stepOutside(w);
  sampleChronicle(w);
  sampleBehaviour(w);
  sweepReserve(w);
  checkEnd(w);
  const t3 = performance.now();
  w.perf.fields = ema(w.perf.fields, t1 - t0); w.perf.nav = ema(w.perf.nav, t2 - t1); w.perf.agents = ema(w.perf.agents, t3 - t2);
  w.tick++;
}
