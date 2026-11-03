// The peoples of the world map: who comes, when, where they feel at home, how they spread, what
// they build and what they call their towns. The systems are in src/atlas/peoples.js (the peoples as
// fields and the towns they found), atlas/towns.js (what towns build) and atlas/roads.js (roads worn by traffic).
//
//   race:     the race the people is named for (data/races.js): its world view, its deeds and the reference of its births
//   kin:      the races a town of this people holds (atlas/population.js; docs/WORLD.md «Расы и народы»): {race: {base}} —
//             every town holds them all, each × base × (KIN.any + the race's `home` of the town's biome, data/races.js); the
//             shares drift by each race's births and deaths, and the land pulls them back a little (KIN.pull). A building or a
//             recipe of a race's own asks for its share (a recipe's `req` 'kin:<race>', data/townBuildings.js; data/requirements.js). The first race
//             is the people's own (`race`); the others are its lesser kin — the humans' halflings and giants, the horde's goblins,
//             gnolls, trolls and ogres. Folk of other peoples that settle in a town (atlas/demography.js migrate, atlas/diplomacy.js
//             mingling) join its composition as their own race
//   polity:   the uklad of its realms (data/polities.js); none — the people's id
//   era:      the era they come in (data/history.js ERAS)
//   arrive:   how they come into the world: `groups` founding bands; `mode` where — the best spot of
//             their land (default), the best coast (`coast`, from over the sea) or as far from everyone
//             as their land lets them (`far`, out of the wild edges); `free` — how much they shun land another
//             people already lives on (0 — not at all; 1 — only empty land)
//   home:     how much a biome suits them, 0..1 — their carrying capacity, as for the beasts; it is
//             the race's `home` (data/races.js), so the local and the world map agree on where a
//             race belongs; `ores`: weight of the rock's ore wealth (dwarves live off the mountains)
//   moves:    how easily they spread through a biome (×), the rest at `movesElse`
//   spread / growth: diffusion and logistic growth of the people field a year (Fisher–KPP)
//   spacing:  a town stands at least this many cells (of a 192-cell-high world) from any other town
//   settlers: a full town sends `pop` of its people to found a new town (atlas/peoples.js sendSettlers; docs/WORLD.md
//             «Демография»): only from `from` people, keeping at least `keep`; on a free spot within `reach` × spacing;
//             they carry what its store can spare of `goods`; `oreLand` — they settle off their people's land too where
//             the ore under the spot is at least so rich (the dwarves follow the veins; atlas/peoples.js settleSpot); `avoid` —
//             never nearer than so many × its spacing to a town of that people ({orcs: 2}: the dwarves keep off the camps)
//   migrate:  share of a town's people ready to move in a season to a better town (fame and how well their needs are met
//             draw them): of their realm, or of another realm that trades with it, nearby (atlas/demography.js)
//   welcome:  the other peoples whose folk this people takes into its towns by migration (its own kin of other realms always)
//   site:     what makes a good spot for a town, beyond the biome: water, coast, fertility, ores, steep
//   rose:     the course the people keeps its realm to over the years, along the three vectors (data/mind.js): the
//             greenskins to war, the dwarves to craft and hoard, the humans to growth, the elves to a warded, crafted home
//   rosePull: how hard its realms' councils pull back to the rose (× MIND.pull's place; data/mind.js)
//   bureau:   how fast a realm of this people breeds corruption (× RUINS corruption `grows`, data/kingdom.js; from the branch Elves)
//   taste:    how much the people care for each kind of effect when a town chooses what to build
//             (data/townBuildings.js EFFECTS, atlas/towns.js); who builds what is in data/townBuildings.js
//   flows:    × on what its buildings give of a good (data/townBuildings.js TOWN_GOODS, `out`): the elves' gardens
//             yield more, their humane quarries less; none — ×1
//   hands:    the share of its grown people who work (atlas/population.js: the young and the old do not; of the grown, the
//             rest keep house): the hands its town's buildings share out (atlas/economy.js); the orcs put everyone to work.
//             (Before the bands of age it was a share of all the people: 0,4 / 0,55 / 0,5 / 0,6 — the same hands at a town
//             of TOWN_LIFE.age.grownRef grown ones)
//   brawl:    a people that kills its own for a place at the fire: a share a year by its realm's crime and its crowding
//   eat:      food a year of one of its people, in people-years (data/townBuildings.js TOWN_GOODS food): an orc eats more
//   placeFlows: more × where its town stands on such a place (data/townBuildings.js PLACE_NEEDS, any of `needsAny`)
//   swaps:    a good its buildings never take, and what they take instead: {silver: {to: 'wood', k: 3}} — an elven
//             jeweller sets gems in ironwood and the sacred tree, three of wood for one of metal; its people's needs and the
//             materials of its building swap the same way (atlas/treasury.js)
//   levy:     × the share of a town's people its army takes (data/parties.js ARMY.levy); breed — × how fast its towns grow;
//             needs — × the goods its people want a head (atlas/treasury.js); none — ×1
//   eatsRaw:  raw foods it eats as they are (data/townBuildings.js TOWN_GOODS `raw`): they feed it as cooked food does
//   wilds:    the wild allies of the people (atlas/wilds.js): {guard, beasts, treants, grove: {grow, cap}} — the elves' beasts of
//             the land and the treants of their forest, in a town's might and with its armies
//   lineMax:  at most so many buildings of a line in a town of this people, its tiers counted together ({kitchen: 1}: the elves
//             eat raw, one hearth for the strangers among them; atlas/towns.js canBuild)
//   bunks:    room for so many of its people (by the town's step) in every building that is not housing (the dwarves sleep in the workshop under
//             the hammers; atlas/towns.js townFx)
//   stoneLore: the dwarves' knowledge of stone: {reach, k} — a rare ore anywhere within `reach` cells of a mine counts at
//             its richest there × k[ore] among what the mine digs (atlas/economy.js digOf)
//   ruinGrow: × how fast a ruin grows in its realms ({crime: 0.25}: the dwarves' clans, where everyone knows everyone; atlas/kingdom.js)
//   workSwaps: a good a building of the people takes in place of another ({handshop: {wood: {to: 'stone', k: 1}}}: the dwarves
//             make tools of stone where others need logs; atlas/economy.js)
//   tradeUp:  goods it sells as soon as it has them, for another at `rate` of the worth ({sells, buys, rate}: the greenskins sell
//             luxury, gems and silver for arms — atlas/peoples.js tradeUp, a season)
//   places:   a place need as it reads it ({pasture: 'grazing'}: nomads graze and hunt on any open land; atlas/towns.js placeHas)
//   workFlows: × what a building of a kind gives of a good, by building ({lodge: {raw: 2}}: the greenskins live by meat — the hunt,
//             the pens and the slaughterhouse feed them, their fields and gardens give little; atlas/economy.js)
//   wants:    its own wants a head beyond TOWN_MONEY.needs ({basic, comfort}: {good: amount a head a year}; 0 — it wants none of it)
//   names:    syllables of town names: first + middle (may be empty) + last
//   color:    on the world map
import {Registry} from '../core/registry.js';
import {RACES} from './races.js';
import {lineHas} from './townBuildings.js';

// the race's own «Биомы расселения» (data/races.js), read each time: an edit of the races table reaches the peoples
const raceHome = id => RACES.find(r => r.id === id).home;

export const WORLD_PEOPLES = new Registry('worldPeople');
WORLD_PEOPLES.registerAll([
  {id: 'elves', race: 'elf', label: 'эльфы', labelGen: 'эльфов', adj: 'эльфийский', era: 'elder', color: [120, 200, 120],
    hands: 0.67, eat: 0.85, kin: {elf: {base: 1}},
    arrive: {verb: 'пробудились', groups: 2, where: 'в самой древней чаще'},
    get home() { return raceHome('elf'); },
    moves: {forest: 1.4, jungle: 1.2, taiga: 1.2, meadow: 1, swamp: 0.6}, movesElse: 0.25,
    // spacing 14 (was 16): as dense as the dwarves, no denser; 20 settlers (was 30) from 100 people (was 150, keeping 60, was 90) — at the
    // same start with the others their few slow towns reach 150 only when the land about them is taken (docs/WORLD.md «Эльфы»)
    spread: 0.22, growth: 0.18, spacing: 14,
    site: {water: 0.35, coast: 0.15, fert: 0.3, trees: 0.5, ores: 0, steep: -0.4},
    settlers: {pop: 20, from: 100, keep: 60, reach: 2.5, goods: {stores: 20, wood: 20, tools: 2}}, migrate: 0.005, welcome: [],
    eatsRaw: ['raw'],   // the elves eat the raw food as it is — fruit, nuts, honey, greens: it feeds them as cooked food does (atlas/economy.js)
    lineMax: {kitchen: 1},   // one kitchen a town, for the strangers among them: a kitchen turns their food into less food
    // the wood fights for them (atlas/wilds.js): treants wake about a town in the forest, `grove.grow` a year up to `grove.cap` by
    // its step; the town counts beasts of the land worth `guard` of its people in its might; an army takes beasts worth `beasts`
    // of its men and, marching on a town in the forest, treants worth `treants` of them
    wilds: {guard: 0.25, beasts: 0.25, treants: 0.25, grove: {grow: 0.5, cap: [2, 4, 6]}},
    rose: {agg: 0.35, grow: 0.2, econ: 0.45},
    bureau: 0.7,
    taste: {housing: 1, food: 1, prod: 0.6, trade: 0.8, defence: 0.9, faith: 1.3, lore: 1.3, prestige: 1, health: 1.1},
    // children of the wood: the land feeds them better, herbs are theirs, stone and clay they take humanely;
    // metal they do not touch — the ironwood and the sacred tree stand for it
    flows: {food: 1.25, raw: 1.25, herbs: 1.5, potions: 1.5, hide: 1.25, stone: 0.5, clay: 0.5},
    swaps: {bar_silver: {to: 'wood', k: 3}},
    wants: {basic: {drink: 0}, comfort: {drink: 0}},   // they brew no beer (docs/WORLD.md «Мёд»: honey is raw food and an indicator)
    breed: 0.8,   // long lives, few children: their towns grow slowest (× TOWN_LIFE.growth)
    names: {first: ['Ла', 'Эль', 'Ми', 'Ти', 'Ан', 'Иль', 'Си', 'Ар', 'Фе', 'Лин', 'Ни', 'Ло'], mid: ['', 'ри', 'нэ', 'ла', 'во', 'ми', 'ан', 'ли'],
      last: ['эль', 'дор', 'риэль', 'ин', 'ион', 'алон', 'энна', 'ассэ', 'ориэн', 'улин']}},
  {id: 'dwarves', race: 'dwarf', label: 'дварфы', labelGen: 'дварфов', adj: 'дварфийский', era: 'elder', color: [220, 150, 70],
    hands: 0.92, eat: 1.15, kin: {dwarf: {base: 1}},
    // strangers (atlas/diplomacy.js): the dwarves love only dwarves — a town of theirs takes in folk of other peoples at
    // × `take` of the usual pace, and pushes them out by `expel` of its people a year; on shared land they press the others
    // × `push` harder (atlas/peoples.js)
    folk: {take: 0.25, expel: 0.03, push: 1.5},
    // digging and craft: the best miners, the hottest furnaces, masters' work; ancestors are poured beer, not wax;
    // under the mountain (steep slopes or caves at the town) they dig a quarter more
    flows: {ore_iron: 1.5, ore_bronze: 1.5, ore_silver: 1.5, ore_gold: 1.5, ore_mithril: 1.5, stone: 1.5, gems: 1.5, bar_bronze: 1.25, bar_iron: 1.25, bar_steel: 1.25, bar_silver: 1.25, bar_gold: 1.25, bar_mithril: 1.25, fuel: 1.25, tools: 1.25, arms: 1.25, armor: 1.25},
    // leather and hide where others wear cloth (no pastures under the mountain); stone bowls for pots
    swaps: {cloth: {to: 'leather', k: 1}, ware: {to: 'stone', k: 2}},
    breed: 0.9,   // few children, long lives
    // cramped and of one clan: a bunk in every workshop and store (`bunks`), little crime where everyone knows everyone and
    // a crime is never washed off in a life of four centuries (`ruinGrow`); tools of stone where the mountain has no logs
    bunks: [5, 10, 15], ruinGrow: {crime: 0.25},   // (bunks by the town's step)
    // the knowledge of stone: a rare ore anywhere in the mountain about a mine is found and dug × k (atlas/economy.js digOf)
    stoneLore: {reach: 5, k: {silver: 2, gold: 3, mithril: 4}},
    workSwaps: {handshop: {wood: {to: 'stone', k: 1}}, crafthut: {wood: {to: 'stone', k: 1}}},
    placeFlows: {needsAny: ['steep', 'caves'], flows: {ore_iron: 1.25, ore_bronze: 1.25, ore_silver: 1.25, ore_gold: 1.25, ore_mithril: 1.25, stone: 1.25}},
    arrive: {verb: 'вышли из-под гор', groups: 2, where: 'у самых богатых жил'},
    get home() { return raceHome('dwarf'); }, ores: 0.4,
    // the mountains first, the hills seldom; the densest of all — where others see no room they set a workshop, a store and a bunk
    moves: {highlands: 1.4, volcano: 1.1, foothills: 1}, movesElse: 0.3,
    spread: 0.18, growth: 0.16, spacing: 8,
    site: {water: 0.2, coast: 0, fert: 0.05, trees: 0, ores: 0.8, steep: 0.3},
    settlers: {pop: 30, from: 150, keep: 90, reach: 2.5, oreLand: 0.5, avoid: {orcs: 2}, goods: {stores: 30, stone: 30, tools: 4}}, migrate: 0.005, welcome: [],
    rose: {agg: 0.2, grow: 0.2, econ: 0.6},
    bureau: 1,
    taste: {housing: 1, food: 1, prod: 1.4, trade: 1, defence: 1.2, faith: 1, lore: 0.8, prestige: 1.2, health: 0.9},
    names: {first: ['Кхаз', 'Бар', 'Дур', 'Гра', 'Тор', 'Ка', 'Бо', 'Гим', 'Дол', 'Мор', 'Ун', 'Зир'], mid: ['', 'ак', 'ин', 'ум', 'ар', 'ек', 'од'],
      last: ['-дум', 'гард', 'хейм', 'бар', 'зад', 'грим', 'тор', 'карак', 'дин', 'бунд']}},
  {id: 'humans', race: 'human', label: 'люди', labelGen: 'людей', adj: 'людской', era: 'young', color: [100, 150, 235],
    hands: 0.83, eat: 1,
    // the middling people and those who live among them: the halflings of the meadows and the giants of the hills (the
    // weights of the caravan's core they always were: data/campaign.js RETINUE)
    kin: {human: {base: 6}, halfling: {base: 1}, giant: {base: 0.5}},
    // the middling people: no gift of their own, but every road leads to them — they take in strangers × `take` faster and
    // trade warms them × `trade` (atlas/diplomacy.js); the crowd of many peoples breeds crime (data/kingdom.js crime `folk`);
    // they settle among the others: on shared land another people pushes them off only × (1 − `mix`), and their town may stand
    // within `near` × their spacing of another people's town — by the elves' coast, under the dwarves' hills (atlas/peoples.js)
    folk: {take: 1.5, mix: 0.5, near: 0.7},
    trade: 1.25, breed: 1.3,   // many children: the middling people spread faster than the elder ones
    arrive: {verb: 'приплыли из-за моря', groups: 2, where: 'к самому удобному берегу', mode: 'coast', free: 0.7},   // an empty shore: not the elves' coast (atlas/peoples.js arrive)
    get home() { return raceHome('human'); },
    moves: {meadow: 1.4, steppe: 1.4, shrubland: 1.2, savanna: 1.2, forest: 1}, movesElse: 0.4,
    spread: 0.26, growth: 0.24, spacing: 11,
    site: {water: 0.35, coast: 0.25, fert: 0.5, trees: 0.1, ores: 0.2, steep: -0.2},
    settlers: {pop: 30, from: 130, keep: 80, reach: 2.5, goods: {stores: 30, wood: 30, tools: 3}}, migrate: 0.02, welcome: ['elves', 'dwarves', 'orcs'],
    rose: {agg: 0.25, grow: 0.45, econ: 0.3},
    bureau: 1.2,
    taste: {housing: 1, food: 1.2, prod: 1, trade: 1.3, defence: 1, faith: 1, lore: 0.9, prestige: 1.1, health: 1},
    names: {first: ['Бел', 'Яр', 'Вел', 'Свят', 'Мир', 'Глад', 'Рад', 'Ост', 'Лю', 'Звени', 'Добр', 'Влад'], mid: ['', 'о', 'е', 'ино'],
      last: ['град', 'город', 'слав', 'поль', 'ск', 'мир', 'бор', 'ец', 'горск', 'дол']}},
  {id: 'orcs', race: 'orc', label: 'зеленокожие', labelGen: 'зеленокожих', adj: 'зеленокожий', era: 'young', color: [210, 80, 60],
    hands: 1, eat: 1.25,
    // the horde of many races: every town holds them all, each × base × its race's home of the land (data/races.js `home`);
    // the greatest share is the town's leading race. A building of a race's own (data/townBuildings.js `kin`) wants its
    // share at KIN.least or more
    kin: {orc: {base: 1}, goblin: {base: 0.6}, gnoll: {base: 0.2}, troll: {base: 0.05}, ogre: {base: 0.15}},
    // the cult of war (atlas/deeds/warOn.js, makePeace.js): `chance` a year to start a war with any neighbour it borders,
    // whatever they think of each other (another realm of greenskins too), `rest` years at least after the last peace; a war
    // lasts `years` [from, to] and ends by itself, the attitude back where it was before it; a raid of theirs sours the
    // other only × `raid`. Their might in a fight × `might` (atlas/towns.js might)
    // they will not crowd: every house of theirs holds × `house` of its people (atlas/towns.js townFx); shacks and tents are
    // their homes, no rough housing to breed corruption (`roughHome`: atlas/towns.js roughShare)
    house: 0.75, roughHome: true,
    // a fight for a place at the fire (atlas/demography.js lifeYear): each year this share of a town's people kill each other —
    // `crime` × its realm's crime (data/kingdom.js RUINS) and `crowd` × how much fuller it is than `from` of its room; their
    // slaves last `slaveLife` years [from, to] (atlas/peoples.js seasonTowns)
    brawl: {crime: 0.002, crowd: 0.06, from: 0.6}, slaveLife: [1, 4],
    // a horde: a third of its people go to war (× ARMY.levy), it breeds fast (its towns grow × `breed`: many children, not all live),
    // it wants half the goods of the others to live content (× its people's needs, atlas/treasury.js)
    // nomads and warriors (from the branch Elves): luxury, gems, silver and gold they sell as soon as they have them and buy arms
    // at 0.8 of the worth (atlas/peoples.js tradeUp); they want no luxury, and arms are a need of theirs
    tradeUp: {sells: ['lux', 'gems', 'bar_silver', 'bar_gold'], buys: 'arms', rate: 0.8}, wants: {basic: {arms: 0.004}, comfort: {lux: 0}},
    levy: 10 / 3, breed: 1.45, needs: 0.5, beastLevy: 1,   // and it brings all its trained war beasts into the fight (data/parties.js ARMY.beasts)
    // what they do without: meat smoked on the fire for salt, rough logs for boards (atlas/economy.js swaps); their ware is
    // waterskins (the hand workshop's recipe)
    swaps: {salt: {to: 'wood', k: 2}, planks: {to: 'wood', k: 1.5}},
    // open land is theirs: by the steppe and the pasture their herds and hunts give more (atlas/economy.js placeFlows)
    placeFlows: {needsAny: ['pasture', 'flat'], flows: {food: 1.25, raw: 1.25, beasts: 1.25, hide: 1.25}},
    // nomads live by meat: their herds graze and their hunters ride on any open land of theirs; the hunt and the slaughterhouse
    // give more meat, the fields, gardens, fishers and gatherers less (atlas/economy.js workFlows)
    places: {pasture: 'grazing'},
    workFlows: {lodge: {raw: 2}, slaughter: {raw: 1.5}, pen: {beasts: 1.5}, pasture: {beasts: 1.5}, field: {raw: 0.25}, garden: {raw: 0.5}, gatherer: {raw: 0.5}, fishhut: {raw: 0.5}, pier: {raw: 0.5}},
    warCult: {chance: 0.3, rest: 2, years: [2, 5], raid: 0.5, might: 1.15, raids: 3},   // raids — × how often its towns raid and how many a year (war feeds them: atlas/treasury.js plunder)
    arrive: {verb: 'пришли с диких окраин', groups: 2, where: 'туда, где никто их не ждал', mode: 'far'},
    get home() { return raceHome('orc'); }, ores: 0.3,
    moves: {steppe: 1.5, savanna: 1.4, tundra: 1.2, swamp: 1, meadow: 1.2}, movesElse: 0.5,
    spread: 0.3, growth: 0.26, spacing: 13,
    site: {water: 0.3, coast: 0, fert: 0.1, trees: 0.1, ores: 0.3, steep: 0.1},
    settlers: {pop: 25, from: 110, keep: 70, reach: 2.5, goods: {stores: 25, hide: 20, arms: 3}}, migrate: 0.03, welcome: ['elves', 'dwarves', 'humans'],
    rose: {agg: 0.55, grow: 0.3, econ: 0.15}, rosePull: 3,   // the horde keeps to its ways: its council pulls back to the rose × 3 (data/mind.js MIND.pull)
    bureau: 1.5,
    taste: {housing: 1, food: 1, prod: 0.9, trade: 0.6, defence: 1.4, faith: 0.9, lore: 0.3, prestige: 1.3, health: 0.8},
    names: {first: ['Гор', 'Груш', 'Мор', 'Ург', 'Зог', 'Крах', 'Шаг', 'Буг', 'Гра', 'Ног'], mid: ['', 'ак', 'ук', 'аг', 'ор'],
      last: ['-баш', 'гат', 'рук', 'мог', 'душ', 'заг', '-тар', 'нак']}},
]);

// a good as a people takes it (`swaps`): [the good, × how much] — the greenskins' bone for pots, the elves' wood for metal
// a place need as a people reads it (`places`: the greenskins' pasture is any open land of theirs, «grazing»)
export const placeNeed = (people, need) => WORLD_PEOPLES.get(people)?.places?.[need] || need;
export const swapOf = (P, g) => { const s = P?.swaps?.[g]; return s ? [s.to, s.k] : [g, 1]; };
// a basket of goods as a people takes it, × k: several goods may become one (the horde's wood for both salt and boards);
// the buildings' flows, the people's needs, the materials of a building and the town's choices all read goods through this
export function swapGoods(people, goods, k = 1) {
  const P = typeof people === 'string' ? (WORLD_PEOPLES.has(people) ? WORLD_PEOPLES.get(people) : null) : people, out = {};
  for (const [g, n] of Object.entries(goods || {})) { const [to, x] = swapOf(P, g); out[to] = (out[to] || 0) + n * x * k; }
  return out;
}

// a race's share a town must hold for a building of that race's own (data/townBuildings.js `kin`; the old threshold, kept
// by the requirements that carry it: data/requirements.js)
// `pull` — each year a town's races move this share of the way back to what its land gives (the wild tribes of the land join
// the horde: atlas/population.js), so a slow-breeding race thins but does not die out; `any` — the weight of a race off its
// home biomes (the land gives KIN.any + home of it)
export const KIN = {least: 0.08, pull: 0.05, any: 0.2};

// Town sizes: three steps, earned by what the town has built (docs/WORLD.md).
// A town is a step when it has at least `pop` people and any of the buildings in `needsAny`
// (data/townBuildings.js); it falls a step when its people drop below TIER_FALL of that `pop`.
// Within a step the size runs free: a town is a town at 400 and at 6000.
// What each people calls a town of that size, in the cases the chronicle needs:
// [nominative, accusative, genitive, prepositional, instrumental], and the gender of the word.
export const TIERS = [
  {pop: 0, needsAny: null,
    label: {elves: ['приют', 'приют', 'приюта', 'приюте', 'приютом'], dwarves: ['застава', 'заставу', 'заставы', 'заставе', 'заставой'],
      humans: ['хутор', 'хутор', 'хутора', 'хуторе', 'хутором'], orcs: ['стойбище', 'стойбище', 'стойбища', 'стойбище', 'стойбищем']},
    gender: {elves: 'm', dwarves: 'f', humans: 'm', orcs: 'n'}},
  {pop: 60, needsAny: ['granary', 'eldershall', 'shrine', 'shamanhut', 'sacredgrove', 'stonecircle', 'ancestorhall'],
    label: {elves: ['селение', 'селение', 'селения', 'селении', 'селением'], dwarves: ['посёлок', 'посёлок', 'посёлка', 'посёлке', 'посёлком'],
      humans: ['деревня', 'деревню', 'деревни', 'деревне', 'деревней'], orcs: ['становище', 'становище', 'становища', 'становище', 'становищем']},
    gender: {elves: 'n', dwarves: 'm', humans: 'f', orcs: 'n'}},
  {pop: 500, needsAny: ['market', 'stonewall', 'hiddenpaths', 'tunnels', 'earthwall', 'warcamp', 'temple', 'ancestorhall'],
    label: {elves: ['город', 'город', 'города', 'городе', 'городом'], dwarves: ['крепость', 'крепость', 'крепости', 'крепости', 'крепостью'],
      humans: ['город', 'город', 'города', 'городе', 'городом'], orcs: ['твердыня', 'твердыню', 'твердыни', 'твердыне', 'твердыней']},
    gender: {elves: 'm', dwarves: 'f', humans: 'm', orcs: 'f'}},
];
export const TIER_FALL = 0.7;
// the capital: not a step but a flag — the seat of a people's realm, crowned by its throne hall
// (data/townBuildings.js `throne`); what each people calls it
export const CAPITAL = {
  label: {elves: ['столица', 'столицу', 'столицы', 'столице', 'столицей'], dwarves: ['чертог', 'чертог', 'чертога', 'чертоге', 'чертогом'],
    humans: ['столица', 'столицу', 'столицы', 'столице', 'столицей'], orcs: ['ставка', 'ставку', 'ставки', 'ставке', 'ставкой']},
  gender: {elves: 'f', dwarves: 'm', humans: 'f', orcs: 'f'},
};
// the step a town has earned: the highest whose people and buildings it has (steps are not skipped)
export function tierOf(t) {
  let k = 0;
  for (let i = 1; i < TIERS.length; i++) {
    const T = TIERS[i];
    if (t.pop >= T.pop && T.needsAny.some(id => lineHas(t.built, id))) k = i; else break;   // (a tier counts as what it grew from)
  }
  return k;
}
// is the town the crowned seat of its people
export const crowned = t => !!t.capital && t.built.includes('throne');

// Realms (atlas/realms.js): a people is a race, a realm is a state — a seat and the towns that hold
// to it. Each founding band is its own realm, so a race starts as two. A realm is named by the land
// of its seat, so no made-up town name has to be declined: «дварфы Медной горы», «эльфы Тёмного леса».
// The first epithet that fits the seat's cell is taken, in the order: a rich ore, the water, the biome;
// if that name is already a realm's of the same people, the next in that order.
export const EPITHETS = {
  ores: {gold: ['Золотых жил'], silver: ['Серебряных копей'], bronze: ['Медной горы', 'Медных холмов'], iron: ['Железных холмов', 'Ржавых гор'], gems: ['Самоцветных гор'], coal: ['Чёрных копей']},
  water: {coast: ['Солёного берега', 'Белого берега', 'Дальнего берега'], great: ['Великой реки'], river: ['Тихой реки', 'Быстрой реки', 'Светлой реки'],
    lake: ['Светлого озера', 'Тихого озера'], salt: ['Солёного озера']},
  biomes: {forest: ['Тёмного леса', 'Старых дубрав', 'Зелёной сени'], taiga: ['Чёрной тайги', 'Сосновых боров'], jungle: ['Зелёных дебрей'], meadow: ['Широких лугов', 'Вольных трав'],
    steppe: ['Вольной степи', 'Ковыльного моря'], savanna: ['Жёлтых трав', 'Красной земли'], shrubland: ['Сухих холмов', 'Каменистых пустошей'], desert: ['Красных песков', 'Горячих ветров'],
    tundra: ['Белых мхов', 'Студёной земли'], foothills: ['Высоких холмов', 'Долгих склонов'], highlands: ['Седых гор', 'Снежных вершин'], swamp: ['Чёрных топей'], volcano: ['Огненной горы'], ice: ['Вечных льдов'], water: ['Семи островов']},
  else: ['Далёкой земли', 'Края света', 'Новых земель', 'Последнего предела'],
};

// Schisms (atlas/realms.js stepRealms). A realm's seat holds its towns by privilege: the throne, the
// palace, the mint. A town that outgrows the seat may break away:
//   edge       a town of the second step with at least this share of the seat's people (the seat's own
//              glory is privilege: the throne, the palace, the mint — so people are weighed, not fame)…
//   far        …standing at least this far from the seat (in fronts, data/diplomacy.js)…
//   harbor     a harbour town without a harbour at the seat counts this many fronts further away
//   years      …for this many years running is a contender
//   chance     a contender breaks away with this chance a year, × how far it stands (in fronts) and
//              × `shaken` when the realm is at war or the seat was raided lately — families hold on
//              while the realm is quiet
//   attitude   the two realms start from this, and drift back to their race's memory of itself
//   war        chance that the split comes with a war for power at once
// When a seat is burnt, the most glorious town takes the throne; if a second is at least `rival` of it,
// the realm breaks in two instead.
// The realm's land on the map (atlas/realms.js realmLand; the map's layer «Державы»): each living town holds the land it
// reaches over the ground — the cost of a step is its length × (1 + steep × the slope), water stops it — within its
// people's spacing × (reach + tier × its step + capital for the seat); where two towns reach, the nearer by that measure
// (the cost over the town's own reach) holds it
export const REALM_LAND = {reach: 1.4, tier: 0.25, capital: 0.4, steep: 1};
export const SCHISM = {edge: 0.8, far: 0.35, harbor: 0.4, years: 3, chance: 0.08, shaken: 1.6, attitude: -1.5, war: 0.35, rival: 0.6};

// Towns against the wild: a town fights the lairs whose territory reaches it; the town's might is
// √pop × `might`, the lair's its strength × its owner's SPECIAL power. A beaten lair is cleared;
// a town that loses is raided and loses `raidLoss` of its people.
export const TOWN_WAR = {might: 0.9, chance: 0.08, raidLoss: 0.2, reach: 4, luck: [0.6, 0.8], threat: 0.5};

// The young peoples' era (the start setting «Эпоха молодых»), in years.
export const YOUNG_YEARS = [
  {years: 25, label: 'Короткая'},
  {years: 40, label: 'Обычная'},
  {years: 60, label: 'Долгая'},
];

// The eras' length (the start setting «Эпоха древних»), in years.
export const ELDER_YEARS = [
  {years: 25, label: 'Короткая'},
  {years: 40, label: 'Обычная'},
  {years: 60, label: 'Долгая'},
];

// The life of the peoples and their towns on the world map (atlas/peoples.js), a year at a time:
//   band:      the field a founding band (or a band landed by hand) wakes around it; bandPop — its town's people,
//              bandPop[0] + bandPop[1] × a roll;  siteBar — the least a spot is worth for a band to settle there;
//   apart:     the founding bands keep apart — no two of one people nearer than `own` of the coarse grid's width, and a band
//              lands no nearer than `others` of it to any town that stands (another people's founding band too) while such
//              land is to be had; none — it takes the best land left (atlas/peoples.js arrive)
//   oresAway:  how much the ores count off a people's home biomes (dwarves)
//   hearth:    a town keeps its people's field up around it: hearth[0] + hearth[1] × its tier + hearth[2] × its fame
//   hunt:      people thin the beasts where they live: predators and monsters, the others
//   foundLand: the least carrying capacity of the land under a new town (the settlers' spot)
//   settle:    a town sends settlers from `full` of what feeds and houses it, all the way at full + span (or as it grows big:
//              all the way at (1 + big) × its people's `from`), with `chance` ×
//              that a year, no oftener than every `every` years; at most `max` new towns a year a people; `near` — how much
//              nearness counts for the settlers' spot (× its share of the reach)
//   migration: a town of another realm is `abroad` as dear; people move up to moveReach × spacing away; a town over its room
//              sends `overflow` of the surplus away a season; moveLeast — fewer movers than this a season stay home;  abandon — a town of fewer people is left (atlas/demography.js)
//   feeds:     the people a town's land feeds: feeds × the land's share × (fert[0] + fert[1] × the soil) × (home[0] +
//              home[1] × how its realm likes the biome) × (1 + road × the road or harbour) × capital for a capital ×
//              (1 + its food − what armies took + trade × its trade)
//   hold:      a people holds its land only near its living towns: within near × its spacing the field lives as it
//              will, past far × spacing it fades by `fade` of itself a year (between — in part); a burnt people's land
//              goes with its towns
//   growth:    a year: + growth × (1 + prestige × fame) × pop × (1 − pop / the target, at least minTarget) — born of its
//              people, and over the target dying off; no roll and no floor (people are not made out of nothing)
export const TOWN_LIFE = {hold: {near: 2.5, far: 4, fade: 0.3}, band: 0.6, bandPop: [90, 60], apart: {own: 0.25, others: 0.25}, siteBar: 0.4, oresAway: 0.3, hearth: [0.45, 0.15, 0.2], hunt: {predator: 0.3, other: 0.12},
  foundLand: 0.25, settle: {full: 0.75, span: 0.25, big: 2, chance: 0.6, every: 3, max: 2, near: 0.2}, abroad: 0.6, moveReach: 3, overflow: 0.5, moveLeast: 0.5, abandon: 10,
  feeds: 1400, fert: [0.6, 0.4], home: [0.7, 0.3], road: 0.6, capital: 1.4, trade: 0.3,
  growth: 0.22, prestige: 0.6, minTarget: 60,
  // age and death (atlas/demography.js lifeYear, atlas/population.js; each race's adult, lifeFrom, life, fertility, brawled — the
  // races table, data/races.js body): a town holds its people in three bands of age — the young under `adult`, the grown, the
  // old past `oldAt` of its life. A race lives L = from + (to − from) × (1 − e^(−health / health)) years — the town's health
  // its soft lift; a band dies at (1 / L) × (base + (its middle age / (L / 2))^hazard) a year (at most `most`), where base —
  // the children, the sick and the unlucky — falls with health from base[0] to base[1] (a poor land buries its children);
  // a year ages a band's share into the next. The growth of a town (atlas/peoples.js bornOf) is two things, booked apart
  // (t.vital born / came): its BIRTHS — `births` of it, children of the town's grown ones, shared out by each race's share of
  // the town × its fertility against the people's race, all of them young and never more than `perGrown` × that fertility a
  // grown one a year (few grown ones, few children) — and the folk of its people's LAND that come to
  // it (the rest), in the bands `arrive` [young, grown, old] as a people on the move is; a founding band comes grown
  age: {found: 1 / 3, health: 0.3, base: [1, 0.3], hazard: 2, most: 0.5, oldAt: 0.7, births: 0.35, perGrown: 0.08, arrive: [0, 0.92, 0.08]}};

// The greenskins' fighting pits (data/townBuildings.js fightpits, atlas/beasts.js): each season a town with pits catches a
// beast or a monster of the land about — the densest of those that live in its coarse cell, the bigger first (a beast's
// worth: health × blow) — and breaks it to war, while it holds fewer than one for every `per` of its people; a war beast
// counts as its worth × `men` of the town's people in its might and its armies. Never a thinking kind (a troll is a greenskin).
// The beast dens breed their own: a recipe of the dens each (data/townBuildings.js dens: `building:recipe`), while it works
// at `work` or better (t.work)
export const WAR_BEASTS = {per: 200, men: 2, least: 0.002, work: 0.5,
  dens: {'dens:wargs': {species: 'varg', every: 1}, 'dens:spiders': {species: 'spider', every: 2}, 'dens:hyenas': {species: 'hyena', every: 2}}};
