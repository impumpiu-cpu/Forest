// The colonists' choice of what to wear from the colony's gear store (world.armory): the worth of a piece to this
// colonist, the best loadout, the swap at the camp (weights: data/behaviour.js GEAR).
import {roleRow} from '../data/roles.js';
import {jobAccess} from './skills.js';
import {CAPTIVE, ESCAPE} from '../data/captives.js';
import {hourOf} from '../core/time.js';
import {COUNCIL_TO} from '../settlement/council.js';
import {JOBS} from '../data/jobs.js';
import {isWeapon} from '../data/items.js';
import {SPECIES, fearsSilver} from '../data/species.js';
import {think} from './mind.js';
import {season} from '../data/seasons.js';
import {COMBAT, traitOf} from '../data/balance/combat.js';
import {mayUse, mayWield} from '../data/kinds.js';
import {GEAR} from '../data/behaviour.js';
import {def, throwsOf, memberOf} from './itemDefs.js';
import {emptySlots, handItems, allItems, recalcGear, blowStat} from './equipment.js';

// How much silver in the hand is worth: a lot while something that fears it is on the map, a little once
// the colony has met such a creature (w.chronicle.silverFoes, settlement/migration.js), nothing before
const silverFoesHere = w => w.agents.some(o => !o.dead && o.faction !== 'colony' && fearsSilver(SPECIES.get(o.species)));
// (worked out once per outfit() — the search weighs many loadouts, and nothing on the map changes meanwhile)
let silverNow = null, inOutfit = false;
const silverOf = w => (!w ? 0 : silverFoesHere(w) ? GEAR.silverHere : w.chronicle?.silverFoes ? GEAR.silverMet : 0);
const silverWorth = w => (!inOutfit ? silverOf(w) : (silverNow ??= silverOf(w)));

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
  if (d.ranged?.dmg > 0) {   // (a torch is thrown at a wall, not shot: no worth as a shot)
    const boost = d.ranged.boost ? (w.mods.best[d.ranged.boost] || 1) : 1, throws = throwsOf(d);   // a bundle of throws, not a quiverful
    v += d.ranged.dmg * boost * GEAR.ranged * (a.prefs.hunt ?? 1) * (throws ? Math.min(1, throws / COMBAT.thrown.shots) : 1) + GEAR.rangedBase;
    if (d.ranged.ammo && !(w.stock[d.ranged.ammo] >= 1) && !a.equip.back?.ammo) v *= GEAR.noAmmo;
  }
  if (d.block) v += d.block * GEAR.block * brave;
  const R = roleRow({fightRole: a.fightPref || a.fightRole});   // its role's act asks this in hand (the forge-master's coal)
  if (R?.perks?.some(g => g.hold && g.hold === d.form)) v += GEAR.act;
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
  const night = a.captive && (hourOf(w.tick, w) >= COUNCIL_TO || hourOf(w.tick, w) < ESCAPE.tools.dawn);
  // (a former slave: a tool and clothes too, day and night — settlement/freedom.js)
  // what the race does not touch at all (data/kinds.js 'taboo') stays in the store
  const own = allItems(a), pool = (a.captive || a.former ? [...own, ...w.armory].filter(it => captiveItem(it) && !(night && def(it).slot === 'hand')) : [...own, ...w.armory]).filter(it => mayUse(a.species, memberOf(it)) && mayWield(a.species, def(it).form));
  let best, now;
  inOutfit = true; silverNow = null;
  try { best = bestLoadout(w, a, pool); now = currentScore(w, a); } finally { inOutfit = false; silverNow = null; }
  if (best && best.score > now + GEAR.swap) {
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
