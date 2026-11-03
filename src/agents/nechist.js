// What the nechist of wood and water shares (docs/BEHAVIOUR.md), as agents/hunting.js is for the pack: its home
// ground (deep wood, open grass, dry land right at the water), a home cell to come back to, whom it is angry with,
// who is spellbound and who is alone. The behaviours (agents/behaviours/: vanish, fightBack, lurk, lure, astray)
// read these; the species' numbers are its `spirit` block (data/bestiary.js), the common ones NECHIST (data/behaviour.js).
import {FAR} from '../nav/navigation.js';
import {TERRAIN} from '../data/terrain.js';
import {walkable, inBounds} from '../world/grid.js';
import {agentInZone} from '../settlement/zone.js';
import {liveById} from './lookup.js';
import {NECHIST} from '../data/behaviour.js';
import {dist, cap} from '../core/util.js';

export {dist} from '../core/util.js';   // (one for all: core/util.js)
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const code = id => TERRAIN.get(id).code;

// is cell i the spirit's home ground: deep wood, open grass, or dry land right at the water
export function isHome(w, i, home) {
  if (!walkable(w, i)) return false;
  if (home === 'forest') return w.grid.terr[i] === code('forest');
  if (home === 'grass') return w.grid.terr[i] === code('grass');
  if (home === 'shore') {
    const x = i % w.w, y = (i / w.w) | 0;
    return N4.some(([dx, dy]) => inBounds(w, x + dx, y + dy) && w.grid.terr[(y + dy) * w.w + x + dx] === code('water'));
  }
  return true;
}

// a home cell at least minDist from the camp (for a spirit that comes back); -1 if the land has none
export function homeCell(w, home, minDist) {
  for (let k = 0; k < NECHIST.homeTries; k++) {
    const i = (w.rngs.nechist() * w.w * w.h) | 0, x = i % w.w, y = (i / w.w) | 0;
    // on land the colony can reach: a rusalka on a lake nobody can walk to would sing in vain
    if (isHome(w, i, home) && w.nav.get('camp')[i] < FAR && Math.hypot(x - w.camp.x, y - w.camp.y) > minDist) return i;
  }
  return -1;
}

// whoever hurt it lately and is still close — but not one inside the settlement: the nechist keeps to its wood and water
export function foeOf(w, a) {
  const h = a.hurtBy;
  if (!h || w.tick - h.tick >= NECHIST.grudge) return null;
  const o = liveById(w, h.id);
  return o && dist(o, a) < NECHIST.giveUp && !agentInZone(w, o) ? o : null;
}

// is the spirit awake: by night only (`night`), or always
export const awake = (S, night) => !S.night || night > NECHIST.nightFrom;

export const lonely = (w, v, r) => !w.agents.some(o => o !== v && !o.dead && o.faction === 'colony' && dist(o, v) < r);   // scan: spirits only, one or two per map
export const spellbound = a => ['fight', 'flee', 'treat', 'astray', 'lured', 'runHome', 'muster'].includes(a.task?.id) || a.sleeping;
export const Label = sp => cap(sp.label);
