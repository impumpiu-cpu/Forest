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
  // how far the foe comes from: an edge at least this far from the camp (cells of the local map)
  far: 18,
  // the foe: a band's budget in «human raiders» (data/raids.js) from its might (data/campaign.js FOES)
  // × the thing's strength × `budget`; beasts come as a pack of `pack` × strength; the threat the band
  // carries its gear and aim by (settlement/threat.js) — × strength
  budget: 0.55, pack: [2, 4], threat: 6,
  // a building packed in the wagon is put up at the camp: it stands with this share of its work left
  // (the caravan finishes it with its own hands before the night)
  deploy: 0.25,
  // the skills the ranks bring (data/skills.js, 0 … 1): the knights fight, the squires work their tools
  skills: {knight: {melee: 0.35, ranged: 0.3}, squire: {}, sellsword: {melee: 0.4, ranged: 0.2}, guide: {hunting: 0.3, ranged: 0.2}},
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
  stop: {maxDays: 2, from: 7, until: 19.5, game: 2.2},
  // the spoils carried to be sold in a town (data/items.js ids): at most this many, the dearest kept
  spoils: 12,
  // how many played camps the campaign keeps to be watched again (ui/campaignView.js)
  keep: 8,
};

// the game of the land (data/campaign.js GAME) and the flow that brings it to the map (data/migrations.js)
export const GAME_FLOW = {deer: 'deer', boar: 'boars', goat: 'goats', hare: 'hares'};

// what each foe of the bubble is on the local map: a raiding band (data/raids.js) or a beast's flow
// (data/migrations.js); a lair's thing names its own band or beast (campaign/land.js dangers)
export const CAMP_FOES = {
  bandits: {band: 'bandits'},
  army:    {band: 'bandits', threat: 1.6},
  tribe:   {band: 'goblins'},
  undead:  {band: 'undead'},
  lair:    {beast: 'varg'},
  wolves:  {beast: 'wolves'},
};
