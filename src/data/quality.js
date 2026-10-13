// Quality of made things: an ordinary piece is +0, finer work is +1, +2, +3 (the names are
// conventional, after the tabletop habit of "+1 sword"). Quality lives on the item instance
// ({type, dur, q}); the item's definition in data/items.js stays the plain version.
// The outpost itself only makes +0 things: +1 and +2 come with traders, +3 only from ruins (later).
//
// What a level does (applied in agents/equipment.js):
//   hit:    melee and ranged damage ×(1 + hit)          guard: armour and shield block + guard
//   tool:   tool speed ×(1 + tool)                     dur:   durability ×(1 + dur)
//   warmth: clothing warmth + warmth
// Price on top of the plain piece (gold), after the 5th-edition habit: a magic weapon is
// "uncommon", magic armour one rarity higher, and every step up costs several times more.
//   addWeapon — weapons, tools and anything else;  addArmor — body armour and shields
//   sold:     whether a trader may carry it
import {Registry} from '../core/registry.js';

export const QUALITY = new Registry('quality');

QUALITY.registerAll([
  {id: 'q0', q: 0, label: '',   hit: 0,    guard: 0,    tool: 0,    dur: 0,   warmth: 0,    addWeapon: 0,   addArmor: 0,    sold: true},
  {id: 'q1', q: 1, label: '+1', hit: 0.15, guard: 0.05, tool: 0.15, dur: 0.5, warmth: 0.05, addWeapon: 10,  addArmor: 25,   sold: true},
  {id: 'q2', q: 2, label: '+2', hit: 0.3,  guard: 0.1,  tool: 0.3,  dur: 1,   warmth: 0.1,  addWeapon: 60,  addArmor: 150,  sold: true},
  {id: 'q3', q: 3, label: '+3', hit: 0.45, guard: 0.15, tool: 0.45, dur: 1.5, warmth: 0.15, addWeapon: 400, addArmor: 900, sold: false},
]);

export const qualityOf = q => QUALITY.get('q' + (q || 0));
export const MAX_Q = Math.max(...QUALITY.all().map(x => x.q));
