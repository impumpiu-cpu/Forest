// What people share, whatever their role (docs/BEHAVIOUR.md): the bodies of those who are not the colony's — on a
// raid and on the road nobody's needs run down (they bring their own food and bedding), they only burn, rot in
// warmth or wither in daylight (the undead, data/monsters.js), and close their wounds in their own way. The colony's
// own body is agents/body.js stepBody; the role (agents/brains/index.js) says which body it has.
import {SPECIES} from '../data/species.js';
import {cellOf} from '../world/grid.js';
import {tempAt} from '../world/heat.js';
import {nightness} from '../core/time.js';
import {kill, maxHp} from './agent.js';
import {heatHarm} from './body.js';
import {RAID, CARAVAN} from '../data/behaviour.js';

// a raider's body: the dead burn twice as easily as the living; the rot and the sun; orcs and trolls regenerate. → T
export function raidBody(w, a) {
  const sp = SPECIES.get(a.species), T = tempAt(w, cellOf(w, a));
  let cause = null;
  if (heatHarm(a, sp, T, sp.undead ? 'undead' : 'raider', w)) cause = 'огня';
  if (sp.rots && T > RAID.rotsFrom) { a.hp -= sp.rots * (T - RAID.rotsFrom); cause ??= 'тепла'; }
  const day = 1 - nightness(w);
  if (sp.sun && day > RAID.sunHurts) { a.hp -= sp.sun * day; cause ??= 'солнца'; }
  if (a.hp <= 0) { kill(w, a, cause || 'ран'); return T; }   // one way to die: the common kill (agents/agent.js)
  if (a.mods.regen > 1 && T < RAID.regenCool && a.hp < maxHp(a)) a.hp = Math.min(maxHp(a), a.hp + RAID.regen * maxHp(a) * (a.mods.regen - 1));
  return T;
}

// a traveller's body: burns, mends a little
export function roadBody(w, a) {
  const sp = SPECIES.get(a.species), T = tempAt(w, cellOf(w, a));
  if (heatHarm(a, sp, T, 'caravan', w) && a.hp <= 0) { kill(w, a, 'огня'); return T; }
  if (a.hp < maxHp(a)) a.hp = Math.min(maxHp(a), a.hp + CARAVAN.mends);
  return T;
}
