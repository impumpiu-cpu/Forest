import {POTION_RES} from './potions.js';
// The caravan's camp on a local map (campaign/camp.js): the numbers of the light mode. A night that did not
// go quietly, an ambush on the march, a stop for a purpose — each is played on a small map of the cell the
// caravan stands on, with the caravan on it as it is: the people, their gear and wounds, the beasts, the
// carts, the food and goods in the stores, a packed building put up. What comes out of it goes back to the
// campaign as it came out: who died, who is hurt, what was eaten, stolen, broken, taken from the dead.

export const CAMP = {
  // the map: smaller than a settlement's, room enough for the foe to come from the edge
  size: {w: 64, h: 48},
  // the campaign's ration in the local map's nutrition (data/foods.js): a person eats ~0.7 of it a day,
  // a ration is a day's food with what spills and spoils; the caravan's food is laid out as jerky
  perRation: 0.8, food: 'jerky',
  // firewood they gathered for the night (the local map's stores); hay for each beast, cut on the way
  wood: 4, hay: 1.5,
  // a night: from dusk till dawn; the foe comes in the dark, the play ends when it is done (dead, gone)
  // and the camp is quiet for `quiet` hours, or at dawn
  night: {from: 19.5, come: [21, 3], until: 7.5},
  // tired after the day's march they sleep early, by the fire (`rest` — the need they come with)
  rest: {night: 0.25, ambush: 0.85, stop: 0.85, guard: 0.9},
  // an ambush on the march: midday, the foe close by at once, the caravan together and on its feet
  ambush: {from: 11, come: [11, 11.05], until: 18, near: 10},
  // a storm of a guarded place of the quest (campaign/quest.js): in the morning, rested, the guards at hand
  guard: {from: 9, come: [9, 9.05], until: 18, near: 12},
  quiet: 1,
  // the camp's clock (core/time.js dayScale; docs/CAMPAIGN.md «Часы стоянки»): its sun goes `scale` times slower than a
  // settlement's — an hour is HOUR × scale ticks, so the company crosses the camp, sets it up and fights many times over in
  // a night; the body and what lasts by the sun keep to the sun. The screen winds the night on by itself when no foe is on
  // the map (ui/campLocal.js: at `wind` times the pace)
  clock: {scale: 4, wind: 8, dark: 0.5},   // (`dark` — the night deeper than this is wound)
  // the camp's alarm (campaign/camp.js stepCamp; agents/behaviours/warband.js): raised when one of the caravan who is not
  // asleep sees a foe within `sight` cells (by day; at night × the eyes' night sight, data/tongues.js), or a blow is struck;
  // then every able one goes for the foe with the weight `want`
  // — or not (plan claude/caravan-ver_d.md D4): one whose friend lies fallen with a foe over it may run to the friend instead
  // (`rescue`: what it feels for the friend past `friend`, × `per`, up to `cap`, over `want`; the friend within `near`, the foe
  // within `foe` of it); one badly hurt and faint-hearted may falter and fall back to the fire (`falter`: health share below
  // `hp`, bravery below `bravery`) — no rule makes anyone stand, and none keeps anyone safe
  band: {sight: 14, want: 3, rescue: {friend: 2.5, per: 0.3, cap: 1.2, near: 10, foe: 4}, falter: {hp: 0.45, bravery: 0.8, over: 0.5}},
  // how far the foe comes from: an edge at least this far from the camp (cells of the local map)
  far: 18,
  // the foe is bought by the thing's own strength, never by the caravan's (plan claude/guild-plan.md Г2а): the strength
  // comes from the world — the land (how thick the wild is there, the road, the rot, an army's foragers: campaign/land.js
  // dangers), the lair (its kind's danger, its strength, at its land or at its walls) and the errand's tier (its guard ×) —
  // and the budget in strength rating (agents/strength.js) is `unit` × that strength × the fight's weight, ± `sway` of it at
  // random. So a company better armed, healed, grown meets the same foe and beats it more often, and a caravan worn down to
  // two meets what eight met. Heads are always rounded up (outside/bands.js fill `up`: when a giant and a half fit, two
  // come). In the quick mode the same, in might (campaign/march.js caravanMight): `quickUnit` a point
  //   unit:      a point of strength — about a caravan of eight just out, in bone and wood (its strength rating 1200–2200;
  //              might 8–12): an ordinary night's band of the wild (strength 0.6–1.2) is a fight it wins, a stormed lair's
  //              guard (1.5–3 and more) is the hard one
  foe: {
    unit: 1200, quickUnit: 8,
    skirmish: [0.7, 1],   // a chance meeting — a nameless band at night or in ambush: down to −30 %
    force: 1,             // a realm's army, the guards of a place stormed
    leader: 1.15, mini: 1.25, boss: 1.5,   // a leader of an old lair, a grave's guard, the fourth and its lair (campaign/epic.js)
    sway: 0.25, floor: 0.1,   // (the weight never below `floor`, however the sway falls)
    // a thing that came with no strength of its own: its kind's mean in the wild (`else` for the rest)
    density: {ref: {beasts: 0.8, wolves: 0.8, tribe: 1.05, lair: 1.1, raiders: 1, undead: 1.3, bandits: 1, cultists: 1.4, else: 1.2}},
    most: 18, mostGuard: 30,   // no more heads than this, however weak each (a swarm of bats is a swarm, not a plague); a place stormed holds more
    hungry: 0.2,          // a pack of beasts comes this hungry (its food need; boldness grows below hunts.hungry, data/bestiary.js)
  },
  // the threat the band carries its gear and aim by (settlement/threat.js) — × the thing's strength; in the quick
  // mode the heads of the record are counted at `quickHeads` a point of might
  threat: 6, quickHeads: 0.55,
  // a boss (a leader of an old lair, a grave's guard, the fourth: campaign/epic.js, campaign/land.js) never comes alone:
  // at least `atLeast` come; the strongest of its own kind is grown into it. It stands while it lives, and its side
  // holds with it (agents/auras.js: the aura `lead`)
  boss: {atLeast: 2},
  // the skills the ranks bring (data/skills.js, 0 … 1): the fighters fight (a tool on the back: its own skill, `tools`)
  skills: {fighter: {melee: 0.35, ranged: 0.3}, knight: {melee: 0.35, ranged: 0.3}, squire: {}, sellsword: {melee: 0.4, ranged: 0.2}, guide: {hunting: 0.3, ranged: 0.2}},
  tools: {axe: 'woodcutting', ironaxe: 'woodcutting', maul: 'construction', hatchet: 'hunting', pan: 'gathering'},
  toolSkill: 0.3,
  // the quiver of a bowman
  arrows: 14,
  // a beast with this little health or less on the map is counted lost (killed or bolted)
  beastGone: 0.05,
  // a cart or wagon stands at the camp: when the foe looted the stores, it is broken with this chance
  wreck: 0.35,
  // a stop on the map (a deliberate camp to hunt and gather): played day by day, at most `maxDays`
  // of it on the map; the rest of the stop goes on as before, on the world map
  // they come to it fed (the day's meal is the campaign's), the land's game on the map: × its level
  stop: {maxDays: 6, from: 7, until: 19.5, game: 2.2, gameCap: 2, smallGame: 1.5, roll: 0.4},   // × min(gameCap, level) × (roll + U(0,1)); small game (below HERD.big) × smallGame
  // what the stores send back to the campaign besides the food: the goods the caravan carries and sells (the
  // rest — firewood, hay, stone — stays at the camp)
  // (every potion and its makings: data/potions.js — the alchemy goes on in the cargo)
  // what of `carry` a stop to dig counts as dug (the rest the hunt and the camp give)
  notDug: ['hide', 'leather', 'rope'],
  carry: [...POTION_RES, 'herbs', 'sleepgrass', 'wort', 'pots', 'slime', 'bile', 'venom', 'wax', 'lynxEyes', 'bone', 'gland', 'feathers', 'silverBar', 'hide', 'leather', 'rope', 'ironore', 'bronzeOre', 'silverOre', 'silverNative', 'gems', 'mithrilOre', 'goldDust', 'goldNugget'],
  // the spoils carried to be sold in a town (data/items.js ids): at most this many, the dearest kept
  spoils: 12,
  // how many played camps of the seasons past the campaign keeps to be watched again (ui/campaignView.js; the season's own
  // are all kept till the screen has played them)
  keep: 8,
};

// The camp set up for the night (campaign/works.js; docs/CAMPAIGN.md «Обустройство стоянки»): not buildings of the colony's
// kind but the evening's chores of a company in the field — what it does with what it brought. Each is a thing on the map,
// placed as the camp opens and made by whoever takes it up (agents/behaviours/campwork.js): `ticks` of one pair of hands,
// `at` cells from the fire. In the first `setup.hours` after the camp opens the chores are wanted above sleep (`setup.want`,
// against the needs' urges of data/needs.js); later they wait for whoever is awake and idle. On a stop's second day at
// the same place everything stands from the first (campaign/camp.js S.stayed).
export const CAMP_WORKS = {
  setup: {hours: 2.5, want: 1.6, idle: 0.5, hurt: 0.5, reach: 1.4, pace: 1.2},   // (`reach` — a chore is worked from this close, walked to at `pace`)
  // the camp's overmind (settlement/campMind.js): each chore takes `hands` pairs of hands (1 unless its row says more); a
  // free chore is taken before joining one begun — a begun one weighs `join` cells further off
  mind: {join: 3},
  // a walk round the camp to see what lies about (the caches are found so): once the first chores are done, by day, with
  // no foe about, the overmind sends one — the guide if there is one, else the healthiest free hand at least `hurt`
  // healthy — on a ring of `points` places `radius` cells from the fire (or nearer, down to `inner`, where the land stops
// one) and back, within `hours`; given up after
  // `tries` sendings that came to nothing. `want` — the walk against the needs (data/needs.js), `dark` — the night that
  // stops it (core/time.js nightness)
  scout: {radius: 14, inner: 5, points: 8, hours: 6, want: 1.6, hurt: 0.7, dark: 0.5, tries: 2},
  // where things stand about the fire: the cart at a random bearing, the rest turned from it by these angles (radians); a
  // taken cell is passed by `step` of a turn at a time
  place: {step: 0.26, tether: 0.9, racks: 2.5, spit: 4.4, smoke: 1.25},   // (`idle` — the chores' weight after the first hours; one below `hurt` of its health sits by the fire)
  // the cart or wagon, drawn up by the fire: the stores are at it, the beasts tethered beside it (placed, no work)
  wagon:  {label: 'повозка с припасами', at: 3.5},
  // a rope between posts (`posts` cells): the beasts keep within `keep` of it (agents/behaviours/penned.js) and a raider who
  // would lead one off first cuts the rope — `cut` ticks beside it (campaign/camp.js stepCamp)
  tether: {label: 'коновязь', ticks: 40, hands: 2, at: 4.5, posts: 3, keep: 1.8, stroll: 0.7, cut: 60},   // (a tethered beast strolls `stroll` × keep about the rope)
  // poles with the hunt's hides stretched on them: a night on the racks cures `hides` hides into `leather` leather
  racks:  {label: 'колья со шкурами', ticks: 30, at: 4, cure: {hides: 3, leather: 2}},
  // the spit over the fire: the evening meal is cooked by one (the dish itself: data/transport.js CAMP_KIT.dish)
  spit:   {label: 'вертел над огнём', ticks: 50, at: 1.6},
  // a smoking rack, at a stop with fresh meat (`min` of it): `perTick` of the meat becomes jerky, that keeps (data/foods.js)
  smoke:  {label: 'коптильня', ticks: 40, at: 5, min: 3, perTick: 0.02, jerky: 1.1},
  // the stakes (data/terrain.js `stakes`): a ring `radius` cells from the fire, the road's side left open; those a cart or
  // wagon brought (data/transport.js VEHICLES.stakes) are set `ticks` a cell; with no wheels, on a stop with an axe among the
  // tools, up to `cutPerDay` are cut and set, `cutTicks` a cell, and stand there the next day (campaign/fight.js K.campHere)
  stakes: {label: 'судесы', ticks: 25, radius: 6.5, cutTicks: 70, cutPerDay: 8, gap: 3},
  // a cache in a piece of terrain (world/pieces.js; what it holds: data/pieces.js PIECE_FINDS): searched `ticks` by one pair
  // of hands, and only when no foe is about — the foe beaten, or none coming. What is not searched on the map is searched
  // in the morning, when the field is the caravan's (campaign/works.js cachesOutcome). The company does not know of a cache
  // until one of it comes within `spot` cells of it (settlement/works.js stepWorks): then it is a chore, before — nothing,
  // and one never seen is not searched in the morning either
  cache: {label: 'тайник', ticks: 40, spot: 4, hands: 2},
};

// the game of the land (data/campaign.js GAME) and the flow that brings it to the map (data/migrations.js)
export const GAME_FLOW = {deer: 'deer', boar: 'boars', goat: 'goats', hare: 'hares'};

// what each foe of the bubble is on the local map: a raiding band (data/raids.js) or a beast's flow
// (data/migrations.js); a lair's thing names its own band or beast (campaign/land.js dangers)
export const CAMP_FOES = {
  bandits: {band: 'bandits'},
  raiders: {band: 'orcs'},
  cultists: {band: 'cultists'},
  army:    {band: 'bandits', threat: 1.6},
  tribe:   {band: 'goblins'},
  undead:  {band: 'undead'},
  lair:    {beast: 'varg'},
  beasts:  {beast: 'wolves'},
  wolves:  {beast: 'wolves'},
};
