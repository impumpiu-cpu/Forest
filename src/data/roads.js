// Roads of the world map: worn by traffic, overgrown when left. The system is atlas/roads.js.
// Every `every` years each town sends traffic to its `links` nearest towns within `reach` cells (of a
// 192-cell-high world) of a people that does not hate it; the traffic goes the cheapest way, and a
// road already there makes the way cheaper, so roads gather traffic and wear in, as trails do.
//   cost:      what a step through a biome costs (a road takes away up to `roadEase` of it)
//   slope:     extra cost per unit of steepness;  river: extra cost of fording a river
//   traffic:   how much a pair of towns wears into the road: √(pop·pop) / traffic
//   decay:     share of the wear that stays after `every` years when nobody walks there
//   levels:    wear from which a cell is a path, a road, a highway
export const ROADS = {
  every: 2, links: 3, reach: 70, roadEase: 0.75, slope: 6, river: 3, traffic: 900, decay: 0.8,
  cost: {meadow: 1, steppe: 1, savanna: 1.1, shrubland: 1.3, forest: 1.6, taiga: 1.8, jungle: 2.6, tundra: 1.6, desert: 2,
    foothills: 2.4, highlands: 4, swamp: 3.5, volcano: 4, ice: 8, water: 25},
  levels: [{wear: 0.25, label: 'тропа', width: 0.45}, {wear: 1.2, label: 'дорога', width: 0.7}, {wear: 4, label: 'тракт', width: 1}],
};
