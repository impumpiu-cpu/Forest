// The bestiary: beasts beyond the first eight (hares, deer, foxes, boars, wolves, goats, mules, rats
// live in data/species.js). Every entry is a species that thinks by its row's list of behaviours (brain `tabled`,
// data/behaviours.js, docs/BEHAVIOUR.md); the lists are WAYS of data/behaviour.js: grazer / herdGrazer (graze and
// run; `flee`, `grazes`), predator (hunt prey, may go for a lone person; `predator`), stander / herdStander (graze
// and kick back; `mule`, `grazes`), vermin (sneak to the stores; `vermin`), woodSpirit / waterSpirit (the rot's
// forest and water folk: they live here for good; `spirit`)
// Fields beyond the usual ones (data/species.js):
//   kind        — beast | monster | spirit (data/species.js KINDS): how the world map takes it in
//   habitat     — {biome: rarity} (data/biomes.js): where it lives and how common it is
//   special, hp, speed, attack — in data/balance/creatures.js; `relativeStats` (set for all of them): the row is the typical animal
//   venom       — {dmg, ticks}: a bite poisons, the victim loses dmg health a tick for `ticks`
//   web         — {slow, ticks}: a bite tangles, the victim moves at `slow` speed for `ticks`
//   breath      — chance per blow to set the victim's ground on fire (agents/combat.js)
//   nocturnal   — comes and hunts by night, leaves the map by day
//   hibernates  — leaves for its den when winter comes and does not come back till spring
//   resident    — nechist (the spirits): lives here, comes back `respawn` days after it was killed;
//                 `undead` on a spirit means only that there is no life in it to poison or to kill —
//                 it is laid to rest, not slain (agents/agent.js) — not that it is the rot's
//   (resist — what blows do to its body — lives in data/balance/creatures.js with its other numbers)
//   tameWith    — (later) races in the colony that let the herder tame it
//   arrive      — how it comes (data/migrations.js builds the arrival, outside/scripted.js the schedule):
//                 group [min, max], every [min, max] days, chance per check (× how common it is here),
//                 cap: no more than this many on the map, first: day of the first check, night: only by
//                 night, message: the journal line ({n} — how many). A resident (`resident: true`)
//                 comes alone, at its home ground, and `respawn` days after it was killed
import {bodyFor} from './balance/creatures.js';
import {WAYS, BEAT} from './behaviour.js';
import {DEED_WAYS} from './deeds.js';
import {petNames} from './names.js';

// a predator's defaults: the wolf's numbers (data/species.js), each beast changes what differs
const hunts = over => ({
  prey: ['hare', 'deer', 'fox'], victims: ['people'], sprint: 1.8, stamina: 0.003, sight: 22, obvious: 8, sated: 0.92,
  hungry: 0.7, starving: 0.1, boldPeople: 0.45, loneRadius: 6, zoneShy: 2, zoneShyNight: 5, groupFear: 3,
  feedTicks: 90, meal: 1.6, calm: 900, bigMeal: 3, wanderOff: 0.0012, weakPrey: [], weakBelow: 0.35, ...over,
});
// a beast that stands its ground: the mule's numbers
const stands = over => ({kickRange: 1.1, charge: 2.0, chargeHit: 1.5, chargeFrom: 2.2, grudge: 360, giveUp: 22, fleeBelow: 0.3, ...over});

const beast = b => ({needs: [], mind: 'beast', relativeStats: true, heatHarm: 60, ...b});

export const BESTIARY = [
  // ── beasts
  // Wargs: great wolves, half-witted; orcs and goblins ride them into raids (data/raids.js)
  beast({id: 'varg', kind: 'monster', label: 'варг', labelAcc: 'варга', plural: 'варги', mind: 'semi', needs: ['food'], behaviours: [...WAYS.predator], heart: BEAT.predator, deeds: {lair: [...DEED_WAYS.lair]},
    arrive: {group: [2, 4], every: [3, 5], chance: 0.5, cap: 4, first: 3, message: 'пришла стая варгов: {n}. Это не волки — они крупнее и злее'},
    habitat: {taiga: 'usual', tundra: 'rare', steppe: 'rare', foothills: 'rare', highlands: 'rare', barrows: 'rare'},
    look: {shape: 'wolf', size: 0.74, color: '#4b4b55'},
    yields: {meat: 3, hide: 3, bone: 2}, tameWith: ['orc', 'goblin'],
    killMessage: name => `Варги разорвали поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['deer', 'goat', 'boar', 'hare', 'elk'], weakPrey: ['mule'], boldPeople: 0.35, groupFear: 4, meal: 2, bigMeal: 4})}),

  // Bear: a loner that only fights when bothered; in winter it sleeps in its den
  beast({id: 'bear', sylvan: true, kind: 'beast', label: 'медведь', labelAcc: 'медведя', plural: 'медведи', behaviours: [...WAYS.stander], heart: BEAT.stander, restAt: 0.75, mends: 0.00025, big: true, hibernates: true,
    arrive: {group: [1, 1], every: [3, 5], chance: 0.5, cap: 1, first: 4, message: 'в лес пришёл медведь. Не трогай — и он не тронет'},
    habitat: {forest: 'usual', taiga: 'usual', tundra: 'rare', foothills: 'rare'},
    look: {shape: 'bear', size: 0.9, color: '#5a3d28'},
    yields: {meat: 12, hide: 3, bone: 3, bile: 1}, trophies: [{res: 'bile', n: 1, chance: 0.25, tier: 2}, {res: 'furs', n: 2, chance: 0.2}],
    killMessage: name => `Медведь задрал поселенца: <b>${name}</b>.`,
    grazes: {terrain: ['grass', 'forest'], eatsBerries: 0, shunZone: true}, leaveChance: 0.00015, mule: stands({kickRange: 1.2, charge: 1.9, chargeHit: 1.7, grudge: 500, giveUp: 26, fleeBelow: 0.2})}),

  // Lynx: an ambush from the branches, mostly hares and foxes; a lone person only when starving
  beast({id: 'lynx', sylvan: true, snowfoot: true, kind: 'beast', label: 'рысь', labelAcc: 'рысь', plural: 'рыси', needs: ['food'], behaviours: [...WAYS.predator], heart: BEAT.predator,
    arrive: {group: [1, 1], every: [3, 4], chance: 0.5, cap: 1, first: 3, message: 'в чаще поселилась рысь'},
    habitat: {taiga: 'usual', forest: 'rare'},
    look: {shape: 'fox', size: 0.5, color: '#9a8f7a'},
    yields: {furs: 2, meat: 1}, trophies: [{res: 'furs', n: 1, chance: 0.3}, {res: 'lynxEyes', n: 2, chance: 0.4, tier: 2}],
    killMessage: name => `Рысь бросилась с ветки на поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['hare', 'fox', 'goat'], boldPeople: 0.75, groupFear: 2, meal: 1.4, sight: 18})}),

  // Elk: the mule of the taiga — a lot of meat, and a bull that tramples hunters
  beast({id: 'elk', sylvan: true, kind: 'beast', label: 'лось', labelAcc: 'лося', plural: 'лоси', behaviours: [...WAYS.herdStander], heart: BEAT.stander, restAt: 0.75, mends: 0.00025, big: true,
    arrive: {group: [1, 3], every: [2, 4], chance: 0.5, cap: 4, first: 2, message: 'к лесу вышли лоси: {n}. Бык топчет охотников'},
    habitat: {taiga: 'usual', swamp: 'usual', tundra: 'rare', forest: 'rare'},
    look: {shape: 'deer', size: 0.84, color: '#5e4630'},
    yields: {meat: 12, hide: 3, bone: 3},
    killMessage: name => `Лось затоптал поселенца: <b>${name}</b>.`,
    herd: {cap: 4, alert: 6},   // a small herd; a bold bull stands up for the others (agents/behaviours/standGround.js)
    grazes: {terrain: ['grass', 'forest'], eatsBerries: 0, shunZone: true}, leaveChance: 0.0003, mule: stands({})}),

  // Hyenas: scavengers of the barrow steppe, packs, bold by night; gnolls keep them
  beast({id: 'hyena', kind: 'beast', label: 'гиена', labelAcc: 'гиену', plural: 'гиены', needs: ['food'], behaviours: [...WAYS.predator], heart: BEAT.predator,
    arrive: {group: [2, 5], every: [2, 4], chance: 0.5, cap: 5, first: 2, message: 'пришли гиены: {n}. Ночью они смелеют'},
    habitat: {barrows: 'common', savanna: 'common', steppe: 'usual', desert: 'rare', shrubland: 'rare', meadow: 'rare'},
    look: {shape: 'wolf', size: 0.56, color: '#a8925e'},
    yields: {meat: 1, hide: 1, bone: 1}, tameWith: ['gnoll'],
    killMessage: name => `Гиены загрызли поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['hare', 'deer', 'goat'], boldPeople: 0.55, groupFear: 3})}),

  // Giant toad: sits in the marsh and snaps whoever comes within its tongue's reach
  beast({id: 'toad', kind: 'beast', label: 'гигантская жаба', labelAcc: 'гигантскую жабу', plural: 'гигантские жабы', behaviours: [...WAYS.stander], heart: BEAT.stander, restAt: 0.75, mends: 0.00025,
    arrive: {group: [1, 2], every: [2, 3], chance: 0.6, cap: 3, first: 2},
    habitat: {swamp: 'common', jungle: 'usual', water: 'rare'},
    look: {shape: 'toad', size: 0.55, color: '#6b7a3a'},
    yields: {meat: 2, slime: 1}, trophies: [{res: 'slime', n: 1, chance: 0.3}],
    killMessage: name => `Жаба утянула поселенца в трясину: <b>${name}</b>.`,
    grazes: {terrain: ['grass', 'forest'], eatsBerries: 0, shunZone: true}, leaveChance: 0.0001, mule: stands({kickRange: 2.4, charge: 1.2, chargeHit: 1.2, chargeFrom: 3, giveUp: 8})}),

  // ── monsters of the heights and the deep
  // Griffin: nests on the crags, carries off goats and mules, a lone person when hungry
  beast({id: 'griffin', kind: 'monster', label: 'грифон', labelAcc: 'грифона', plural: 'грифоны', needs: ['food'], behaviours: [...WAYS.predator], heart: BEAT.predator, deeds: {lair: [...DEED_WAYS.lair]},
    arrive: {group: [1, 1], every: [5, 8], chance: 0.4, cap: 1, first: 5, message: 'над скалами кружит грифон. Коз и мулов — под крышу'},
    habitat: {highlands: 'usual', foothills: 'rare', steppe: 'rare', desert: 'rare'},
    look: {shape: 'bird', size: 0.86, color: '#b88a44'},
    yields: {meat: 4, feathers: 3, bone: 2}, trophies: [{res: 'feathers', n: 2, chance: 0.3}],
    killMessage: name => `Грифон унёс поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['goat', 'deer', 'hare'], weakPrey: ['mule'], weakBelow: 0.7, sight: 30, sprint: 1.6, boldPeople: 0.5, groupFear: 3, meal: 2.5, bigMeal: 4})}),

  // Wyvern: dragon-kin without a mind; its sting poisons
  beast({id: 'wyvern', kind: 'monster', label: 'виверна', labelAcc: 'виверну', plural: 'виверны', needs: ['food'], behaviours: [...WAYS.predator], heart: BEAT.predator, deeds: {lair: [...DEED_WAYS.lair]},
    arrive: {group: [1, 1], every: [6, 10], chance: 0.35, cap: 1, first: 6, message: 'с гор спустилась виверна. Её жало ядовито'},
    habitat: {highlands: 'usual', volcano: 'rare'},
    look: {shape: 'bird', size: 0.86, color: '#5d6b4b'}, venom: {dmg: 0.0009, ticks: 240},
    yields: {meat: 5, scales: 2, venom: 1}, trophies: [{res: 'venom', n: 1, chance: 0.3, tier: 2}, {res: 'scales', n: 1, chance: 0.2}],
    killMessage: name => `Виверна ужалила поселенца насмерть: <b>${name}</b>.`,
    predator: hunts({prey: ['goat', 'deer', 'boar'], weakPrey: ['mule', 'elk'], weakBelow: 0.6, sight: 26, boldPeople: 0.45, groupFear: 4})}),

  // Dragon: the one great beast of a world — one or two, in an ancient lair at a volcano (data/lairs.js
  // `dragon`). It never comes to the local map on its own (no `arrive`, no `habitat`): on the world map it
  // sleeps for years and flies out to burn a town's works and people (atlas/parties.js DRAGON). Its
  // habitat only says where its lair may be: the dragon is a lair, not a field of beasts
  beast({id: 'dragon', kind: 'monster', label: 'дракон', labelAcc: 'дракона', plural: 'драконы', needs: ['food'], behaviours: [...WAYS.predator], heart: BEAT.predator, deeds: {lair: [...DEED_WAYS.dragon]}, heatHarm: 800,
    fearHeat: 800, habitat: {volcano: 'rare'},
    look: {shape: 'bird', size: 1.4, color: '#8a2418'}, breath: 0.5,
    yields: {meat: 20, scales: 12, gland: 3}, trophies: [{res: 'scales', n: 4, chance: 0.4, tier: 3}, {res: 'gland', n: 2, chance: 0.3, tier: 4}],
    killMessage: name => `Дракон сжёг поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['goat', 'deer', 'boar', 'mule', 'elk', 'aurochs'], sight: 30, boldPeople: 0.6, groupFear: 10, meal: 6, bigMeal: 10})}),

  // Drake: a young dragon with no mind yet; its breath sets the grass on fire
  beast({id: 'drake', kind: 'monster', label: 'дрейк', labelAcc: 'дрейка', plural: 'дрейки', needs: ['food'], behaviours: [...WAYS.predator], heart: BEAT.predator, deeds: {lair: [...DEED_WAYS.lair]}, heatHarm: 400,
    arrive: {group: [1, 1], every: [8, 14], chance: 0.3, cap: 1, first: 8, message: 'с вулкана прилетел дрейк. Где он дышит, загорается трава'},
    fearHeat: 350,
    habitat: {volcano: 'usual', highlands: 'rare', desert: 'rare'},
    look: {shape: 'bird', size: 0.95, color: '#a3432e'}, breath: 0.25,
    yields: {meat: 6, scales: 4, gland: 1}, trophies: [{res: 'scales', n: 2, chance: 0.25, tier: 2}, {res: 'gland', n: 1, chance: 0.2, tier: 3}],
    killMessage: name => `Дрейк сжёг поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['goat', 'deer', 'boar', 'mule', 'elk'], sight: 26, boldPeople: 0.35, groupFear: 5, meal: 3, bigMeal: 5})}),

  // Giant spider: webs tangle its prey; silk for bowstrings and cloth, venom for the alchemist
  beast({id: 'spider', kind: 'monster', label: 'гигантский паук', labelAcc: 'гигантского паука', plural: 'гигантские пауки', needs: ['food'], behaviours: [...WAYS.predator], heart: BEAT.predator, deeds: {lair: [...DEED_WAYS.lair]},
    arrive: {group: [1, 3], every: [3, 5], chance: 0.5, cap: 3, first: 3, message: 'в лесу видели гигантских пауков: {n}. Паутина держит крепко'},
    habitat: {underground: 'common', jungle: 'common', forest: 'rare', swamp: 'rare'},
    look: {shape: 'spider', size: 0.62, color: '#3a3530'},
    web: {slow: 0.35, ticks: 120}, venom: {dmg: 0.0004, ticks: 160},
    yields: {silk: 2, venom: 1}, trophies: [{res: 'venom', n: 1, chance: 0.3, tier: 2}, {res: 'silk', n: 2, chance: 0.3}],
    killMessage: name => `Паук опутал и загрыз поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['hare', 'fox', 'goat'], boldPeople: 0.5, groupFear: 3, sight: 16})}),

  // Stone worm: digs through the rock, slow and nearly unkillable, leaves its shell
  beast({id: 'stoneworm', kind: 'monster', label: 'каменный червь', labelAcc: 'каменного червя', plural: 'каменные черви', behaviours: [...WAYS.stander], heart: BEAT.stander, deeds: {lair: [...DEED_WAYS.lair]}, restAt: 0.75, mends: 0.00025, big: true,
    arrive: {group: [1, 1], every: [6, 10], chance: 0.35, cap: 1, first: 5, message: 'из-под скал выполз каменный червь'},
    habitat: {underground: 'usual', desert: 'rare', foothills: 'rare'},
    look: {shape: 'worm', size: 0.9, color: '#7d6f5c'},
    yields: {meat: 8, hide: 4}, trophies: [{res: 'gems', n: 1, chance: 0.15}],
    killMessage: name => `Каменный червь раздавил поселенца: <b>${name}</b>.`,
    grazes: {terrain: ['grass'], eatsBerries: 0, shunZone: true}, leaveChance: 0.0004, mule: stands({kickRange: 1.4, charge: 1.3, chargeHit: 1.8, fleeBelow: 0.15})}),

  // Blood bats: night flocks from caves and barrows; they drink, a little at a time
  beast({id: 'bat', kind: 'monster', label: 'летучая мышь-кровопийца', labelAcc: 'летучую мышь', plural: 'летучие мыши', needs: ['food'], behaviours: [...WAYS.predator], heart: BEAT.predator, deeds: {lair: [...DEED_WAYS.lair]}, nocturnal: true,
    arrive: {group: [3, 6], every: [2, 3], chance: 0.6, cap: 6, first: 2, night: true},
    habitat: {underground: 'common', barrows: 'common', jungle: 'rare', swamp: 'rare'},
    look: {shape: 'bat', size: 0.34, color: '#3b3440'}, drinks: 0.6,
    killMessage: name => `Летучие мыши обескровили поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['hare', 'rat'], boldPeople: 0.4, groupFear: 4, sight: 18, meal: 0.8})}),

  // Salamander: lives in the heat; fire does not hurt it. Shy, worth its gland
  beast({id: 'salamander', kind: 'beast', label: 'саламандра', labelAcc: 'саламандру', plural: 'саламандры', behaviours: [...WAYS.grazer], heart: BEAT.grazer, heatHarm: 500,
    arrive: {group: [1, 2], every: [2, 4], chance: 0.5, cap: 3, first: 2},
    fearHeat: 450,
    habitat: {volcano: 'usual', underground: 'rare'},
    look: {shape: 'lizard', size: 0.45, color: '#d0632a'},
    yields: {meat: 1, gland: 1}, trophies: [{res: 'gland', n: 1, chance: 0.2, tier: 2}],
    flee: {radius: 5, sprint: 1.5, from: ['people', 'wolf', 'varg'], stamina: 0.006},
    grazes: {terrain: ['grass', 'burnt'], eatsBerries: 0},
    leaveChance: 0.0003}),

  // ── nechist: the rot's folk of wood and water. They live here; killed, they come back after a while
  // Leshy: a mycelium the size of a wood; its spores lead woodcutters and hunters astray. Fire kills it
  beast({id: 'leshy', kind: 'spirit', label: 'леший', labelAcc: 'лешего', plural: 'лешие', mind: 'semi', undead: true, behaviours: [...WAYS.woodSpirit], heart: BEAT.spirit, heatHarm: 40,
    arrive: {first: 2, message: 'в чаще завёлся леший: лесорубы и охотники будут плутать'},
    resident: true, respawn: 8,
    habitat: {forest: 'usual', taiga: 'usual', jungle: 'rare'},
    look: {shape: 'spirit', size: 0.86, color: '#4f6b3a'},
    yields: {herbs: 4, wood: 6},
    killMessage: name => `Леший задавил поселенца в чаще: <b>${name}</b>.`,
    spirit: {home: 'forest', aura: 'astray', radius: 7, every: 120, veil: 4, regen: 4, keepOff: 16, crowd: 3}}),

  // Rusalka: a drowned body of the water strain; by night she lures a lone colonist into the lake
  beast({id: 'rusalka', kind: 'spirit', label: 'русалка', labelAcc: 'русалку', plural: 'русалки', mind: 'semi', undead: true, behaviours: [...WAYS.waterSpirit], heart: BEAT.spirit, heatHarm: 45,
    arrive: {first: 2, message: 'в омуте поселилась русалка. Ночью к воде — только вдвоём'},
    resident: true, respawn: 6,
    habitat: {water: 'usual', swamp: 'usual'},
    look: {shape: 'spirit', size: 0.6, color: '#9fc3c8'},
    killMessage: name => `Русалка утопила поселенца: <b>${name}</b>.`,
    spirit: {home: 'shore', aura: 'lure', radius: 11, night: true, veil: 0, keepOff: 8, dives: true}}),

  // Kikimora: a small marsh pest; by night she spoils the stores and frightens the stock
  beast({id: 'kikimora', kind: 'spirit', label: 'кикимора', labelAcc: 'кикимору', plural: 'кикиморы', mind: 'semi', undead: true, behaviours: [...WAYS.vermin], heart: BEAT.vermin, heatHarm: 50,
    arrive: {first: 2, message: 'на болоте завелась кикимора: по ночам портит припасы'},
    resident: true, respawn: 5,
    habitat: {swamp: 'usual'},
    look: {shape: 'spirit', size: 0.4, color: '#6e6a4e'},
    vermin: {eats: 0.004, flee: 3, caught: 0.03, spoils: true, veil: 2}}),
  // Vodyanoy: the old man of the deep water — the rusalka's strain grown heavy; drags the lone one down by night
  beast({id: 'vodyanoy', kind: 'spirit', label: 'водяной', labelAcc: 'водяного', plural: 'водяные', mind: 'semi', undead: true, behaviours: [...WAYS.waterSpirit], heart: BEAT.spirit, heatHarm: 45,
    arrive: {first: 3, message: 'в омуте заворочался водяной. К глубокой воде ночью — только вдвоём'},
    resident: true, respawn: 10,
    habitat: {water: 'usual', swamp: 'rare'},
    look: {shape: 'spirit', size: 0.9, color: '#4f7a6a'},
    yields: {fish: 6, slime: 2},
    killMessage: name => `Водяной утащил поселенца на дно: <b>${name}</b>.`,
    spirit: {home: 'shore', aura: 'lure', radius: 9, night: true, veil: 0, keepOff: 10, dives: true, regen: 3}}),

  // Poludnitsa: the noon-wife of the open fields; whoever works the meadow under her gaze loses the way
  beast({id: 'poludnitsa', kind: 'spirit', label: 'полуденница', labelAcc: 'полуденницу', plural: 'полуденницы', mind: 'semi', undead: true, behaviours: [...WAYS.woodSpirit], heart: BEAT.spirit, heatHarm: 60,
    arrive: {first: 3, message: 'над лугами в жару ходит полуденница: кто работает в полдень, теряет дорогу'},
    resident: true, respawn: 7,
    habitat: {meadow: 'usual', steppe: 'usual', savanna: 'rare'},
    look: {shape: 'spirit', size: 0.7, color: '#e8d9a0'},
    yields: {herbs: 3, fiber: 2},
    killMessage: name => `Полуденница свела поселенца в поле: <b>${name}</b>.`,
    spirit: {home: 'grass', aura: 'astray', radius: 6, every: 100, veil: 3, regen: 2, keepOff: 12, crowd: 3}}),

  // ── beasts of the far lands: the steppe, the hot south, the ice. Few of them reach the first
  // colonies' regions (data/regions.js); they are here for the world map and the lands to come
  // Horse: a herd of the open steppe, fast and shy; tamed, it carries the hunter and the builder
  beast({id: 'horse', kind: 'beast', label: 'лошадь', labelAcc: 'лошадь', plural: 'лошади', behaviours: [...WAYS.grazer], heart: BEAT.grazer, big: true, legend: 'лошадь',
    arrive: {group: [2, 5], every: [3, 5], chance: 0.5, cap: 6, first: 2, message: 'на луга вышел табун: {n}'},
    habitat: {steppe: 'common', meadow: 'common', savanna: 'usual', shrubland: 'rare', foothills: 'rare'},
    look: {shape: 'horse', size: 0.8, color: '#8c5a34'},
    yields: {meat: 8, hide: 3, bone: 3},
    flee: {radius: 5, sprint: 1.6, from: ['people', 'wolf', 'varg', 'lion'], stamina: 0.004},
    grazes: {terrain: ['grass'], eatsBerries: 0},
    leaveChance: 0.0002,
    tame: {chance: 0.3, tier: 2, space: 2, bait: {hay: 2}, eats: 1.2, breed: 0.04, grownDays: 30, stack: 2, max: 3,
      effects: {jobSpeed: {hunt: 1.15, build: 1.1, farm: 1.15}},
      names: petNames('horse'),
      effect: 'возит охотника и брёвна (охота +15%, стройка +10%), тянет соху (поле +15%)'}}),

  // Aurochs: the wild bull of the forest edge — a mountain of meat, and it charges
  beast({id: 'aurochs', kind: 'beast', label: 'тур', labelAcc: 'тура', plural: 'туры', behaviours: [...WAYS.stander], heart: BEAT.stander, restAt: 0.75, mends: 0.00025, big: true, legend: 'тур',
    arrive: {group: [1, 3], every: [3, 5], chance: 0.45, cap: 3, first: 3, message: 'на опушку вышли туры: {n}. Бык поднимает на рога'},
    habitat: {meadow: 'common', forest: 'usual', steppe: 'usual', swamp: 'rare', taiga: 'rare'},
    look: {shape: 'bull', size: 0.92, color: '#3f2a1c'},
    yields: {meat: 14, hide: 4, bone: 4},
    killMessage: name => `Тур поднял на рога поселенца: <b>${name}</b>.`,
    grazes: {terrain: ['grass', 'forest'], eatsBerries: 0, shunZone: true}, leaveChance: 0.0002, mule: stands({kickRange: 1.2, charge: 1.8, chargeHit: 1.8, grudge: 420, giveUp: 24}),
    tame: {chance: 0.2, tier: 3, space: 3, bait: {hay: 3}, eats: 2, milk: 2.5, breed: 0.03, grownDays: 40, kicks: true, stack: 2, max: 3,
      effects: {jobSpeed: {farm: 1.3, dig: 1.1}},
      names: petNames('aurochs'),
      effect: 'даёт много молока, тянет соху (поле +30%)'}}),

  // Saiga: the antelope of the dry steppe; herds that run at the first scent
  beast({id: 'saiga', kind: 'beast', label: 'сайгак', labelAcc: 'сайгака', plural: 'сайгаки', behaviours: [...WAYS.grazer], heart: BEAT.grazer,
    arrive: {group: [3, 7], every: [2, 4], chance: 0.6, cap: 8, first: 2, message: 'по степи прошло стадо сайгаков: {n}'},
    habitat: {steppe: 'common', savanna: 'common', desert: 'usual', shrubland: 'rare'},
    look: {shape: 'deer', size: 0.56, color: '#c9b08a'},
    yields: {meat: 4, hide: 1, bone: 1},
    flee: {radius: 6, sprint: 1.7, from: ['people', 'wolf', 'varg', 'lion', 'hyena'], stamina: 0.005},
    grazes: {terrain: ['grass'], eatsBerries: 0},
    leaveChance: 0.0004}),

  // Lion: the pride of the savanna; takes saiga and cattle, and a lone man in the dry season
  beast({id: 'lion', kind: 'beast', label: 'лев', labelAcc: 'льва', plural: 'львы', needs: ['food'], behaviours: [...WAYS.predator], heart: BEAT.predator, big: true,
    arrive: {group: [1, 3], every: [4, 6], chance: 0.4, cap: 3, first: 4, message: 'в высокой траве залегли львы: {n}'},
    habitat: {savanna: 'common', shrubland: 'usual', steppe: 'usual', desert: 'rare', barrows: 'rare'},
    look: {shape: 'lion', size: 0.78, color: '#c9a259'},
    yields: {meat: 4, hide: 2, bone: 2}, trophies: [{res: 'furs', n: 2, chance: 0.3}],
    killMessage: name => `Лев задрал поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['saiga', 'deer', 'goat', 'boar', 'hare'], weakPrey: ['aurochs', 'horse', 'camel'], boldPeople: 0.3, groupFear: 4, meal: 2.2, bigMeal: 4, sight: 24})}),

  // Crocodile: lies at the water's edge and takes whatever drinks there; slow on land, never far from it
  beast({id: 'crocodile', kind: 'beast', label: 'крокодил', labelAcc: 'крокодила', plural: 'крокодилы', behaviours: [...WAYS.stander], heart: BEAT.stander, restAt: 0.75, mends: 0.00025, big: true,
    arrive: {group: [1, 2], every: [4, 6], chance: 0.4, cap: 2, first: 3, message: 'у воды залёг крокодил. К берегу — с оглядкой'},
    habitat: {swamp: 'common', jungle: 'usual', water: 'usual', savanna: 'rare'},
    look: {shape: 'lizard', size: 1.0, color: '#4a5e36'},
    yields: {meat: 8, hide: 5, bone: 3}, trophies: [{res: 'scales', n: 2, chance: 0.2}],
    killMessage: name => `Крокодил утащил поселенца в воду: <b>${name}</b>.`,
    grazes: {terrain: ['water', 'grass'], eatsBerries: 0, shunZone: true}, leaveChance: 0.0001, mule: stands({kickRange: 1.3, charge: 1.6, chargeHit: 2.0, chargeFrom: 1.5, grudge: 200, giveUp: 10, fleeBelow: 0.15})}),

  // Camel: the beast of the sand; tamed, it carries the gatherers' loads across the dry land
  beast({id: 'camel', kind: 'beast', label: 'верблюд', labelAcc: 'верблюда', plural: 'верблюды', behaviours: [...WAYS.stander], heart: BEAT.stander, restAt: 0.75, mends: 0.00025, big: true, legend: 'верблюд', heatHarm: 70,
    arrive: {group: [1, 3], every: [3, 5], chance: 0.45, cap: 3, first: 3, message: 'из-за барханов вышли верблюды: {n}'},
    habitat: {desert: 'common', savanna: 'rare', steppe: 'rare', shrubland: 'rare'},
    look: {shape: 'camel', size: 0.88, color: '#c8a874'},
    yields: {meat: 10, hide: 3, bone: 4, wool: 2},
    killMessage: name => `Верблюд затоптал поселенца: <b>${name}</b>.`,
    grazes: {terrain: ['grass'], eatsBerries: 0, shunZone: true}, leaveChance: 0.0002, mule: stands({grudge: 240, giveUp: 16}),
    tame: {chance: 0.25, tier: 2, space: 2, bait: {hay: 2}, eats: 0.8, milk: 1, wool: 2, woolDays: 60, breed: 0.03, grownDays: 40, kicks: true, stack: 2, max: 2,
      effects: {jobSpeed: {gather: 1.2}},
      names: petNames('camel'),
      effect: 'возит собранное (сбор +20%), даёт молоко и немного шерсти'}}),

  // Giant scorpion: hunts by night among the sands; its sting is venom
  beast({id: 'scorpion', kind: 'beast', label: 'гигантский скорпион', labelAcc: 'гигантского скорпиона', plural: 'гигантские скорпионы', needs: ['food'], behaviours: [...WAYS.predator], heart: BEAT.predator, nocturnal: true,
    arrive: {group: [1, 3], every: [3, 5], chance: 0.5, cap: 4, first: 3, night: true, message: 'ночью из песка выползли скорпионы: {n}'},
    habitat: {desert: 'common', shrubland: 'rare', savanna: 'rare', underground: 'rare'},
    look: {shape: 'spider', size: 0.5, color: '#b08a4a'},
    venom: {dmg: 0.0005, ticks: 150},
    yields: {venom: 1, bone: 1}, trophies: [{res: 'venom', n: 1, chance: 0.35, tier: 2}],
    killMessage: name => `Скорпион ужалил поселенца насмерть: <b>${name}</b>.`,
    predator: hunts({prey: ['hare', 'rat', 'fox'], weakPrey: ['saiga'], boldPeople: 0.5, groupFear: 2, sight: 14, meal: 1.2})}),

  // White bear: the lord of the ice; hunts seals, and anything else that walks the snow
  beast({id: 'polarbear', snowfoot: true, kind: 'beast', label: 'белый медведь', labelAcc: 'белого медведя', plural: 'белые медведи', needs: ['food'], behaviours: [...WAYS.predator], heart: BEAT.predator, big: true, heatHarm: 55,
    arrive: {group: [1, 1], every: [4, 7], chance: 0.4, cap: 1, first: 4, message: 'по льду пришёл белый медведь'},
    habitat: {ice: 'common', tundra: 'usual'},
    look: {shape: 'bear', size: 0.95, color: '#e8e6dc'},
    yields: {meat: 14, hide: 3, bone: 3}, trophies: [{res: 'furs', n: 3, chance: 0.3}, {res: 'bile', n: 1, chance: 0.2, tier: 2}],
    killMessage: name => `Белый медведь задрал поселенца: <b>${name}</b>.`,
    predator: hunts({prey: ['seal', 'deer', 'hare', 'fox'], weakPrey: ['elk'], boldPeople: 0.35, groupFear: 4, meal: 2.5, bigMeal: 4, sight: 20, sprint: 1.5})}),

  // Seal: hauls out on the ice by the water; slow on land, fat and hide for the north
  beast({id: 'seal', kind: 'beast', label: 'тюлень', labelAcc: 'тюленя', plural: 'тюлени', behaviours: [...WAYS.grazer], heart: BEAT.grazer,
    arrive: {group: [2, 5], every: [2, 4], chance: 0.5, cap: 6, first: 2, message: 'на лёд у воды вылезли тюлени: {n}'},
    habitat: {ice: 'common', tundra: 'usual', water: 'rare'},
    look: {shape: 'seal', size: 0.6, color: '#7c7a70'},
    yields: {meat: 6, hide: 2, bone: 1},
    flee: {radius: 3.5, sprint: 1.2, from: ['people', 'polarbear', 'wolf'], stamina: 0.01},
    grazes: {terrain: ['water', 'grass'], eatsBerries: 0},
    leaveChance: 0.0003}),

  // Sheep: the hills' flock; tamed for wool first of all
  beast({id: 'sheep', kind: 'beast', label: 'овца', labelAcc: 'овцу', plural: 'овцы', behaviours: [...WAYS.grazer], heart: BEAT.grazer, legend: 'овца',
    arrive: {group: [3, 6], every: [2, 4], chance: 0.5, cap: 8, first: 2, message: 'по склонам разбрелись овцы: {n}'},
    habitat: {meadow: 'common', shrubland: 'common', foothills: 'usual', steppe: 'usual', highlands: 'rare'},
    look: {shape: 'sheep', size: 0.46, color: '#ece6d6'},
    yields: {meat: 3, hide: 1, wool: 2, bone: 1},
    flee: {radius: 4, sprint: 1.3, from: ['people', 'wolf', 'varg', 'lynx', 'lion'], stamina: 0.007},
    grazes: {terrain: ['grass'], eatsBerries: 0.001},
    leaveChance: 0.0001,
    tame: {chance: 0.5, tier: 1, space: 1, bait: {hay: 1}, eats: 0.5, milk: 0.6, wool: 5, woolDays: 35, breed: 0.07, grownDays: 20,
      names: petNames('sheep'),
      effect: 'даёт много шерсти и немного молока, в тёплое время приносит ягнят'}}),
].map(bodyFor);
