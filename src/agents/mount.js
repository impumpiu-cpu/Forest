// A rider (data/roles.js `mount`, RIDE): one fighter of two bodies — the greenskins' warg-rider and spider-rider. The
// rider is the agent; its mount is a.mount = {species, hp, max}: it moves at the mount's pace, the mount bites at every
// blow of its rider, and a blow at the pair falls on the mount with RIDE.hitMount. The mount falls — the rider is thrown,
// lies stunned a moment and fights on foot; the rider falls — the mount is let loose as a war beast of the band.
import {SPECIES} from '../data/species.js';
import {RIDE} from '../data/roles.js';
import {createAgent} from './agent.js';
import {refreshBody} from './special.js';
import {joinSquad} from './squad.js';
import {log} from '../core/log.js';
import {esc, cap} from '../core/util.js';

export const mounted = a => !!a?.mount && a.mount.hp > 0;

// the rider gets its beast
export function mountUp(a, species) {
  const sp = SPECIES.get(species);
  a.mount = {species, hp: sp.hp, max: sp.hp};
}
// the pace of a rider: its mount's
export const mountSpeed = a => (mounted(a) ? SPECIES.get(a.mount.species).speed : null);

// the mount's bite at the rider's blow: [raw, type] or null
export function mountBite(a, riderCd) {
  if (!mounted(a)) return null;
  const at = SPECIES.get(a.mount.species).attack || {power: 1, cooldown: 12};
  return [at.power * (riderCd / (at.cooldown || 12)), at.type || 'pierce'];
}

// a blow at a rider: on the mount? → the damage the mount took, or null (the rider takes it)
export function blowOnMount(w, t, raw, type, melee, resistOf) {
  if (!mounted(t) || w.rngs.hits() >= RIDE.hitMount) return null;
  const dmg = raw * resistOf(SPECIES.get(t.mount.species), type, melee);
  t.mount.hp -= dmg; t.flash = 3;
  if (t.mount.hp <= 0) thrown(w, t);
  return dmg;
}

// the mount falls: the rider on foot, stunned for a moment
function thrown(w, a) {
  const sp = SPECIES.get(a.mount.species);
  a.mount = null;
  a.stunned = {until: w.tick + RIDE.fall};
  log(w, `Под <b>${esc(a.name)}</b> пал ${sp.label}: всадник бьётся пешим.`, 'danger');
}

// the rider falls: its mount fights on by itself, a war beast of the band (trained: data/conditions.js)
export function loose(w, a) {
  if (!mounted(a)) return null;
  const m = a.mount; a.mount = null;
  const b = createAgent(w, m.species, a.faction === 'colony' ? 'allies' : a.faction, a.x + RIDE.aside, a.y);
  b.marks = [...(b.marks || []), 'trained']; refreshBody(b);
  b.hp = Math.max(RIDE.least, m.hp); b.band = a.band; b.warBeast = true;
  if (a.faction === 'colony') { b.brain = 'summoned'; b.summoned = {by: a.id, last: w.tick}; }
  else { b.brain = 'raider'; joinSquad(w, a, b); }
  b.name = cap(SPECIES.get(m.species).label);
  return b;
}
