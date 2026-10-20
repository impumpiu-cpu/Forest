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

// Who was attacking whom (a «maul» or «fight» task with a target) when the tick's first question was
// asked: target → the attackers in list order. Tasks change while the creatures step, so this one is
// a snapshot, and the question checks each attacker is still at it. An attack begun after the tick's
// first question is seen on the next tick — 50 ms of game time, the delay an attacker further down
// the list always had (it steps after its victim).
export function attackersOf(w, a) {
  const m = perTick(w, 'lk.attack', () => {
    const m = new Map();
    for (const o of w.agents) {
      const t = o.task;
      if (o.dead || !t?.target || (t.id !== 'maul' && t.id !== 'fight')) continue;
      let l = m.get(t.target); if (!l) m.set(t.target, l = []); l.push(o);
    }
    return m;
  });
  return m.get(a) || NONE;
}
const NONE = [];
