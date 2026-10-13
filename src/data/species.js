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
      prey: ['hare', 'deer', 'fox'], // what it hunts for food (goats keep to the rocks and are not worth the chase)
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
      weakPrey: ['mule'],        // big game it dares to hunt only when the animal is badly hurt…
      weakBelow: 0.35,           // …below this share of its health; it is bitten down, not caught at once
    }},

  // Deer: the main game of the woods — skittish, fast, a lot of meat and a good hide.
  {id: 'deer', label: 'олень', labelAcc: 'оленя', hp: 0.45, speed: 0.15, needs: [], brain: 'grazer', game: true,
    heatHarm: 60, look: {shape: 'deer', size: 0.62, color: '#a8794a'},
    yields: {meat: 5, hide: 2, bone: 2},
    flee: {radius: 7, sprint: 1.6, from: ['human', 'wolf'], stamina: 0.006},
    grazes: {terrain: ['grass', 'forest'], eatsBerries: 0.002},
    leaveChance: 0.0003},

  // Fox: small and quick, hunted for its fur, which traders pay well for.
  {id: 'fox', label: 'лиса', labelAcc: 'лису', hp: 0.15, speed: 0.18, needs: [], brain: 'grazer', game: true,
    heatHarm: 60, look: {shape: 'fox', size: 0.42, color: '#d0703a'},
    yields: {meat: 1, furs: 1},
    flee: {radius: 6, sprint: 1.5, from: ['human', 'wolf'], stamina: 0.006},
    grazes: {terrain: ['grass', 'forest'], eatsBerries: 0},
    leaveChance: 0.0004},

  // Boar: fat and dangerous. Like the mule it does not run: it kicks back with its tusks and charges
  // whoever shot it. Hunters go for it only when there is no gentler game about.
  {id: 'boar', label: 'кабан', labelAcc: 'кабана', hp: 1.3, speed: 0.12, needs: [], brain: 'mule', big: true, game: true,
    heatHarm: 60, look: {shape: 'boar', size: 0.62, color: '#4a3a30'},
    attack: {power: 1.45, cooldown: 14},
    yields: {meat: 6, hide: 2, bone: 1},
    killMessage: name => `Кабан задрал поселенца: <b>${name}</b>.`,
    mule: {kickRange: 1.0, charge: 2.1, chargeHit: 1.6, chargeFrom: 1.8, grudge: 300, giveUp: 18, fleeBelow: 0.3, leaveChance: 0.0003}},

  // Rats: they come for the stock when there is a lot of food and nothing to keep them out of it.
  // They nibble what lies in the open (pots and a granary protect it) and run from people;
  // whoever catches one near the stores kills it (agents/brains/vermin.js).
  {id: 'rat', label: 'крыса', labelAcc: 'крысу', hp: 0.05, speed: 0.15, needs: [], brain: 'vermin',
    heatHarm: 55, look: {shape: 'rat', size: 0.25, color: '#7c7468'},
    vermin: {eats: 0.0016, flee: 1.6, caught: 0.04}},

  // The mule: a big, stubborn grazer, a small bull really. It does not run from people; it kicks
  // whoever comes at it, and someone who shoots it from afar gets charged and trampled. Wolves
  // dare only a badly wounded one. Wild mules wander in now and then; traders bring pack mules.
  // big: hunters and wolves fight it rather than finish it with one bite or arrow.
  {id: 'mule', label: 'мул', labelAcc: 'мула', hp: 3.2, speed: 0.11, needs: [], brain: 'mule', big: true, legend: 'мул',
    heatHarm: 62, look: {shape: 'mule', size: 0.85, color: '#7a5232'},
    attack: {power: 1.9, cooldown: 16},
    yields: {meat: 9, hide: 3, bone: 4},
    killMessage: name => `Мул затоптал поселенца: <b>${name}</b>.`,
    mule: {
      kickRange: 1.1,            // close enough to kick
      charge: 2.0,               // sprint when charging someone who hit it from afar
      chargeHit: 1.5,            // the first blow after a run hits this much harder
      chargeFrom: 2.2,           // a hit from further than this makes it charge
      grudge: 360,               // how long it keeps after whoever hurt it
      giveUp: 22,                // …unless they get this far away
      fleeBelow: 0.3,            // badly hurt: it limps off instead
      leaveChance: 0.0002,       // per tick, a wild mule wanders off the map
    },
    // tamed it hauls logs and stone and pulls the plough (see `tame` on the goat for the fields)
    tame: {chance: 0.22, space: 2, bait: {hay: 2}, eats: 1.2, kicks: true, stack: 2, max: 2,
      effects: {jobSpeed: {chop: 1.15, mine: 1.15, dig: 1.15, farm: 1.25}},
      names: ['Буян', 'Гнедко', 'Упрямец', 'Тяжеступ', 'Ворчун'],
      effect: 'возит брёвна и камень (рубка, камень и руда +15%), тянет соху (поле +25%)'}},

  // Goat: a wild goat of the rocky meadows. Skittish like a deer, but a patient herder with an
  // armful of hay can tame it; in a pen it gives milk and wool and has kids in spring and summer.
  {id: 'goat', label: 'коза', labelAcc: 'козу', hp: 0.3, speed: 0.14, needs: [], brain: 'grazer', game: true, legend: 'коза',
    heatHarm: 60, look: {shape: 'goat', size: 0.46, color: '#d6cdb6'},
    yields: {meat: 3, hide: 1, bone: 1},
    flee: {radius: 4.5, sprint: 1.5, from: ['human', 'wolf'], stamina: 0.006},
    grazes: {terrain: ['grass'], eatsBerries: 0.002},
    leaveChance: 0.0001,
    // tame: how the herder's job (data/jobs.js 'herd') and the pen (settlement/herd.js) treat it
    //   chance: of one try with bait to tame it (× the herder's skill; every failed try makes the next easier)
    //   space:  places it takes in a pen;  bait: what one try costs from the stock
    //   eats:   hay a day when there is no grass in the pen (less in the grazing seasons)
    //   milk:   portions a day while fed (little in winter);  wool: fleece sheared once it has grown back
    //   breed:  chance a day for a kid while there are two of them, room in the pen and it is not winter
    //   kicks:  a failed try ends with a kick;  max: no more of them are tamed (the colony has no use for more)
//   effects: work it does for the colony (settlement/mods.js),
    //   counted for up to `stack` animals;  names: what the herders call them
    tame: {chance: 0.45, space: 1, bait: {hay: 1}, eats: 0.6, milk: 1.2, wool: 3, woolDays: 40, breed: 0.06, grownDays: 20,
      names: ['Белянка', 'Пеструшка', 'Зорька', 'Рогатка', 'Маруська', 'Бодуша', 'Сивка', 'Дереза', 'Звёздочка', 'Чернушка'],
      effect: 'даёт молоко и шерсть, в тёплое время приносит козлят'}},
]);
