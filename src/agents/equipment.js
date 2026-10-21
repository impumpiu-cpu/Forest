// Inventory of humanoids: four slots, two-handed items, gear stats, wear and breakage,
// and the colonists' choice of what to wear from the colony's gear store (world.armory).
//
// An item instance is {type, dur, ammo?}. A two-handed item sits in both hand slots at once
// (the same object in `left` and `right`).
import {jobAccess} from './skills.js';
import {CAPTIVE, ESCAPE} from '../data/captives.js';
import {hourOf} from '../core/time.js';
import {COUNCIL_TO} from '../settlement/council.js';
import {JOBS} from '../data/jobs.js';
import {ITEMS, SLOTS, isWeapon} from '../data/items.js';
import {SPECIES} from '../data/species.js';
import {log} from '../core/log.js';
import {esc} from '../core/util.js';
import {think} from './mind.js';
import {qualityOf} from '../data/quality.js';
import {season} from '../data/seasons.js';
import {CAPS, DEFAULT_BLOW, DEFAULT_SCALE, SCALE_MODS} from '../data/balance/combat.js';
import {QUALITY as QUALITY_PRICE, SERVICES} from '../data/balance/prices.js';

// The definition of an item instance. A finer piece ({type, q: 1…3}) gets a definition of its own,
// made once from the plain one and data/quality.js: stronger blows, better guard, faster work,
// longer life, a "+1" in its name. Everything else simply reads def(item) and needs no special case.
const finer = new Map();
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
// a named piece (an epic find) wears its own name over the plain one; a silvered blade
// (`silver: true`, settlement/crafting.js) is called so and bites what fears silver (combat.js)
const named = new Map();
export function def(inst) {
  const d = itemDef(inst.type, inst.q);
  if (!inst.name && !inst.silver) return d;
  const key = inst.type + ':' + inst.q + ':' + (inst.name || '') + ':' + (inst.silver ? 's' : '');
  let n = named.get(key);
  if (!n) {
    n = {...d};
    if (inst.silver) { n.silver = true; n.label = `${d.label} (посеребрённый)`; n.short = `${d.short} сер.`; n.dur = d.dur * 0.8; }
    if (inst.name) { n.label = `${inst.name} (${n.label})`; n.short = inst.name; }
    named.set(key, n);
  }
  return n;
}
export const newItem = (type, extra = {}) => ({type, ...extra, dur: def({type, ...extra}).dur});

// price of one piece in imperial gold: the plain piece plus the step up in quality
// a silvered iron blade costs this much more than a plain one
export const SILVERING = SERVICES.silvering;
export function itemPrice(type, q = 0, silver = false) {
  const base = ITEMS.get(type);
  const step = q ? QUALITY_PRICE[q][base.slot === 'body' || base.block ? 'armor' : 'weapon'] : 0;
  return (base.value || 0) + step + (silver && !base.silver ? SILVERING : 0);
}

// How much silver in the hand is worth: a lot while something that fears it is on the map, a little once
// the colony has met such a creature (w.chronicle.silverFoes, settlement/migration.js), nothing before
export const silverFoesHere = w => w.agents.some(o => !o.dead && o.faction !== 'colony' && SPECIES.get(o.species).weakTo?.includes('silver'));
const silverWorth = w => (!w ? 0 : silverFoesHere(w) ? 1.6 : w.chronicle?.silverFoes ? 0.35 : 0);
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
  const g = {melee: {dmg: base.power, cd: base.cooldown, item: null, type: base.type || DEFAULT_BLOW.melee, scale: null}, ranged: null, rangedReady: false,
    block: 0, blockItem: null, blockVs: null, cover: 0, coverItem: null, coverVs: null, armor: 0, armorVs: null, warmth: 0, speed: 1, tool: {}, toolItem: {}, carry: 0};
  if (!a.equip) { a.gear = g; return g; }
  for (const it of handItems(a)) {
    const d = def(it);
    if (d.melee && d.melee.dmg > (g.melee.item ? def(g.melee.item).melee.dmg : 0)) g.melee = {dmg: d.melee.dmg, cd: d.melee.cd, item: it, type: d.blow || DEFAULT_BLOW.melee, scale: d.scale || null};
    if (d.ranged && (!g.ranged || d.ranged.dmg > g.ranged.dmg)) g.ranged = {...d.ranged, item: it};
    if ((d.block || 0) > g.block) { g.block = d.block; g.blockItem = it; g.blockVs = d.vs || null; }
    // a shot is caught only by what covers (a shield), with `cover` of its block (forms.js)
    if ((d.block || 0) * (d.cover || 0) > g.cover) { g.cover = d.block * d.cover; g.coverItem = it; g.coverVs = d.vs || null; }
    if (d.speed) g.speed *= d.speed;
  }
  if (g.ranged) g.rangedReady = rangedAmmo(a, def(g.ranged.item)) > 0;
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
  inst.dur -= amount * (a.faction === 'colony' ? w.mods.mul.wear : 1);
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

// give an agent a list of items (raider kits, starting gear, a guard's kit); each is a type id or
// {type, q} for a finer piece; returns what did not fit
export function dress(a, types, ammo = 0) {
  const spill = [];
  for (const t of types) {
    const spec = typeof t === 'string' ? {type: t} : t;
    const inst = newItem(spec.type, spec.q ? {q: spec.q} : {}), d = def(inst);
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
// how much of a blow the striker's letters give (data/balance/combat.js `scale`): Strength alone by default
export function blowStat(a, scale = DEFAULT_SCALE) {
  let rest = 1, v = 0;
  for (const [k, wt] of Object.entries(scale || DEFAULT_SCALE)) { rest -= wt; v += wt * (a.mods?.[SCALE_MODS[k]] ?? 1); }
  return rest + v;
}
// a tool for a job this colonist may not do (agents/skills.js jobAccess) is worth nothing to them:
// a gold pan goes to someone who can pan
const toolUse = (a, job) => (JOBS.has(job) && !jobAccess(a, JOBS.get(job)).ok ? 0 : 1);
// Value of an item for this colonist: fighting value grows with courage, tool value with how much
// the colonist likes the job it speeds up, a bow is worth more to someone who likes hunting.
function value(a, d, w) {
  const brave = 0.5 + 0.5 * a.mods.bravery;
  let v = 0;
  // a blow as this colonist strikes it: the weapon's damage a tick (against a blow of 1 every 12 ticks) and the
  // letters it is struck with (an agile one is worth more with a dagger, a strong one with a maul)
  if (d.melee) v += (d.melee.dmg * 12 / d.melee.cd * blowStat(a, d.scale) - 1) * 0.6 * brave + 0.15;
  if (d.silver && d.melee) v += silverWorth(w) * brave;
  if (d.ranged) {
    const boost = d.ranged.boost ? (w.mods.best[d.ranged.boost] || 1) : 1;
    v += d.ranged.dmg * boost * 0.55 * (a.prefs.hunt ?? 1) + 0.1;
    if (d.ranged.ammo && !(w.stock[d.ranged.ammo] >= 1) && !a.equip.back?.ammo) v *= 0.3;
  }
  if (d.block) v += d.block * 1.6 * brave;
  for (const [job, m] of Object.entries(d.tool || {})) v += (m - 1) * 1.4 * (a.prefs[job] ?? 1) * toolUse(a, job);
  if (d.speed && d.slot === 'hand') v += (d.speed - 1) * 2;
  return v;
}
// warm clothes count for more in the cold seasons (data/seasons.js `dress`)
function bodyValue(a, d, w) { return (d.armor || 0) * (0.6 + 0.4 * a.mods.bravery) * 2 + (d.warmth || 0) * 0.8 * a.mods.cold * (w ? season(w).dress ?? 1 : 1) - (1 - (d.speed || 1)) * 2; }
function backValue(a, d, w, handsDefs) {
  if (d.holds) return handsDefs.some(h => h.ranged?.ammo === d.holds.ammo) ? 3 : 0;
  if (d.carry) return 0.25 + d.carry * 0.15 * Math.max(a.prefs.gather ?? 1, a.prefs.chop ?? 1);
  // a spare carried on the back: tools still help at work, weapons barely
  let v = 0; for (const [job, m] of Object.entries(d.tool || {})) v += (m - 1) * 1.3 * (a.prefs[job] ?? 1) * toolUse(a, job);
  return v + (isWeapon(d) ? 0.05 : 0);
}

// hands: the first item does the fighting; a second one-hander adds its block and tool value only
function handsValue(w, a, hands) {
  if (!hands.length) return 0;
  let v = value(a, def(hands[0]), w);
  if (hands[1] && hands[1] !== hands[0]) {
    const od = def(hands[1]);
    v += (od.block || 0) * 1.6 * (0.5 + 0.5 * a.mods.bravery) + 0.05 +
      Object.entries(od.tool || {}).reduce((t, [j, m]) => t + (m - 1) * 1.4 * (a.prefs[j] ?? 1) * toolUse(a, j), 0);
  }
  return v;
}

// best loadout from the agent's own gear plus the store; returns {hands, two, body, back, score}
function bestLoadout(w, a, pool) {
  const byType = new Map();   // keep one instance per kind (type and quality, the most durable) to keep the search small
  for (const it of pool) { const key = it.type + ':' + (it.q || 0) + (it.silver ? ':s' : ''), k = byType.get(key); if (!k || it.dur > k.dur) byType.set(key, it); }
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
    for (const it of rest) { const d = def(it); if (d.slot === 'body') { const v = bodyValue(a, d, w); if (v > bv) { bv = v; body = it; } } }
    for (const it of rest) { if (def(it).slot === 'body' || ((a.captive || a.former) && def(it).slot === 'hand')) continue; const v = backValue(a, def(it), w, hd); if (v > kv) { kv = v; back = it; } }   // a captive: one tool, none spare
    const score = handsValue(w, a, h.hands) + bv + kv;
    if (!best || score > best.score) best = {hands: h.hands, two: h.two, body, back, score};
  }
  return best;
}

function currentScore(w, a) {
  const hs = handItems(a), e = a.equip;
  let s = handsValue(w, a, e.right ? [e.right, e.left].filter(Boolean) : hs);
  if (e.body) s += bodyValue(a, def(e.body), w);
  if (e.back) s += backValue(a, def(e.back), w, hs.map(def));
  return s;
}

// what a captive may hold (settlement/captives.js): a tool (not a shield, not a bow, not a blade that is only a
// blade), clothes on the body (not armour), a basket on the back (not a quiver)
export function captiveItem(it) {
  const d = def(it);
  if (d.slot === 'body') return (d.armor || 0) <= CAPTIVE.armour;
  if (d.slot === 'back') return !d.holds;
  return !!d.tool && Object.keys(d.tool).length > 0 && !d.ranged && !(d.block > 0);
}

// called when a colonist is at the camp: swap gear with the store if it is clearly better,
// and top up the quiver from the stock
export function outfit(w, a) {
  if (!a.equip) return false;
  let changed = false;
  // a captive: a tool and clothes only, and no tool from the council till dawn (settlement/escape.js)
  const night = a.captive && (hourOf(w.tick) >= COUNCIL_TO || hourOf(w.tick) < ESCAPE.tools.dawn);
  // (a former slave: a tool and clothes too, day and night — settlement/freedom.js)
  const own = allItems(a), pool = a.captive || a.former ? [...own, ...w.armory].filter(it => captiveItem(it) && !(night && def(it).slot === 'hand')) : [...own, ...w.armory];
  const best = bestLoadout(w, a, pool);
  if (best && best.score > currentScore(w, a) + 0.12) {
    const keep = new Set([...best.hands, best.body, best.back].filter(Boolean));
    const gained = [...keep].filter(it => !own.includes(it)).map(it => def(it).short);
    if (gained.length) think(w, a, 'newGear', {items: gained.join(', ')});
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
