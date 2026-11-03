// The strength rating (КС) of a creature: one additive number for how much it is worth in a fight,
// a plain human with tier 0 gear being 100 (numbers and the reasoning: data/balance/creatures.js STRENGTH;
// each species' correction `ks` sits in its row there).
// Raids, threat and gear choices can weigh sides by it instead of by heads.
//
//   strengthOf(a)          — the rating as it is now equipped, at full health
//   strengthOf(a, {now})   — the same at its present health (the wounded count for less)
//   sideStrength(list)     — the sum over the living
//   strengthParts(a)       — offence, staying power and the raw product, for the card and the arena
//   expectedStrength(sp, …) — what one of a species is worth on average as a band brings it (raids plan by it)
import {STRENGTH} from '../data/balance/creatures.js';
import {COMBAT} from '../data/balance/combat.js';
import {CRIT} from '../data/wounds.js';
import {SPECIES} from '../data/species.js';
import {STATS} from '../data/special.js';
import {mulberry, seedNumber} from '../core/rng.js';
import {critChance} from './wounds.js';
import {createAgent, maxHp} from './agent.js';
import {dress, recalcGear, blowStat, mixGain} from './equipment.js';
import {armorAgainst, blockAgainst, resistOf} from './combat.js';
import {BLOWS, traitOf} from '../data/balance/combat.js';
import {meanPlaceDamage} from '../data/anatomy.js';
import {refreshBody} from './special.js';
import {onEdit} from '../data/schema/layer.js';

// a piercing weapon (quality `piercing`) against the armour of the average foe (COMBAT.armourSeen): × what more of it goes through
const pierceGain = q => { const p = traitOf(q, 'piercing'), A = COMBAT.armourSeen; return p ? (1 - A * (1 - p)) / (1 - A) : 1; };
export function strengthParts(a, {now = false} = {}) {
  const {blow: BLOW, shot: SHOT, hit: HIT} = COMBAT;   // (read now: an edit of the table reaches it)
  const sp = SPECIES.get(a.species), g = a.gear || recalcGear(a), m = a.mods || {};
  // a critical blow × CRIT.mul, more for a vicious weapon (data/balance/combat.js WEAPON_QUALITIES)
  const pc = critChance(a), crit = 1 + pc * (CRIT.mul + traitOf(g.melee.q, 'vicious') - 1), critShot = 1 + pc * (CRIT.mul + traitOf(g.ranged?.q, 'vicious') - 1);
  // offence: a blow per tick, and shots on top for one who carries a bow or a sling
  const cd = Math.max(COMBAT.minCooldown, Math.round(g.melee.cd * (m.swing ?? 1)));
  let melee = (BLOW.base + BLOW.spread / 2) * g.melee.dmg * mixGain(g.melee) * blowStat(a, g.melee.scale) * (1 + COMBAT.meleeSkill * (a.skill?.melee || 0)) * crit / cd;
  if (sp.venom) melee += sp.venom.dmg * Math.min(1, sp.venom.ticks / cd);
  // a sly weapon (quality `backstab`): the share of blows from the flank strikes deeper (COMBAT.flank)
  const sly = q => 1 + COMBAT.flank.share * (COMBAT.flank.dmg - 1) * traitOf(q, 'backstab');
  melee *= sly(g.melee.q) * pierceGain(g.melee.q);
  // the other hand strikes after the main blow (quality `paired`, agents/combat.js attack)
  const off = g.offhand;
  if (off) melee += (BLOW.base + BLOW.spread / 2) * off.dmg * off.share * mixGain(off) * blowStat(a, off.scale) * (1 + COMBAT.meleeSkill * (a.skill?.melee || 0)) * (1 + pc * (CRIT.mul + traitOf(off.q, 'vicious') - 1)) * sly(off.q) * pierceGain(off.q) / cd;
  let shot = 0;
  if (g.ranged) {
    const hit = Math.min(0.95, Math.max(0.05, HIT.base + HIT.skill * (a.skill?.ranged ?? HIT.noSkill) + (m.aim || 0) - HIT.far * 0.5));
    shot = (SHOT.base + SHOT.spread / 2) * g.ranged.dmg * mixGain(g.ranged) * critShot * hit / g.ranged.cd * STRENGTH.rangedWeight;
    shot *= pierceGain(g.ranged.q);   // through the armour of the average foe
    // a bundle, not a quiverful; as it is now — what is left of it
    const throws = traitOf(g.ranged.q, 'thrown'); if (throws) shot *= Math.min(1, (now ? g.ranged.item?.ammo ?? throws : throws) / COMBAT.thrown.shots);
  }
  // a shooter shoots while the foe comes or is held by others, and strikes with the bow once it is close
  const offence = melee + shot;
  // staying power: health over the share of blows that land and hurt
  // against the average blow: armour and the body's resistance taken over the three kinds of blow
  const kinds = Object.keys(BLOWS), mean = f => kinds.reduce((s, k) => s + f(k), 0) / kinds.length;
  let staying = (now ? Math.max(0, a.hp) : maxHp(a)) / ((1 - mean(k => armorAgainst(g, k))) * (1 - mean(k => (1 - STRENGTH.shotShare) * blockAgainst(g, k) + STRENGTH.shotShare * blockAgainst(g, k, false))) * (1 - (m.dodge || 0)));
  staying /= mean(k => resistOf(sp, k, true));
  staying /= meanPlaceDamage(sp);   // where blows land on this body (data/anatomy.js): 1 while every place is at 1
  if (sp.weakTo?.includes('silver')) staying /= COMBAT.silver.plain;   // against plain weapons
  if (sp.drinks) staying /= 1 - sp.drinks * STRENGTH.drinksWeight;
  return {offence, staying, raw: offence * staying};
}

// the reference fighter, made once on a scratch world of its own (nothing in the game is touched); made again after
// an edit of the tables (a creature, a race, a form, a material may have changed: data/schema/layer.js onEdit)
let refRaw = null;
onEdit(() => { refRaw = null; expected.clear(); });
export function referenceRaw() {
  if (refRaw != null) return refRaw;
  const R = STRENGTH.ref, w = {rngs: {birth: mulberry(1)}, agents: [], nextId: 1, nameIdx: 0};
  const a = createAgent(w, R.species, 'raiders', 0, 0);
  if (a.special) { for (const s of STATS.ids()) a.special[s] = R.special; refreshBody(a); a.hp = maxHp(a); }
  a.skill = {melee: R.skill, ranged: R.skill};
  dress(a, R.kit);
  return (refRaw = strengthParts(a).raw);
}

const ratingOf = (raw, species, alpha = STRENGTH.alpha) => STRENGTH.base * (raw / referenceRaw()) ** alpha * (SPECIES.get(species).ks ?? 1);
// a rider is worth its mount too (agents/mount.js): a trained beast of its kind, at the share of health it has left
const mountWorth = m => (m?.hp > 0 ? expectedStrength(m.species, {key: 'mount', prepare: b => { b.marks = ['trained']; refreshBody(b); }}) * Math.min(1, m.hp / (m.max || m.hp)) : 0);
export const strengthOf = (a, opt) => ratingOf(strengthParts(a, opt).raw, a.species) + mountWorth(a.mount);
export const sideStrength = (list, opt) => list.reduce((s, a) => s + (a.dead ? 0 : strengthOf(a, opt)), 0);

// What a creature of a species is expected to be worth as it comes: `n` of them rolled on a scratch world
// with private random numbers (nothing the game draws is touched), each given `kit` (a list of items, or a
// function rng → list for kits that are drawn) and `prepare(a)` (what the band does to its members),
// rated at their present health. Kept per `key`: the caller names what makes two estimates the same.
const expected = new Map();
export function expectedStrength(species, {key = "", kit = null, prepare = null, n = 64} = {}) {
  const k = species + '|' + key;
  if (expected.has(k)) return expected.get(k);
  const rng = mulberry(seedNumber('expected/' + k)), w = {rngs: {birth: rng}, agents: [], nextId: 1, nameIdx: 0};
  let sum = 0;
  for (let i = 0; i < n; i++) {
    w.agents = [];
    const a = createAgent(w, species, 'raiders', 0, 0);
    const list = typeof kit === 'function' ? kit(rng) : kit;
    if (list?.length && a.equip) dress(a, list, 15);
    prepare?.(a);
    sum += strengthOf(a, {now: true});
  }
  expected.set(k, sum / n);
  return sum / n;
}
