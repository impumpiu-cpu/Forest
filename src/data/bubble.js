// The bubble around the caravan (docs/CAMPAIGN.md, «Пузырь»). The world keeps most of what lives in it
// as fields — beasts, the rot, the lairs' hold on the land, the roads' traffic; around the caravan these
// become things: a wolf pack, a band out of a lair, outlaws by the road, an army's foragers, a merchant's
// train, a herd of deer. A thing is born in a ring between `near` and `far` from the caravan and melts back
// into the field beyond `gone` (a margin past `far`, so that nothing blinks at the edge). The world's own
// parties (atlas/parties.js: raids, armies, broods) are things already; inside the bubble they count too.
// Distances are cells of a 192-high world (× the world's scale), speeds — cells a day.
import {CAMPAIGN} from './balance/prices.js';
export const BUBBLE = {
  near: 4, far: 8, gone: 10,
  // each day this many cells of the ring are looked at; each danger of a cell (campaign/land.js dangers)
  // sends a thing with its chance × `spawn`, the traders and herds with their own; near a friendly town × `friendly`
  samples: 4, spawn: 0.3, friendly: 0.3,
  // at most this many things at once (the world's parties are not counted); a thing that is not hunting the
  // caravan wanders off back into the field after `life` days
  max: 10, life: 20,
  // a thing on the caravan's trail (a pursuit, one that has noticed it) goes for it within `sense`; one that only
  // wanders about its own business notices the caravan only within `wanderSense` (half the bubble), and may miss
  // it; once it notices, it hunts. It reaches the caravan within `contact`
  sense: 6, wanderSense: 4, contact: 0.7,
  // the further on the way, the darker: the hostile are born × (1 + `way` × the share of the way to the crown
  // walked + `clue` × the clues found); small parties by day — of a cell's dangers, with `chance` × that, at
  // `strength` × of the danger's own, wandering
  grow: {way: 0.6, clue: 0.25},
  small: {chance: 0.03, strength: [0.5, 0.8]},
  // a people that walks quietly is noticed only this near (× sense): the forest folk, frail in a fight, keep out of one
  quiet: {elves: 0.6},
  // the old field's chance of a night visitor nobody saw coming (a lone beast, a thief)
  stray: 0.012,
  // with a guide, a hunting thing loses the trail with this chance a day
  guideLoses: 0.25,
  // a pursuer the scouts see and that is stronger than `evadeAt` × the caravan: they muddle the trail and slip
  // away with `evade` (more with a guide: + `guideEvade`); it loses them for `lost` days
  evadeAt: 0.9, evade: 0.4, guideEvade: 0.25, lost: 4,
  // a thing that fought the caravan and won leaves it alone for these days
  sated: 12,
  // the council does not camp with a hunting thing this near (× `sense`); the scouts tell of a thing whose might
  // is above `strong` × the caravan's (and of any of the world's parties)
  wary: 0.8, strong: 0.8,
  // a world party (raid, army, brood): its might over the foes' units, within these bounds
  partyMight: {per: 1 / 3, min: 0.7, max: 3},
};

// what the things are. foe — the fight it brings (data/campaign.js FOES); hunts — goes for the caravan when it
// notices it; ambush — strikes on the march, by day (the caravan is caught × `surprise` of its might);
// speed — cells a day; mood — 'hostile' | 'trade' | 'game'; road — keeps to the roads
export const THINGS = {
  wolves:  {foe: 'wolves', hunts: true, speed: 0.9, label: 'волчья стая', mood: 'hostile'},
  lair:    {foe: 'lair', hunts: true, ambush: true, speed: 0.8, mood: 'hostile'},
  tribe:   {foe: 'tribe', hunts: true, ambush: true, speed: 0.7, mood: 'hostile'},
  undead:  {foe: 'undead', hunts: true, speed: 0.4, mood: 'hostile'},
  bandits: {foe: 'bandits', hunts: true, ambush: true, speed: 0.7, road: true, mood: 'hostile'},
  army:    {foe: 'army', hunts: true, ambush: true, speed: 0.7, mood: 'hostile'},
  trader:  {speed: 0.6, road: true, mood: 'trade', label: 'торговый обоз'},
  herd:    {speed: 0.5, mood: 'game', label: 'стадо'},
};
export const AMBUSH = {surprise: 0.85};

// the merchants' train on the road: how much it carries and its prices (× a town's: data/market.js)
export const TRAIN = {chance: 0.12, food: [15, 40], get buy() { return CAMPAIGN.train.buy; }, get sell() { return CAMPAIGN.train.sell; }};   // buy, sell: data/balance/prices.js
// a herd: its chance where game lives (× the cell's game), and the food a hunt of it gives
export const HERD = {chance: 0.08, food: [4, 10]};
