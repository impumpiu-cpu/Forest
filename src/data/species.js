// Creatures. A species sets body stats, which needs it has, how it looks and, for animals,
// its behaviours (the list `behaviours`: docs/BEHAVIOUR.md; a race has none and thinks by its faction) and what hunting it yields. Animals live here; thinking races in data/races.js,
// the rot's undead and other raid monsters in data/monsters.js. All of them end up in SPECIES.
//   mind: how it thinks — one field (MINDS below): 'mindless' (the risen dead: no fear, no cunning) · 'beast' · 'semi'
//         (a warg, a spirit, an upyr) · 'sentient' (the races: hired, bargained with, taken captive). The fighting roles
//         read it as the depth of their tactics (agents/tactics.js)
//   special, hp, speed, attack: in data/balance/creatures.js, one row per species (bodyFor merges it);
//            for beasts `relativeStats`: the row is the typical animal
//   trophies: rare extras on top of `yields`, decided once when the colony kills it (agents/trophies.js):
//            [{res, n, chance, tier?}] — `tier`: a delicate organ only a skilled hand gets out whole (trophyExtraction, A)
//   habitat: {biome: 'common' | 'usual' | 'rare' | 'scarce'} (data/biomes.js); none — lives everywhere
//   g:       the grammatical gender of `label` when it is not masculine ('f', 'n'): «коза — своя» (ui/cards.js)
//   kind:    what it is to the world (KINDS below): the world map lets each kind in through its own door
//            (docs/WORLD.md); data/species.js and data/bestiary.js set it on
//            the beasts, monsters and spirits, data/races.js on the races, data/monsters.js on the undead
import {Registry} from '../core/registry.js';
import {RACES} from './races.js';
import {MONSTERS} from './monsters.js';
import {BESTIARY} from './bestiary.js';
import {CONSTRUCTS} from './constructs.js';
import {bodyFor, CREATURES} from './balance/creatures.js';
import {petNames} from './names.js';
import {WAYS, BEAT} from './behaviour.js';

// how a creature thinks (`mind`): the words, in order from none to full
export const MINDS = {mindless: 'безмозглый', beast: 'зверь', semi: 'полуразумный', sentient: 'разумный'};
export const isSentient = sp => sp?.mind === 'sentient';
export const isMindless = sp => sp?.mind === 'mindless';

export const SPECIES = new Registry('species');

// a hunter of the pack: has the `predator` block (data/behaviour.js WAYS.predator reads it)
export const isPredator = sp => !!sp.predator;
// silver bites it (`weakTo`, the tag «Боится серебра»)
export const fearsSilver = sp => !!sp?.weakTo?.includes('silver');
// the brain a creature of this species is born with: its own (a race names none: the faction's — colonist, raider, caravan),
// or the tabled one for every row that lists its behaviours (agents/brains/tabled.js, docs/BEHAVIOUR.md)
export const brainOf = (sp, fa) => sp.brain || (sp.behaviours ? 'tabled' : fa?.brain);


// What a species is to the world. On the world map (src/atlas/) each kind comes in its own way:
//   beast    — the beasts: fields of density by biome, prey and predators (atlas/fauna.js)
//   monster  — the monsters of the wild era: the same fields, and lairs that hold them (atlas/lairs.js)
//   spirit   — the nechist of a place: bound to it, never spreads (atlas/fauna.js, `resident`)
//   race     — the thinking races: the peoples with towns (atlas/peoples.js, data/peoples.js) or the
//              tribes with camps instead of towns (to come)
//   undead   — the rot's dead: from the barrows of old battles, burnt towns and necromancers (to come)
//   fiend    — demons: magic is rare in this world; they come through the rifts at live volcanoes
//              and plate seams (atlas/lairs.js `rift`), few and far from the colony
//   construct — the dwarves' golems (data/constructs.js): made at a golem forge, never born or wild
export const KINDS = {beast: 'звери', monster: 'чудовища', spirit: 'нечисть', race: 'разумные', undead: 'нежить', fiend: 'демоны', construct: 'механизмы'};
SPECIES.registerAll([
  // Hares graze, rest at night, bolt from people and fire. They never breed here:
  // their numbers change only through migration (see migrations.js).
  // game: shows up on the prey flow field that hunters and predators follow
  {id: 'hare', snowfoot: true, kind: 'beast', label: 'заяц', labelAcc: 'зайца', plural: 'зайцы', needs: [], behaviours: [...WAYS.grazer], heart: BEAT.grazer,
    habitat: {meadow: 'common', steppe: 'common', forest: 'usual', taiga: 'usual', shrubland: 'usual', savanna: 'rare', tundra: 'rare', foothills: 'rare', barrows: 'usual'},
    heatHarm: 60, look: {shape: 'hare', size: 0.42, color: '#cdbb9a'},
    yields: {meat: 2, hide: 1, bone: 1},
    flee: {radius: 4.5, sprint: 1.45, from: ['people', 'wolf'], stamina: 0.007},
    grazes: {terrain: ['grass'], eatsBerries: 0.004},
    leaveChance: 0.0004},

  // Wolves hunt hares in packs and may go for a person who wanders off alone, mostly at night
  // or when starving. They shun the lit camp, fire and groups of people, and leave when wounded
  // or when the hares run out. Like everyone else they only arrive and depart by migration.
  // remembers: the key of a colonist's memory of a fight with one of these (a.mem; the council's motives read it,
  // data/buildings.js); a fight with anyone else is remembered as 'raid' (agents/combat.js)
  {id: 'wolf', remembers: 'wolf', sylvan: true, kind: 'beast', label: 'волк', labelAcc: 'волка', plural: 'волки', needs: ['food'], behaviours: [...WAYS.predator], heart: BEAT.predator,
    habitat: {taiga: 'common', tundra: 'usual', steppe: 'usual', forest: 'usual', foothills: 'usual', highlands: 'rare', meadow: 'rare'},
    mods: {hunger: 0.9},
    heatHarm: 60, look: {shape: 'wolf', size: 0.58, color: '#8d8f96'},
    yields: {meat: 1, hide: 2, bone: 2}, trophies: [{res: 'furs', n: 1, chance: 0.15}],
    killMessage: name => `Волки загрызли поселенца: <b>${name}</b>.`,
    // Hunger drives everything: boldness = 0 when fed (food ≥ hungry), 1 when starving (food ≤ starving).
    predator: {
      prey: ['hare', 'deer', 'fox'], // what it hunts for food (goats keep to the rocks and are not worth the chase)
      victims: ['people'],       // whom it attacks ('people': any thinking race): a lone colonist, or a pair when desperate
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
  {id: 'deer', sylvan: true, kind: 'beast', label: 'олень', labelAcc: 'оленя', plural: 'олени', needs: [], behaviours: [...WAYS.herdGrazer], heart: BEAT.grazer,
    habitat: {taiga: 'common', tundra: 'usual', forest: 'usual', meadow: 'usual', steppe: 'rare'},
    heatHarm: 60, look: {shape: 'deer', size: 0.62, color: '#a8794a'},
    yields: {meat: 5, hide: 2, bone: 2},
    flee: {radius: 7, sprint: 1.6, from: ['people', 'wolf'], stamina: 0.006},
    grazes: {terrain: ['grass', 'forest'], eatsBerries: 0.002},
    herd: {cap: 12},   // grazes in herds (agents/wildHerd.js)
    leaveChance: 0.0003},

  // Fox: small and quick, hunted for its fur, which traders pay well for.
  {id: 'fox', sylvan: true, kind: 'beast', label: 'лиса', labelAcc: 'лису', plural: 'лисы', needs: [], behaviours: [...WAYS.grazer], heart: BEAT.grazer,
    habitat: {taiga: 'common', forest: 'usual', steppe: 'usual', tundra: 'usual', meadow: 'rare', desert: 'rare', barrows: 'rare'},
    heatHarm: 60, look: {shape: 'fox', size: 0.42, color: '#d0703a'},
    yields: {meat: 1, furs: 1}, trophies: [{res: 'furs', n: 1, chance: 0.2}],
    flee: {radius: 6, sprint: 1.5, from: ['people', 'wolf'], stamina: 0.006},
    grazes: {terrain: ['grass', 'forest'], eatsBerries: 0},
    leaveChance: 0.0004},

  // Boar: fat and dangerous. Like the mule it does not run: it kicks back with its tusks and charges
  // whoever shot it. Hunters go for it only when there is no gentler game about.
  {id: 'boar', sylvan: true, kind: 'beast', label: 'кабан', labelAcc: 'кабана', plural: 'кабаны', needs: [], behaviours: [...WAYS.stander], heart: BEAT.stander, restAt: 0.75, mends: 0.00025, big: true,
    habitat: {forest: 'common', shrubland: 'usual', swamp: 'rare', meadow: 'rare', taiga: 'rare', jungle: 'rare'},
    heatHarm: 60, look: {shape: 'boar', size: 0.62, color: '#4a3a30'},
    yields: {meat: 6, hide: 2, bone: 1}, trophies: [{res: 'hide', n: 1, chance: 0.2}],
    killMessage: name => `Кабан задрал поселенца: <b>${name}</b>.`,
    grazes: {terrain: ['grass'], eatsBerries: 0, shunZone: true}, leaveChance: 0.0003,
    mule: {kickRange: 1.0, charge: 2.1, chargeHit: 1.6, chargeFrom: 1.8, grudge: 300, giveUp: 18, fleeBelow: 0.3}},

  // Rats: they come for the stock when there is a lot of food and nothing to keep them out of it.
  // They nibble what lies in the open (pots and a granary protect it) and run from people;
  // whoever catches one near the stores kills it (agents/behaviours/scurry.js).
  {id: 'rat', kind: 'beast', label: 'крыса', labelAcc: 'крысу', plural: 'крысы', needs: [], behaviours: [...WAYS.vermin], heart: BEAT.vermin,
    // no habitat: lives wherever there is food lying about
    heatHarm: 55, look: {shape: 'rat', size: 0.25, color: '#7c7468'},
    vermin: {eats: 0.0016, flee: 1.6, caught: 0.04}},

  // The mule: a big, stubborn grazer, a small bull really. It does not run from people; it kicks
  // whoever comes at it, and someone who shoots it from afar gets charged and trampled. Wolves
  // dare only a badly wounded one. Wild mules wander in now and then; traders bring pack mules.
  // big: hunters and wolves fight it rather than finish it with one bite or arrow.
  {id: 'mule', remembers: 'mule', kind: 'beast', label: 'мул', labelAcc: 'мула', plural: 'мулы', needs: [], behaviours: [...WAYS.mule], heart: BEAT.stander, restAt: 0.75, mends: 0.00025, big: true, legend: 'мул',
    habitat: {foothills: 'common', meadow: 'usual', shrubland: 'rare', highlands: 'rare'},
    heatHarm: 62, look: {shape: 'mule', size: 0.85, color: '#7a5232'},
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
    },
    grazes: {terrain: ['grass'], eatsBerries: 0, shunZone: true},   // what it grazes on; keeps off the settlement (agents/behaviours/graze.js)
    leaveChance: 0.0002,       // per tick, a wild mule wanders off the map
    // tamed it hauls logs and stone and pulls the plough (see `tame` on the goat for the fields)
    tame: {chance: 0.22, tier: 3, space: 2, bait: {hay: 2}, eats: 1.2, kicks: true, stack: 2, max: 2,
      effects: {jobSpeed: {chop: 1.15, mine: 1.15, dig: 1.15, farm: 1.25}},
      names: petNames('mule'),
      effect: 'возит брёвна и камень (рубка, камень и руда +15%), тянет соху (поле +25%)'}},

  // Goat: a wild goat of the rocky meadows. Skittish like a deer, but a patient herder with an
  // armful of hay can tame it; in a pen it gives milk and wool and has kids in spring and summer.
  {id: 'goat', kind: 'beast', label: 'коза', g: 'f', labelAcc: 'козу', plural: 'козы', needs: [], behaviours: [...WAYS.herdGrazer], heart: BEAT.grazer, legend: 'коза',
    habitat: {foothills: 'common', highlands: 'common', shrubland: 'usual', meadow: 'rare'},
    heatHarm: 60, look: {shape: 'goat', size: 0.46, color: '#d6cdb6'},
    yields: {meat: 3, hide: 1, bone: 1},
    flee: {radius: 4.5, sprint: 1.5, from: ['people', 'wolf'], stamina: 0.006},
    grazes: {terrain: ['grass'], eatsBerries: 0.002},
    herd: {cap: 8},
    leaveChance: 0.0001,
    // tame: how the herder's job (data/jobs.js 'herd') and the pen (settlement/herd.js) treat it;
    //   tier: the husbandry tier (C) a herder needs to go after it — a kicking mule wants a calm hand (T3)
    //   chance: of one try with bait to tame it (× the herder's skill; every failed try makes the next easier)
    //   space:  places it takes in a pen;  bait: what one try costs from the stock
    //   eats:   hay a day when there is no grass in the pen (less in the grazing seasons)
    //   milk:   portions a day while fed (little in winter);  wool: fleece sheared once it has grown back
    //   breed:  chance a day for a kid while there are two of them, room in the pen and it is not winter
    //   kicks:  a failed try ends with a kick;  max: no more of them are tamed (the colony has no use for more)
//   effects: work it does for the colony (settlement/mods.js),
    //   counted for up to `stack` animals;  names: what the herders call them
    tame: {chance: 0.45, tier: 1, space: 1, bait: {hay: 1}, eats: 0.6, milk: 1.2, wool: 3, woolDays: 40, breed: 0.06, grownDays: 20,
      names: petNames('goat'),
      effect: 'даёт молоко и шерсть, в тёплое время приносит козлят'}},
].map(sp => bodyFor({mind: 'beast', relativeStats: true, ...sp})));

SPECIES.registerAll(RACES);
SPECIES.registerAll(MONSTERS);
SPECIES.registerAll(BESTIARY);
SPECIES.registerAll(CONSTRUCTS);

// ── species made in the constructor (src/app/beastView.js, docs/TABLES.md): a copy of one of the above under a new
// id, kept in the layer of table edits (data/schema/edits.js `newSpecies`) and made again at every start. Whatever
// derives a thing per species at load (an arrival: data/migrations.js; a flow from beyond the edge: outside/scripted.js;
// a neighbour's list: data/neighbours.js) hears of it through onSpeciesChange and follows.
const WATCHERS = [];
export const onSpeciesChange = fn => { WATCHERS.push(fn); };
const tell = (what, sp) => { for (const fn of WATCHERS) fn(what, sp); };
const deep = v => (typeof v === 'function' ? v : structuredClone(v));

// a new species as a copy of `from`: its row of data/balance/creatures.js too; → the species, or {error}
export function cloneSpecies(from, id, {label, labelAcc, plural} = {}) {
  if (!SPECIES.has(from)) return {error: `нет вида «${from}»`};
  if (!/^[a-z][a-z0-9_]{1,23}$/.test(id || '')) return {error: 'id — латиница, цифры и _, от 2 до 24 знаков, с буквы'};
  if (SPECIES.has(id)) return {error: `вид «${id}» уже есть`};
  const base = SPECIES.get(from);
  if (base.kind === 'race') return {error: 'расы делаются не здесь'};
  const sp = {};
  for (const k of Object.keys(base)) sp[k] = deep(base[k]);
  Object.assign(sp, {id, label: label || base.label, labelAcc: labelAcc || label || base.labelAcc, plural: plural || base.plural, made: from});
  if (sp.behaviours) sp.behaviours = [...sp.behaviours];
  CREATURES[id] = structuredClone(CREATURES[from]);
  SPECIES.register(sp);
  tell('added', sp);
  return sp;
}
// the `arrive` block of a species was edited (data/schema/edits.js): whoever built a flow from it builds it anew
export const arrives = sp => !!(sp.arrive?.group && sp.arrive.every && sp.arrive.cap) || !!(sp.arrive && sp.resident);
export const arriveChanged = id => { if (SPECIES.has(id)) tell('arrive', SPECIES.get(id)); };
export function removeSpecies(id) {
  if (!SPECIES.has(id) || !SPECIES.get(id).made) return false;
  const sp = SPECIES.get(id);
  SPECIES.unregister(id); delete CREATURES[id];
  tell('removed', sp);
  return true;
}


// Heat: `heatHarm` is where it starts to hurt; `fearHeat` is where the animal runs (45 °C by default,
// a bit before it hurts). A creature that fears no fire (`fearHeat` above 100: a salamander, a drake)
// does not run from flames either.
export const fearHeat = sp => sp.fearHeat ?? Math.min(45, sp.heatHarm - 10);
export const fearsFire = sp => fearHeat(sp) <= 100;

// does a species belong to a list of kinds? 'people' stands for every thinking race (data/races.js)
export const matchesKind = (id, list) => list.includes(id) || (list.includes('people') && !!SPECIES.get(id).rel);
