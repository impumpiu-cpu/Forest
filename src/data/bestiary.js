// The bestiary: beasts beyond the first eight (hares, deer, foxes, boars, wolves, goats, mules, rats
// live in data/species.js). Every entry is a species and reuses one of the brains:
//   predator (agents/brains/predator.js) — hunts prey, may go for a lone person; `predator` block
//   mule     (agents/brains/mule.js)     — grazes, kicks whoever comes at it, charges whoever shot it
//   grazer   (agents/brains/grazer.js)   — grazes and runs
//   vermin   (agents/brains/vermin.js)   — sneaks to the stores
//   spirit   (agents/brains/spirit.js)   — the rot's forest and water folk: they live here for good
// Fields beyond the usual ones (data/species.js):
//   kind        — beast | monster | spirit (data/species.js KINDS): how the world map takes it in
//   habitat     — {biome: rarity} (data/biomes.js): where it lives and how common it is
//   special     — SPECIAL limits; `relativeStats` (set for all of them): the entry is the typical animal
//   venom       — {dmg, ticks}: a bite poisons, the victim loses dmg health a tick for `ticks`
//   web         — {slow, ticks}: a bite tangles, the victim moves at `slow` speed for `ticks`
//   breath      — chance per blow to set the victim's ground on fire (agents/combat.js)
//   nocturnal   — comes and hunts by night, leaves the map by day
//   hibernates  — leaves for its den when winter comes and does not come back till spring
//   resident    — nechist (the spirits): lives here, comes back `respawn` days after it was killed;
//                 `undead` on a spirit means only that there is no life in it to poison or to kill —
//                 it is laid to rest, not slain (agents/agent.js) — not that it is the rot's
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
  beast({id: 'varg', kind: 'monster', label: 'варг', labelAcc: 'варга', plural: 'варги', mind: 'semi', hp: 1.5, speed: 0.15, needs: ['food'], brain: 'predator',
    arrive: {group: [2, 4], every: [3, 5], chance: 0.5, cap: 4, first: 3, message: 'пришла стая варгов: {n}. Это не волки — они крупнее и злее'},
    habitat: {taiga: 'usual', tundra: 'rare', steppe: 'rare', foothills: 'rare', highlands: 'rare', barrows: 'rare'},
    special: around({S: 10, P: 10, E: 9, C: 2, I: 4, A: 9, L: 4}),
    look: {shape: 'wolf', size: 0.74, color: '#4b4b55'}, attack: {power: 1.35, cooldown: 13},
    yields: {meat: 3, hide: 3, bone: 2}, tameWith: ['orc', 'goblin'],
    killMessage: name => `Варги разорвали поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['deer', 'goat', 'boar', 'hare', 'elk'], weakPrey: ['mule'], boldPeople: 0.35, groupFear: 4, meal: 2, bigMeal: 4})}),

  // Bear: a loner that only fights when bothered; in winter it sleeps in its den
  beast({id: 'bear', kind: 'beast', label: 'медведь', labelAcc: 'медведя', plural: 'медведи', hp: 3.6, speed: 0.12, brain: 'mule', big: true, hibernates: true,
    arrive: {group: [1, 1], every: [3, 5], chance: 0.5, cap: 1, first: 4, message: 'в лес пришёл медведь. Не трогай — и он не тронет'},
    habitat: {forest: 'usual', taiga: 'usual', tundra: 'rare', foothills: 'rare'},
    special: around({S: 14, P: 6, E: 13, C: 2, I: 3, A: 5, L: 4}),
    look: {shape: 'bear', size: 0.9, color: '#5a3d28'}, attack: {power: 2.4, cooldown: 16},
    yields: {meat: 12, hide: 3, bone: 3, bile: 1}, trophies: [{res: 'bile', n: 1, chance: 0.25, tier: 2}, {res: 'furs', n: 2, chance: 0.2}],
    killMessage: name => `Медведь задрал поселенца: <b>${name}</b>.`,
    mule: stands({kickRange: 1.2, charge: 1.9, chargeHit: 1.7, grudge: 500, giveUp: 26, fleeBelow: 0.2, leaveChance: 0.00015, terrain: ['grass', 'forest']})}),

  // Lynx: an ambush from the branches, mostly hares and foxes; a lone person only when starving
  beast({id: 'lynx', snowfoot: true, kind: 'beast', label: 'рысь', labelAcc: 'рысь', plural: 'рыси', hp: 0.6, speed: 0.16, needs: ['food'], brain: 'predator',
    arrive: {group: [1, 1], every: [3, 4], chance: 0.5, cap: 1, first: 3, message: 'в чаще поселилась рысь'},
    habitat: {taiga: 'usual', forest: 'rare'},
    special: around({S: 5, P: 11, E: 5, C: 2, I: 3, A: 12, L: 5}),
    look: {shape: 'fox', size: 0.5, color: '#9a8f7a'}, attack: {power: 1.0, cooldown: 11},
    yields: {furs: 2, meat: 1}, trophies: [{res: 'furs', n: 1, chance: 0.3}],
    killMessage: name => `Рысь бросилась с ветки на поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['hare', 'fox', 'goat'], boldPeople: 0.75, groupFear: 2, meal: 1.4, sight: 18})}),

  // Elk: the mule of the taiga — a lot of meat, and a bull that tramples hunters
  beast({id: 'elk', kind: 'beast', label: 'лось', labelAcc: 'лося', plural: 'лоси', hp: 3.4, speed: 0.13, brain: 'mule', big: true, game: true,
    arrive: {group: [1, 3], every: [2, 4], chance: 0.5, cap: 4, first: 2, message: 'к лесу вышли лоси: {n}. Бык топчет охотников'},
    habitat: {taiga: 'usual', swamp: 'usual', tundra: 'rare', forest: 'rare'},
    special: around({S: 11, P: 6, E: 12, C: 2, I: 2, A: 6, L: 4}),
    look: {shape: 'deer', size: 0.84, color: '#5e4630'}, attack: {power: 2.0, cooldown: 16},
    yields: {meat: 12, hide: 3, bone: 3},
    killMessage: name => `Лось затоптал поселенца: <b>${name}</b>.`,
    mule: stands({terrain: ['grass', 'forest'], leaveChance: 0.0003})}),

  // Hyenas: scavengers of the barrow steppe, packs, bold by night; gnolls keep them
  beast({id: 'hyena', kind: 'beast', label: 'гиена', labelAcc: 'гиену', plural: 'гиены', hp: 0.7, speed: 0.15, needs: ['food'], brain: 'predator',
    arrive: {group: [2, 5], every: [2, 4], chance: 0.5, cap: 5, first: 2, message: 'пришли гиены: {n}. Ночью они смелеют'},
    habitat: {barrows: 'common', savanna: 'common', steppe: 'usual', desert: 'rare', shrubland: 'rare', meadow: 'rare'},
    special: around({S: 6, P: 10, E: 8, C: 1, I: 3, A: 9, L: 5}),
    look: {shape: 'wolf', size: 0.56, color: '#a8925e'}, attack: {power: 0.9, cooldown: 12},
    yields: {meat: 1, hide: 1, bone: 1}, tameWith: ['gnoll'],
    killMessage: name => `Гиены загрызли поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['hare', 'deer', 'goat'], boldPeople: 0.55, groupFear: 3})}),

  // Giant toad: sits in the marsh and snaps whoever comes within its tongue's reach
  beast({id: 'toad', kind: 'beast', label: 'гигантская жаба', labelAcc: 'гигантскую жабу', plural: 'гигантские жабы', hp: 1.0, speed: 0.06, brain: 'mule',
    arrive: {group: [1, 2], every: [2, 3], chance: 0.6, cap: 3, first: 2},
    habitat: {swamp: 'common', jungle: 'usual', water: 'rare'},
    special: around({S: 7, P: 6, E: 9, C: 1, I: 1, A: 4, L: 4}),
    look: {shape: 'toad', size: 0.55, color: '#6b7a3a'}, attack: {power: 1.2, cooldown: 20},
    yields: {meat: 2, slime: 1}, trophies: [{res: 'slime', n: 1, chance: 0.3}],
    killMessage: name => `Жаба утянула поселенца в трясину: <b>${name}</b>.`,
    mule: stands({kickRange: 2.4, charge: 1.2, chargeHit: 1.2, chargeFrom: 3, giveUp: 8, terrain: ['grass', 'forest'], leaveChance: 0.0001})}),

  // ── monsters of the heights and the deep
  // Griffin: nests on the crags, carries off goats and mules, a lone person when hungry
  beast({id: 'griffin', kind: 'monster', label: 'грифон', labelAcc: 'грифона', plural: 'грифоны', hp: 2.4, speed: 0.18, needs: ['food'], brain: 'predator',
    arrive: {group: [1, 1], every: [5, 8], chance: 0.4, cap: 1, first: 5, message: 'над скалами кружит грифон. Коз и мулов — под крышу'},
    habitat: {highlands: 'usual', foothills: 'rare', steppe: 'rare', desert: 'rare'},
    special: around({S: 16, P: 14, E: 13, C: 4, I: 5, A: 13, L: 5}),
    look: {shape: 'bird', size: 0.86, color: '#b88a44'}, attack: {power: 1.9, cooldown: 13},
    yields: {meat: 4, feathers: 3, bone: 2}, trophies: [{res: 'feathers', n: 2, chance: 0.3}],
    killMessage: name => `Грифон унёс поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['goat', 'deer', 'hare'], weakPrey: ['mule'], weakBelow: 0.7, sight: 30, sprint: 1.6, boldPeople: 0.5, groupFear: 3, meal: 2.5, bigMeal: 4})}),

  // Wyvern: dragon-kin without a mind; its sting poisons
  beast({id: 'wyvern', kind: 'monster', label: 'виверна', labelAcc: 'виверну', plural: 'виверны', hp: 2.8, speed: 0.15, needs: ['food'], brain: 'predator',
    arrive: {group: [1, 1], every: [6, 10], chance: 0.35, cap: 1, first: 6, message: 'с гор спустилась виверна. Её жало ядовито'},
    habitat: {highlands: 'usual', volcano: 'rare'},
    special: around({S: 15, P: 10, E: 14, C: 2, I: 3, A: 10, L: 4}),
    look: {shape: 'bird', size: 0.86, color: '#5d6b4b'}, attack: {power: 1.7, cooldown: 14}, venom: {dmg: 0.0009, ticks: 240},
    yields: {meat: 5, scales: 2, venom: 1}, trophies: [{res: 'venom', n: 1, chance: 0.3, tier: 2}, {res: 'scales', n: 1, chance: 0.2}],
    killMessage: name => `Виверна ужалила поселенца насмерть: <b>${name}</b>.`,
    predator: hunts({prey: ['goat', 'deer', 'boar'], weakPrey: ['mule', 'elk'], weakBelow: 0.6, sight: 26, boldPeople: 0.45, groupFear: 4})}),

  // Drake: a young dragon with no mind yet; its breath sets the grass on fire
  beast({id: 'drake', kind: 'monster', label: 'дрейк', labelAcc: 'дрейка', plural: 'дрейки', hp: 4.5, speed: 0.14, needs: ['food'], brain: 'predator', heatHarm: 400,
    arrive: {group: [1, 1], every: [8, 14], chance: 0.3, cap: 1, first: 8, message: 'с вулкана прилетел дрейк. Где он дышит, загорается трава'},
    fearHeat: 350,
    habitat: {volcano: 'usual', highlands: 'rare', desert: 'rare'},
    special: around({S: 22, P: 11, E: 20, C: 3, I: 4, A: 9, L: 5}, 2),
    look: {shape: 'bird', size: 0.95, color: '#a3432e'}, attack: {power: 2.6, cooldown: 15}, breath: 0.25,
    yields: {meat: 6, scales: 4, gland: 1}, trophies: [{res: 'scales', n: 2, chance: 0.25, tier: 2}, {res: 'gland', n: 1, chance: 0.2, tier: 3}],
    killMessage: name => `Дрейк сжёг поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['goat', 'deer', 'boar', 'mule', 'elk'], sight: 26, boldPeople: 0.35, groupFear: 5, meal: 3, bigMeal: 5})}),

  // Giant spider: webs tangle its prey; silk for bowstrings and cloth, venom for the alchemist
  beast({id: 'spider', kind: 'monster', label: 'гигантский паук', labelAcc: 'гигантского паука', plural: 'гигантские пауки', hp: 1.1, speed: 0.13, needs: ['food'], brain: 'predator',
    arrive: {group: [1, 3], every: [3, 5], chance: 0.5, cap: 3, first: 3, message: 'в лесу видели гигантских пауков: {n}. Паутина держит крепко'},
    habitat: {underground: 'common', jungle: 'common', forest: 'rare', swamp: 'rare'},
    special: around({S: 8, P: 9, E: 7, C: 0, I: 2, A: 12, L: 4}),
    look: {shape: 'spider', size: 0.62, color: '#3a3530'}, attack: {power: 1.0, cooldown: 12},
    web: {slow: 0.35, ticks: 120}, venom: {dmg: 0.0004, ticks: 160},
    yields: {silk: 2, venom: 1}, trophies: [{res: 'venom', n: 1, chance: 0.3, tier: 2}, {res: 'silk', n: 2, chance: 0.3}],
    killMessage: name => `Паук опутал и загрыз поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['hare', 'fox', 'goat'], boldPeople: 0.5, groupFear: 3, sight: 16})}),

  // Stone worm: digs through the rock, slow and nearly unkillable, leaves its shell
  beast({id: 'stoneworm', kind: 'monster', label: 'каменный червь', labelAcc: 'каменного червя', plural: 'каменные черви', hp: 6, speed: 0.06, brain: 'mule', big: true,
    arrive: {group: [1, 1], every: [6, 10], chance: 0.35, cap: 1, first: 5, message: 'из-под скал выполз каменный червь'},
    habitat: {underground: 'usual', desert: 'rare', foothills: 'rare'},
    special: around({S: 18, P: 3, E: 18, C: 0, I: 1, A: 3, L: 3}),
    look: {shape: 'worm', size: 0.9, color: '#7d6f5c'}, attack: {power: 2.8, cooldown: 22},
    yields: {meat: 8, hide: 4}, trophies: [{res: 'gems', n: 1, chance: 0.15}],
    killMessage: name => `Каменный червь раздавил поселенца: <b>${name}</b>.`,
    mule: stands({kickRange: 1.4, charge: 1.3, chargeHit: 1.8, fleeBelow: 0.15, leaveChance: 0.0004})}),

  // Blood bats: night flocks from caves and barrows; they drink, a little at a time
  beast({id: 'bat', kind: 'monster', label: 'летучая мышь-кровопийца', labelAcc: 'летучую мышь', plural: 'летучие мыши', hp: 0.2, speed: 0.17, needs: ['food'], brain: 'predator', nocturnal: true,
    arrive: {group: [3, 6], every: [2, 3], chance: 0.6, cap: 6, first: 2, night: true},
    habitat: {underground: 'common', barrows: 'common', jungle: 'rare', swamp: 'rare'},
    special: around({S: 2, P: 12, E: 2, C: 0, I: 2, A: 13, L: 6}),
    look: {shape: 'bat', size: 0.34, color: '#3b3440'}, attack: {power: 0.35, cooldown: 9}, drinks: 0.6,
    killMessage: name => `Летучие мыши обескровили поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['hare', 'rat'], boldPeople: 0.4, groupFear: 4, sight: 18, meal: 0.8})}),

  // Salamander: lives in the heat; fire does not hurt it. Shy, worth its gland
  beast({id: 'salamander', kind: 'beast', label: 'саламандра', labelAcc: 'саламандру', plural: 'саламандры', hp: 0.5, speed: 0.12, brain: 'grazer', game: true, heatHarm: 500,
    arrive: {group: [1, 2], every: [2, 4], chance: 0.5, cap: 3, first: 2},
    fearHeat: 450,
    habitat: {volcano: 'usual', underground: 'rare'},
    special: around({S: 4, P: 7, E: 8, C: 1, I: 2, A: 8, L: 5}),
    look: {shape: 'lizard', size: 0.45, color: '#d0632a'},
    yields: {meat: 1, gland: 1}, trophies: [{res: 'gland', n: 1, chance: 0.2, tier: 2}],
    flee: {radius: 5, sprint: 1.5, from: ['people', 'wolf', 'varg'], stamina: 0.006},
    grazes: {terrain: ['grass', 'burnt'], eatsBerries: 0},
    leaveChance: 0.0003}),

  // ── nechist: the rot's folk of wood and water. They live here; killed, they come back after a while
  // Leshy: a mycelium the size of a wood; its spores lead woodcutters and hunters astray. Fire kills it
  beast({id: 'leshy', kind: 'spirit', label: 'леший', labelAcc: 'лешего', plural: 'лешие', mind: 'semi', undead: true, hp: 3.0, speed: 0.07, brain: 'spirit', heatHarm: 40,
    arrive: {first: 2, message: 'в чаще завёлся леший: лесорубы и охотники будут плутать'},
    resident: true, respawn: 8,
    habitat: {forest: 'usual', taiga: 'usual', jungle: 'rare'},
    special: around({S: 12, P: 12, E: 14, C: 3, I: 6, A: 4, L: 6}),
    look: {shape: 'spirit', size: 0.86, color: '#4f6b3a'}, attack: {power: 1.4, cooldown: 16}, resist: {melee: 0.35, ranged: 0.25},
    yields: {herbs: 4, wood: 6},
    killMessage: name => `Леший задавил поселенца в чаще: <b>${name}</b>.`,
    spirit: {home: 'forest', aura: 'astray', radius: 7, every: 120, veil: 4, regen: 4, keepOff: 16, crowd: 3}}),

  // Rusalka: a drowned body of the water strain; by night she lures a lone colonist into the lake
  beast({id: 'rusalka', kind: 'spirit', label: 'русалка', labelAcc: 'русалку', plural: 'русалки', mind: 'semi', undead: true, hp: 1.0, speed: 0.11, brain: 'spirit', heatHarm: 45,
    arrive: {first: 2, message: 'в омуте поселилась русалка. Ночью к воде — только вдвоём'},
    resident: true, respawn: 6,
    habitat: {water: 'usual', swamp: 'usual'},
    special: around({S: 5, P: 9, E: 6, C: 12, I: 5, A: 9, L: 5}),
    look: {shape: 'spirit', size: 0.6, color: '#9fc3c8'}, attack: {power: 1.0, cooldown: 14},
    killMessage: name => `Русалка утопила поселенца: <b>${name}</b>.`,
    spirit: {home: 'shore', aura: 'lure', radius: 11, night: true, veil: 0, keepOff: 8, dives: true}}),

  // Kikimora: a small marsh pest; by night she spoils the stores and frightens the stock
  beast({id: 'kikimora', kind: 'spirit', label: 'кикимора', labelAcc: 'кикимору', plural: 'кикиморы', mind: 'semi', undead: true, hp: 0.5, speed: 0.13, brain: 'vermin', heatHarm: 50,
    arrive: {first: 2, message: 'на болоте завелась кикимора: по ночам портит припасы'},
    resident: true, respawn: 5,
    habitat: {swamp: 'usual'},
    special: around({S: 3, P: 9, E: 5, C: 2, I: 5, A: 10, L: 7}),
    look: {shape: 'spirit', size: 0.4, color: '#6e6a4e'},
    vermin: {eats: 0.004, flee: 3, caught: 0.03, spoils: true, veil: 2}}),
  // Vodyanoy: the old man of the deep water — the rusalka's strain grown heavy; drags the lone one down by night
  beast({id: 'vodyanoy', kind: 'spirit', label: 'водяной', labelAcc: 'водяного', plural: 'водяные', mind: 'semi', undead: true, hp: 2.4, speed: 0.08, brain: 'spirit', heatHarm: 45,
    arrive: {first: 3, message: 'в омуте заворочался водяной. К глубокой воде ночью — только вдвоём'},
    resident: true, respawn: 10,
    habitat: {water: 'usual', swamp: 'rare'},
    special: around({S: 11, P: 8, E: 13, C: 6, I: 5, A: 5, L: 5}),
    look: {shape: 'spirit', size: 0.9, color: '#4f7a6a'}, attack: {power: 1.8, cooldown: 18}, resist: {melee: 0.5, ranged: 0.4},
    yields: {fish: 6, slime: 2},
    killMessage: name => `Водяной утащил поселенца на дно: <b>${name}</b>.`,
    spirit: {home: 'shore', aura: 'lure', radius: 9, night: true, veil: 0, keepOff: 10, dives: true, regen: 3}}),

  // Poludnitsa: the noon-wife of the open fields; whoever works the meadow under her gaze loses the way
  beast({id: 'poludnitsa', kind: 'spirit', label: 'полуденница', labelAcc: 'полуденницу', plural: 'полуденницы', mind: 'semi', undead: true, hp: 1.2, speed: 0.1, brain: 'spirit', heatHarm: 60,
    arrive: {first: 3, message: 'над лугами в жару ходит полуденница: кто работает в полдень, теряет дорогу'},
    resident: true, respawn: 7,
    habitat: {meadow: 'usual', steppe: 'usual', savanna: 'rare'},
    special: around({S: 6, P: 11, E: 7, C: 10, I: 6, A: 9, L: 5}),
    look: {shape: 'spirit', size: 0.7, color: '#e8d9a0'}, attack: {power: 1.1, cooldown: 15}, resist: {melee: 0.3, ranged: 0.3},
    yields: {herbs: 3, fiber: 2},
    killMessage: name => `Полуденница свела поселенца в поле: <b>${name}</b>.`,
    spirit: {home: 'grass', aura: 'astray', radius: 6, every: 100, veil: 3, regen: 2, keepOff: 12, crowd: 3}}),

  // ── beasts of the far lands: the steppe, the hot south, the ice. Few of them reach the first
  // colonies' regions (data/regions.js); they are here for the world map and the lands to come
  // Horse: a herd of the open steppe, fast and shy; tamed, it carries the hunter and the builder
  beast({id: 'horse', kind: 'beast', label: 'лошадь', labelAcc: 'лошадь', plural: 'лошади', hp: 2.4, speed: 0.17, brain: 'grazer', big: true, game: true, legend: 'лошадь',
    arrive: {group: [2, 5], every: [3, 5], chance: 0.5, cap: 6, first: 2, message: 'на луга вышел табун: {n}'},
    habitat: {steppe: 'common', meadow: 'common', savanna: 'usual', shrubland: 'rare', foothills: 'rare'},
    special: around({S: 9, P: 7, E: 9, C: 3, I: 2, A: 7, L: 5}),
    look: {shape: 'horse', size: 0.8, color: '#8c5a34'},
    yields: {meat: 8, hide: 3, bone: 3},
    flee: {radius: 5, sprint: 1.6, from: ['people', 'wolf', 'varg', 'lion'], stamina: 0.004},
    grazes: {terrain: ['grass'], eatsBerries: 0},
    leaveChance: 0.0002,
    tame: {chance: 0.3, tier: 2, space: 2, bait: {hay: 2}, eats: 1.2, breed: 0.04, grownDays: 30, stack: 2, max: 3,
      effects: {jobSpeed: {hunt: 1.15, build: 1.1, farm: 1.15}},
      names: ['Буланый', 'Воронок', 'Ласточка', 'Гнедая', 'Серко', 'Ветерок', 'Звёздочка', 'Рыжуха'],
      effect: 'возит охотника и брёвна (охота +15%, стройка +10%), тянет соху (поле +15%)'}}),

  // Aurochs: the wild bull of the forest edge — a mountain of meat, and it charges
  beast({id: 'aurochs', kind: 'beast', label: 'тур', labelAcc: 'тура', plural: 'туры', hp: 4.2, speed: 0.12, brain: 'mule', big: true, game: true, legend: 'тур',
    arrive: {group: [1, 3], every: [3, 5], chance: 0.45, cap: 3, first: 3, message: 'на опушку вышли туры: {n}. Бык поднимает на рога'},
    habitat: {meadow: 'common', forest: 'usual', steppe: 'usual', swamp: 'rare', taiga: 'rare'},
    special: around({S: 13, P: 5, E: 13, C: 1, I: 1, A: 4, L: 4}),
    look: {shape: 'bull', size: 0.92, color: '#3f2a1c'}, attack: {power: 2.3, cooldown: 17},
    yields: {meat: 14, hide: 4, bone: 4},
    killMessage: name => `Тур поднял на рога поселенца: <b>${name}</b>.`,
    mule: stands({kickRange: 1.2, charge: 1.8, chargeHit: 1.8, grudge: 420, giveUp: 24, terrain: ['grass', 'forest'], leaveChance: 0.0002}),
    tame: {chance: 0.2, tier: 3, space: 3, bait: {hay: 3}, eats: 2, milk: 2.5, breed: 0.03, grownDays: 40, kicks: true, stack: 2, max: 3,
      effects: {jobSpeed: {farm: 1.3, dig: 1.1}},
      names: ['Буря', 'Пеструха', 'Бурёнка', 'Крутой', 'Рогач', 'Зорька'],
      effect: 'даёт много молока, тянет соху (поле +30%)'}}),

  // Saiga: the antelope of the dry steppe; herds that run at the first scent
  beast({id: 'saiga', kind: 'beast', label: 'сайгак', labelAcc: 'сайгака', plural: 'сайгаки', hp: 0.5, speed: 0.19, brain: 'grazer', game: true,
    arrive: {group: [3, 7], every: [2, 4], chance: 0.6, cap: 8, first: 2, message: 'по степи прошло стадо сайгаков: {n}'},
    habitat: {steppe: 'common', savanna: 'common', desert: 'usual', shrubland: 'rare'},
    special: around({S: 4, P: 8, E: 6, C: 1, I: 1, A: 9, L: 5}),
    look: {shape: 'deer', size: 0.56, color: '#c9b08a'},
    yields: {meat: 4, hide: 1, bone: 1},
    flee: {radius: 6, sprint: 1.7, from: ['people', 'wolf', 'varg', 'lion', 'hyena'], stamina: 0.005},
    grazes: {terrain: ['grass'], eatsBerries: 0},
    leaveChance: 0.0004}),

  // Lion: the pride of the savanna; takes saiga and cattle, and a lone man in the dry season
  beast({id: 'lion', kind: 'beast', label: 'лев', labelAcc: 'льва', plural: 'львы', hp: 3.0, speed: 0.15, needs: ['food'], brain: 'predator', big: true,
    arrive: {group: [1, 3], every: [4, 6], chance: 0.4, cap: 3, first: 4, message: 'в высокой траве залегли львы: {n}'},
    habitat: {savanna: 'common', shrubland: 'usual', steppe: 'usual', desert: 'rare', barrows: 'rare'},
    special: around({S: 12, P: 10, E: 11, C: 3, I: 3, A: 9, L: 4}),
    look: {shape: 'lion', size: 0.78, color: '#c9a259'}, attack: {power: 2.2, cooldown: 13},
    yields: {meat: 4, hide: 2, bone: 2}, trophies: [{res: 'furs', n: 2, chance: 0.3}],
    killMessage: name => `Лев задрал поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['saiga', 'deer', 'goat', 'boar', 'hare'], weakPrey: ['aurochs', 'horse', 'camel'], boldPeople: 0.3, groupFear: 4, meal: 2.2, bigMeal: 4, sight: 24})}),

  // Crocodile: lies at the water's edge and takes whatever drinks there; slow on land, never far from it
  beast({id: 'crocodile', kind: 'beast', label: 'крокодил', labelAcc: 'крокодила', plural: 'крокодилы', hp: 3.6, speed: 0.08, brain: 'mule', big: true,
    arrive: {group: [1, 2], every: [4, 6], chance: 0.4, cap: 2, first: 3, message: 'у воды залёг крокодил. К берегу — с оглядкой'},
    habitat: {swamp: 'common', jungle: 'usual', water: 'usual', savanna: 'rare'},
    special: around({S: 14, P: 6, E: 15, C: 1, I: 1, A: 4, L: 3}),
    look: {shape: 'lizard', size: 1.0, color: '#4a5e36'}, attack: {power: 2.6, cooldown: 20},
    yields: {meat: 8, hide: 5, bone: 3}, trophies: [{res: 'scales', n: 2, chance: 0.2}],
    killMessage: name => `Крокодил утащил поселенца в воду: <b>${name}</b>.`,
    mule: stands({kickRange: 1.3, charge: 1.6, chargeHit: 2.0, chargeFrom: 1.5, grudge: 200, giveUp: 10, fleeBelow: 0.15, terrain: ['water', 'grass'], leaveChance: 0.0001})}),

  // Camel: the beast of the sand; tamed, it carries the gatherers' loads across the dry land
  beast({id: 'camel', kind: 'beast', label: 'верблюд', labelAcc: 'верблюда', plural: 'верблюды', hp: 3.0, speed: 0.12, brain: 'mule', big: true, game: true, legend: 'верблюд', heatHarm: 70,
    arrive: {group: [1, 3], every: [3, 5], chance: 0.45, cap: 3, first: 3, message: 'из-за барханов вышли верблюды: {n}'},
    habitat: {desert: 'common', savanna: 'rare', steppe: 'rare', shrubland: 'rare'},
    special: around({S: 10, P: 5, E: 12, C: 2, I: 2, A: 4, L: 4}),
    look: {shape: 'camel', size: 0.88, color: '#c8a874'}, attack: {power: 1.6, cooldown: 16},
    yields: {meat: 10, hide: 3, bone: 4, wool: 2},
    killMessage: name => `Верблюд затоптал поселенца: <b>${name}</b>.`,
    mule: stands({grudge: 240, giveUp: 16, leaveChance: 0.0002}),
    tame: {chance: 0.25, tier: 2, space: 2, bait: {hay: 2}, eats: 0.8, milk: 1, wool: 2, woolDays: 60, breed: 0.03, grownDays: 40, kicks: true, stack: 2, max: 2,
      effects: {jobSpeed: {gather: 1.2}},
      names: ['Горбун', 'Песчанка', 'Хан', 'Тихоня', 'Сухарь'],
      effect: 'возит собранное (сбор +20%), даёт молоко и немного шерсти'}}),

  // Giant scorpion: hunts by night among the sands; its sting is venom
  beast({id: 'scorpion', kind: 'beast', label: 'гигантский скорпион', labelAcc: 'гигантского скорпиона', plural: 'гигантские скорпионы', hp: 0.9, speed: 0.12, needs: ['food'], brain: 'predator', nocturnal: true,
    arrive: {group: [1, 3], every: [3, 5], chance: 0.5, cap: 4, first: 3, night: true, message: 'ночью из песка выползли скорпионы: {n}'},
    habitat: {desert: 'common', shrubland: 'rare', savanna: 'rare', underground: 'rare'},
    special: around({S: 6, P: 8, E: 7, C: 0, I: 1, A: 10, L: 4}),
    look: {shape: 'spider', size: 0.5, color: '#b08a4a'}, attack: {power: 0.8, cooldown: 12},
    venom: {dmg: 0.0005, ticks: 150},
    yields: {venom: 1, bone: 1}, trophies: [{res: 'venom', n: 1, chance: 0.35, tier: 2}],
    killMessage: name => `Скорпион ужалил поселенца насмерть: <b>${name}</b>.`,
    predator: hunts({prey: ['hare', 'rat', 'fox'], weakPrey: ['saiga'], boldPeople: 0.5, groupFear: 2, sight: 14, meal: 1.2})}),

  // White bear: the lord of the ice; hunts seals, and anything else that walks the snow
  beast({id: 'polarbear', snowfoot: true, kind: 'beast', label: 'белый медведь', labelAcc: 'белого медведя', plural: 'белые медведи', hp: 4.2, speed: 0.12, needs: ['food'], brain: 'predator', big: true, heatHarm: 55,
    arrive: {group: [1, 1], every: [4, 7], chance: 0.4, cap: 1, first: 4, message: 'по льду пришёл белый медведь'},
    habitat: {ice: 'common', tundra: 'usual'},
    special: around({S: 15, P: 6, E: 14, C: 2, I: 3, A: 5, L: 4}),
    look: {shape: 'bear', size: 0.95, color: '#e8e6dc'}, attack: {power: 2.6, cooldown: 16},
    yields: {meat: 14, hide: 3, bone: 3}, trophies: [{res: 'furs', n: 3, chance: 0.3}, {res: 'bile', n: 1, chance: 0.2, tier: 2}],
    killMessage: name => `Белый медведь задрал поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['seal', 'deer', 'hare', 'fox'], weakPrey: ['elk'], boldPeople: 0.35, groupFear: 4, meal: 2.5, bigMeal: 4, sight: 20, sprint: 1.5})}),

  // Seal: hauls out on the ice by the water; slow on land, fat and hide for the north
  beast({id: 'seal', kind: 'beast', label: 'тюлень', labelAcc: 'тюленя', plural: 'тюлени', hp: 0.8, speed: 0.07, brain: 'grazer', game: true,
    arrive: {group: [2, 5], every: [2, 4], chance: 0.5, cap: 6, first: 2, message: 'на лёд у воды вылезли тюлени: {n}'},
    habitat: {ice: 'common', tundra: 'usual', water: 'rare'},
    special: around({S: 5, P: 6, E: 8, C: 1, I: 2, A: 4, L: 5}),
    look: {shape: 'seal', size: 0.6, color: '#7c7a70'},
    yields: {meat: 6, hide: 2, bone: 1},
    flee: {radius: 3.5, sprint: 1.2, from: ['people', 'polarbear', 'wolf'], stamina: 0.01},
    grazes: {terrain: ['water', 'grass'], eatsBerries: 0},
    leaveChance: 0.0003}),

  // Sheep: the hills' flock; tamed for wool first of all
  beast({id: 'sheep', kind: 'beast', label: 'овца', labelAcc: 'овцу', plural: 'овцы', hp: 0.35, speed: 0.12, brain: 'grazer', game: true, legend: 'овца',
    arrive: {group: [3, 6], every: [2, 4], chance: 0.5, cap: 8, first: 2, message: 'по склонам разбрелись овцы: {n}'},
    habitat: {meadow: 'common', shrubland: 'common', foothills: 'usual', steppe: 'usual', highlands: 'rare'},
    special: around({S: 3, P: 5, E: 5, C: 2, I: 1, A: 6, L: 4}),
    look: {shape: 'sheep', size: 0.46, color: '#ece6d6'},
    yields: {meat: 3, hide: 1, wool: 2, bone: 1},
    flee: {radius: 4, sprint: 1.3, from: ['people', 'wolf', 'varg', 'lynx', 'lion'], stamina: 0.007},
    grazes: {terrain: ['grass'], eatsBerries: 0.001},
    leaveChance: 0.0001,
    tame: {chance: 0.5, tier: 1, space: 1, bait: {hay: 1}, eats: 0.5, milk: 0.6, wool: 5, woolDays: 35, breed: 0.07, grownDays: 20,
      names: ['Кудряшка', 'Снежка', 'Бяша', 'Долли', 'Пышка', 'Белка', 'Ромашка', 'Зефирка'],
      effect: 'даёт много шерсти и немного молока, в тёплое время приносит ягнят'}}),
];
