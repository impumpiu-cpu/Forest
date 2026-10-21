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
  fight: {hurt: [0.05, 0.25], blow: [0.1, 0.35], shield: 3, captive: 0.4, lostHurt: 1.3, saved: 0.05, lost: 0.35, loot: [1, 4], mortal: 0.02},
  // a morning after a quiet night: a little food is found with `food`, something of worth with `treasure`
  morning: {food: 0.22, foodN: [1, 3], treasure: 0.012, gold: [3, 15]},
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
    camp: ['camp', 'info'], stop: ['camp', 'info'], find: ['camp', 'info'],
    march: ['road', 'info'], land: ['road', 'info'], route: ['road', 'info'], lost: ['road', 'notice'],
    beast: ['baggage', 'info'], build: ['baggage', 'info'],
  },
  fold: ['stop', 'find', 'land', 'sight'],
};
