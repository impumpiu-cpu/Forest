// Indexes over w.agents, so that a brain asks «who has this id», «who is in this pack», «what can
// hunters go after» without walking every creature on the map. Walking the list for each creature
// every tick grows as the square of their number (tools/stress.mjs shows it).
//
// An index is built on the first question and lives while the list is the same: the same tick, the
// same w.agents array (sim.js replaces it when it sweeps out the dead) and the same length (createAgent
// pushes onto it). It is never saved (kept in w.scratch, see core/util.js perTick).
//
// Only what does not change once a creature is made goes into the key: its id, species, pack. What
// does change (dead, tame, the task) is checked at the question, the way the old scan checked it, so
// an index gives the same answer as the scan it replaces, in the same order.
import {perTick} from '../core/util.js';

function cached(w, key, build) {
  const ags = w.agents, box = perTick(w, key, () => ({}));
  if (box.src !== ags || box.n !== ags.length) { box.src = ags; box.n = ags.length; box.v = build(ags); }
  return box.v;
}

const group = (ags, keyOf) => {
  const m = new Map();
  for (const a of ags) { const k = keyOf(a); let l = m.get(k); if (!l) m.set(k, l = []); l.push(a); }
  return m;
};

// the creature with this id, dead or alive (as w.agents.find(o => o.id === id)), or null
export function agentById(w, id) {
  if (id == null) return null;
  return cached(w, 'lk.id', ags => { const m = new Map(); for (const a of ags) if (!m.has(a.id)) m.set(a.id, a); return m; }).get(id) || null;
}
// the living one with this id — what most brains mean by «byId»
export const liveById = (w, id) => { const a = agentById(w, id); return a && !a.dead ? a : null; };

// the living members of a pack, in list order (as w.agents.filter(o => !o.dead && o.pack === pack));
// creatures without a pack share the key `undefined`, exactly as the filter lumped them together
export function packMembers(w, pack) {
  const l = cached(w, 'lk.pack', ags => group(ags, a => a.pack)).get(pack);
  return l ? l.filter(o => !o.dead) : [];
}

// the creatures of any of these species, in list order; `keep` filters what may change (dead, tame)
export function ofSpeciesList(w, species, keep) {
  const key = species.length === 1 ? species[0] : species.join('|');
  const m = cached(w, 'lk.species', () => new Map());
  let l = m.get(key);
  if (!l) { const set = new Set(species); m.set(key, l = w.agents.filter(o => set.has(o.species))); }
  return keep ? l.filter(keep) : l.slice();
}

// Who is attacking whom: target → the creatures whose task is «maul» or «fight» against it. Tasks
// change while the creatures step, so the index is kept up to date instead of being a snapshot:
// sim.js notes each creature after its step (noteAttacker), and so do the two places where one
// creature sets another's attack (a pack joining its leader, a beast defending its meal); a fresh
// list (the sweep of the dead, a newcomer) rebuilds it from the tasks as they are. The question
// checks each candidate is still at it, and of several returns the first in w.agents, as the old
// walk over the whole list did — the answer is the same, tick for tick.
const ATTACK = new Set(['maul', 'fight']);
// a task that is an attack on someone: a beast's maul or a fighter's fight, with its target
export const isAttack = t => !!t?.target && ATTACK.has(t.id);
// is `o` of the side of `a`: its own faction, or the colony for the colony's allies (a called beast, a golem)
export const ours = (a, o) => o.faction === a.faction || (a.faction === 'allies' && o.faction === 'colony');
const attacks = w => cached(w, 'lk.attack', ags => {
  const by = new Map(), pos = new Map();
  ags.forEach((o, k) => {
    pos.set(o, k);
    const t = o.task;
    if (!o.dead && t?.target && ATTACK.has(t.id)) { let l = by.get(t.target); if (!l) by.set(t.target, l = []); l.push(o); }
  });
  return {by, pos};
});

export function noteAttacker(w, o) {
  const t = o.task;
  if (o.dead || !t?.target || !ATTACK.has(t.id)) return;
  const {by} = attacks(w);
  let l = by.get(t.target); if (!l) by.set(t.target, l = []);
  if (!l.includes(o)) l.push(o);
}

// the first creature in w.agents attacking `a` right now that passes `ok` (as w.agents.find would)
export function firstAttacker(w, a, ok) {
  const {by, pos} = attacks(w), l = by.get(a);
  if (!l) return null;
  let best = null, bk = Infinity;
  for (const o of l) {
    if (o.dead || o === a || o.task?.target !== a || !ATTACK.has(o.task.id) || (ok && !ok(o))) continue;
    const k = pos.get(o) ?? w.agents.indexOf(o);
    if (k < bk) { bk = k; best = o; }
  }
  return best;
}
