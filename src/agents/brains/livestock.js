// Livestock brain: a tamed goat or mule (settlement/herd.js). It keeps to its pen: walks there when
// it is outside, grazes from spot to spot inside the fence, dozes at night. It shies from fire and
// from wolves; a mule kicks a wolf that comes at it. Without a pen it stays by the camp.
import {SPECIES} from '../../data/species.js';
import {nightness} from '../../core/time.js';
import {cellOf} from '../../world/grid.js';
import {approach, escapeHeat, nearFire, bolt, follow, recover, moveToward} from '../movement.js';
import {kill} from '../agent.js';
import {damage} from '../combat.js';
import {pens} from '../../settlement/herd.js';
import {BUILDINGS} from '../../data/buildings.js';
import {buildingById} from '../../settlement/query.js';

// the pen this animal belongs to: the one it had, or the first with room
function penOf(w, a) {
  let b = a.pen != null ? buildingById(w, a.pen) : null;
  if (b && b.done) return b;
  a.pen = null;
  const space = SPECIES.get(a.species).tame.space;
  for (const p of pens(w)) {
    const used = w.agents.filter(o => o.tame && !o.dead && o.pen === p.id).reduce((s, o) => s + SPECIES.get(o.species).tame.space, 0);
    if (used + space <= BUILDINGS.get(p.key).pen) { a.pen = p.id; return p; }
  }
  return null;
}

const inside = (b, a) => a.x >= b.x && a.y >= b.y && a.x < b.x + b.w && a.y < b.y + b.h;

export const livestockBrain = {
  id: 'livestock',
  step(w, a) {
    const sp = SPECIES.get(a.species), i = cellOf(w, a), T = w.grid.temp[i];
    if (T > sp.heatHarm) { a.hp -= Math.min(0.01, (T - sp.heatHarm) * 0.0001); if (a.hp <= 0) { kill(w, a, 'огня'); return; } }
    if (T > 45 || nearFire(w, a, 2)) { a.task = {id: 'bolt'}; escapeHeat(w, a, 1.3); return; }
    if (a.cd > 0) a.cd--;
    // a wolf right here: a mule turns and kicks, a goat runs
    const wolf = w.agents.find(o => o.species === 'wolf' && !o.dead && Math.hypot(o.x - a.x, o.y - a.y) < 3);
    if (wolf) {
      if (sp.mule && Math.hypot(wolf.x - a.x, wolf.y - a.y) < sp.mule.kickRange && a.cd <= 0) {
        a.cd = sp.attack.cooldown; a.flash = 4; damage(w, a, wolf, (0.1 + w.rng() * 0.12) * sp.attack.power);
      } else if (!sp.mule) { a.task = {id: 'bolt'}; bolt(w, a, [wolf], 1.3); return; }
    }
    recover(a);
    if (a.hp < sp.hp) a.hp = Math.min(sp.hp, a.hp + 0.0003 * sp.hp);
    const pen = penOf(w, a);
    if (!pen) {
      // no pen yet: stay by the camp
      a.task = {id: 'graze'};
      if (w.nav.get('camp')[i] > 5) follow(w, a, 'camp', 0.8);
      else if (w.rng() < 0.02) { const ang = w.rng() * 6.283; moveToward(w, a, w.camp.x + Math.cos(ang) * 4, w.camp.y + Math.sin(ang) * 4, 0.4); }
      return;
    }
    if (!inside(pen, a)) {
      a.task = {id: 'toPen'};
      if (approach(w, a, pen.x + pen.w / 2, pen.y + pen.h / 2, 0.9) === null) follow(w, a, 'camp', 0.9);
      return;
    }
    if (nightness(w.tick) > 0.7) { a.task = {id: 'rest'}; return; }
    const t = a.task?.id === 'penned' ? a.task : (a.task = {id: 'penned'});
    if (!t.spot || w.rng() < 0.008) t.spot = [pen.x + 0.3 + w.rng() * (pen.w - 0.6), pen.y + 0.3 + w.rng() * (pen.h - 0.6)];
    if (Math.hypot(t.spot[0] - a.x, t.spot[1] - a.y) > 0.2) moveToward(w, a, t.spot[0], t.spot[1], 0.3);
  },
};

// someone who left the outpost: walks off the map and is gone
export const leaverBrain = {
  id: 'leaver',
  step(w, a) { a.task = {id: 'leave'}; if (follow(w, a, 'edge') === 'arrived') a.gone = true; },
};
