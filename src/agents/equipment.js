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
import {CAPS, COMBAT, DEFAULT_BLOW, DEFAULT_SCALE, SCALE_MODS, traitOf} from '../data/balance/combat.js';
import {QUALITY as QUALITY_PRICE, SERVICES} from '../data/balance/prices.js';
import {MARKS, MARK, markable} from '../data/balance/marks.js';
import {WOODS, mayUse, mayWield, useOf, KIND_LAND} from '../data/kinds.js';
import {MATERIALS} from '../data/balance/materials.js';
import {GEAR} from '../data/behaviour.js';
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
    if (inst.silver) { n.silver = true; n.label = `${d.label} (посеребрённый)`; n.short = `${d.short} сер.`; n.dur = d.dur * 0.8; }
    if (inst.name) { n.label = `${inst.name} (${n.label})`; n.short = inst.name; }
    named.set(key, n);
  }
  return n;
}
// a thrown weapon comes as a full bundle (quality `thrown`: its throws are its `ammo`)
export const throwsOf = d => traitOf(d.qualities, 'thrown');
// a burning thing to throw, in hand or behind the back (a torch: qualities `burn` and `thrown`, throws left) → {item, range}, or null
export function throwTorch(a) {
  for (const it of a.equip ? [...handItems(a), a.equip.back].filter(Boolean) : []) {
    const d = def(it);
    if (traitOf(d.qualities, 'burn') > 0 && throwsOf(d) && (it.ammo || 0) > 0 && d.ranged) return {item: it, range: d.ranged.range};
  }
  return null;
}
// one throw of it gone; the last throw takes the thing out of the hand
export function spendThrow(a, T) {
  T.item.ammo = (T.item.ammo || 0) - 1;
  if (T.item.ammo <= 0) { for (const s of SLOTS) if (a.equip[s.id] === T.item) a.equip[s.id] = null; }
  recalcGear(a);
}
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

// How much silver in the hand is worth: a lot while something that fears it is on the map, a little once
// the colony has met such a creature (w.chronicle.silverFoes, settlement/migration.js), nothing before
export const silverFoesHere = w => w.agents.some(o => !o.dead && o.faction !== 'colony' && SPECIES.get(o.species).weakTo?.includes('silver'));
const silverWorth = w => (!w ? 0 : silverFoesHere(w) ? GEAR.silverHere : w.chronicle?.silverFoes ? GEAR.silverMet : 0);
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
    if (d.melee && d.melee.dmg > (g.melee.item ? def(g.melee.item).melee.dmg : 0)) g.melee = {dmg: d.melee.dmg, cd: d.melee.cd, item: it, type: d.blow || DEFAULT_BLOW.melee, scale: d.scale || null, mix: d.melee.mix || null, ...(d.qualities ? {q: d.qualities} : {})};
    if (d.ranged && (!g.ranged || d.ranged.dmg > g.ranged.dmg)) g.ranged = {...d.ranged, item: it, ...(d.qualities ? {q: d.qualities} : {})};
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
  const brave = GEAR.brave[0] + GEAR.brave[1] * a.mods.bravery;
  let v = 0;
  // a blow as this colonist strikes it: the weapon's damage a tick (against a blow of 1 every 12 ticks) and the
  // letters it is struck with (an agile one is worth more with a dagger, a strong one with a maul)
  if (d.melee) v += (d.melee.dmg * GEAR.blowTicks / d.melee.cd * blowStat(a, d.scale) - 1) * GEAR.melee * brave + GEAR.meleeBase;
  if (d.silver && d.melee) v += silverWorth(w) * brave;
  if (d.ranged) {
    const boost = d.ranged.boost ? (w.mods.best[d.ranged.boost] || 1) : 1, throws = throwsOf(d);   // a bundle of throws, not a quiverful
    v += d.ranged.dmg * boost * GEAR.ranged * (a.prefs.hunt ?? 1) * (throws ? Math.min(1, throws / COMBAT.thrown.shots) : 1) + GEAR.rangedBase;
    if (d.ranged.ammo && !(w.stock[d.ranged.ammo] >= 1) && !a.equip.back?.ammo) v *= GEAR.noAmmo;
  }
  if (d.block) v += d.block * GEAR.block * brave;
  for (const [job, m] of Object.entries(d.tool || {})) v += (m - 1) * GEAR.tool * (a.prefs[job] ?? 1) * toolUse(a, job);
  if (d.speed && d.slot === 'hand') v += (d.speed - 1) * GEAR.handSpeed;
  return v;
}
// warm clothes count for more in the cold seasons (data/seasons.js `dress`)
function bodyValue(a, d, w) { return (d.armor || 0) * (GEAR.armorBrave[0] + GEAR.armorBrave[1] * a.mods.bravery) * GEAR.armor + (d.warmth || 0) * GEAR.warmth * a.mods.cold * (w ? season(w).dress ?? 1 : 1) - (1 - (d.speed || 1)) * GEAR.bodySpeed; }
function backValue(a, d, w, handsDefs) {
  if (d.holds) return handsDefs.some(h => h.ranged?.ammo === d.holds.ammo) ? GEAR.quiver : 0;
  if (d.carry) return GEAR.carryBase + d.carry * GEAR.carry * Math.max(a.prefs.gather ?? 1, a.prefs.chop ?? 1);
  // a spare carried on the back: tools still help at work, weapons barely
  let v = 0; for (const [job, m] of Object.entries(d.tool || {})) v += (m - 1) * GEAR.backTool * (a.prefs[job] ?? 1) * toolUse(a, job);
  return v + (isWeapon(d) ? GEAR.spareWeapon : 0);
}

// hands: the first item does the fighting; a second one-hander adds its block and tool value, and its blow if it is paired
function handsValue(w, a, hands) {
  if (!hands.length) return 0;
  let v = value(a, def(hands[0]), w);
  if (hands[1] && hands[1] !== hands[0]) {
    const od = def(hands[1]);
    // a weapon for the other hand (quality `paired`) adds its blow at its share
    const paired = od.melee && od.hands !== 2 ? traitOf(od.qualities, 'paired') : 0, cd = def(hands[0]).melee?.cd;
    if (paired && cd) v += od.melee.dmg * GEAR.blowTicks / cd * paired * blowStat(a, od.scale) * GEAR.melee * (GEAR.brave[0] + GEAR.brave[1] * a.mods.bravery);
    v += (od.block || 0) * GEAR.block * (GEAR.brave[0] + GEAR.brave[1] * a.mods.bravery) + GEAR.second +
      Object.entries(od.tool || {}).reduce((t, [j, m]) => t + (m - 1) * GEAR.tool * (a.prefs[j] ?? 1) * toolUse(a, j), 0);
  }
  return v;
}

// best loadout from the agent's own gear plus the store; returns {hands, two, body, back, score}
function bestLoadout(w, a, pool) {
  const byType = new Map();   // keep one instance per kind (type and quality, the most durable) to keep the search small
  for (const it of pool) { const key = it.type + ':' + (it.q || 0) + (it.silver ? ':s' : '') + (it.mark ? ':' + it.mark : '') + (it.of ? ':' + it.of + (it.master ? '!' : '') : ''), k = byType.get(key); if (!k || it.dur > k.dur) byType.set(key, it); }
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
  // what the race does not touch at all (data/kinds.js 'taboo') stays in the store
  const own = allItems(a), pool = (a.captive || a.former ? [...own, ...w.armory].filter(it => captiveItem(it) && !(night && def(it).slot === 'hand')) : [...own, ...w.armory]).filter(it => mayUse(a.species, memberOf(it)) && mayWield(a.species, def(it).form));
  const best = bestLoadout(w, a, pool);
  if (best && best.score > currentScore(w, a) + GEAR.swap) {
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
  // thrown weapons picked up again (or made good) at the camp: the bundle full
  for (const it of handItems(a)) { const n = throwsOf(def(it)); if (n && (it.ammo ?? 0) < n) { it.ammo = n; changed = true; } }
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
  const hs = handItems(a).map(it => def(it).short + (throwsOf(def(it)) ? ` ${it.ammo || 0}` : '') + (dirtyFor(a, it) ? ' (грязн.)' : ''));
  const parts = [hs.length ? hs.join(' + ') : 'безоружен'];
  if (a.equip.body) parts.push(def(a.equip.body).short);
  const b = a.equip.back;
  if (b) parts.push(def(b).holds ? `${def(b).short} ${b.ammo || 0}` : `за спиной ${def(b).short}`);
  return parts.join(' · ');
}
