// Furniture: what makes a solid building more than four walls. A piece is made at a workshop (or
// bought from a trader) and lies in the stock until it is put into a building; every building with
// `furnish: true` (data/buildings.js) takes up to FURNISH_MAX pieces. What the pieces add up to
// (their `comfort`) is the building's standing (settlement/life.js, statusOf):
//   a house — its sleepers wake in a better mood;  a workshop — work there goes faster;
//   the healer's hut — wounds close faster;  the shrine — prayer comforts more.
// Each entry becomes a stock resource (group 'Мебель') and, with `recipe`, a crafting recipe;
// `tradeOnly` pieces come only with traders (data/trade.js).
//   recipe: {at: station, cost, work, fuel?, heat?, needs?, tier?}
import {Registry} from '../core/registry.js';

export const FURNISH_MAX = 3;

export const FURNITURE = new Registry('furniture');

FURNITURE.registerAll([
  {id: 'bench',    label: 'лавка',             comfort: 0.04, color: '#b08850', recipe: {at: 'crafthut', cost: {wood: 4}, work: 400}},
  {id: 'table',    label: 'стол из тёса',      comfort: 0.06, color: '#c99a5c', recipe: {at: 'crafthut', tier: 2, cost: {planks: 4}, work: 600}},
  {id: 'rug',      label: 'шерстяной ковёр',   comfort: 0.08, color: '#b05a4a', recipe: {at: 'loom', tier: 2, cost: {wool: 4}, work: 700}},
  {id: 'chest',    label: 'кованый сундук',    comfort: 0.08, color: '#8a6a48', recipe: {at: 'forge', tier: 2, cost: {planks: 3, iron: 1}, fuel: 1, work: 600}},
  {id: 'bell',     label: 'бронзовый колокол', comfort: 0.12, color: '#c89048', recipe: {at: 'smelter', tier: 2, cost: {bronze: 3}, fuel: 1, heat: 1, work: 600}},
  {id: 'casket',   label: 'резной ларец',      comfort: 0.1,  color: '#58b3a8', recipe: {at: 'jeweler', tier: 2, cost: {wood: 2, bone: 2, gems: 1}, work: 700}},
  // from the empire's towns
  {id: 'mirror',   label: 'бронзовое зеркало', comfort: 0.14, color: '#d9b25a', tradeOnly: true},
  {id: 'tapestry', label: 'имперский гобелен', comfort: 0.13, color: '#7a4aa0', tradeOnly: true},
  {id: 'lamp',     label: 'медный светильник', comfort: 0.1,  color: '#d08a3a', tradeOnly: true},
]);
