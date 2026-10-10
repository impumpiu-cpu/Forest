// Factions decide who is hostile to whom and which brain drives their members
// (unless the species brings its own, like wild animals).
import {Registry} from '../core/registry.js';

export const FACTIONS = new Registry('faction');

FACTIONS.registerAll([
  {id: 'colony',  label: 'колония',      brain: 'colonist', color: '#62c6b9', hostile: ['raiders']},
  {id: 'raiders', label: 'Серые волки',  brain: 'raider',   color: '#d9585e', hostile: ['colony']},
  {id: 'wild',    label: 'дикие звери',  brain: null,       color: '#cdbb9a', hostile: []},
]);

export function isHostile(a, b) {
  return FACTIONS.get(a.faction).hostile.includes(b.faction);
}
