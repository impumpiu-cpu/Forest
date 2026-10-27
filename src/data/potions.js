// Potions (docs/RULES.md «Зелья»). What a potion does is a row of «Состояния» of kind `potion` (data/conditions.js):
// at once (it heals, it cures a state), for a while (mods, a resistance, holding the ground), or on the blade (so many
// blows poison what they strike). This table says what each potion is made of and where.
//
// POTIONS — one row per potion, its grades in order (the plain first, then the strong):
//   use    — when its bearer drinks it by itself (agents/potions.js): wounded — health below POTION.below; poisoned —
//            a venom is in the blood; fight — at the first blow of a fight; blade — rubbed on the weapon at the first blow
//   grades — [{res, tier, at, cost, effect}]: the resource the potion is in the stock and the belt (data/resources.js
//            makes one row for each), the step of skill it takes (data/skills.js TIERS), where it is brewed — healerhut
//            (the settlement's hut and the caravan's: only plain grades of tier ≤ POTION.hutTier; brewed with medicine)
//            or alchemist (a town's laboratory: the strong grades, with alchemy; campaign/town.js), what it takes (a pot
//            always: POTION.pot), and the row of «Состояния» it gives
// A potion that leaves a mark for life (an elixir, later) is not drunk again by one who bears the mark.
//
// The belt (agents/potions.js): the healing potion has a slot of its own (a.potions, at most POTION.slot); any other —
// a strong healing one too — takes one of POTION.belt places (a.belt: the resources, one a place).
import {Registry} from '../core/registry.js';

export const POTION = {
  below: 0.15,     // drunk when health falls below this share of the whole, while still on one's feet
  slot: 3,         // healing potions carried at most
  belt: 2,         // places for the other potions
  herbs: 2,        // healing herbs a healing potion takes (the recipe)
  pot: 1,          // pots every potion is poured into (data/resources.js pots: the potter's work)
  hutTier: 2,      // the highest step a healer's hut brews: what is harder is the alchemist's
  hutPots: 4,      // the potter keeps this many pots for a settlement's healer's hut
  // the settlement's stock fills its people's slots and belts (settlement/potions.js): every `hand` ticks
  hand: 60,
  // a foe carries one with this chance (data/migrations.js raiders)
  foe: 0.03,
  // the caravan (campaign/march.js): a day of camp with the healer's hut in the camp gathers a healing herb with this
  // chance (× 2 in wooded land); herbs are brewed at once into potions while the slots are not full
  camp: {herbs: 0.35, wooded: 2},
};

export const POTIONS = new Registry('potion');
const P = POTION.pot;
POTIONS.registerAll([
  {id: 'heal', label: 'зелье лечения', use: 'wounded', note: 'пьётся само у края смерти',
    grades: [{res: 'potion', tier: 1, at: 'healerhut', cost: {herbs: POTION.herbs, pots: P}, effect: 'potHeal'},
             {res: 'potionStrong', tier: 2, at: 'alchemist', cost: {herbs: 3, honey: 1, pots: P}, effect: 'potHealStrong'}]},
  {id: 'antidote', label: 'противоядие', use: 'poisoned', note: 'пьётся, когда яд в крови',
    grades: [{res: 'antidote', tier: 1, at: 'healerhut', cost: {herbs: 1, slime: 1, pots: P}, effect: 'potAntidote'},
             {res: 'antidoteStrong', tier: 2, at: 'alchemist', cost: {herbs: 2, slime: 2, pots: P}, effect: 'potAntidoteStrong'}]},
  {id: 'bear', label: 'медвежья сила', use: 'fight', note: 'пьётся перед первым ударом боя',
    grades: [{res: 'bearBrew', tier: 2, at: 'healerhut', cost: {bile: 1, braga: 1, pots: P}, effect: 'potBear'},
             {res: 'bearBrewStrong', tier: 3, at: 'alchemist', cost: {bile: 2, braga: 1, honey: 1, pots: P}, effect: 'potBearStrong'}]},
  {id: 'venom', label: 'яд для клинка', use: 'blade', note: 'клинок натирают перед первым ударом боя',
    grades: [{res: 'bladeVenom', tier: 2, at: 'healerhut', cost: {venom: 1, wax: 1, pots: P}, effect: 'potVenom'},
             {res: 'bladeVenomStrong', tier: 3, at: 'alchemist', cost: {venom: 2, wax: 1, pots: P}, effect: 'potVenomStrong'}]},
]);

// a potion's grade by its resource: {potion, grade, k} (k — 0 plain, 1 strong), or null
const byRes = new Map();
for (const p of POTIONS.all()) p.grades.forEach((g, k) => byRes.set(g.res, {potion: p, grade: g, k}));
export const potionOf = res => byRes.get(res) || null;
export const isPotion = res => byRes.has(res);
// every potion resource, the plain healing one first (it fills the slot of its own)
export const POTION_RES = [...byRes.keys()];
// what goes into a belt, in the order it is handed out: potion by potion as the table has them, the strong grade before
// the plain one; one of a kind in a belt (sameKind)
export const BELT_ORDER = POTIONS.all().flatMap(p => p.grades.map(g => g.res).filter(r => r !== 'potion').reverse());
export const sameKind = (a, b) => potionOf(a)?.potion === potionOf(b)?.potion;
// what a caravan keeps, neither sells nor leaves behind before other goods (campaign/town.js, campaign/baggage.js): the
// potions and everything any of them is made of
export const POTION_KEEP = new Set([...POTION_RES, ...POTIONS.all().flatMap(p => p.grades.flatMap(g => Object.keys(g.cost)))]);
// the grades a healer's hut brews (in the settlement and the caravan's camp)
export const hutGrades = () => POTIONS.all().flatMap(p => p.grades.filter(g => g.at === 'healerhut' && g.tier <= POTION.hutTier).map(g => ({potion: p, grade: g})));
