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
  // the camp's alarm (campaign/camp.js stepCamp; agents/behaviours/warband.js): raised when one of the caravan who is not
  // asleep sees a foe within `sight` cells (by day; at night × the eyes' night sight, data/tongues.js), or a blow is struck;
  // then every able one goes for the foe with the weight `want`
  band: {sight: 14, want: 3},
  // how far the foe comes from: an edge at least this far from the camp (cells of the local map)
  far: 18,
  // the foe is bought by the caravan's strength, not by the thing's (agents/strength.js sideStrength of everyone
  // who stands in the fight, with all they wear — campaign/camp.js campSetup): the fight's budget is that strength
  // × the fight's weight, ± `sway` of it at random; heads are always rounded up (data/raids.js fill `up`: when a
  // giant and a half fit, two come). In the quick mode the same, in the caravan's own might (campaign/fight.js)
  foe: {
    skirmish: [0.7, 1],   // a chance meeting — a nameless band at night or in ambush: down to −30 %
    force: 1,             // a realm's army, the guards of a place stormed
    leader: 1.15, mini: 1.25, boss: 1.5,   // a leader of an old lair, a grave's guard, the fourth and its lair (campaign/epic.js)
    sway: 0.25, floor: 0.1,   // (never lighter than `floor` of the caravan, however the sway falls)
    // a chance meeting is as many as live there (campaign/land.js: the thing's strength grows with the density of who
    // came): × its strength over `ref` of its kind (the mean of that kind in the wild; `else` for the rest), within
    // [lo, hi] — a thick land sends more, a thin one fewer; a kind as a whole is as strong as before
    density: {ref: {beasts: 0.8, wolves: 0.8, tribe: 1.05, lair: 1.1, raiders: 1, undead: 1.3, bandits: 1, cultists: 1.4, else: 1.2}, lo: 0.6, hi: 1.5},
    most: 18,             // no more heads than this, however weak each (a swarm of bats is a swarm, not a plague)
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
  tools: {axe: 'woodcutting', ironaxe: 'woodcutting', maul: 'construction', rod: 'fishing', pan: 'gathering'},
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
  stop: {maxDays: 6, from: 7, until: 19.5, game: 2.2},
  // what the stores send back to the campaign besides the food: the goods the caravan carries and sells (the
  // rest — firewood, hay, stone — stays at the camp)
  // (every potion and its makings: data/potions.js — the alchemy goes on in the cargo)
  carry: [...POTION_RES, 'herbs', 'sleepgrass', 'wort', 'pots', 'slime', 'bile', 'venom', 'wax', 'lynxEyes', 'bone', 'gland', 'feathers', 'silverBar', 'hide', 'leather', 'rope', 'ironore', 'bronzeOre', 'silverOre', 'silverNative', 'gems', 'mithrilOre', 'goldDust', 'goldNugget'],
  // the spoils carried to be sold in a town (data/items.js ids): at most this many, the dearest kept
  spoils: 12,
  // how many played camps of the seasons past the campaign keeps to be watched again (ui/campaignView.js; the season's own
  // are all kept till the screen has played them)
  keep: 8,
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
