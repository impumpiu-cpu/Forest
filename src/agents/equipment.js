// Inventory of humanoids: four slots, two-handed items, gear stats, wear and breakage. What an item is — its
// definition, its word and price — is agents/itemDefs.js; the colonists' choice of gear from the store is
// agents/outfit.js (both re-exported here for the many callers that import them from this file).
//
// An item instance is {type, dur, ammo?}. A two-handed item sits in both hand slots at once
// (the same object in `left` and `right`).
import {SLOTS} from '../data/items.js';
import {SPECIES} from '../data/species.js';
import {log} from '../core/log.js';
import {esc} from '../core/util.js';
import {think} from './mind.js';
import {DEFAULT_BLOW, DEFAULT_SCALE, SCALE_MODS, traitOf} from '../data/balance/combat.js';
import {dirtyFor, def, throwsOf, newItem, gearSpec} from './itemDefs.js';
export {itemDef, dirtyFor, mayTake, mixGain, def, newItem, gearToken, gearSpec, gearType, gearDef, gearValue, itemPrice} from './itemDefs.js';
export {captiveItem, outfit} from './outfit.js';

// a burning thing to throw, in hand or behind the back (a torch: qualities `burn` and `thrown`, throws left) → {item, range}, or null
export function throwTorch(a) {
  for (const it of a.equip ? [...handItems(a), a.equip.back].filter(Boolean) : []) {
    const d = def(it);
    if (traitOf(d.qualities, 'burn') > 0 && throwsOf(d) && (it.ammo || 0) > 0 && d.ranged) return {item: it, range: d.ranged.range};
  }
  return null;
}
// a torch carried, in hand or behind the back: its light (agents/combat.js darkness)
export const carriesTorch = a => !!a.equip && [...handItems(a), a.equip.back].some(it => it && traitOf(def(it).qualities, 'burn') > 0);
// one throw of it gone; the last throw takes the thing out of the hand
export function spendThrow(a, T) {
  T.item.ammo = (T.item.ammo || 0) - 1;
  if (T.item.ammo <= 0) { for (const s of SLOTS) if (a.equip[s.id] === T.item) a.equip[s.id] = null; }
  recalcGear(a);
}
export const emptySlots = () => Object.fromEntries(SLOTS.map(s => [s.id, null]));

export function handItems(a) {
  const e = a.equip; if (!e) return [];
  return e.left && e.left === e.right ? [e.left] : [e.left, e.right].filter(Boolean);
}
export const allItems = a => (a.equip ? [...handItems(a), a.equip.body, a.equip.back].filter(Boolean) : []);

// does a ranged weapon in hand have what it needs to shoot?
function rangedAmmo(a, d) {
  if (!d.ranged.ammo) return Infinity;
  const back = a.equip.back;
  return back && def(back).holds?.ammo === d.ranged.ammo ? back.ammo || 0 : 0;
}

// recompute cached stats after any change of equipment
export function recalcGear(a) {
  const sp = SPECIES.get(a.species), base = sp.attack || {power: 1, cooldown: 12};
  const g = {melee: {dmg: base.power, cd: base.cooldown, item: null, type: base.type || DEFAULT_BLOW.melee, scale: null}, ranged: null, rangedReady: false,
    block: 0, blockItem: null, blockVs: null, cover: 0, coverItem: null, coverVs: null, armor: 0, armorVs: null, warmth: 0, speed: 1, tool: {}, toolItem: {}, carry: 0};
  if (!a.equip) { a.gear = g; return g; }
  for (const it of handItems(a)) {
    const d = def(it);
    if (d.melee && d.melee.dmg > (g.melee.item ? def(g.melee.item).melee.dmg : 0)) g.melee = {dmg: d.melee.dmg, cd: d.melee.cd, item: it, type: d.blow || DEFAULT_BLOW.melee, scale: d.scale || null, mix: d.melee.mix || null, ...(d.qualities ? {q: d.qualities} : {})};
    if (d.ranged && d.ranged.dmg > 0 && (!g.ranged || d.ranged.dmg > g.ranged.dmg)) g.ranged = {...d.ranged, item: it, ...(d.qualities ? {q: d.qualities} : {})};   // (a torch, thrown at a wall, is no shot: throwTorch)
    if ((d.block || 0) > g.block) { g.block = d.block; g.blockItem = it; g.blockVs = d.vs || null; }
    // a shot is caught only by what covers (a shield), with `cover` of its block (forms.js)
    if ((d.block || 0) * (d.cover || 0) > g.cover) { g.cover = d.block * d.cover; g.coverItem = it; g.coverVs = d.vs || null; }
    if (d.speed) g.speed *= d.speed;
  }
  // the other hand: a one-handed weapon light enough for it (quality `paired`) strikes after the main one (agents/combat.js attack)
  for (const it of handItems(a)) {
    if (it === g.melee.item) continue;
    const d = def(it), share = traitOf(d.qualities, 'paired');
    if (!d.melee || d.hands === 2 || !share) continue;
    if (!g.offhand || d.melee.dmg * share > g.offhand.dmg * g.offhand.share) g.offhand = {dmg: d.melee.dmg, share, item: it, type: d.blow || DEFAULT_BLOW.melee, scale: d.scale || null, mix: d.melee.mix || null, ...(d.qualities ? {q: d.qualities} : {})};
  }
  // a parrying weapon in hand adds to the block against blows (data/balance/combat.js WEAPON_QUALITIES)
  const parry = handItems(a).reduce((s, it) => s + traitOf(def(it).qualities, 'parry'), 0);
  if (parry) g.parry = parry;
  // a thrown weapon is ready while throws are left in its bundle, a bow while arrows are in the quiver
  if (g.ranged) g.rangedReady = (throwsOf(def(g.ranged.item)) ? g.ranged.item.ammo || 0 : rangedAmmo(a, def(g.ranged.item))) > 0;
  const body = a.equip.body;
  if (body) { const d = def(body); g.armor = d.armor || 0; g.armorVs = d.vs || null; g.warmth = d.warmth || 0; if (d.speed) g.speed *= d.speed; }
  // tools work from the hands or from the back (the worker swaps them in)
  for (const it of [...handItems(a), a.equip.back].filter(Boolean)) {
    for (const [job, m] of Object.entries(def(it).tool || {})) if (m > (g.tool[job] || 1)) { g.tool[job] = m; g.toolItem[job] = it; }
  }
  if (a.equip.back) g.carry = def(a.equip.back).carry || 0;
  a.gear = g;
  return g;
}

function removeEverywhere(a, inst) {
  for (const s of SLOTS) if (a.equip[s.id] === inst) a.equip[s.id] = null;
}

// wear an item down; when it breaks it is gone for good
export function wear(w, a, inst, amount = 1) {
  if (!inst || !Number.isFinite(inst.dur)) return;
  inst.dur -= amount * (a.faction === 'colony' ? w.mods.mul.wear : 1) * (1 + traitOf(def(inst).qualities, 'unreliable'));
  if (inst.dur > 0) return;
  removeEverywhere(a, inst);
  recalcGear(a);
  if (a.faction === 'colony') {
    w.stats.broken++; a.mem.broken += 0.4;
    think(w, a, 'gearBroke', {item: def(inst).short});
    log(w, `У <b>${esc(a.name)}</b> сломался предмет: ${def(inst).short}.`, 'craft');
  }
}

// put an item on; whatever it displaces goes to `spill` (the gear store or the ground)
export function putOn(a, inst, slot, spill) {
  const d = def(inst);
  const drop = x => { if (x && !allItems(a).includes(x)) spill.push(x); };
  if (slot === 'hands2') {
    const old = handItems(a); a.equip.left = a.equip.right = inst; old.forEach(drop);
  } else if (slot === 'left' || slot === 'right') {
    const old = a.equip[slot];
    if (old && old === (slot === 'left' ? a.equip.right : a.equip.left)) { a.equip.left = a.equip.right = null; }   // breaking up a two-hander
    a.equip[slot] = inst; drop(old);
  } else {
    const old = a.equip[slot]; a.equip[slot] = inst; drop(old);
  }
  recalcGear(a);
  return d;
}

// give an agent a list of items (raider kits, starting gear, a guard's kit); each is a type id, a caravan's word
// ('ironsword+1@orc') or {type, q, mark}; returns what did not fit
export function dress(a, types, ammo = 0) {
  const spill = [];
  for (const t of types) {
    const spec = typeof t === 'string' ? gearSpec(t) : t;
    const inst = newItem(spec.type, {...(spec.q ? {q: spec.q} : {}), ...(spec.mark ? {mark: spec.mark} : {}), ...(spec.of ? {of: spec.of} : {}), ...(spec.master ? {master: true} : {}), ...(spec.silver ? {silver: true} : {})}), d = def(inst);
    if (d.holds) inst.ammo = ammo;
    if (d.slot === 'body') putOn(a, inst, 'body', spill);
    else if (d.slot === 'back') putOn(a, inst, 'back', spill);
    else if (d.hands === 2) putOn(a, inst, 'hands2', spill);
    // a torch (quality `burn`) with both hands taken goes behind the back, if the back is free: thrown from there
    else if (traitOf(d.qualities, 'burn') > 0 && a.equip.right && a.equip.left && !a.equip.back) putOn(a, inst, 'back', spill);
    else putOn(a, inst, a.equip.right ? 'left' : 'right', spill);
  }
  return spill;
}

// everything the agent wears goes to `target` (death, trophies)
export function stripAll(a, target) {
  for (const it of allItems(a)) target.push(it);
  if (a.equip) a.equip = emptySlots();
  recalcGear(a);
}
// how much of a blow the striker's letters give (data/balance/combat.js `scale`): Strength alone by default
export function blowStat(a, scale = DEFAULT_SCALE) {
  let rest = 1, v = 0;
  for (const [k, wt] of Object.entries(scale || DEFAULT_SCALE)) { rest -= wt; v += wt * (a.mods?.[SCALE_MODS[k]] ?? 1); }
  return rest + v;
}

export function gearText(a) {
  if (!a.equip) return '';
  const hs = handItems(a).map(it => def(it).short + (throwsOf(def(it)) ? ` ${it.ammo || 0}` : '') + (dirtyFor(a, it) ? ' (грязн.)' : ''));
  const parts = [hs.length ? hs.join(' + ') : 'безоружен'];
  if (a.equip.body) parts.push(def(a.equip.body).short);
  const b = a.equip.back;
  if (b) parts.push(def(b).holds ? `${def(b).short} ${b.ammo || 0}` : `за спиной ${def(b).short}`);
  return parts.join(' · ');
}
