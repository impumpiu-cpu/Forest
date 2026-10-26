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
  // where an armed blow comes from (agents/combat.js stanceOf; beasts' bites do not count it): from the flank — the target
  // fights someone else: its block × block, the blow × dmg; in the back — the target does not know (asleep, or not in a
  // fight and not hurt for `aware` ticks): no block, the blow × dmg. A sly weapon (quality `backstab`) adds its value
  // to the share over 1 (a dagger: × 1 + 0.2 × 2). `share` — how many of a fighter's blows the rating (КС) counts as
  // from the flank
  flank: {block: 0.5, dmg: 1.2, share: 0.25},
  back: {dmg: 1.4, aware: 60},
  // a thrown weapon (quality `thrown`): the rating (КС) counts its throws against this many shots in a fight
  thrown: {shots: 6},
  // the armour a blow or a shot meets on the average foe: what the rating (КС) lets a piercing weapon (quality `piercing`)
  // get through
  armourSeen: 0.3,
  // a shield-bearer covers a neighbour from shots: one of the target's side within `near` cells, closer to the shooter
  // than the target and off the line by no more than `side` cells, catches the shot with its shield's cover × `share`
  cover: {near: 1.6, side: 0.9, share: 0.6},
  // a net that falls on someone (quality `ensnare`): its step × slow for `ticks`, and it cannot strike for `hold`
  net: {slow: 0.25, ticks: 240, hold: 90},
  // one who creeps (a.sneaking: a cutthroat, a scout) is seen only this close: `seen` cells + `armour` × its armour (mail
  // clinks); its first blow or shot gives it away
  sneak: {seen: 3, armour: 6},
};

// how far finer work (data/quality.js) may push a piece; a quality's own `cap` adds to these
export const CAPS = {block: 0.75, armor: 0.8, warmth: 0.9};

// What a blow is. A weapon's form says how it strikes (forms.js `blow`, and `ranged.type` for a shot), a bare
// blow its species (creatures.js `attack.type`; a fist, a hoof, a tail: blunt). Two things answer to it:
//   armour and block — a form's `vs` scales its armour, or its block, against each (mail turns a cut, a hammer
//            goes through it; a hide shield catches a spear point, a club breaks through it);
//   the body — a species' `resist` scales the damage it takes (creatures.js: a skeleton is all gaps for a
//              spear point and all bone for a club), and so do `melee` and `ranged` there.
export const BLOWS = {pierce: 'колющий', slash: 'рубящий', blunt: 'дробящий'};
// a bare blow whose species does not say, and a shot whose weapon does not say
export const DEFAULT_BLOW = {melee: 'blunt', ranged: 'pierce'};
// armour (or a block) against a blow never stops more than this
export const ARMOR_VS_CAP = 0.85;

// What a blow is struck with. A form's `scale` gives the weights of the letters ({S: 0.5, A: 0.3}): the blow is
// × (1 − Σ weights) + Σ weight × the letter's factor (data/special.js EFFECTS: str for S, fin for A). Weights
// below 1 in all leave part of the blow to the weapon alone, so a spear serves anyone. A form that does not
// say — and a bare blow — strikes with Strength alone.
export const DEFAULT_SCALE = {S: 1};
export const SCALE_MODS = {S: 'str', A: 'fin'};

// ── Kinds of harm (docs/RULES.md). The three blows above, the elements and the banes. A species' `resist`
// (creatures.js; the table «Урон по видам») holds × the damage for each id here and for the delivery (melee,
// ranged); an empty cell is 1. Where each one is dealt:
//   blow    — every blow and shot (agents/combat.js damage), × the delivery too
//   element — fire: the heat of a burning or hot cell (agents/body.js heatHarm); cold: the frost when warmth runs
//             out (data/needs.js warmth `element`); poison: a venomous bite (agents/combat.js); rot: an undead's blow
//             (agents/afflictions.js taintBy, the taint — 0 a blow by default)
//   bane    — silver: a silvered blade, on top of the fear of silver (tag, data/tags.js); holy: no source yet
export const DAMAGE_TYPES = [
  {id: 'pierce', kind: 'blow', label: 'колющий', source: 'копья, стрелы, кинжалы, клыки'},
  {id: 'slash', kind: 'blow', label: 'рубящий', source: 'мечи, топоры, когти'},
  {id: 'blunt', kind: 'blow', label: 'дробящий', source: 'булавы, дубины, кулаки, копыта, хвосты'},
  {id: 'fire', kind: 'element', label: 'огонь', source: 'жар горящей или раскалённой клетки, дыхание дракона (через огонь)'},
  {id: 'cold', kind: 'element', label: 'холод', source: 'мороз, когда тепло кончилось'},
  {id: 'poison', kind: 'element', label: 'яд', source: 'укус ядовитого (змеи, пауки, скорпионы)'},
  {id: 'rot', kind: 'element', label: 'порча', source: 'удар нежити — порча на теле («Зависимость и порча» taint.perHit; по умолчанию 0)'},
  {id: 'silver', kind: 'bane', label: 'серебро', source: 'посеребрённый клинок — сверх страха серебра'},
  {id: 'holy', kind: 'bane', label: 'святость', source: 'пока нет'},
];
export const DAMAGE_KINDS = {blow: 'удар', element: 'стихия', bane: 'погибель'};
export const DELIVERY = {melee: 'вблизи', ranged: 'издали'};
// × the damage of a kind (or a delivery) to a species: its `resist`, else 1
export const resistTo = (sp, id) => sp.resist?.[id] ?? 1;

// ── Weapon qualities (docs/RULES.md), as damage effects and qualities in Fallout 2d20: a form or a material
// gives them with a value ({piercing: 0.2}); an item has the sum of its form's and its material's. `live` — the
// game reads it now; the others wait for their mechanic.
export const WEAPON_QUALITIES = [
  {id: 'piercing', label: 'пробивное', unit: 'доля', live: true, reads: 'бой: броня цели × (1 − значение)', note: 'гранёный наконечник, клевец: снимает долю брони'},
  {id: 'vicious', label: 'жестокое', unit: '+', live: true, reads: 'крит: множитель урона + значение; КС', note: 'бьёт страшнее, когда удар удачен'},
  {id: 'reach', label: 'длинное', unit: 'клеток', live: true, reads: 'досягаемость удара + значение (agents/combat.js reachOf)', note: 'бьёт из-за плеча'},
  {id: 'parry', label: 'парирующее', unit: 'доля', live: true, reads: 'блок против ударов (не стрел) + значение; КС', note: 'отводит клинок'},
  {id: 'unreliable', label: 'ненадёжное', unit: 'доля', live: true, reads: 'износ × (1 + значение)', note: 'ломается скорее'},
  {id: 'bleed', label: 'кровопускающее', unit: 'шанс', live: true, reads: 'шанс оставить кровотечение (состояние «кровотечение», data/conditions.js)', note: 'зазубренное лезвие'},
  {id: 'stun', label: 'оглушающее', unit: 'шанс', live: true, reads: 'шанс оглушить (состояние «оглушён»: не бьёт, медленнее ходит)', note: 'тяжёлый удар по голове'},
  {id: 'backstab', label: 'коварное', unit: '×', live: true, reads: 'удар с фланга и в спину (COMBAT.flank, back): прибавка урона × (1 + значение); КС', note: 'кинжал: туда, где не ждут'},
  {id: 'ensnare', label: 'ловчее', unit: 'шанс', live: true, reads: 'попавший опутывает: состояния «в паутине» (шаг × COMBAT.net.slow) и «оглушён» (не бьёт COMBAT.net.hold тиков)', note: 'ловчая сеть'},
  {id: 'paired', label: 'парное', unit: 'доля', live: true, reads: 'вторая рука: вслед за ударом главного оружия бьёт и это, урон × значение (agents/combat.js attack); выбор вещей, КС', note: 'кинжал, топорик, меч во второй руке'},
  {id: 'thrown', label: 'метательное', unit: 'бросков', live: true, reads: 'бросается своим `ranged` (agents/combat.js shoot): столько бросков в связке, последнее остаётся в руке; поселенец собирает их у лагеря (agents/equipment.js outfit); КС — доля от COMBAT.thrown.shots', note: 'дротики, метательный топорик'},
];
// the value of a quality on a weapon (an item definition, or the gear's melee/ranged entry), 0 without it
export const traitOf = (q, id) => q?.[id] || 0;
