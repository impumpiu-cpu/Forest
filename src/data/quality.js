// Quality of made things: an ordinary piece is +0, finer work is +1, +2, +3 (the names are
// conventional, after the tabletop habit of "+1 sword"). Quality lives on the item instance
// ({type, dur, q}); the item's definition in data/items.js stays the plain version.
// The outpost itself only makes +0 things: +1 and +2 come with traders, +3 only from ruins (later),
// +4 — epic pieces — only from the bosses of the dungeons (later). An epic piece may carry a name
// of its own on the instance ({type, q: 4, name: 'Клык Вожака'}).
//
// What a level does (applied in agents/equipment.js):
//   hit:    melee and ranged damage ×(1 + hit)          guard: armour and shield block + guard
//   tool:   tool speed ×(1 + tool)                     dur:   durability ×(1 + dur)
//   warmth: clothing warmth + warmth
// Price on top of the plain piece (gold), after the 5th-edition habit: a magic weapon is
// "uncommon", magic armour one rarity higher, and every step up costs several times more.
//   addWeapon — weapons, tools and anything else;  addArmor — body armour and shields
//   sold:     whether a trader may carry it;  keep: the colony never sells it
//   rank:     the rarity word shown on the card;  cap: how far it may push armour and block
import {Registry} from '../core/registry.js';

export const QUALITY = new Registry('quality');

QUALITY.registerAll([
  {id: 'q0', q: 0, label: '',   rank: 'обычное',     hit: 0,    guard: 0,    tool: 0,    dur: 0,   warmth: 0,    addWeapon: 0,    addArmor: 0,    sold: true,  cap: 0},
  {id: 'q1', q: 1, label: '+1', rank: 'добротное',   hit: 0.15, guard: 0.05, tool: 0.15, dur: 0.5, warmth: 0.05, addWeapon: 10,   addArmor: 25,   sold: true,  cap: 0},
  {id: 'q2', q: 2, label: '+2', rank: 'мастерское',  hit: 0.3,  guard: 0.1,  tool: 0.3,  dur: 1,   warmth: 0.1,  addWeapon: 60,   addArmor: 150,  sold: true,  cap: 0},
  {id: 'q3', q: 3, label: '+3', rank: 'редкое',      hit: 0.45, guard: 0.15, tool: 0.45, dur: 1.5, warmth: 0.15, addWeapon: 400,  addArmor: 900,  sold: false, cap: 0.03},
  {id: 'q4', q: 4, label: '+4', rank: 'эпическое',   hit: 0.7,  guard: 0.22, tool: 0.7,  dur: 3,   warmth: 0.22, addWeapon: 3000, addArmor: 6000, sold: false, cap: 0.07, keep: true},
]);

export const qualityOf = q => QUALITY.get('q' + (q || 0));
export const MAX_Q = Math.max(...QUALITY.all().map(x => x.q));
