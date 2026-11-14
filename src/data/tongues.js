// Tongues and senses (docs/WORLD.md).
//
// LANGUAGES — who speaks what. A race speaks the tongues of SPEAKS (its own first). In the campaign a town trades
// with the caravan in its people's tongue: when no free member of the caravan speaks any tongue of the town's race,
// the town sells dearer and buys cheaper by `TONGUE.barrier` (0 — as before). campaign/town.js termsOf reads it.
// SENSES — what a body notices by. `darkvision`: sees by night as by day; everyone else's sight × (1 − `NIGHT.loss` ×
// the night) — by the campfire as by day (agents/combat.js darkness: the search for a foe, a shot's reach, the
// watch, the camp's sentries). `scent`: smells one who creeps — within `reach` cells it is found however quietly it goes,
// by day and by night (agents/combat.js canSee: the creeper's `sneak.seen` gives way to the nose).
import {Registry} from '../core/registry.js';
import {CONDITIONS} from './conditions.js';

export const LANGUAGES = new Registry('language');
LANGUAGES.registerAll([
  {id: 'common', label: 'имперский', note: 'язык тракта и торговли'},
  {id: 'elvish', label: 'эльфийский', note: ''},
  {id: 'undertongue', label: 'подземный', note: 'язык тёмных эльфов'},
  {id: 'dwarvish', label: 'дварфийский', note: ''},
  {id: 'orcish', label: 'орочий', note: ''},
  {id: 'goblin', label: 'гоблинский', note: ''},
  {id: 'giant', label: 'великаний', note: 'великаны, огры, тролли'},
  {id: 'gnoll', label: 'гнолльский', note: 'лай и рык'},
  {id: 'dead', label: 'мёртвая речь', note: 'вампиры и некроманты'},
]);
for (const L of LANGUAGES.all()) if (!L.note) L.note = L.label;

// the tongues of each race, its own first
export const SPEAKS = {
  human: ['common'], halfling: ['common'], giant: ['giant'], elf: ['elvish', 'common'], darkelf: ['undertongue', 'elvish'],
  dwarf: ['dwarvish', 'common'], orc: ['orcish'], goblin: ['goblin', 'orcish'], ogre: ['giant'], troll: ['giant'],
  gnoll: ['gnoll'], vampire: ['dead', 'common'], necromancer: ['dead', 'common'],
};
export const TONGUE = {barrier: 0};
export const tonguesOf = race => SPEAKS[race] || [];
export const shareTongue = (racesA, raceB) => racesA.some(r => tonguesOf(r).some(l => tonguesOf(raceB).includes(l)));

export const SENSES = new Registry('sense');
SENSES.registerAll([
  {id: 'darkvision', label: 'ночное зрение', live: true, species: ['dwarf', 'orc', 'goblin', 'darkelf', 'troll', 'ogre', 'vampire', 'upyr', 'necromancer', 'lynx', 'bat', 'varg'],
    note: 'видит ночью как днём'},
  {id: 'scent', label: 'чутьё', live: true, reach: 6, species: ['wolf', 'varg', 'bear', 'polarbear', 'hyena', 'fox', 'boar', 'gnoll'],
    note: 'чует крадущегося: ближе reach клеток его не спрятать ни днём, ни ночью (добычу звери ищут по своим повадкам)'},
]);
// how much of its sight the night takes at its deepest (× nightness); a campfire lights WATCH.fireLight around it
export const NIGHT = {loss: 0.5};
export const hasSense = (species, id) => SENSES.get(id).species.includes(species);
// how far a creature smells one who creeps (0 — it has no nose for it)
export const scentReach = species => { const S = SENSES.get('scent'); return S.live && S.species.includes(species) ? S.reach || 0 : 0; };
// × how far a creature sees now: 1 by day, or for one with darkvision
// (`a` — the creature: a cat's eye at work sees as darkvision does, agents/potions.js)
export const nightSight = (species, night, a = null) => (hasSense(species, 'darkvision') || (a?.effects && a.effects.some(e => CONDITIONS.has(e.id) && CONDITIONS.get(e.id).senses?.includes('darkvision'))) ? 1 : 1 - NIGHT.loss * night);
