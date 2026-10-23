// Needs, harm and healing for any agent, driven by NEEDS and the agent's species.
import {NEEDS} from '../data/needs.js';
import {SPECIES} from '../data/species.js';
import {cellOf} from '../world/grid.js';
import {kill, maxHp} from './agent.js';
import {think} from './mind.js';
import {tempAt} from '../world/heat.js';
import {HEAT} from '../data/behaviour.js';
import {resistTo} from '../data/balance/combat.js';

const NEED_THOUGHT = {food: 'starving', warmth: 'freezing', rest: 'exhausted'};

// remembered hardships use the need's `memory` key once the level drops below `remember`
const REMEMBER_BELOW = {food: 0.3, rest: 0.25, warmth: 0.4};

// Lasting effects on any creature, whatever its brain: venom from a bite (agents/combat.js) hurts every
// tick until it wears off; a spider's web only slows (agents/movement.js) and is dropped once it is over.
// Called once a tick for every agent from sim.js; the undead never get venom in the first place.
export function stepEffects(w, a) {
  if (a.poison) {
    if (w.tick < a.poison.until) { a.hp -= a.poison.dmg; if (a.hp <= 0) kill(w, a, 'яда'); }
    else a.poison = null;
  }
  if (a.webbed && w.tick >= a.webbed.until) a.webbed = null;
}

// Heat above what a species stands (`heatHarm`) burns: by the profile of who it is (data/behaviour.js HEAT), × the
// body's answer to fire (data/balance/combat.js resistTo). → true if it burnt
export function heatHarm(a, sp, T, who) {
  if (!(T > sp.heatHarm)) return false;
  const P = HEAT[who];
  a.hp -= Math.min(P.max, (T - sp.heatHarm) * P.perDegree) * resistTo(sp, 'fire');
  return true;
}

export function stepBody(w, a) {
  const sp = SPECIES.get(a.species), T = tempAt(w, cellOf(w, a));
  let starving = null;
  for (const id of sp.needs) {
    const n = NEEDS.get(id);
    a.needs[id] = Math.min(1, Math.max(0, a.needs[id] - n.decay(w, a, T)));
    if (a.needs[id] <= (n.harmBelow ?? 0) && n.harm) { a.hp -= n.harm * (n.element ? resistTo(sp, n.element) : 1); starving = n.cause; }
    if (n.memory && a.needs[id] < (REMEMBER_BELOW[id] ?? 0.3)) a.mem[n.memory] += 0.004;
    if (a.diary && a.needs[id] < 0.15) think(w, a, NEED_THOUGHT[id]);
  }
  heatHarm(a, sp, T, 'colonist');
  const comfy = sp.needs.every(id => a.needs[id] > 0.4);
  // wounds close faster in some races (orcs, trolls: mods.regen); fire close by stops a troll's
  const regen = a.mods.regen > 1 && T > 30 ? 1 : a.mods.regen ?? 1;
  // the fallen do not mend by themselves: only a dressed wound stops the bleeding (agents/wounds.js)
  if (comfy && T < 45 && !a.downed) a.hp = Math.min(maxHp(a), a.hp + 0.0003 * maxHp(a) * regen);
  if (a.hp <= 0) kill(w, a, starving || (T > 60 ? 'пожара' : 'ран'));
  return T;
}
