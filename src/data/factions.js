// Factions decide who is hostile to whom and which brain drives their members
// (unless the species brings its own, like wild animals).
import {Registry} from '../core/registry.js';

export const FACTIONS = new Registry('faction');

FACTIONS.registerAll([
  {id: 'colony',  label: 'колония',      brain: 'colonist', color: '#62c6b9', hostile: ['raiders', 'nechist']},
  {id: 'raiders', label: 'Серые волки',  brain: 'raider',   color: '#d9585e', hostile: ['colony', 'allies']},
  // the forest beasts an elf of the colony has called into a fight (agents/summon.js): the colony's foes are theirs
  {id: 'allies', label: 'союзные звери', brain: 'summoned', color: '#7cbf6a', hostile: ['raiders', 'nechist'], legend: 'призванные звери'},
  {id: 'wild',    label: 'дикие звери',  brain: null,       color: '#cdbb9a', hostile: []},
  // predators are not at war with anyone: they pick fights one victim at a time (see combat.js)
  {id: 'predators', label: 'хищники',     brain: null,       color: '#8d8f96', hostile: []},
  // the colony's tamed animals: they live in the pen, nobody is at war with them
  {id: 'herd', label: 'скот', brain: 'livestock', color: '#d6cdb6', hostile: [], legend: 'скот (приручённый)'},
  // those who gave up on the outpost and walk away
  // the rot's folk of wood and water (data/bestiary.js): they start no war, but colonists fight them on sight
  {id: 'nechist', label: 'нечисть', brain: null, color: '#7aa08a', hostile: [], legend: 'нечисть'},
  {id: 'leavers', label: 'ушедшие', brain: null, color: '#9a9a9a', hostile: []},
  // captives running away (settlement/escape.js): at war with nobody; the colony chases them as a yellow flag
  {id: 'fugitives', label: 'беглецы', brain: 'fugitive', color: '#c79a5a', hostile: [], legend: 'беглый пленный'},
  // a trader's caravan: at war with nobody, but its guards answer anyone who goes for it
  {id: 'traders', label: 'торговцы',      brain: 'trader',  color: '#e3c14a', hostile: [], legend: 'торговый караван'},
]);

export function isHostile(a, b) {
  return FACTIONS.get(a.faction).hostile.includes(b.faction);
}
