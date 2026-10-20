// The strength rating (КС) of a creature: one additive number for how much it is worth in a fight,
// a plain human with tier 0 gear being 100 (numbers and the reasoning: data/balance/strength.js).
// Raids, threat and gear choices can weigh sides by it instead of by heads.
//
//   strengthOf(a)          — the rating as it is now equipped, at full health
//   strengthOf(a, {now})   — the same at its present health (the wounded count for less)
//   sideStrength(list)     — the sum over the living
//   strengthParts(a)       — offence, staying power and the raw product, for the card and the arena
import {STRENGTH} from '../data/balance/strength.js';
import {COMBAT} from '../data/balance/combat.js';
import {CRIT} from '../data/wounds.js';
import {SPECIES} from '../data/species.js';
import {STATS} from '../data/special.js';
import {mulberry} from '../core/rng.js';
import {critChance} from './wounds.js';
import {createAgent, maxHp} from './agent.js';
import {dress, recalcGear} from './equipment.js';
import {refreshBody} from './special.js';

const {blow: BLOW, shot: SHOT, hit: HIT} = COMBAT;

export function strengthParts(a, {now = false} = {}) {
  const sp = SPECIES.get(a.species), g = a.gear || recalcGear(a), m = a.mods || {};
  const crit = 1 + critChance(a) * (CRIT.mul - 1);
  // offence: the better of a blow and a shot, per tick
  const cd = Math.max(COMBAT.minCooldown, Math.round(g.melee.cd * (m.swing ?? 1)));
  let melee = (BLOW.base + BLOW.spread / 2) * g.melee.dmg * (m.str ?? 1) * (1 + COMBAT.meleeSkill * (a.skill?.melee || 0)) * crit / cd;
  if (sp.venom) melee += sp.venom.dmg * Math.min(1, sp.venom.ticks / cd);
  let shot = 0;
  if (g.ranged) {
    const hit = Math.min(0.95, Math.max(0.05, HIT.base + HIT.skill * (a.skill?.ranged ?? HIT.noSkill) + (m.aim || 0) - HIT.far * 0.5));
    shot = (SHOT.base + SHOT.spread / 2) * g.ranged.dmg * crit * hit / g.ranged.cd * STRENGTH.rangedWeight;
  }
  const offence = Math.max(melee, shot);
  // staying power: health over the share of blows that land and hurt
  let staying = (now ? Math.max(0, a.hp) : maxHp(a)) / ((1 - (g.armor || 0)) * (1 - (g.block || 0)) * (1 - (m.dodge || 0)));
  if (sp.resist?.melee) staying /= sp.resist.melee;
  if (sp.weakTo?.includes('silver')) staying /= COMBAT.silver.plain;   // against plain weapons
  if (sp.drinks) staying /= 1 - sp.drinks * STRENGTH.drinksWeight;
  return {offence, staying, raw: offence * staying};
}

// the reference fighter, made once on a scratch world of its own (nothing in the game is touched)
let refRaw = null;
export function referenceRaw() {
  if (refRaw != null) return refRaw;
  const R = STRENGTH.ref, w = {rngs: {birth: mulberry(1)}, agents: [], nextId: 1, nameIdx: 0};
  const a = createAgent(w, R.species, 'raiders', 0, 0);
  if (a.special) { for (const s of STATS.ids()) a.special[s] = R.special; refreshBody(a); a.hp = maxHp(a); }
  a.skill = {melee: R.skill, ranged: R.skill};
  dress(a, R.kit);
  return (refRaw = strengthParts(a).raw);
}

export const ratingOf = (raw, species, alpha = STRENGTH.alpha) => STRENGTH.base * (raw / referenceRaw()) ** alpha * (STRENGTH.adjust[species] ?? 1);
export const strengthOf = (a, opt) => ratingOf(strengthParts(a, opt).raw, a.species);
export const sideStrength = (list, opt) => list.reduce((s, a) => s + (a.dead ? 0 : strengthOf(a, opt)), 0);
