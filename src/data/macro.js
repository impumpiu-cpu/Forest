import {WORLD_PEOPLES} from './peoples.js';

// The towns and realms as households that pay their way (docs/WORLD.md «Стройка, войско, торговля»): what a building
// costs to raise, what an army costs to keep, what goes down the trade routes between realms. All rates are a day.

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
export const BUILD = {days: [60, 180, 480], jobsPer: 20, housePer: 400, crew: 0.006, matDays: 300, hand: 12, switch: 0.3};

// An army's keep, a day per fighter: each people's own (data/peoples.js `army`, the table «Народы мира»): gold (pay), arms
// and armour (their wear, by worth) and rations of food, eaten of the first of `eats` the realm has a season of (stores
// keep on the march; the elves eat raw). Orcs fight for loot and keep themselves cheapest; the dwarves' mailed host is
// the dearest. The keep is asked of the town the army marched from, as its people's needs are (atlas/economy.js), and
// the army gets the share the realm met.
//   pack       days of food the army takes at muster from the realm's stocks (no more than ARMY.supplies)
//   packMin    the fewest days of food to march at all: a realm that cannot feed its army musters fewer, or none
//   desert     share of the men that leave a day when unpaid (× the unpaid share)
//   unarmed    might lost without arms or armour (each, × the share missing)
export const ARMY_KEEP = {pack: 60, packMin: 20, desert: 0.004, unarmed: 0.25};
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
