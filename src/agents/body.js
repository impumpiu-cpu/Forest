// Needs, harm and healing for any agent, driven by NEEDS and the agent's species.
import {NEEDS} from '../data/needs.js';
import {SPECIES} from '../data/species.js';
import {cellOf} from '../world/grid.js';
import {kill, maxHp} from './agent.js';
import {think} from './mind.js';
import {tempAt} from '../world/heat.js';
import {HEAT, BODY} from '../data/behaviour.js';
import {resistTo} from '../data/balance/combat.js';
import {exhaustionStage, exhaustionRow, conditionHasMods, EXHAUSTION, effectResist} from '../data/conditions.js';
import {caughtFrom} from '../data/afflictions.js';
import {catchIll, stepIll, stepTaint, stepWithdrawal} from './afflictions.js';
import {scaleOf, dayLen} from '../core/time.js';
import {refreshBody} from './special.js';
import {lethal} from './wounds.js';
import {quaff, drinkFor, stepPotionEffects} from './potions.js';
import {thornedBy} from './movement.js';
import {THORNS} from '../data/buildings.js';
import {heldOf} from '../data/perks.js';
import {stepBurning} from './abilities.js';
import {T} from '../data/terrain.js';
const fireproofOf = a => heldOf(a, 'fireproof');

// Lasting effects on any creature, whatever its brain: venom from a bite (agents/combat.js) hurts every
// tick until it wears off; a spider's web only slows (agents/movement.js) and is dropped once it is over.
// Called once a tick for every agent from sim.js; the undead never get venom in the first place.
export function stepEffects(w, a) {
  // the thorns of an elven hedge tear whoever comes through (data/buildings.js THORNS)
  if (!a.dead && SPECIES.get(a.species).kind !== 'spirit' && !SPECIES.get(a.species).undead && thornedBy(w, a)) { a.hp -= THORNS.dmg; if (a.hp <= 0) { kill(w, a, 'шипов'); return; } }
  if (a.poison) {
    if (w.tick < a.poison.until) { a.hp -= a.poison.dmg; if (a.hp <= 0) kill(w, a, 'яда'); }
    else a.poison = null;
  }
  if (a.webbed && w.tick >= a.webbed.until) a.webbed = null;
  if (a.burning) stepBurning(w, a, w.grid.terr[cellOf(w, a)] === T.WATER);   // on fire (a breath: agents/abilities.js); water puts it out
  // a bleeding cut (a weapon with `bleed`, data/conditions.js): it hurts every tick until it stops
  if (a.bleeding) {
    // a cut that bleeds out is a wound like a blow's: luck may turn it into a fall (agents/wounds.js lethal)
    if (w.tick < a.bleeding.until) { a.hp -= a.bleeding.dmg; if (a.hp <= 0) lethal(w, a, 'ран', null); }
    else a.bleeding = null;
  }
  if (a.stunned && w.tick >= a.stunned.until) a.stunned = null;
  // an illness runs its course, the rot fades, a hooked one goes without (agents/afflictions.js)
  stepIll(w, a); stepTaint(w, a); stepWithdrawal(w, a);
  // the potions: a venom in the blood calls for the antidote, poison or a bleeding cut at the edge for healing; the ones
  // at work run out (agents/potions.js)
  if (a.poison && a.belt?.length && !a.dead) drinkFor(w, a, 'poisoned');
  if ((a.potions || a.belt?.length) && !a.dead) quaff(w, a);
  if (a.effects) stepPotionEffects(w, a);
}

// The stage of exhaustion follows the needs (data/conditions.js EXHAUSTION); the body is rebuilt only when the stage
// that ends or begins does something (its row has mods), so a stage without numbers changes nothing
function stepExhaustion(a) {
  const now = exhaustionStage(a), was = a.exhaust || 0;
  if (now === was) return;
  if (now) a.exhaust = now; else delete a.exhaust;
  if (conditionHasMods(exhaustionRow(now)) || conditionHasMods(exhaustionRow(was))) refreshBody(a);
}

// Heat above what a species stands (`heatHarm`) burns: by the profile of who it is (data/behaviour.js HEAT), × the
// body's answer to fire (data/balance/combat.js resistTo) × a fire-ward potion at work; one burning with such a potion
// in its belt drinks it (`w` given). → true if it burnt
export function heatHarm(a, sp, T, who, w = null) {
  if (!(T > sp.heatHarm) || fireproofOf(a)?.heat) return false;   // (the forge-master: data/roles.js, a perk «Огнестойкость»)
  const P = HEAT[who];
  if (w && a.belt?.length) drinkFor(w, a, 'fire');
  a.hp -= Math.min(P.max, (T - sp.heatHarm) * P.perDegree) * resistTo(sp, 'fire') * (a.effects ? effectResist(null, a, 'fire') : 1);
  return true;
}

// (the body lives by the sun: in a world with a slower sun its rates are divided by the scale — core/time.js dayScale)
export function stepBody(w, a) {
  const sp = SPECIES.get(a.species), T = tempAt(w, cellOf(w, a)), k = 1 / scaleOf(w);
  let starving = null;
  for (const id of sp.needs) {
    const n = NEEDS.get(id);
    a.needs[id] = Math.min(1, Math.max(0, a.needs[id] - n.decay(w, a, T) * k));
    if (a.needs[id] <= (n.harmBelow ?? 0) && n.harm) { a.hp -= n.harm * k * (n.element ? resistTo(sp, n.element) : 1); starving = n.cause; }
    // remembered hardships and the diary (data/needs.js memory, rememberBelow; thought, thoughtBelow)
    if (n.memory && a.needs[id] < (n.rememberBelow ?? 0.3)) a.mem[n.memory] += BODY.remember * k;
    if (a.diary && a.needs[id] < (n.thoughtBelow ?? 0.15)) think(w, a, n.thought);
  }
  heatHarm(a, sp, T, 'colonist', w);
  stepExhaustion(a);
  // a chill caught in the cold (data/afflictions.js `catch` a day; 0 — never): the colony's people only
  const CH = caughtFrom('cold');
  if (CH && CH.catch > 0 && a.faction === 'colony' && !a.ill && a.needs.warmth != null && a.needs.warmth <= EXHAUSTION.low && w.rngs.colony() < CH.catch / dayLen(w)) catchIll(w, a, CH.id);
  const B = BODY, comfy = sp.needs.every(id => a.needs[id] > B.comfy);
  // wounds close faster in some races (orcs, trolls: mods.regen); fire close by stops a troll's — not a strengthening
  // brew's (mods.mend): the greater of the two works
  const regen = Math.max(a.mods.regen > 1 && T > B.regenStop ? 1 : a.mods.regen ?? 1, a.mods.mend ?? 1);
  // the fallen do not mend by themselves: only a dressed wound stops the bleeding (agents/wounds.js)
  // a mechanism (data/tags.js) never mends by itself: only at a forge (agents/golem.js)
  if (comfy && T < B.mendBelow && !a.downed && !sp.mechanism) a.hp = Math.min(maxHp(a), a.hp + B.mend * maxHp(a) * regen * k);
  if (a.hp <= 0) kill(w, a, starving || (T > B.fireDeath ? 'пожара' : 'ран'));
  return T;
}
