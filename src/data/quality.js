// Quality of made things: an ordinary piece is +0, finer work is +1, +2, +3 (the names are
// conventional, after the tabletop habit of "+1 sword"). Quality lives on the item instance
// ({type, dur, q}); the item's definition in data/items.js stays the plain version.
// Quality and origin are kept apart. Quality is how fine the piece is; origin is where it came from:
// the instance may name its maker ({maker: 'Торгрим'}) or carry a name of its own, as an epic find from
// a dungeon's boss will ({type, q: 4, name: 'Клык Вожака'}). Traders bring +1 and +2.
//
// The colony's own craftsmen may make any quality. When an item is finished one random number decides
// it (qualityRoll): the chance of each level is craftBase + craftSkill × the master's skill in the
// recipe's skill (0–1), counted from the top down. Skill raises every chance a few times over and never
// makes a fine piece a matter of course; +4 stays below a thousandth of a percent even for a master
// (0.0008% at skill 100). Bellows at the forge add their own small chance of +1.
//
// What a level does (applied in agents/equipment.js):
//   hit:    melee and ranged damage ×(1 + hit)          guard: armour and shield block + guard
//   tool:   tool speed ×(1 + tool)                     dur:   durability ×(1 + dur)
//   warmth: clothing warmth + warmth
// The price on top of the plain piece lives in data/balance/prices.js (QUALITY), after the 5th-edition
// habit: a magic weapon is "uncommon", magic armour one rarity higher, every step up several times dearer.
//   sold:     whether a trader may carry it;  keep: the colony never sells it
//   rank:     the rarity word shown on the card;  cap: how far it may push armour and block
import {Registry} from '../core/registry.js';

export const QUALITY = new Registry('quality');

QUALITY.registerAll([
  {id: 'q0', q: 0, label: '',   rank: 'обычное',     hit: 0,    guard: 0,    tool: 0,    dur: 0,   warmth: 0,    sold: true,  cap: 0,    craftBase: 1,        craftSkill: 0},
  {id: 'q1', q: 1, label: '+1', rank: 'добротное',   hit: 0.15, guard: 0.05, tool: 0.15, dur: 0.5, warmth: 0.05, sold: true,  cap: 0,    craftBase: 0.03,     craftSkill: 0.17},
  {id: 'q2', q: 2, label: '+2', rank: 'мастерское',  hit: 0.3,  guard: 0.1,  tool: 0.3,  dur: 1,   warmth: 0.1,  sold: true,  cap: 0,    craftBase: 0.003,    craftSkill: 0.03},
  {id: 'q3', q: 3, label: '+3', rank: 'редкое',      hit: 0.45, guard: 0.15, tool: 0.45, dur: 1.5, warmth: 0.15, sold: false, cap: 0.03, craftBase: 0.0002,   craftSkill: 0.002},
  {id: 'q4', q: 4, label: '+4', rank: 'эпическое',   hit: 0.7,  guard: 0.22, tool: 0.7,  dur: 3,   warmth: 0.22, sold: false, cap: 0.07, keep: true, craftBase: 0.000002, craftSkill: 0.000006},
]);

// the chance that a piece made by a master of this skill (0–1) comes out at least this fine
export const craftChance = (q, skill, extra = 0) => { const Q = qualityOf(q); return Math.min(1, Q.craftBase + Q.craftSkill * skill + (q === 1 ? extra : 0)); };

// One random number u in [0, 1) → the quality of a finished piece; levels are tried from the top down.
// `extra`: a bonus to +1 only (bellows at the forge).
export function qualityRoll(u, skill, extra = 0) {
  for (let q = MAX_Q; q >= 1; q--) if (u < craftChance(q, skill, extra)) return q;
  return 0;
}

export const qualityOf = q => QUALITY.get('q' + (q || 0));
export const MAX_Q = Math.max(...QUALITY.all().map(x => x.q));
