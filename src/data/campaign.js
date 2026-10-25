// The campaign (docs/CAMPAIGN.md): a caravan sets out from a capital of the world map and walks it
// day by day while the world's history goes on around it. Everything that can be counted lives here;
// campaign/*.js only reads it. Numbers are first guesses for the balance run (tools/campaign-check.mjs).

export const CAMPAIGN = {
  // the peoples whose capitals can send a caravan (the major ones; the minor join on the way, later)
  peoples: ['humans', 'elves', 'dwarves', 'orcs'],
  // the core: those who set out; when all of them are dead the campaign is lost
  knights: 4, squires: 4,
  // food in rations: a ration feeds one for a day and takes one unit of room (data/transport.js: a back is
  // one cell of 6 units, so each sets out with 6 days of food; the capital gives nothing else)
  ration: 1,
  // food found a day per person, × the land's richness (campaign/land.js): on the march only what is
  // picked by the way, in a camp the whole day goes to hunting, fishing and gathering
  forage: {march: 0.4, camp: 1.6, spread: 0.6},
  // the season's × on what the land gives; in hard frost (a winter day's mean below −5°) × `frost` more
  seasonFood: {spring: 0.9, summer: 1.1, autumn: 1.2, winter: 0.6, frost: 0.7},
  // hunger: a day fed below `starveAt` of the need is a hungry day; hungry, the caravan walks at `slow`
  // and nobody heals; after `wasteAfter` hungry days in a row everyone loses `waste` health a day
  // the chronicle tells of a new hunger only `again` days after the last told, of its end after `over` days of it
  hunger: {starveAt: 0.5, slow: 0.5, wasteAfter: 12, waste: 0.025, tell: {again: 20, over: 4}},
  // health a day: on the march, in a camp
  heal: {march: 0.05, camp: 0.1},
  // the evening council stops the march: to forage when the food left lasts less than `foodDays` and the
  // land can feed them (richness ≥ `foodLand`); to heal when the core's mean health is below `hp` or one
  // of them is below `badly`; not where the night is dangerous (`danger`), unless they already starve;
  // a camp lasts at most `maxDays`, then they go on whatever happens; it breaks up sooner when the packs
  // are `full` (a food camp: that share of what they can carry, at most `stock` days of food) or the core
  // is `healed` (a camp of the wounded). Fed and in a quiet place, every `think` days the council looks
  // whether to stop to build (a cart, a wagon, a building for it) or to tame (data/transport.js)
  camp: {foodDays: 1.5, foodLand: 0.35, hp: 0.6, badly: 0.35, danger: 0.1, maxDays: 6, full: 0.9, healed: 0.85, stock: 12, think: 10},
  // in frost the march is slower (winter, the day's mean below 0°)
  frost: 0.7,
  // the speed a day on open meadow, cells of a 192-high world (as the world's parties on foot, data/parties.js)
  speed: 0.7,
  // the fog: what the caravan knows of the world. At the start: `known` cells around the towns of its realm
  // and `partner` around the towns of the realms it trades with; on the way: `sight` cells around it
  fog: {known: 8, partner: 3, sight: 3},
  // a member's might in a fight: role × weapon × armour × health × Strength
  might: {knight: 1, squire: 0.4, sellsword: 1, guide: 0.5, companion: 0.5, freed: 0.3, former: 0.3, perDmg: 0.35, perArmor: 1, perStr: 0.06},
  // a night: what finds the camp comes out of the bubble (campaign/bubble.js); a stray nobody saw coming is
  // × `friendly` near a town of friends
  night: {friendly: 0.3},
  // a fight: the foe's might × U(0.6, 1.4) against the caravan's; the caravan takes `hurt` × the foe's might
  // (more when it loses) in blows of `blow` health, the knights `shield` times as often as the squires;
  // the quick mode's fight (campaign/fight.js autoFight): in a fight they win one struck down is carried off at
  // `saved` health; any blow may be mortal (`mortal`, win or lose), as on the local map; a lost fight costs `lost`
  // of the food. `mortal` is tuned so that the quick mode loses as many of the eight as the local map
  // (tools/campaign-balance.mjs)
  // captive: the weight of a captive among those the blows fall on (it keeps out of the fight)
  fight: {hurt: [0.05, 0.25], blow: [0.1, 0.35], shield: 3, captive: 0.4, lostHurt: 1.3, saved: 0.05, lost: 0.35, loot: [1, 4], mortal: 0.02, wounded: 0.05},   // wounded: health lost in a fight that counts as a wound in its record (campaign/stats.js)
  // a morning after a quiet night: a little food is found with `food`; something of worth only where it has a
  // reason to lie (FINDS below)
  morning: {food: 0.22, foodN: [1, 3]},
  // the goal of the walk (this stage: a point; later the clues, docs/CAMPAIGN.md): a land cell this share
  // of the world's diagonal away from the capital; when none can be walked to, the ring widens to `wide`
  goal: {near: 0.22, far: 0.4, wide: [0.06, 0.6]},
  // the campaign gives up after this many years
  maxYears: 25,
};

// game a cell's beasts give (data/species.js ids) — weight of each against a deer
export const GAME = {deer: 1, boar: 1, elk: 1.3, goat: 0.8, hare: 0.5, saiga: 1, aurochs: 1.3, horse: 0.7, camel: 0.7, sheep: 0.8, seal: 0.9, toad: 0.2};

// what a night may bring, by the land's danger it comes from (campaign/land.js); `might` — the foe's
// strength in the members' units (a knight is 1), × the source's strength where it has one
export const FOES = {
  lair:    {label: 'чудища из логова', might: 4},
  tribe:   {label: 'дикари', might: 5},
  undead:  {label: 'мертвецы', might: 4},
  wolves:  {label: 'волчья стая', might: 2.5},
  army:    {label: 'фуражиры чужого войска', might: 6},
  bandits: {label: 'разбойники с большой дороги', might: 3},
};

// the core of each people: ranks (one, many, «four of») and the gear they set out in (data/items.js ids).
// Knights: leather or hardened leather and a good weapon, not iron; squires: a plain tool, no armour.
export const RETINUE = {
  humans:  {knight: ['рыцарь', 'рыцари', 'рыцаря'], squire: ['оруженосец', 'оруженосцы', 'оруженосца'],
    knightGear: [['bronzespear', 'shield'], ['bronzeaxe', 'shield'], ['bronzespear', 'shield'], ['bow', 'quiver']]},
  elves:   {knight: ['страж', 'стражи', 'стража'], squire: ['помощник', 'помощники', 'помощника'],
    knightGear: [['bow', 'quiver'], ['bronzespear', 'shield'], ['bow', 'quiver'], ['bronzespear', 'shield']]},
  dwarves: {knight: ['хирдман', 'хирдманы', 'хирдмана'], squire: ['подмастерье', 'подмастерья', 'подмастерья'],
    knightGear: [['bronzeaxe', 'shield'], ['bronzeaxe', 'shield'], ['bronzespear', 'shield'], ['bronzeaxe', 'shield']]},
  orcs:    {knight: ['рубака', 'рубаки', 'рубаки'], squire: ['прислужник', 'прислужники', 'прислужника'],
    knightGear: [['bronzeaxe'], ['bronzeaxe', 'shield'], ['bronzespear'], ['bronzeaxe']]},
  // shared by all
  // the stats each rank leans to (agents/special.js rollCreature opts.lean: the better of two rolls, inside the
  // people's limits): the fighters to Strength, Endurance, Agility (a bowman — Perception too); the squires to
  // Intelligence (they learn the crafts), Charisma (taming, rumours, companions), Perception (hunting, scouting), Luck
  lean: {knight: ['S', 'E', 'A'], bowman: ['P'], squire: ['I', 'C', 'P', 'L']},
  armour: ['jerkin', 'hardleather', 'jerkin', 'hardleather'],
  squireGear: [['axe'], ['maul'], ['rod'], ['pan']],
  squireBody: 'clothes',
};

// The campaign's chronicle (campaign/chronicle.js): every line has a kind (campaign/march.js say), every kind a
// theme and a level — the screen hides themes and colours the levels, as the settlement's journal does
// (data/logTopics.js). `fold` — kinds whose lines repeat (a day of the stop, a morning's find, a new land):
// a run of them in a row is shown as one line with a count.
export const CHRONICLE = {
  topics: [
    {id: 'quest', label: 'корона и следы'},
    {id: 'fight', label: 'бои'},
    {id: 'death', label: 'смерти'},
    {id: 'people', label: 'люди'},
    {id: 'town', label: 'города'},
    {id: 'camp', label: 'стоянки'},
    {id: 'road', label: 'дорога'},
    {id: 'baggage', label: 'обоз'},
  ],
  kinds: {
    start: ['quest', 'alert'], quest: ['quest', 'notice'], crown: ['quest', 'alert'], goal: ['quest', 'notice'], home: ['quest', 'alert'], end: ['death', 'alert'], epilogue: ['quest', 'notice'],
    fight: ['fight', 'notice'], sight: ['fight', 'info'],
    death: ['death', 'alert'], hunger: ['death', 'notice'],
    people: ['people', 'notice'], leave: ['people', 'info'],
    town: ['town', 'notice'],
    camp: ['camp', 'info'], stop: ['camp', 'info'], find: ['camp', 'info'], treasure: ['camp', 'notice'],
    march: ['road', 'info'], land: ['road', 'info'], route: ['road', 'info'], lost: ['road', 'notice'],
    beast: ['baggage', 'info'], build: ['baggage', 'info'],
  },
  fold: ['stop', 'find', 'land', 'sight'],
};

// What a morning may find besides food (campaign/finds.js): never a purse out of thin air — always something it
// came from. `where` — what of the land makes it possible, read as a share 0…1 of the cell (campaign/finds.js
// WHERE): road — a road's traffic; beasts — a beasts' lair or wolves; ruin — a burnt town or a fallen lair near;
// battle — the graves of a battle or a raid, an army's track. A quiet morning rolls each kind once, with
// `chance` × that share; the first that comes is the find. In it: gold `gold` (always some: a find is never empty), `items` (data/items.js
// ids, each with its chance: one goes to whoever it suits, the rest rides to be sold), `goods` (resources
// with an amount); `text` — the line, one drawn: {gold}, {things} are filled in.
export const FINDS = [
  {id: 'corpse', where: 'road', chance: 0.007, gold: [2, 10], items: {bronzedagger: 0.3}, goods: {rope: [0.3, 2, 4]},
    text: ['У дороги нашли тело путника — давно, видно, лежит: {things}.', 'В придорожной канаве — убитый торговец, разбойники его не обыскали: {things}.']},
  {id: 'cart', where: 'road', chance: 0.005, gold: [1, 6], items: {bronzeaxe: 0.15}, goods: {rope: [0.5, 2, 4], leather: [0.5, 1, 3]},
    text: ['На обочине — брошенная повозка со сломанной осью; в ней нашлось: {things}.', 'Нашли опрокинутую телегу без лошади, груз растащен не весь: {things}.']},
  {id: 'den', where: 'beasts', chance: 0.006, gold: [1, 8], items: {bronzespear: 0.2, irondagger: 0.05}, goods: {hide: [0.4, 1, 2]},
    text: ['Пещера зверя, вся в костях: кто-то из охотников не вернулся отсюда. Среди костей: {things}.', 'В логове зверя под костями — остатки чужого снаряжения: {things}.']},
  {id: 'ash', where: 'ruin', chance: 0.02, gold: [3, 15], items: {bronzesword: 0.1, ironaxe: 0.1}, goods: {},
    text: ['На пепелище, в обгоревшем подполе, отыскали: {things}.', 'Среди развалин под рухнувшей балкой — забытый тайник: {things}.']},
  {id: 'field', where: 'battle', chance: 0.012, gold: [1, 6], items: {shield: 0.25, bronzespear: 0.15}, goods: {},
    text: ['Старое поле боя: земля всё ещё отдаёт ржавое железо. Подобрали: {things}.', 'У курганов павших — брошенное оружие и кошель убитого: {things}.']},
];

// A stop to dig (campaign/march.js, camp.js): the council looks at the cell it stands on (the world's geology,
// seam/cell.js) for an ore worth stopping for. An ore of a metal (data/ores.js `tier`) is
// worth it only when the caravan's best metal (campaign/baggage.js metalTier) is lower; silver and gems
// (`money`) and the gold sand of a river (`placer`, with a pan) — while the treasury is below `rich`. Only the cell
// the caravan stands on (it walks over dozens a season). Not more often than every
// `every` days, never twice on the same cell, only with food for `food` days and room for `room` units more besides
// the room that food would take; it stops after `maxDays`, or
// when a day gave less than `quit` units (the face is worked out), or when the packs are full. On the local map
// the caravan digs the outcrop itself (data/jobs.js 'dig' in a camp: no mine); in the quick mode a day gives
// `auto[ore] × the cell's level × the diggers` units (a digger — one with Strength ≥ `strength`; gold sand —
// the one with the pan)
export const MINE = {every: 40, maxDays: 6, quit: 1, room: 6, food: 8, strength: 4, rich: 40,
  ores: ['bronze', 'iron', 'silver', 'gems', 'mithril'],
  // (tuned to what a day on the local map digs, seed 777: iron ~10 units a day on a level-0.5 cell, bronze ~1,
  // gems ~1, silver hardly any, gold sand ~4 for the one panner on a level-1 river)
  auto: {bronze: 0.3, iron: 2.5, silver: 0.1, gems: 0.35, mithril: 0.04, placer: 4}};


// the epic world's sizes (the epic campaign of the old menu and the quick start of the new one; the medium is the campaign's own)
export const EPIC_SIZES = [['small', 'Малый'], ['medium', 'Средний']];

// What may come at the caravan's camp at night (campaign/land.js dangers): each a chance of a fight `p` and its strength.
//   lair:    in a lair's land: p[0] + p[1] × its strength (at most pCap), strength s[0] + s[1] × its strength (at most sCap)
//   wolves:  where wolves live: p × their density (at most cap), strength s[0] + s[1] × it
//   army:    where an army's foragers stripped the land above `at`: p × how badly;  undead: where the rot is above `at`:
//            p × it, strength s + it;  bandits: by a road above `at` of the way: p × the road
export const NIGHT = {lair: {p: [0.05, 0.05], pCap: 1.5, s: [0.6, 0.6], sCap: 2}, wolves: {p: 0.025, cap: 2, s: [0.7, 0.3]},
  army: {at: 0.3, p: 0.2, s: 1}, undead: {at: 0.2, p: 0.06, s: 0.8}, bandits: {at: 0.1, p: 0.02, s: 1}};
