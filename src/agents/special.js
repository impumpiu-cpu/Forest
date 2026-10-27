// A creature's own body and world view, rolled at birth (or arrival) inside its species' limits:
//   a.people  — sub-race id, when the species has peoples
//   a.special — {S, P, E, C, I, A, L}, each inside the (shifted) limits of the species
//   a.maxHp   — health from the species and Endurance
//   a.align   — {order, mercy} near the race's default; a.values — 2–3 values it holds dear
// The values work through agent.mods (data/special.js EFFECTS), so the rest of the game reads
// mods as before and never has to know about SPECIAL. refreshBody() rebuilds mods and health from all
// their sources at once; it is safe to call again whenever SPECIAL, traits or the creature's extras change.
import {STATS, EFFECTS, middle} from '../data/special.js';
import {alignNear, spreadOf} from '../data/values.js';
import {weighted} from '../core/util.js';
import {SPECIES} from '../data/species.js';
import {TRAITS, BASE_MODS} from '../data/traits.js';
import {CREATURE_MODS, ADD_MODS} from '../data/mods.js';
import {WOUNDS} from '../data/wounds.js';
import {exhaustionRow, taintRow, marksOf, effectsOf, CONDITIONS} from '../data/conditions.js';
import {illStage} from '../data/afflictions.js';

export const peopleOf = (sp, a) => (a.people && sp.peoples ? sp.peoples.find(p => p.id === a.people) : null);

// the limits after the people's shift
export function limits(sp, people) {
  const out = {};
  for (const id of STATS.ids()) {
    const [lo, hi] = sp.special?.[id] ?? [5, 5], s = people?.shift?.[id] || 0;
    out[id] = [Math.max(0, lo + s), Math.max(0, hi + s)];
  }
  return out;
}

// racial traits the creature carries (the species' and its people's)
export const innateOf = (sp, a) => [...(sp.innate || []), ...(peopleOf(sp, a)?.innate || [])];

// a label like «глубинный гном»
export const raceLabel = (sp, a) => peopleOf(sp, a)?.label || sp.label;

// keys that add up rather than multiply
// the keys that add rather than multiply (data/mods.js CREATURE_MODS `how`)
export const ADD = ADD_MODS;

function mod(m, k, v) { m[k] = ADD.has(k) ? (m[k] ?? 0) + v : (m[k] ?? 1) * v; }

// Rolls who the creature is: its people, SPECIAL inside the limits, world view and values. The body
// (mods, health) is not touched here: refreshBody() builds it from these and the other sources.
// opts.lean — stats (ids) the creature leans to: each is the better of two rolls, still inside the limits
// (the campaign's knights lean to the fighting ones, its squires to the others: data/campaign.js RETINUE.lean).
// Without it the draws are exactly as before.
export function rollCreature(w, a, sp, opts = {}) {
  if (!sp.special) return;
  const rng = w.rngs.birth;
  if (sp.peoples) a.people = weighted(rng, sp.peoples.map(p => [p, p.weight ?? 1])).id;
  const people = peopleOf(sp, a), lim = limits(sp, people);
  // the middle of the range is the most common; the ends are rare
  a.special = {};
  const lean = new Set(opts.lean || []), roll = (lo, hi) => Math.round(lo + (hi - lo) * (rng() + rng()) / 2);
  for (const [id, [lo, hi]] of Object.entries(lim)) a.special[id] = lean.has(id) ? Math.max(roll(lo, hi), roll(lo, hi)) : roll(lo, hi);
  // the world view: near the capital's point (opts.align) or, with no world behind, the race's (data/values.js)
  if (sp.align) { a.align = alignNear(opts.align || sp.align, spreadOf(sp, 'pawn'), rng); a.alignRoot = {...a.align}; }
  if (sp.values) {
    const pool = Object.entries(sp.values).filter(([, v]) => v > 0), want = rng() < 0.45 ? 3 : 2;
    a.values = [];
    while (a.values.length < want && pool.length) {
      const pick = weighted(rng, pool.map(e => [e, e[1]]));
      a.values.push(pick[0]); pool.splice(pool.indexOf(pick), 1);
    }
  }
}

// A boss of a calamity (atlas/calamity.js, data/calamities.js CAL.boss): an ordinary creature of its kind, rolled as
// any, then grown past its kind's limits — `add` on each of `stats` (at most `cap`). → {people, special, align, values}
export function bossSpecial(sp, rnd, B) {
  const a = {};
  rollCreature({rngs: {birth: rnd}}, a, sp);
  for (const id of B.stats) a.special[id] = Math.min(B.cap, a.special[id] + Math.round(B.add[0] + rnd() * (B.add[1] - B.add[0])));
  return a;
}

// SPECIAL → mods and health. A beast (`relativeStats`) is measured against the typical one of its kind.
function specialInto(m, a, sp) {
  // the marks shift its letters (a war beast's training: data/conditions.js); the creature's own roll is kept as it is
  const marks = marksOf(a);
  let s = a.special;
  if (marks.some(r => r.special)) { s = {...s}; for (const r of marks) for (const [k, v] of Object.entries(r.special || {})) if (k in s) s[k] += v; }
  const base = sp.relativeStats ? middle(sp.special) : null;
  const rel = (k) => (base ? EFFECTS[k](s) / EFFECTS[k](base) : EFFECTS[k](s));
  // every key of the body that a SPECIAL curve sets (data/mods.js `curve`): a multiplier is the curve, an addition
  // its difference from the typical one of the kind, no less than `floor`
  for (const M of CREATURE_MODS.all()) {
    if (!M.curve) continue;
    if (M.how !== 'add') { mod(m, M.id, rel(M.curve)); continue; }
    const v = EFFECTS[M.curve](s) - (base ? EFFECTS[M.curve](base) : 0);
    mod(m, M.id, M.floor != null ? Math.max(M.floor, v) : v);
  }
  return sp.hp * rel('hp');
}

// The body, rebuilt from its sources every time, never on top of the last result, so calling it twice
// changes nothing. Sources, in order:
//   species mods → SPECIAL → the people's mods → racial innate traits → character traits (a.traits)
//   → wounds and traumas (a.wounds, data/wounds.js)
//   → the creature's own extras (a.own: {mul: {k: ×}, add: {k: +}, set: {k: value}, hp: full health})
// Health keeps its share of the maximum: a wounded colonist stays as wounded after the rebuild.
// Called when the creature is made, and whenever one of the sources changes.
export function refreshBody(a) {
  const sp = SPECIES.get(a.species), m = {...BASE_MODS};
  for (const [k, v] of Object.entries(sp.mods || {})) m[k] *= v;
  let full = null;
  if (a.special && sp.special) {
    full = specialInto(m, a, sp);
    const people = peopleOf(sp, a);
    for (const [k, v] of Object.entries(people?.mods || {})) mod(m, k, v);
    for (const t of innateOf(sp, a)) for (const [k, v] of Object.entries(t.mods || {})) mod(m, k, v);
  }
  for (const id of a.traits || []) for (const [k, v] of Object.entries(TRAITS.get(id).mods)) mod(m, k, v);
  // wounds that heal and traumas for life (data/wounds.js)
  let hpMul = 1;
  for (const wd of a.wounds || []) { const W = WOUNDS.get(wd.id); for (const [k, v] of Object.entries(W.mods || {})) mod(m, k, v); hpMul *= W.hp ?? 1; }
  // the stage of exhaustion (data/conditions.js): its mods, if it has any
  const ex = exhaustionRow(a.exhaust || 0);
  if (ex) { for (const [k, v] of Object.entries(ex.mods || {})) mod(m, k, v); hpMul *= ex.hp ?? 1; }
  // an illness by its stage, withdrawal, the rot (data/afflictions.js, data/conditions.js)
  // … and the potions at work (a.effects: their time is kept by agents/potions.js stepPotionEffects)
  for (const row of [illStage(a), a.withdrawal ? CONDITIONS.get('withdrawal') : null, taintRow(a), ...marksOf(a), ...effectsOf(null, a)]) if (row) { for (const [k, v] of Object.entries(row.mods || {})) mod(m, k, v); hpMul *= row.hp ?? 1; }
  const own = a.own || {};
  for (const [k, v] of Object.entries(own.mul || {})) m[k] = (m[k] ?? 1) * v;
  for (const [k, v] of Object.entries(own.add || {})) m[k] = (m[k] ?? 0) + v;
  Object.assign(m, own.set || {});
  if (own.hp != null) full = own.hp;
  if (hpMul !== 1) full = (full ?? sp.hp) * hpMul;
  const was = a.maxHp || sp.hp, share = Number.isFinite(a.hp) ? a.hp / was : 1;
  a.mods = m;
  if (full != null) a.maxHp = full; else delete a.maxHp;
  a.hp = (a.maxHp || sp.hp) * Math.max(0, Math.min(1, share));
}

// A save from before refreshBody: its mods were stacked in place and some sources (the bravery roll,
// old formulas) are not kept. The difference between what was saved and what the sources give now is
// kept as the creature's own extra, so the rebuild reproduces the saved body; keys whose rule changed
// (RULE_KEYS) follow the new rule, so their old difference is dropped.
// keys whose formula changed since bodies were stacked in place: they follow the new rule, not the save
// (learn — data/skills.js; aim and dodge no longer read Luck)
const RULE_KEYS = new Set(['learn', 'aim', 'dodge']);
export const BODY_VER = 3;   // 3: `fin` (agility in a blow) joined the body

export function adoptBody(a) {
  if (!a.mods || a.bodyVer >= 1) return;
  const saved = a.mods, hp = a.hp, maxHp = a.maxHp;
  delete a.own;
  refreshBody(a);
  const mul = {}, add = {};
  for (const [k, v] of Object.entries(saved)) {
    if (RULE_KEYS.has(k) || !Number.isFinite(v)) continue;
    if (ADD.has(k)) { const d = v - (a.mods[k] ?? 0); if (Math.abs(d) > 1e-9) add[k] = d; }
    else { const now = a.mods[k] ?? 1; if (now !== 0 && Math.abs(v / now - 1) > 1e-9) mul[k] = v / now; }
  }
  a.own = {};
  if (Object.keys(mul).length) a.own.mul = mul;
  if (Object.keys(add).length) a.own.add = add;
  if (maxHp && Math.abs(maxHp - (a.maxHp || SPECIES.get(a.species).hp)) > 1e-9) a.own.hp = maxHp;
  a.hp = hp; if (maxHp) a.maxHp = maxHp;
  refreshBody(a);
  a.bodyVer = BODY_VER;
}
