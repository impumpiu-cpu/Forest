// The campaign (docs/CAMPAIGN.md): a caravan sets out from a capital of the world map and walks it
// day by day while the world's history goes on around it. Everything that can be counted lives here;
// campaign/*.js only reads it. Numbers are first guesses for the balance run (tools/campaign-check.mjs).

import {COMBAT_ROLES} from './roles.js';

export const CAMPAIGN = {
  // a night with nothing in the cell's pool still sends a stray (campaign/march.js): wolves of this strength
  stray: {kind: 'beasts', strength: 0.7, beast: 'wolves', label: 'волки'},
  // the peoples whose capitals can send a caravan (the major ones; the minor join on the way, later)
  peoples: ['humans', 'elves', 'dwarves', 'orcs'],
  // the core: those who set out (all of them fighters, RETINUE below); when all of them are dead the campaign is lost
  fighters: 8,
  // food in rations: a ration feeds one for a day and takes one unit of room (data/transport.js: a back is
  // one cell of 6 units, so each sets out with 6 days of food; the capital gives nothing else)
  ration: 1,
  // food found a day per person, × the land's richness (campaign/land.js): on the march only what is
  // picked by the way, in a camp the whole day goes to hunting, fishing and gathering
  forage: {march: 0.4, camp: 1.6, spread: 0.6,
    // a cell's richness (campaign/land.js richness): `game` × the game (at most `gameCap`) + `plants` × the plants + `fish` by
    // a lake or a river, at most `max`; the plants — the biomes' fertility (`fert` for a biome not in the table) × (soil[0] +
    // soil[1] × the cell's fertility, `soilAt` where the world has none)
    land: {game: 0.45, gameCap: 2, plants: 0.55, fish: 0.25, max: 1.6, fert: 0.5, soil: [0.5, 0.5], soilAt: 0.6}},
  // the season's × on what the land gives; in hard frost (a winter day's mean below −5°) × `frost` more
  seasonFood: {spring: 0.9, summer: 1.1, autumn: 1.2, winter: 0.6, frost: 0.7, frostBelow: -5},
  // hunger: a day fed below `starveAt` of the need is a hungry day; hungry, the caravan walks at `slow`
  // and nobody heals; after `wasteAfter` hungry days in a row everyone loses `waste` health a day
  // the chronicle tells of a new hunger only `again` days after the last told, of its end after `over` days of it
  hunger: {starveAt: 0.5, slow: 0.5, wasteAfter: 12, waste: 0.025, tell: {again: 20, over: 4}},
  // health a day: on the march, in a camp
  heal: {march: 0.05, camp: 0.1, ride: 1.5},   // ride: × on the march for one in the saddle
  // the evening council stops the march: to forage when the food left lasts less than `foodDays` and the
  // land can feed them (richness ≥ `foodLand`); to heal when the core's mean health is below `hp` or one
  // of them is below `badly`; not where the night is dangerous (`danger`), unless they already starve;
  // a camp lasts at most `maxDays`, then they go on whatever happens; it breaks up sooner when the packs
  // are `full` (a food camp: that share of what they can carry, at most `stock` days of food) or the core
  // is `healed` (a camp of the wounded). Fed and in a quiet place, every `think` days the council looks
  // whether to stop to build (a cart, a wagon, a building for it) or to tame (data/transport.js)
  camp: {foodDays: 1.5, foodLand: 0.35, hp: 0.6, badly: 0.35, danger: 0.1, maxDays: 6, full: 0.9, healed: 0.85, stock: 12, think: 10,
    wooded: 0.3, basketTrees: 0.1, basket: 0.5},   // trees enough to build and gather bark (`wooded`), to weave a basket (`basketTrees`) and its chance a day
  // in frost the march is slower (winter, the day's mean below 0°)
  frost: 0.7,
  // the speed a day on open meadow, cells of a 192-high world (as the world's parties on foot, data/parties.js)
  speed: 0.7,
  // the fog: what the caravan knows of the world. At the start: `known` cells around the towns of its realm
  // and `partner` around the towns of the realms it trades with; on the way: `sight` cells around it
  fog: {known: 8, partner: 3, sight: 3},
  // a member's might in a fight: role × weapon × armour × health × Strength
  might: {fighter: 0.7, knight: 1, squire: 0.4, sellsword: 1, guide: 0.5, companion: 0.5, freed: 0.3, former: 0.3, perDmg: 0.35, perArmor: 1, perStr: 0.06,
    golem: {bronze: 2, iron: 2.8, steel: 3.6, mithril: 5},
    hurt: [0.3, 0.7]},   // the share of its might one keeps: hurt[0] + hurt[1] × its health   // a golem of the caravan (data/transport.js), as so many knights, × its health
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
  fight: {hurt: [0.05, 0.25], blow: [0.1, 0.35], shield: 3, captive: 0.4, lostHurt: 1.3, saved: 0.05, lost: 0.35, loot: [1, 4], mortal: 0.02, wounded: 0.05, finishOff: 0.5},   // finishOff: one maimed in a lost quick fight, with nobody left standing — finished where it lies (Р3; the map: campaign/camp.js)   // wounded: health lost in a fight that counts as a wound in its record (campaign/stats.js)
  // a morning after a quiet night: a little food is found with `food`; something of worth only where it has a
  // reason to lie (FINDS below)
  morning: {food: 0.22, foodN: [1, 3], rich: 0.2, richCap: 1.2, tell: 0.25},   // the chance × min(richCap, the land's richness + rich); told with `tell`
  // the chronicle tells again of a brew in the healer's hut, of gold panned, only `again` days after the last told
  told: {again: 60},
  // the pace of one who walks or a beast, by its health: base + hurt × min(1, health / at)
  hurtPace: {foot: {base: 0.55, hurt: 0.45, at: 0.6}, beast: {base: 0.6, hurt: 0.4, at: 0.6}},
  // the goal of the walk (this stage: a point; later the clues, docs/CAMPAIGN.md): a land cell this share
  // of the world's diagonal away from the capital; when none can be walked to, the ring widens to `wide`
  goal: {near: 0.22, far: 0.4, wide: [0.06, 0.6]},
  // the campaign gives up after this many years
  maxYears: 25,
  // what a fight of the caravan does to the world (campaign/march.js worldOutcome). The scene's foes ARE that many of the world
  // party met in the bubble (an army, a raid, a leader's band; the rest of it did not fight): its dead are the scene's dead, its
  // taken are the scene's taken — the very ones that walk on with the caravan — whoever won; nothing is healed after the scene
  // (the scene's dead are dead) and the party's beasts and golems fall in the same share, rounded. A party the caravan beat turns
  // home. The quick mode has no scene — its own fate: `auto.won` / `auto.lost` of the party dead, the named one (a leader, a
  // chief) dead when the caravan wins (`auto.boss`), standing when it loses. On the local map the named one's own fate rules:
  // dead — dead; bound and led off — a captive of the caravan, its seat freed; bound but left (no room) — fled; fled or stood —
  // alive. Applied once a fight (K.partyHit)
  scene: {auto: {won: 0.5, lost: 0.1, boss: 'dead'}},
};

// game a cell's beasts give (data/species.js ids) — weight of each against a deer
export const GAME = {deer: 1, boar: 1, elk: 1.3, goat: 0.8, hare: 0.5, saiga: 1, aurochs: 1.3, horse: 0.7, camel: 0.7, sheep: 0.8, seal: 0.9, toad: 0.2};

// what a night may bring, by the land's danger it comes from (campaign/land.js); `might` — the foe's
// strength in the members' units (a knight is 1), × the source's strength where it has one
export const FOES = {
  lair:    {label: 'чудища из логова', might: 4},
  tribe:   {label: 'дикари', might: 5},
  undead:  {label: 'мертвецы', might: 4},
  beasts:  {label: 'хищные звери', might: 2.5},
  wolves:  {label: 'волчья стая', might: 2.5},   // (a caravan saved before the beasts of every kind)
  army:    {label: 'фуражиры чужого войска', might: 6},
  bandits: {label: 'разбойники с большой дороги', might: 3},
  raiders: {label: 'налётчики', might: 5},
  cultists: {label: 'культисты некроманта', might: 5},
};

// The core of a caravan (campaign/start.js): CAMPAIGN.fighters fighters of the realm's kinds, each of a fighting role
// (data/roles.js) drawn by the kind's weights in «Роли видов», in that role's kit (roleKit at `level`: bone and wood, now
// and then bronze).
//   title  — the people's word for a fighter of the core: one, many, of many («вышел караван: 8 хирдманов»)
//   kinds  — whom it is drawn from: `kin` — by the capital's shares of its races (data/peoples.js kin, atlas/population.js);
//            or a fixed {species: weight}
// Shared by all:
//   least  — the roles a core has at least: line (the first rank: shield, spear, cleaver…), a shooter, a healer — the rest drawn
//   big    — the great kinds, at most `max` of them in a core (a giant, an ogre, a troll)
//   lean   — the stats a fighter leans to by its role's group (agents/special.js rollCreature opts.lean: the better of two
//            rolls, inside the people's limits): the line to Strength and Endurance, the shooters to Perception and Agility,
//            the quick to Agility and Luck, the support to Intelligence and Charisma
//   tools  — the camp's tools on the backs of the first fighters (an axe, a maul, a hatchet, a pan: the camp is built with
//            them, the game is skinned and the gold washed)
//   skip   — the roles never drawn for a core: the mounted (no horse at the start) and those of a link only
export const RETINUE = {
  humans:  {title: ['ратник', 'ратники', 'ратников'], kinds: 'kin'},
  elves:   {title: ['страж', 'стражи', 'стражей'], kinds: 'kin'},
  dwarves: {title: ['хирдман', 'хирдманы', 'хирдманов'], kinds: 'kin'},
  orcs:    {title: ['рубака', 'рубаки', 'рубак'], kinds: 'kin'},
  least: {line: 2, shooter: 1, healer: 1},
  big: {kinds: ['giant', 'ogre', 'troll'], max: 1},
  lean: {'линия': ['S', 'E'], 'дальний бой': ['P', 'A'], 'подвижные': ['A', 'L'], 'поддержка': ['I', 'C']},
  tools: [['axe'], ['maul'], ['hatchet'], ['pan']],   // (no rod: the caravan does not fish — a hatchet for the hunt)
  level: 6,
  body: 'clothes',
};
// the role a member of the caravan holds in the core (an old save's knight and squire are fighters too)
export const isFighter = m => m.role === 'fighter' || m.role === 'knight' || m.role === 'squire';
// a fighter of the first rank (its role's group «линия»: data/roles.js; an old save's knight) — it takes the blows, gets the armour
export const inLine = m => m.role === 'knight' || (!!m.fight && COMBAT_ROLES.has(m.fight) && COMBAT_ROLES.get(m.fight).group === 'линия');
// who carries a tool among its things (a camp's tool on the back: RETINUE.tools)
export const toolOf = (m, def) => m.gear.hand.find(id => def(id)?.tool) || null;

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
  {id: 'corpse', where: 'road', chance: 0.007, gold: [2, 10], items: {bronzedagger: 0.3}, goods: {rope: [0.3, 2, 4], potion: [0.15, 1, 1]},
    text: ['У дороги нашли тело путника — давно, видно, лежит: {things}.', 'В придорожной канаве — убитый торговец, разбойники его не обыскали: {things}.']},
  {id: 'cart', where: 'road', chance: 0.005, gold: [1, 6], items: {bronzeaxe: 0.15}, goods: {rope: [0.5, 2, 4], leather: [0.5, 1, 3]},
    text: ['На обочине — брошенная повозка со сломанной осью; в ней нашлось: {things}.', 'Нашли опрокинутую телегу без лошади, груз растащен не весь: {things}.']},
  {id: 'den', where: 'beasts', chance: 0.006, gold: [1, 8], items: {bronzespear: 0.2, irondagger: 0.05}, goods: {hide: [0.4, 1, 2]},
    text: ['Пещера зверя, вся в костях: кто-то из охотников не вернулся отсюда. Среди костей: {things}.', 'В логове зверя под костями — остатки чужого снаряжения: {things}.']},
  {id: 'ash', where: 'ruin', chance: 0.02, gold: [3, 15], items: {bronzesword: 0.1, ironaxe: 0.1}, goods: {potion: [0.2, 1, 2]},
    text: ['На пепелище, в обгоревшем подполе, отыскали: {things}.', 'Среди развалин под рухнувшей балкой — забытый тайник: {things}.']},
  {id: 'field', where: 'battle', chance: 0.012, gold: [1, 6], items: {shield: 0.25, bronzespear: 0.15}, goods: {potion: [0.1, 1, 1]},
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
// The caravan's council (campaign/march.js evening, campaign/visit.js wantVisit; the decision points caravan.visit and
// caravan.camp of data/commands.js), as a realm's court: the first lane with anything on offer (the town or the camp of need —
// the winter, food, the wounded — before the ones of choice), a draw by weight within it.
//   want     the weight of each command when it wants anything; `caravan.camp.goOn` — the way on, offered in the camp's lane
//            of choice whenever anything else is: a camp wanted but not needed is drawn against it. (A town has no such rival:
//            tried on 10 worlds, the shop and the smith drawn against the way on cost the humans and the dwarves their
//            gear — 8 walks won of 20 against 13 without it, 14 before the draw)
//   mission  the caravan's mission profile: three axes 0 … 1, each its own (not shares) — pace (on to the goal), caution (food,
//            healing, the winter in a town), side (wheels, beasts, ore, the smith and the shop). A command's weight × (1 + k ×
//            Σ its leaning along an axis × (the axis − 0.5) × 2): at 0.5 everywhere nothing changes; `people` — each people's
//            profile (a people not listed, or the profile «без влияния склонностей»: `mid` on every axis). The humans' was
//            tuned on 20 worlds (tools/council-probe.mjs): 0.5 · 0.5 · 0.55 won 15 walks, 0.6 · 0.5 · 0.4 — 19 (the old order: 17)
export const COUNCIL = {
  want: {'caravan.visit.winter': 6, 'caravan.visit.food': 3, 'caravan.visit.heal': 3, 'caravan.visit.smith': 1, 'caravan.visit.shop': 1,
    'caravan.camp.food': 3, 'caravan.camp.heal': 2, 'caravan.camp.build': 1, 'caravan.camp.tame': 1, 'caravan.camp.mine': 1, 'caravan.camp.goOn': 0.5},
  mission: {
    k: 0.8, mid: 0.5,
    axes: {pace: 'темп', caution: 'осторожность', side: 'побочные промыслы'},
    leans: {'caravan.visit.winter': {pace: 0, caution: 1, side: 0}, 'caravan.visit.food': {pace: 0, caution: 1, side: 0}, 'caravan.visit.heal': {pace: 0, caution: 1, side: 0},
      'caravan.visit.smith': {pace: 0, caution: 0, side: 1}, 'caravan.visit.shop': {pace: -0.5, caution: 0, side: 1},
      'caravan.camp.food': {pace: -0.5, caution: 0.5, side: 0}, 'caravan.camp.heal': {pace: -0.5, caution: 1, side: 0},
      'caravan.camp.build': {pace: -0.5, caution: 0, side: 1}, 'caravan.camp.tame': {pace: -0.5, caution: 0, side: 1}, 'caravan.camp.mine': {pace: -0.5, caution: 0, side: 1}, 'caravan.camp.goOn': {pace: 1, caution: 0, side: 0}},
    people: {humans: {pace: 0.6, caution: 0.5, side: 0.4}, elves: {pace: 0.45, caution: 0.65, side: 0.4},
      dwarves: {pace: 0.4, caution: 0.55, side: 0.75}, orcs: {pace: 0.7, caution: 0.3, side: 0.45}},
  },
  // how the council decides (campaign/council.js; plan claude/caravan-ver_d.md D5): 'voices' — each who has a say scores the
  // options by its own leanings over its people's, its needs and what it remembers, and the options are drawn from by the sum
  // of what each prefers (core/decide.js pickVoices); 'lanes' — the old way: the need's lane first, its options drawn from
  // by COUNCIL.want × the people's profile, nobody's own voice
  policy: 'voices',
  voice: {
    // a voice: who has it — the captives none (their wish is not a say); the rest, hired and joined too, one each
    say: {captive: 0},
    self: 0.6,          // one's own leaning (data/leans.js: persist → pace, 1 − risk → caution, curious → side) over its people's
    eps: 0.05,          // the weight every option keeps whatever the voices
    // the needs (added to an option's score, × the want of it): hunger to the food, one's wounds and a friend's to the healing,
    // tiredness to any stop, a dangerous night against a camp by caution, a recent loss to caution
    need: {food: 2, hurt: 2, friend: 0.6, friendAt: 1, tired: 1, danger: 1.5, grief: 0.15, griefDays: 20, griefCap: 0.3},
    whyFrom: 0.05,      // a part of a score this big or more is a reason one gives
    keep: 40,           // the meetings kept on the campaign (K.social.meetings: who said what, for the fire's scene)
    // one round of talk (campaign/council.js debate): the option most want is proposed by the one who wants it most; one with a
    // reason of its own (`reasons`) for another option — wanting it `objectAt` more than the proposal, or no more than `near`
    // less (a reason is said even by one who would go along) — objects, the strongest such voice; each other
    // voice moves `sway` toward the objection (× 1 + `bond` × what it feels for the objector, ÷ `bondTop`; × `known` when the reason
    // is one it had already: no news), and as much away from the proposal by half; the proposer then yields (its proposal
    // no more than `yieldAt` over the objection now), meets the objector halfway (an option both score `meetAt` of their best
    // or more: `meet` added for both), or holds
    debate: {objectAt: 0.25, near: 0.5, reasons: ['hunger', 'wounds', 'friend', 'tired', 'danger'], sway: 0.15, bond: 0.5, bondTop: 4, known: 0.5, yieldAt: 0.1, meetAt: 0.8, meet: 0.2},
  },
};

export const MINE = {every: 40, maxDays: 6, quit: 1, room: 6, food: 8, strength: 4, rich: 40,
  ores: ['bronze', 'iron', 'silver', 'gems', 'mithril'],
  // (tuned to what a day on the local map digs, seed 777: iron ~10 units a day on a level-0.5 cell, bronze ~1,
  // gems ~1, silver hardly any, gold sand ~4 for the one panner on a level-1 river)
  auto: {bronze: 0.3, iron: 2.5, silver: 0.1, gems: 0.35, mithril: 0.04, placer: 4}};


// the epic world's sizes (the epic campaign of the old menu and the quick start of the new one; the medium is the campaign's own)
export const EPIC_SIZES = [['small', 'Малый'], ['medium', 'Средний']];

// The wild as foes (campaign/land.js dangers; docs/CAMPAIGN.md «Кто нападает»): who lives in a cell is read from the
// fields of the world (atlas/fauna.js — the beasts, the lairs' monsters and the tribes, data/lairs.js LAIR_FIELD), each
// species that can come at people a foe of its own, by its density there (N, at least `at`):
//   beasts: a beast of prey that hunts people;  lair: a lair's monster;  tribe: the folk of a tribe (its raid band,
//           data/seam.js LAIR_BANDS) — each a chance p × the density (at most cap), strength s[0] + s[1] × it.
//           Inside a lair's land its own kind is the lair's (NIGHT.lair), not counted twice.
//   dead:    the risen of a necromancer (atlas/necro.js: the field of the dead), as the band of the dead
//   raiders: a people that raids (data/seam.js REALM_BANDS: the orcs' warbands, men turned outlaw) by its field there
//           (atlas/peoples.js: density × the land it holds), when it is the caravan's foe — its race dislikes the
//           caravan's (data/relations.js), or a realm of it is at war with the caravan's realm
//   mix:    a foe that comes brings a second kind of the same cell along with the chance chance × the second's share of
//           the two (beasts with beasts, bands with bands); the second makes `share` of the strength the fight is bought
//           with (data/camp.js), [lo, hi]
export const WILD_FOES = {at: 0.04, beasts: {p: 0.025, cap: 1.5, s: [0.6, 0.4]}, lair: {p: 0.03, cap: 1.5, s: [0.7, 0.5]}, tribe: {p: 0.03, cap: 1.5, s: [0.8, 0.5]},
  raiders: {p: 0.02, cap: 1, s: [0.8, 0.5]},
  dead: {p: 0.03, cap: 1.5, s: [0.8, 0.5]},
  mix: {chance: 0.6, share: [0.25, 0.45]}};

// What may come at the caravan's camp at night (campaign/land.js dangers): each a chance of a fight `p` and its strength.
//   lair:    in a lair's land: p[0] + p[1] × its strength (at most pCap), strength s[0] + s[1] × its strength (at most sCap),
//            × the lair's danger (data/lairs.js) — its own band out at night, harder than its kind met roaming the wild
//            (WILD_FOES above: 0.6–1.2 × the danger) and lighter than its garrison stormed (data/quest.js QUEST.guard.lair)
//   army:    where an army's foragers stripped the land above `at`: p × how badly;  undead: where the rot is above `at`:
//            p × it, strength s + it;  bandits: by a road above `at` of the way: p × the road
export const NIGHT = {lair: {p: [0.05, 0.05], pCap: 1.5, s: [0.5, 0.5], sCap: 1},
  army: {at: 0.3, p: 0.2, s: 1}, undead: {at: 0.2, p: 0.06, s: 0.8}, bandits: {at: 0.1, p: 0.02, s: 1}};
