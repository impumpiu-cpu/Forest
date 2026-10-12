// Creatures. A species sets body stats, which needs it has, how it looks and, for animals,
// its own brain and what hunting it yields. Add a fantasy race or a new animal here.
import {Registry} from '../core/registry.js';

export const SPECIES = new Registry('species');

// [name, gender]; gender picks the verb endings in the journal and the diary
export const HUMAN_NAMES = [['Милава', 'f'], ['Ждан', 'm'], ['Горислав', 'm'], ['Веселина', 'f'], ['Тихон', 'm'], ['Любава', 'f'],
  ['Мирон', 'm'], ['Злата', 'f'], ['Ярослав', 'm'], ['Дарина', 'f'], ['Ратибор', 'm'], ['Снежана', 'f'], ['Боян', 'm'],
  ['Забава', 'f'], ['Светозар', 'm'], ['Агния', 'f'], ['Велимир', 'm'], ['Олеся', 'f'], ['Добрыня', 'm'], ['Василиса', 'f'],
  ['Радим', 'm'], ['Ведана', 'f']];

SPECIES.registerAll([
  {id: 'human', label: 'человек', hp: 1, speed: 0.13, needs: ['food', 'rest', 'warmth'],
    heatHarm: 70, look: {shape: 'person', size: 0.62}, names: HUMAN_NAMES, sentient: true, inventory: true,
    attack: {power: 1, cooldown: 12}},

  // Hares graze, rest at night, bolt from people and fire. They never breed here:
  // their numbers change only through migration (see migrations.js).
  // game: shows up on the prey flow field that hunters and predators follow
  {id: 'hare', label: 'заяц', labelAcc: 'зайца', hp: 0.12, speed: 0.17, needs: [], brain: 'grazer', game: true,
    heatHarm: 60, look: {shape: 'hare', size: 0.42, color: '#cdbb9a'},
    yields: {meat: 2, hide: 1, bone: 1},
    flee: {radius: 4.5, sprint: 1.45, from: ['human', 'wolf'], stamina: 0.007},
    grazes: {terrain: ['grass'], eatsBerries: 0.004},
    leaveChance: 0.0004},

  // Wolves hunt hares in packs and may go for a person who wanders off alone, mostly at night
  // or when starving. They shun the lit camp, fire and groups of people, and leave when wounded
  // or when the hares run out. Like everyone else they only arrive and depart by migration.
  {id: 'wolf', label: 'волк', labelAcc: 'волка', hp: 0.8, speed: 0.14, needs: ['food'], brain: 'predator',
    mods: {hunger: 0.9},
    heatHarm: 60, look: {shape: 'wolf', size: 0.58, color: '#8d8f96'},
    attack: {power: 0.85, cooldown: 14},
    yields: {meat: 1, hide: 2, bone: 2},
    killMessage: name => `Волки загрызли поселенца: <b>${name}</b>.`,
    // Hunger drives everything: boldness = 0 when fed (food ≥ hungry), 1 when starving (food ≤ starving).
    predator: {
      prey: ['hare'],            // what it hunts for food
      victims: ['human'],        // whom it attacks: a lone colonist, or a pair when desperate
      sprint: 1.9, stamina: 0.003,
      sight: 22,                 // how far it notices prey
      obvious: 8,                // prey this close is chased even by a wolf that is not hungry yet…
      sated: 0.92,               // …unless it has just eaten
      hungry: 0.7, starving: 0.1,
      boldPeople: 0.45,          // boldness (+ night) needed to go for a person
      loneRadius: 6,             // nobody else of the victim's kind this close → the victim is alone
      zoneShy: 2, zoneShyNight: 5, // keeps this many cells outside the settlement zone (less when starving)
      groupFear: 3,              // this many people together make it back off (more when starving)
      feedTicks: 90, meal: 1.6,  // a kill is shared: the pack splits `meal` units of fullness
      calm: 900,                 // after a try at people the pack waits this long (less when starving)
      bigMeal: 3,                // a person feeds the whole pack this much
      wanderOff: 0.0012,         // per tick, a starving pack with no prey in sight leaves for other grounds
    }},
]);
