// The bestiary: beasts beyond the first eight (hares, deer, foxes, boars, wolves, goats, mules, rats
// live in data/species.js). Every entry is a species and reuses one of the brains:
//   predator (agents/brains/predator.js) — hunts prey, may go for a lone person; `predator` block
//   mule     (agents/brains/mule.js)     — grazes, kicks whoever comes at it, charges whoever shot it
//   grazer   (agents/brains/grazer.js)   — grazes and runs
//   vermin   (agents/brains/vermin.js)   — sneaks to the stores
//   spirit   (agents/brains/spirit.js)   — the rot's forest and water folk: they live here for good
// Fields beyond the usual ones (data/species.js):
//   habitat     — {biome: rarity} (data/biomes.js): where it lives and how common it is
//   special     — SPECIAL limits; `relativeStats` (set for all of them): the entry is the typical animal
//   venom       — {dmg, ticks}: a bite poisons, the victim loses dmg health a tick for `ticks`
//   web         — {slow, ticks}: a bite tangles, the victim moves at `slow` speed for `ticks`
//   breath      — chance per blow to set the victim's ground on fire (agents/combat.js)
//   nocturnal   — comes and hunts by night, leaves the map by day
//   hibernates  — leaves for its den when winter comes and does not come back till spring
//   resident    — nechist (the spirits): lives here, comes back `respawn` days after it was killed
//   resist      — damage multipliers {melee, ranged}: plain weapons barely hurt a leshy; fire does
//   tameWith    — (later) races in the colony that let the herder tame it
//   arrive      — how it comes (data/migrations.js builds the arrival, outside/scripted.js the schedule):
//                 group [min, max], every [min, max] days, chance per check (× how common it is here),
//                 cap: no more than this many on the map, first: day of the first check, night: only by
//                 night, message: the journal line ({n} — how many). A resident (`resident: true`)
//                 comes alone, at its home ground, and `respawn` days after it was killed
import {around} from './special.js';

// a predator's defaults: the wolf's numbers (data/species.js), each beast changes what differs
const hunts = over => ({
  prey: ['hare', 'deer', 'fox'], victims: ['people'], sprint: 1.8, stamina: 0.003, sight: 22, obvious: 8, sated: 0.92,
  hungry: 0.7, starving: 0.1, boldPeople: 0.45, loneRadius: 6, zoneShy: 2, zoneShyNight: 5, groupFear: 3,
  feedTicks: 90, meal: 1.6, calm: 900, bigMeal: 3, wanderOff: 0.0012, weakPrey: [], weakBelow: 0.35, ...over,
});
// a beast that stands its ground: the mule's numbers
const stands = over => ({kickRange: 1.1, charge: 2.0, chargeHit: 1.5, chargeFrom: 2.2, grudge: 360, giveUp: 22,
  fleeBelow: 0.3, leaveChance: 0.0002, terrain: ['grass'], ...over});

const beast = b => ({needs: [], mind: 'beast', relativeStats: true, heatHarm: 60, ...b});

export const BESTIARY = [
  // ── beasts
  // Wargs: great wolves, half-witted; orcs and goblins ride them into raids (data/raids.js)
  beast({id: 'varg', label: 'варг', labelAcc: 'варга', plural: 'варги', mind: 'semi', hp: 1.5, speed: 0.15, needs: ['food'], brain: 'predator',
    arrive: {group: [2, 4], every: [3, 5], chance: 0.5, cap: 4, first: 3, message: 'пришла стая варгов: {n}. Это не волки — они крупнее и злее'},
    habitat: {taiga: 'usual', foothills: 'rare', highlands: 'rare', barrows: 'rare'},
    special: around({S: 10, P: 10, E: 9, C: 2, I: 4, A: 9, L: 4}),
    look: {shape: 'wolf', size: 0.74, color: '#4b4b55'}, attack: {power: 1.35, cooldown: 13},
    yields: {meat: 3, hide: 3, bone: 2}, tameWith: ['orc', 'goblin'],
    killMessage: name => `Варги разорвали поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['deer', 'goat', 'boar', 'hare', 'elk'], weakPrey: ['mule'], boldPeople: 0.35, groupFear: 4, meal: 2, bigMeal: 4})}),

  // Bear: a loner that only fights when bothered; in winter it sleeps in its den
  beast({id: 'bear', label: 'медведь', labelAcc: 'медведя', plural: 'медведи', hp: 3.6, speed: 0.12, brain: 'mule', big: true, hibernates: true,
    arrive: {group: [1, 1], every: [3, 5], chance: 0.5, cap: 1, first: 4, message: 'в лес пришёл медведь. Не трогай — и он не тронет'},
    habitat: {forest: 'usual', taiga: 'usual', foothills: 'rare'},
    special: around({S: 14, P: 6, E: 13, C: 2, I: 3, A: 5, L: 4}),
    look: {shape: 'bear', size: 0.9, color: '#5a3d28'}, attack: {power: 2.4, cooldown: 16},
    yields: {meat: 12, hide: 3, bone: 3, bile: 1},
    killMessage: name => `Медведь задрал поселенца: <b>${name}</b>.`,
    mule: stands({kickRange: 1.2, charge: 1.9, chargeHit: 1.7, grudge: 500, giveUp: 26, fleeBelow: 0.2, leaveChance: 0.00015, terrain: ['grass', 'forest']})}),

  // Lynx: an ambush from the branches, mostly hares and foxes; a lone person only when starving
  beast({id: 'lynx', label: 'рысь', labelAcc: 'рысь', plural: 'рыси', hp: 0.6, speed: 0.16, needs: ['food'], brain: 'predator',
    arrive: {group: [1, 1], every: [3, 4], chance: 0.5, cap: 1, first: 3, message: 'в чаще поселилась рысь'},
    habitat: {taiga: 'usual', forest: 'rare'},
    special: around({S: 5, P: 11, E: 5, C: 2, I: 3, A: 12, L: 5}),
    look: {shape: 'fox', size: 0.5, color: '#9a8f7a'}, attack: {power: 1.0, cooldown: 11},
    yields: {furs: 2, meat: 1},
    killMessage: name => `Рысь бросилась с ветки на поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['hare', 'fox', 'goat'], boldPeople: 0.75, groupFear: 2, meal: 1.4, sight: 18})}),

  // Elk: the mule of the taiga — a lot of meat, and a bull that tramples hunters
  beast({id: 'elk', label: 'лось', labelAcc: 'лося', plural: 'лоси', hp: 3.4, speed: 0.13, brain: 'mule', big: true, game: true,
    arrive: {group: [1, 3], every: [2, 4], chance: 0.5, cap: 4, first: 2, message: 'к лесу вышли лоси: {n}. Бык топчет охотников'},
    habitat: {taiga: 'usual', swamp: 'usual', forest: 'rare'},
    special: around({S: 11, P: 6, E: 12, C: 2, I: 2, A: 6, L: 4}),
    look: {shape: 'deer', size: 0.84, color: '#5e4630'}, attack: {power: 2.0, cooldown: 16},
    yields: {meat: 12, hide: 3, bone: 3},
    killMessage: name => `Лось затоптал поселенца: <b>${name}</b>.`,
    mule: stands({terrain: ['grass', 'forest'], leaveChance: 0.0003})}),

  // Hyenas: scavengers of the barrow steppe, packs, bold by night; gnolls keep them
  beast({id: 'hyena', label: 'гиена', labelAcc: 'гиену', plural: 'гиены', hp: 0.7, speed: 0.15, needs: ['food'], brain: 'predator',
    arrive: {group: [2, 5], every: [2, 4], chance: 0.5, cap: 5, first: 2, message: 'пришли гиены: {n}. Ночью они смелеют'},
    habitat: {barrows: 'common', meadow: 'rare'},
    special: around({S: 6, P: 10, E: 8, C: 1, I: 3, A: 9, L: 5}),
    look: {shape: 'wolf', size: 0.56, color: '#a8925e'}, attack: {power: 0.9, cooldown: 12},
    yields: {meat: 1, hide: 1, bone: 1}, tameWith: ['gnoll'],
    killMessage: name => `Гиены загрызли поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['hare', 'deer', 'goat'], boldPeople: 0.55, groupFear: 3})}),

  // Giant toad: sits in the marsh and snaps whoever comes within its tongue's reach
  beast({id: 'toad', label: 'гигантская жаба', labelAcc: 'гигантскую жабу', plural: 'гигантские жабы', hp: 1.0, speed: 0.06, brain: 'mule',
    arrive: {group: [1, 2], every: [2, 3], chance: 0.6, cap: 3, first: 2},
    habitat: {swamp: 'common', water: 'rare'},
    special: around({S: 7, P: 6, E: 9, C: 1, I: 1, A: 4, L: 4}),
    look: {shape: 'toad', size: 0.55, color: '#6b7a3a'}, attack: {power: 1.2, cooldown: 20},
    yields: {meat: 2, slime: 1},
    killMessage: name => `Жаба утянула поселенца в трясину: <b>${name}</b>.`,
    mule: stands({kickRange: 2.4, charge: 1.2, chargeHit: 1.2, chargeFrom: 3, giveUp: 8, terrain: ['grass', 'forest'], leaveChance: 0.0001})}),

  // ── monsters of the heights and the deep
  // Griffin: nests on the crags, carries off goats and mules, a lone person when hungry
  beast({id: 'griffin', label: 'грифон', labelAcc: 'грифона', plural: 'грифоны', hp: 2.4, speed: 0.18, needs: ['food'], brain: 'predator',
    arrive: {group: [1, 1], every: [5, 8], chance: 0.4, cap: 1, first: 5, message: 'над скалами кружит грифон. Коз и мулов — под крышу'},
    habitat: {highlands: 'usual', foothills: 'rare'},
    special: around({S: 16, P: 14, E: 13, C: 4, I: 5, A: 13, L: 5}),
    look: {shape: 'bird', size: 0.86, color: '#b88a44'}, attack: {power: 1.9, cooldown: 13},
    yields: {meat: 4, feathers: 3, bone: 2},
    killMessage: name => `Грифон унёс поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['goat', 'deer', 'hare'], weakPrey: ['mule'], weakBelow: 0.7, sight: 30, sprint: 1.6, boldPeople: 0.5, groupFear: 3, meal: 2.5, bigMeal: 4})}),

  // Wyvern: dragon-kin without a mind; its sting poisons
  beast({id: 'wyvern', label: 'виверна', labelAcc: 'виверну', plural: 'виверны', hp: 2.8, speed: 0.15, needs: ['food'], brain: 'predator',
    arrive: {group: [1, 1], every: [6, 10], chance: 0.35, cap: 1, first: 6, message: 'с гор спустилась виверна. Её жало ядовито'},
    habitat: {highlands: 'usual', volcano: 'rare'},
    special: around({S: 15, P: 10, E: 14, C: 2, I: 3, A: 10, L: 4}),
    look: {shape: 'bird', size: 0.86, color: '#5d6b4b'}, attack: {power: 1.7, cooldown: 14}, venom: {dmg: 0.0009, ticks: 240},
    yields: {meat: 5, scales: 2, venom: 1},
    killMessage: name => `Виверна ужалила поселенца насмерть: <b>${name}</b>.`,
    predator: hunts({prey: ['goat', 'deer', 'boar'], weakPrey: ['mule', 'elk'], weakBelow: 0.6, sight: 26, boldPeople: 0.45, groupFear: 4})}),

  // Drake: a young dragon with no mind yet; its breath sets the grass on fire
  beast({id: 'drake', label: 'дрейк', labelAcc: 'дрейка', plural: 'дрейки', hp: 4.5, speed: 0.14, needs: ['food'], brain: 'predator', heatHarm: 400,
    arrive: {group: [1, 1], every: [8, 14], chance: 0.3, cap: 1, first: 8, message: 'с вулкана прилетел дрейк. Где он дышит, загорается трава'},
    fearHeat: 350,
    habitat: {volcano: 'usual', highlands: 'rare'},
    special: around({S: 22, P: 11, E: 20, C: 3, I: 4, A: 9, L: 5}, 2),
    look: {shape: 'bird', size: 0.95, color: '#a3432e'}, attack: {power: 2.6, cooldown: 15}, breath: 0.25,
    yields: {meat: 6, scales: 4, gland: 1},
    killMessage: name => `Дрейк сжёг поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['goat', 'deer', 'boar', 'mule', 'elk'], sight: 26, boldPeople: 0.35, groupFear: 5, meal: 3, bigMeal: 5})}),

  // Giant spider: webs tangle its prey; silk for bowstrings and cloth, venom for the alchemist
  beast({id: 'spider', label: 'гигантский паук', labelAcc: 'гигантского паука', plural: 'гигантские пауки', hp: 1.1, speed: 0.13, needs: ['food'], brain: 'predator',
    arrive: {group: [1, 3], every: [3, 5], chance: 0.5, cap: 3, first: 3, message: 'в лесу видели гигантских пауков: {n}. Паутина держит крепко'},
    habitat: {underground: 'common', forest: 'rare', swamp: 'rare'},
    special: around({S: 8, P: 9, E: 7, C: 0, I: 2, A: 12, L: 4}),
    look: {shape: 'spider', size: 0.62, color: '#3a3530'}, attack: {power: 1.0, cooldown: 12},
    web: {slow: 0.35, ticks: 120}, venom: {dmg: 0.0004, ticks: 160},
    yields: {silk: 2, venom: 1},
    killMessage: name => `Паук опутал и загрыз поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['hare', 'fox', 'goat'], boldPeople: 0.5, groupFear: 3, sight: 16})}),

  // Stone worm: digs through the rock, slow and nearly unkillable, leaves its shell
  beast({id: 'stoneworm', label: 'каменный червь', labelAcc: 'каменного червя', plural: 'каменные черви', hp: 6, speed: 0.06, brain: 'mule', big: true,
    arrive: {group: [1, 1], every: [6, 10], chance: 0.35, cap: 1, first: 5, message: 'из-под скал выполз каменный червь'},
    habitat: {underground: 'usual', foothills: 'rare'},
    special: around({S: 18, P: 3, E: 18, C: 0, I: 1, A: 3, L: 3}),
    look: {shape: 'worm', size: 0.9, color: '#7d6f5c'}, attack: {power: 2.8, cooldown: 22},
    yields: {meat: 8, hide: 4},
    killMessage: name => `Каменный червь раздавил поселенца: <b>${name}</b>.`,
    mule: stands({kickRange: 1.4, charge: 1.3, chargeHit: 1.8, fleeBelow: 0.15, leaveChance: 0.0004})}),

  // Blood bats: night flocks from caves and barrows; they drink, a little at a time
  beast({id: 'bat', label: 'летучая мышь-кровопийца', labelAcc: 'летучую мышь', plural: 'летучие мыши', hp: 0.2, speed: 0.17, needs: ['food'], brain: 'predator', nocturnal: true,
    arrive: {group: [3, 6], every: [2, 3], chance: 0.6, cap: 6, first: 2, night: true},
    habitat: {underground: 'common', barrows: 'common', swamp: 'rare'},
    special: around({S: 2, P: 12, E: 2, C: 0, I: 2, A: 13, L: 6}),
    look: {shape: 'bat', size: 0.34, color: '#3b3440'}, attack: {power: 0.35, cooldown: 9}, drinks: 0.6,
    killMessage: name => `Летучие мыши обескровили поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['hare', 'rat'], boldPeople: 0.4, groupFear: 4, sight: 18, meal: 0.8})}),

  // Salamander: lives in the heat; fire does not hurt it. Shy, worth its gland
  beast({id: 'salamander', label: 'саламандра', labelAcc: 'саламандру', plural: 'саламандры', hp: 0.5, speed: 0.12, brain: 'grazer', game: true, heatHarm: 500,
    arrive: {group: [1, 2], every: [2, 4], chance: 0.5, cap: 3, first: 2},
    fearHeat: 450,
    habitat: {volcano: 'usual', underground: 'rare'},
    special: around({S: 4, P: 7, E: 8, C: 1, I: 2, A: 8, L: 5}),
    look: {shape: 'lizard', size: 0.45, color: '#d0632a'},
    yields: {meat: 1, gland: 1},
    flee: {radius: 5, sprint: 1.5, from: ['people', 'wolf', 'varg'], stamina: 0.006},
    grazes: {terrain: ['grass', 'burnt'], eatsBerries: 0},
    leaveChance: 0.0003}),

  // ── nechist: the rot's folk of wood and water. They live here; killed, they come back after a while
  // Leshy: a mycelium the size of a wood; its spores lead woodcutters and hunters astray. Fire kills it
  beast({id: 'leshy', label: 'леший', labelAcc: 'лешего', plural: 'лешие', mind: 'semi', undead: true, hp: 3.0, speed: 0.07, brain: 'spirit', heatHarm: 40,
    arrive: {first: 2, message: 'в чаще завёлся леший: лесорубы и охотники будут плутать'},
    resident: true, respawn: 8,
    habitat: {forest: 'usual', taiga: 'usual'},
    special: around({S: 12, P: 12, E: 14, C: 3, I: 6, A: 4, L: 6}),
    look: {shape: 'spirit', size: 0.86, color: '#4f6b3a'}, attack: {power: 1.4, cooldown: 16}, resist: {melee: 0.35, ranged: 0.25},
    yields: {herbs: 4, wood: 6},
    killMessage: name => `Леший задавил поселенца в чаще: <b>${name}</b>.`,
    spirit: {home: 'forest', aura: 'astray', radius: 7, every: 120, veil: 4, regen: 4, keepOff: 16, crowd: 3}}),

  // Rusalka: a drowned body of the water strain; by night she lures a lone colonist into the lake
  beast({id: 'rusalka', label: 'русалка', labelAcc: 'русалку', plural: 'русалки', mind: 'semi', undead: true, hp: 1.0, speed: 0.11, brain: 'spirit', heatHarm: 45,
    arrive: {first: 2, message: 'в омуте поселилась русалка. Ночью к воде — только вдвоём'},
    resident: true, respawn: 6,
    habitat: {water: 'usual', swamp: 'usual'},
    special: around({S: 5, P: 9, E: 6, C: 12, I: 5, A: 9, L: 5}),
    look: {shape: 'spirit', size: 0.6, color: '#9fc3c8'}, attack: {power: 1.0, cooldown: 14},
    killMessage: name => `Русалка утопила поселенца: <b>${name}</b>.`,
    spirit: {home: 'shore', aura: 'lure', radius: 11, night: true, veil: 0, keepOff: 8, dives: true}}),

  // Kikimora: a small marsh pest; by night she spoils the stores and frightens the stock
  beast({id: 'kikimora', label: 'кикимора', labelAcc: 'кикимору', plural: 'кикиморы', mind: 'semi', undead: true, hp: 0.5, speed: 0.13, brain: 'vermin', heatHarm: 50,
    arrive: {first: 2, message: 'на болоте завелась кикимора: по ночам портит припасы'},
    resident: true, respawn: 5,
    habitat: {swamp: 'usual'},
    special: around({S: 3, P: 9, E: 5, C: 2, I: 5, A: 10, L: 7}),
    look: {shape: 'spirit', size: 0.4, color: '#6e6a4e'},
    vermin: {eats: 0.004, flee: 3, caught: 0.03, spoils: true, veil: 2}}),
];
