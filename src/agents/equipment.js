// Inventory of humanoids: four slots, two-handed items, gear stats, wear and breakage,
// and the colonists' choice of what to wear from the colony's gear store (world.armory).
//
// An item instance is {type, dur, ammo?}. A two-handed item sits in both hand slots at once
// (the same object in `left` and `right`).
import {ITEMS, SLOTS, isWeapon} from '../data/items.js';
import {SPECIES} from '../data/species.js';
import {log} from '../core/log.js';
import {esc} from '../core/util.js';

export const def = inst => ITEMS.get(inst.type);
export const newItem = (type, extra = {}) => ({type, dur: ITEMS.get(type).dur, ...extra});
export const emptySlots = () => Object.fromEntries(SLOTS.map(s => [s.id, null]));

export function handItems(a) {
  const e = a.equip; if (!e) return [];
  return e.left && e.left === e.right ? [e.left] : [e.left, e.right].filter(Boolean);
}
export const allItems = a => (a.equip ? [...handItems(a), a.equip.body, a.equip.back].filter(Boolean) : []);

// does a ranged weapon in hand have what it needs to shoot?
export function rangedAmmo(a, d) {
  if (!d.ranged.ammo) return Infinity;
  const back = a.equip.back;
  return back && def(back).holds?.ammo === d.ranged.ammo ? back.ammo || 0 : 0;
}

// recompute cached stats after any change of equipment
export function recalcGear(a) {
  const sp = SPECIES.get(a.species), base = sp.attack || {power: 1, cooldown: 12};
  const g = {melee: {dmg: base.power, cd: base.cooldown, item: null}, ranged: null, rangedReady: false,
    block: 0, blockItem: null, armor: 0, warmth: 0, speed: 1, tool: {}, toolItem: {}, carry: 0};
  if (!a.equip) { a.gear = g; return g; }
  for (const it of handItems(a)) {
    const d = def(it);
    if (d.melee && d.melee.dmg > (g.melee.item ? def(g.melee.item).melee.dmg : 0)) g.melee = {dmg: d.melee.dmg, cd: d.melee.cd, item: it};
    if (d.ranged && (!g.ranged || d.ranged.dmg > g.ranged.dmg)) g.ranged = {...d.ranged, item: it};
    if ((d.block || 0) > g.block) { g.block = d.block; g.blockItem = it; }
    if (d.speed) g.speed *= d.speed;
  }
  if (g.ranged) g.rangedReady = rangedAmmo(a, def(g.ranged.item)) > 0;
  const body = a.equip.body;
  if (body) { const d = def(body); g.armor = d.armor || 0; g.warmth = d.warmth || 0; if (d.speed) g.speed *= d.speed; }
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
  inst.dur -= amount * (a.faction === 'colony' ? w.mods.mul.wear : 1);
  if (inst.dur > 0) return;
  removeEverywhere(a, inst);
  recalcGear(a);
  if (a.faction === 'colony') {
    w.stats.broken++; a.mem.broken += 0.4;
    log(w, `У <b>${esc(a.name)}</b> сломался предмет: ${def(inst).short}.`);
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

// give an agent a list of item types (raider kits, starting gear); returns what did not fit
export function dress(a, types, ammo = 0) {
  const spill = [];
  for (const t of types) {
    const inst = newItem(t), d = def(inst);
    if (d.holds) inst.ammo = ammo;
    if (d.slot === 'body') putOn(a, inst, 'body', spill);
    else if (d.slot === 'back') putOn(a, inst, 'back', spill);
    else if (d.hands === 2) putOn(a, inst, 'hands2', spill);
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

// ── choosing gear ────────────────────────────────────────────────────────────
// Value of an item for this colonist: fighting value grows with courage, tool value with how much
// the colonist likes the job it speeds up, a bow is worth more to someone who likes hunting.
function value(a, d, w) {
  const brave = 0.5 + 0.5 * a.mods.bravery;
  let v = 0;
  if (d.melee) v += (d.melee.dmg - 1) * 0.6 * brave + 0.15;
  if (d.ranged) {
    const boost = d.ranged.boost ? (w.mods.best[d.ranged.boost] || 1) : 1;
    v += d.ranged.dmg * boost * 0.55 * (a.prefs.hunt ?? 1) + 0.1;
    if (d.ranged.ammo && !(w.stock[d.ranged.ammo] >= 1) && !a.equip.back?.ammo) v *= 0.3;
  }
  if (d.block) v += d.block * 1.6 * brave;
  for (const [job, m] of Object.entries(d.tool || {})) v += (m - 1) * 1.4 * (a.prefs[job] ?? 1);
  if (d.speed && d.slot === 'hand') v += (d.speed - 1) * 2;
  return v;
}
function bodyValue(a, d) { return (d.armor || 0) * (0.6 + 0.4 * a.mods.bravery) * 2 + (d.warmth || 0) * 0.8 * a.mods.cold - (1 - (d.speed || 1)) * 2; }
function backValue(a, d, w, handsDefs) {
  if (d.holds) return handsDefs.some(h => h.ranged?.ammo === d.holds.ammo) ? 3 : 0;
  if (d.carry) return 0.25 + d.carry * 0.15 * Math.max(a.prefs.gather ?? 1, a.prefs.chop ?? 1);
  // a spare carried on the back: tools still help at work, weapons barely
  let v = 0; for (const [job, m] of Object.entries(d.tool || {})) v += (m - 1) * 1.3 * (a.prefs[job] ?? 1);
  return v + (isWeapon(d) ? 0.05 : 0);
}

// hands: the first item does the fighting; a second one-hander adds its block and tool value only
function handsValue(w, a, hands) {
  if (!hands.length) return 0;
  let v = value(a, def(hands[0]), w);
  if (hands[1] && hands[1] !== hands[0]) {
    const od = def(hands[1]);
    v += (od.block || 0) * 1.6 * (0.5 + 0.5 * a.mods.bravery) + 0.05 +
      Object.entries(od.tool || {}).reduce((t, [j, m]) => t + (m - 1) * 1.4 * (a.prefs[j] ?? 1), 0);
  }
  return v;
}

// best loadout from the agent's own gear plus the store; returns {hands, two, body, back, score}
function bestLoadout(w, a, pool) {
  const byType = new Map();   // keep one instance per type (the most durable) to keep the search small
  for (const it of pool) { const k = byType.get(it.type); if (!k || it.dur > k.dur) byType.set(it.type, it); }
  const items = [...byType.values()];
  const hand = items.filter(it => def(it).slot === 'hand');
  const opts = [{hands: []}];
  for (const it of hand) {
    if (def(it).hands === 2) { opts.push({hands: [it], two: true}); continue; }
    opts.push({hands: [it]});
    for (const o of hand) if (o !== it && def(o).hands === 1) opts.push({hands: [it, o]});
  }
  let best = null;
  for (const h of opts) {
    const hd = h.hands.map(def), rest = items.filter(it => !h.hands.includes(it));
    let body = null, bv = 0, back = null, kv = 0;
    for (const it of rest) { const d = def(it); if (d.slot === 'body') { const v = bodyValue(a, d); if (v > bv) { bv = v; body = it; } } }
    for (const it of rest) { if (def(it).slot === 'body') continue; const v = backValue(a, def(it), w, hd); if (v > kv) { kv = v; back = it; } }
    const score = handsValue(w, a, h.hands) + bv + kv;
    if (!best || score > best.score) best = {hands: h.hands, two: h.two, body, back, score};
  }
  return best;
}

function currentScore(w, a) {
  const hs = handItems(a), e = a.equip;
  let s = handsValue(w, a, e.right ? [e.right, e.left].filter(Boolean) : hs);
  if (e.body) s += bodyValue(a, def(e.body));
  if (e.back) s += backValue(a, def(e.back), w, hs.map(def));
  return s;
}

// called when a colonist is at the camp: swap gear with the store if it is clearly better,
// and top up the quiver from the stock
export function outfit(w, a) {
  if (!a.equip) return false;
  let changed = false;
  const own = allItems(a), pool = [...own, ...w.armory];
  const best = bestLoadout(w, a, pool);
  if (best && best.score > currentScore(w, a) + 0.12) {
    const keep = new Set([...best.hands, best.body, best.back].filter(Boolean));
    for (const it of own) if (!keep.has(it)) w.armory.push(it);
    for (const it of keep) { const k = w.armory.indexOf(it); if (k >= 0) w.armory.splice(k, 1); }
    a.equip = emptySlots();
    if (best.two) a.equip.left = a.equip.right = best.hands[0];
    else { a.equip.right = best.hands[0] || null; a.equip.left = best.hands[1] || null; }
    a.equip.body = best.body; a.equip.back = best.back;
    w.armoryVersion = (w.armoryVersion || 0) + 1;
    changed = true;
  }
  const back = a.equip.back;
  if (back && def(back).holds) {
    const {ammo, max} = def(back).holds, take = Math.min(max - (back.ammo || 0), Math.floor(w.stock[ammo] || 0));
    if (take > 0) { back.ammo = (back.ammo || 0) + take; w.stock[ammo] -= take; changed = true; }
  }
  recalcGear(a);
  return changed;
}

export function gearText(a) {
  if (!a.equip) return '';
  const hs = handItems(a).map(it => def(it).short);
  const parts = [hs.length ? hs.join(' + ') : 'безоружен'];
  if (a.equip.body) parts.push(def(a.equip.body).short);
  const b = a.equip.back;
  if (b) parts.push(def(b).holds ? `${def(b).short} ${b.ammo || 0}` : `за спиной ${def(b).short}`);
  return parts.join(' · ');
}
