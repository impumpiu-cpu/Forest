import {WORLD_PEOPLES} from './peoples.js';

// The towns and realms as households that pay their way (docs/WORLD.md «Стройка, войско, торговля»): what a building
// costs to raise, what an army costs to keep, what goes down the trade routes between realms. All rates are a day.

// A town's household (atlas/economy.js): its hands, its buildings' loads, its stocks and their limits, all a day.
//   work          share of the people who work in the buildings
//   passes        passes that settle the loads of the buildings together
//   maxScale      how far spare hands can widen a building (× its jobs)
//   keepWay       a way has its makings when at least this share of a full load of them is to hand
//   switchWay     a building leaves its way for another only when that one's lacking worth is this much (gold a day) more
//   stockDays     the stock is drawn on over so many days (a season): its share of a day
//   haul          of what a town sends to another of its realm, this much arrives
//   reserve       days of its people's food a town keeps in stores (smoked, salted, dried: the hungry eat them, armies march
//                 on them, settlers carry them, a besieged town lives on them); short of it, it asks for more…
//   reserveFill   …filling what it lacks over so many days (stores come second to the daily bread)
//   forage        rations a head a day the people get off their land by their own hands, up to as many as it feeds
//   hold          a town's stores hold this many days of what it asks and makes of a good (gold aside: the treasury takes
//                 it); holdStore — × for a granary's or a cellar's goods; holdMin — at least this gold's worth of any good;
//                 holdLoss — of what is over, this share goes a season (sold off, stolen, rotten)
//   cold, warm    the cell's mean °C below which warmth costs climate.cold, above which climate.warm
export const ECONOMY = {work: 0.5, passes: 5, maxScale: 40, keepWay: 0.5, switchWay: 0.2, stockDays: 30, haul: 0.85,
  reserve: 30, reserveFill: 240, forage: 0.6, hold: 120, holdStore: 2, holdMin: 200, holdLoss: 0.5,
  cold: 2, warm: 12, climate: {cold: 1.6, mild: 1, warm: 0.4}};

// Building. A town builds one thing at a time: its council picks what it needs most (atlas/towns.js chooseBuilding),
// and it is raised by the town's builders out of materials from the realm's stocks (atlas/build.js). Every season
// (a month of the world) the council looks again: another building is taken up when it is wanted `switch` more than the
// one under way; what was done on the old one is kept and goes on if the council comes back to it.
//   days       work-days a building of each step (0 hamlet, 1 village, 2 town) takes, × (1 + jobs / jobsPer) for its hands
//              at work and × (1 + house / housePer) for the room it gives
//   crew       share of the people at building (at least one builder)
//   matDays    materials: the building's own upkeep (`repair`) × this many days — logs, boards, stone or hides
//   hand       work-days for each gold of worth of a material the realm neither has nor makes: gathered by hand
//   switch     how much more another building must be wanted to leave the one under way
//   settle     a town wants settlers from `full` of its target, fully `span` above it (or at twice its people's `from`)
//   instead    what stands in for a material the household did not meet, taken from the realm's stocks one for one:
//              settlers take ready food for the stores they lack
export const BUILD = {days: [60, 180, 480], jobsPer: 20, housePer: 400, crew: 0.006, matDays: 300, hand: 12, switch: 0.3, settle: {full: 0.6, span: 0.3}, instead: {stores: ['food', 'produce']}};

// An army's keep, a day per fighter: each people's own (data/peoples.js `army`, the table «Народы мира»): gold (pay), arms
// and armour (their wear, by worth) and rations of food, eaten of the first of `eats` the realm has a season of (stores
// keep on the march; the elves eat raw). Orcs fight for loot and keep themselves cheapest; the dwarves' mailed host is
// the dearest. The keep is asked of the town the army marched from, as its people's needs are (atlas/economy.js), and
// the army gets the share the realm met.
//   pack       days of food the army takes at muster from the realm's stocks (no more than ARMY.supplies)
//   packMin    the fewest days of food to march at all: a realm that cannot feed its army musters fewer, or none
//   desert     share of the men that leave a day when unpaid (× the unpaid share)
//   unarmed    might lost without arms or armour (each, × the share missing)
//   reach      the realm's towns within so many cells (of a 192-cell world) of the mustering town send their levy too
//   pro        the trained core: the men of these buildings (their jobs) march among the levy and count `might` times
//   guardFloor what the barracks and war camps give with their guard unpaid (× their effects; atlas/treasury.js t.guard)
export const ARMY_KEEP = {pack: 60, packMin: 20, desert: 0.004, unarmed: 0.25, reach: 30, pro: {at: ['barracks', 'warcamp'], might: 2}, guardFloor: 0.5};
const NO_KEEP = {gold: 0, arms: 0, armor: 0, food: 1, eats: ['food']};
const armyOf = people => (WORLD_PEOPLES.has(people) && WORLD_PEOPLES.get(people).army) || NO_KEEP;
// what a fighter takes a day: {gold, arms, armor, food} (food in rations, whatever it eats)
export const keepOf = people => { const {eats, ...keep} = armyOf(people); return keep; };
export const armyEats = people => armyOf(people).eats || ['food'];

// Trade between realms (atlas/trade.js): each season the realms that trade and are joined by routes (atlas/diplomacy.js
// `r.routes`) swap what one has to spare for what the other runs short of, by worth; the side that takes more pays the
// rest in gold, then in luxury.
//   perRoute   worth a day a route carries (a route of a town with a mint counts twice)
//   keep       days of a realm's own asking it keeps before it sells a good
//   haul       share of what is sent that arrives
//   pay        goods a realm pays with, in order
export const TRADE = {perRoute: 40, keep: 60, haul: 0.85, pay: ['gold', 'lux']};

// The realm's treasury (atlas/treasury.js, docs/WORLD.md «Казна»): a store of the realm in its seat — no people, it only
// takes and gives goods. Every season the towns pay their dues into it; its council pays the armies, the builders, the
// upkeep of the buildings and the court, and gives the towns what they lack of what it holds.
//   tax        share of the worth of a town's net making a season, by the edict «подати» (data/kingdom.js EDICTS taxes):
//              light and rich 5%, usual 10%, high and need 15% — paid in gold as far as the town has it, the rest in the goods that keep (rot slower
//              than `keeps` a day)
//   corrupt    of what is paid, corruption (data/kingdom.js RUINS) takes `corrupt` × its points, no more than corruptMax
//   duty       share of the goods that come into a realm by its trade routes that its customs take (atlas/trade.js)
//   loot       share of the keeping stock of a town taken by storm (seat: of the treasury too) or raided, to the winner's
//   wage       gold a work-day for the builders of a building of the village step and up; unpaid, they work at `unpaidPace`
//   court      gold a day for each office held (data/kingdom.js OFFICES), per 1000 people of the realm
//   payIn      what the treasury pays gold's worth in when gold is short, in order; then any other good that keeps, dearest first
//   reserve    seasons of the realm's armies and court the treasury keeps before it gives to the towns
//   help       share of a town's lack of a season the treasury gives it, as far as it has to spare
//   guardWear  the standing guard (the men of the barracks and war camps) wears out this share of an army's arms and armour
//   works      share of what a town's building under way still waits for that the treasury gives a season (beyond its reserve)
//   tribute    once a year a realm on bad terms (attitude at most `below`) with one `ratio` times mightier, not at war,
//              pays it `share` of its treasury; their standing warms by `calm`
//   ransom     gold's worth a head a realm pays to buy its people back from the realm that holds them
//   econ       the kingdom's economy (data/kingdom.js REALM_STATS) from the treasury: × the worth a day of its dues per
//              100 people; the buildings' trade and craft count `fx` of what they did
export const TREASURY = {tax: {light: 0.05, rich: 0.05, usual: 0.1, high: 0.15, need: 0.15}, keeps: 0.001, corrupt: 0.03, corruptMax: 0.5, duty: 0.05,
  loot: {seat: 0.5, assault: 0.3, raid: 0.1}, wage: 0.05, unpaidPace: 0.5, court: 0.15, payIn: ['gold', 'silver', 'lux', 'gems'], reserve: 2, help: 0.5, econ: 0.5, fx: 0.5,
  guardWear: 0.5, works: 0.5, tribute: {below: -1.5, ratio: 2.5, share: 0.05, calm: 0.4}, ransom: 3};

// Plots: how many buildings stand within a town (data/townBuildings.js; the outlying works — fields, mines, pastures —
// stand in their own cells and take none): by the town's step, and more for the seat (atlas/towns.js canBuild)
export const PLOTS = {tier: [8, 20, 45], capital: 15};
