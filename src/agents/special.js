// A creature's own body and world view, rolled at birth (or arrival) inside its species' limits:
//   a.people  — sub-race id, when the species has peoples
//   a.special — {S, P, E, C, I, A, L}, each inside the (shifted) limits of the species
//   a.maxHp   — health from the species and Endurance
//   a.align   — {order, mercy} near the race's default; a.values — 2–3 values it holds dear
// The values work through agent.mods (data/special.js EFFECTS), so the rest of the game reads
// mods as before and never has to know about SPECIAL.
import {STATS, EFFECTS} from '../data/special.js';
import {AXIS_MAX} from '../data/values.js';
import {weighted, clamp} from '../core/util.js';

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

const ADD = new Set(['aim', 'dodge', 'bravery']);

function mod(a, k, v) { a.mods[k] = ADD.has(k) ? (a.mods[k] ?? 0) + v : (a.mods[k] ?? 1) * v; }

export function rollCreature(w, a, sp) {
  if (!sp.special) return;
  const rng = w.rng;
  if (sp.peoples) a.people = weighted(rng, sp.peoples.map(p => [p, p.weight ?? 1])).id;
  const people = peopleOf(sp, a), lim = limits(sp, people);
  // the middle of the range is the most common; the ends are rare
  a.special = {};
  for (const [id, [lo, hi]] of Object.entries(lim)) a.special[id] = Math.round(lo + (hi - lo) * (rng() + rng()) / 2);
  applySpecial(a, sp);
  for (const [k, v] of Object.entries(people?.mods || {})) mod(a, k, v);
  for (const t of innateOf(sp, a)) for (const [k, v] of Object.entries(t.mods || {})) mod(a, k, v);
  if (sp.align) {
    const s = sp.align.spread ?? 1, n = () => (rng() + rng() + rng() - 1.5) * s;
    a.align = {order: clamp(Math.round((sp.align.order + n()) * 2) / 2, -AXIS_MAX, AXIS_MAX), mercy: clamp(Math.round((sp.align.mercy + n()) * 2) / 2, -AXIS_MAX, AXIS_MAX)};
  }
  if (sp.values) {
    const pool = Object.entries(sp.values).filter(([, v]) => v > 0), want = rng() < 0.45 ? 3 : 2;
    a.values = [];
    while (a.values.length < want && pool.length) {
      const pick = weighted(rng, pool.map(e => [e, e[1]]));
      a.values.push(pick[0]); pool.splice(pool.indexOf(pick), 1);
    }
  }
}

// SPECIAL → mods and health
export function applySpecial(a, sp) {
  const s = a.special;
  a.maxHp = sp.hp * EFFECTS.hp(s);
  a.hp = a.maxHp;
  for (const k of ['str', 'speed', 'swing', 'learn', 'sight', 'cold']) mod(a, k, EFFECTS[k](s));
  mod(a, 'aim', EFFECTS.aim(s));
  mod(a, 'dodge', EFFECTS.dodge(s));
}
