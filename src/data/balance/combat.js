// The numbers of the fight itself (agents/combat.js, agents/equipment.js read them).
// Weapon and armour numbers: data/balance/forms.js and materials.js. Critical blows and the deadly wound:
// data/wounds.js. What SPECIAL does to a blow (strength, swing, dodge): data/special.js EFFECTS.
export const COMBAT = {
  // one melee blow before the weapon and the body: base + random × spread, × weapon dmg × strength × skill
  blow: {base: 0.1, spread: 0.12},
  // one shot that hit, the same way, × weapon dmg (× a colony boost for sling stones)
  shot: {base: 0.12, spread: 0.1},
  // melee skill (0–1) adds to the blow: × (1 + meleeSkill × skill)
  meleeSkill: 0.4,
  // the chance a shot hits: base + skill × ranged skill + aim (Perception) − far × distance / range − moving
  // (the target runs); a creature without the skill shoots as with `noSkill`
  hit: {base: 0.4, skill: 0.4, far: 0.2, moving: 0.12, noSkill: 0.2},
  // the fastest a creature may strike, in ticks, whatever its agility
  minCooldown: 4,
  // arm's length (a species may have its own `attack.reach`)
  reach: 1.25,
  // colonists inside the settlement zone strike this much harder
  home: 1.25,
  // creatures that fear silver: a silvered blade bites them × bane, anything else × plain
  silver: {bane: 2.5, plain: 0.5},
};

// how far finer work (data/quality.js) may push a piece; a quality's own `cap` adds to these
export const CAPS = {block: 0.75, armor: 0.8, warmth: 0.9};

// What a blow is. A weapon's form says how it strikes (forms.js `blow`, and `ranged.type` for a shot), a bare
// blow its species (creatures.js `attack.type`; a fist, a hoof, a tail: blunt). Two things answer to it:
//   armour — a form's `vs` scales its armour against each (mail turns a cut, a hammer goes through it);
//   the body — a species' `resist` scales the damage it takes (creatures.js: a skeleton is all gaps for a
//              spear point and all bone for a club), and so do `melee` and `ranged` there.
export const BLOWS = {pierce: 'колющий', slash: 'рубящий', blunt: 'дробящий'};
// a bare blow whose species does not say, and a shot whose weapon does not say
export const DEFAULT_BLOW = {melee: 'blunt', ranged: 'pierce'};
// armour against a blow never stops more than this
export const ARMOR_VS_CAP = 0.85;

// What a blow is struck with. A form's `scale` gives the weights of the letters ({S: 0.5, A: 0.3}): the blow is
// × (1 − Σ weights) + Σ weight × the letter's factor (data/special.js EFFECTS: str for S, fin for A). Weights
// below 1 in all leave part of the blow to the weapon alone, so a spear serves anyone. A form that does not
// say — and a bare blow — strikes with Strength alone.
export const DEFAULT_SCALE = {S: 1};
export const SCALE_MODS = {S: 'str', A: 'fin'};
