// What an item is: the definition of an item instance (a finer piece, a smith's mark, a kind of wood, a silvered or a
// named piece over the plain row of data/items.js), the caravan's words for its gear and their prices. Nothing here
// knows who carries the piece (that is agents/equipment.js) or who would choose it (agents/outfit.js).
//
// An item instance is {type, dur, ammo?}.
import {ITEMS} from '../data/items.js';
import {qualityOf} from '../data/quality.js';
import {CAPS, DEFAULT_BLOW, traitOf} from '../data/balance/combat.js';
import {QUALITY as QUALITY_PRICE, SERVICES} from '../data/balance/prices.js';
import {MARKS, MARK, markable} from '../data/balance/marks.js';
import {WOODS, mayUse, mayWield, useOf, KIND_LAND} from '../data/kinds.js';
import {MATERIALS} from '../data/balance/materials.js';
import {onEdit} from '../data/schema/layer.js';

// The definition of an item instance. A finer piece ({type, q: 1…3}) gets a definition of its own,
// made once from the plain one and data/quality.js: stronger blows, better guard, faster work,
// longer life, a "+1" in its name. Everything else simply reads def(item) and needs no special case.
const finer = new Map();
// an edit of the tables (forms, materials, qualities…) makes the finer and named copies again
onEdit(() => { finer.clear(); named.clear(); });
export function itemDef(type, q = 0) {
  const base = ITEMS.get(type);
  if (!q || base.quality === false) return base;
  const key = type + ':' + q;
  let d = finer.get(key);
  if (!d) {
    const Q = qualityOf(q);
    d = {...base, q, base,
      label: `${base.label} ${Q.label}`, short: `${base.short} ${Q.label}`,
      dur: base.dur * (1 + Q.dur)};
    if (base.melee) d.melee = {...base.melee, dmg: base.melee.dmg * (1 + Q.hit)};
    if (base.ranged) d.ranged = {...base.ranged, dmg: base.ranged.dmg * (1 + Q.hit)};
    if (base.block) d.block = Math.min(CAPS.block + Q.cap, base.block + Q.guard);
    if (base.armor) d.armor = Math.min(CAPS.armor + Q.cap, base.armor + Q.guard);
    if (base.warmth) d.warmth = Math.min(CAPS.warmth + Q.cap, base.warmth + Q.warmth);
    d.rank = Q.rank; d.keep = !!Q.keep;
    if (base.tool) d.tool = Object.fromEntries(Object.entries(base.tool).map(([j, m]) => [j, 1 + (m - 1) * (1 + Q.tool) + Q.tool * 0.5]));
    finer.set(key, d);
  }
  return d;
}
// a smith's mark (data/balance/marks.js): its kind of blow strikes and guards better; a piece of another kind
// takes a share of the mark's kind into its blow (`mix`: [[kind, weight], …], read by combat.js damage)
function markedDef(d, M) {
  const n = {...d, mark: M.id, label: `${d.label} ${M.label}`, short: `${d.short} (${M.short})`};
  const mix = (own, dmg) => (own === M.blow ? {dmg: dmg * (1 + MARK.hit)} : {mix: [[own, 1 - MARK.share], [M.blow, MARK.share * (1 + MARK.hit)]]});
  if (d.melee) n.melee = {...d.melee, ...mix(d.blow || DEFAULT_BLOW.melee, d.melee.dmg)};
  if (d.ranged) n.ranged = {...d.ranged, ...mix(d.ranged.type || DEFAULT_BLOW.ranged, d.ranged.dmg)};
  if (d.armor || d.block) n.vs = {...(d.vs || {}), [M.blow]: (d.vs?.[M.blow] ?? 1) * (1 + MARK.guard)};
  return n;
}
// a wooden piece of a kind of wood (data/kinds.js WOODS; `inst.of`): its blow, its shot, its tool and its life by that
// wood; a special wood (the sacred tree) gives its own numbers only to a piece its master made (`inst.master`), to any
// other it is a fine plain wood
function woodenDef(d, inst) {
  const T0 = WOODS.get(inst.of), T = T0.special && !inst.master ? WOODS.get(T0.plain) : T0;
  const n = {...d, of: inst.of, label: `${d.label} (${T0.label}${inst.master && T0.special ? ', работа мастера' : ''})`, short: `${d.short} (${T0.label.split(' ')[0].slice(0, 5)}.)`};
  if (d.melee) n.melee = {...d.melee, dmg: d.melee.dmg * T.dmg};
  if (d.ranged) n.ranged = {...d.ranged, dmg: d.ranged.dmg * T.dmg};
  if (d.block) n.block = Math.min(CAPS.block, d.block * Math.sqrt(T.dur));
  if (d.tool) n.tool = Object.fromEntries(Object.entries(d.tool).map(([j, m]) => [j, 1 + (m - 1) * T.dmg]));
  if (Number.isFinite(d.dur)) n.dur = d.dur * T.dur;
  return n;
}
const isWooden = d => !!MATERIALS[d.material]?.class.includes('wood');
// what a piece is made of, as the races' rules know it (data/kinds.js): its wood, or its metal's resource
// (a wooden piece whose wood nobody wrote down — the first kit, a trader's — counts as the commonest wood, data/kinds.js KIND_LAND)
export const memberOf = inst => { const d = ITEMS.has(inst.type) ? ITEMS.get(inst.type) : null; return inst.of || (d && isWooden(d) ? KIND_LAND.wood : d ? MATERIALS[d.material]?.resource : null) || null; };
// a piece «dirty» to its bearer: of a material its race does not get or make (data/kinds.js 'nomake') — it was made by others
export const dirtyFor = (a, inst) => useOf(a.species, memberOf(inst)) === 'nomake';
// may one of this race carry a piece (a gear word, data/kinds.js): not of a material it will not touch, not a form it will
// not take in hand — the elves and iron, the elves and the crossbow (the campaign's buying, spoils and finds ask this)
export function mayTake(species, token) {
  const s = gearSpec(token); if (!ITEMS.has(s.type)) return true;
  return mayUse(species, memberOf({type: s.type, of: s.of})) && mayWield(species, ITEMS.get(s.type).form);
}

// how much a mixed blow is worth on average against nothing (the strength rating: agents/strength.js)
export const mixGain = attack => (attack?.mix ? attack.mix.reduce((s, [, k]) => s + k, 0) : 1);

// a named piece (an epic find) wears its own name over the plain one; a silvered blade
// (`silver: true`, settlement/crafting.js) is called so and bites what fears silver (combat.js);
// a marked one (`mark`) is of a people's smiths
const named = new Map();
export function def(inst) {
  const d = itemDef(inst.type, inst.q);
  const M = inst.mark && MARKS[inst.mark] && markable(d) ? MARKS[inst.mark] : null;
  const wood = inst.of && WOODS.has(inst.of) && isWooden(d);
  if (!inst.name && !inst.silver && !M && !wood) return d;
  const key = inst.type + ':' + inst.q + ':' + (inst.name || '') + ':' + (inst.silver ? 's' : '') + ':' + (M ? M.id : '') + ':' + (wood ? inst.of + (inst.master ? '!' : '') : '');
  let n = named.get(key);
  if (!n) {
    const base = wood ? woodenDef(d, inst) : d;
    n = M ? markedDef(base, M) : {...base};
    // the sacred tree in its master's work bites what fears silver (data/kinds.js `silver`)
    if (wood && WOODS.get(inst.of).silver && (!WOODS.get(inst.of).special || inst.master) && (base.melee || base.ranged)) n.silver = true;
    if (inst.silver) { n.silver = true; n.label = `${d.label} (посеребрённый)`; n.short = `${d.short} сер.`; n.dur = d.dur * 0.8; }
    if (inst.name) { n.label = `${inst.name} (${n.label})`; n.short = inst.name; }
    named.set(key, n);
  }
  return n;
}
// a thrown weapon comes as a full bundle (quality `thrown`: its throws are its `ammo`)
export const throwsOf = d => traitOf(d.qualities, 'thrown');
export const newItem = (type, extra = {}) => { const d = def({type, ...extra}), n = throwsOf(d); return {type, ...(n ? {ammo: n} : {}), ...extra, dur: d.dur}; };

// The caravan keeps its gear as words, not objects (campaign/): a piece is 'ironsword', a finer or marked one
// 'ironsword+1@orc' (+ its quality, @ its mark), a wooden one 'bow~holywood!' (~ its wood, ! made by its master).
// These turn a word into the piece and back.
// (`$` at the end: silvered)
export const gearToken = inst => inst.type + (inst.of ? `~${inst.of}${inst.master ? '!' : ''}` : '') + (inst.q ? `+${inst.q}` : '') + (inst.mark ? `@${inst.mark}` : '') + (inst.silver ? '$' : '');
export function gearSpec(token) {
  const m = /^([^+@~$]+)(?:~(\w+)(!)?)?(?:\+(\d+))?(?:@(\w+))?(\$)?$/.exec(token || '');
  if (!m) return {type: token};
  return {type: m[1], ...(m[2] ? {of: m[2]} : {}), ...(m[3] ? {master: true} : {}), ...(m[4] ? {q: +m[4]} : {}), ...(m[5] ? {mark: m[5]} : {}), ...(m[6] ? {silver: true} : {})};
}
export const gearType = token => (token || '').split(/[+@~$]/)[0];
// the definition behind a word of the caravan's gear (null: not an item — a word nobody knows)
export const gearDef = token => { const s = gearSpec(token); return ITEMS.has(s.type) ? def(s) : null; };
// its price, with its quality and mark
export const gearValue = token => { const s = gearSpec(token); return ITEMS.has(s.type) ? itemPrice(s.type, s.q || 0, !!s.silver, s.mark || null, s.of || null, !!s.master) : 0; };

// price of one piece in imperial gold: the plain piece plus the step up in quality
// (a wooden piece of a wood of its own, data/kinds.js WOODS `price`: a special wood only in a master's work, else plain)
export function itemPrice(type, q = 0, silver = false, mark = null, of = null, master = false) {
  const base = ITEMS.get(type);
  const step = q ? QUALITY_PRICE[q][base.slot === 'body' || base.block ? 'armor' : 'weapon'] : 0;
  const markMul = mark && MARKS[mark] && markable(base) ? MARK.price : 1;
  const W = of && WOODS.has(of) && isWooden(base) ? WOODS.get(of) : null, woodMul = W ? (W.special && !master ? WOODS.get(W.plain).price : W.price) : 1;
  return Math.round(((base.value || 0) + step) * markMul * woodMul) + (silver && !base.silver ? SERVICES.silvering : 0);
}
