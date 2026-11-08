// Penned: a tamed goat or mule (settlement/herd.js) keeps to its pen — walks there when it is outside (`to` mode),
// grazes from spot to spot inside the fence; without a pen it stays by the camp (`camp` mode) — at the caravan's camp, at
// the tether once it is set (campaign/works.js). Its wounds close in the pen. Reads: nothing of its own (a.pen, the pens of settlement/herd.js).
import {SPECIES} from '../../data/species.js';
import {cellOf} from '../../world/grid.js';
import {approach, follow, moveToward, recover} from '../movement.js';
import {maxHp} from '../agent.js';
import {pens} from '../../settlement/herd.js';
import {BUILDINGS} from '../../data/buildings.js';
import {buildingById} from '../../settlement/query.js';
import {PEN} from '../../data/behaviour.js';
import {CAMP_WORKS} from '../../data/camp.js';
import {tetherAt} from '../../campaign/works.js';

// the pen this animal belongs to: the one it had, or the first with room
function penOf(w, a) {
  let b = a.pen != null ? buildingById(w, a.pen) : null;
  if (b && b.done) return b;
  a.pen = null;
  const space = SPECIES.get(a.species).tame.space;
  for (const p of pens(w)) {
    const used = w.agents.filter(o => o.tame && !o.dead && o.pen === p.id).reduce((s, o) => s + SPECIES.get(o.species).tame.space, 0);   // scan: once per pen check of a tame beast; the herd is small
    if (used + space <= BUILDINGS.get(p.key).pen) { a.pen = p.id; return p; }
  }
  return null;
}
const inside = (b, a) => a.x >= b.x && a.y >= b.y && a.x < b.x + b.w && a.y < b.y + b.h;
const same = (a, mode) => (a.task?.id === 'penned' && a.task.mode === mode ? a.task : {id: 'penned', mode});

export const penned = {
  want(w, a) {
    const pen = penOf(w, a);
    if (!pen) return [[same(a, 'camp'), PEN.want.out, () => 'загона нет: держится у лагеря']];
    if (!inside(pen, a)) return [[same(a, 'to'), PEN.want.out, () => 'идёт в загон']];
    return [[same(a, undefined), PEN.want.in, () => 'в загоне']];
  },
  step(w, a, t) {
    recover(a);
    // the pen's rest: up to PEN.mends a tick together with the body's own (a mule mends by itself: agents/brains/tabled.js beastBody)
    const more = PEN.mends - (SPECIES.get(a.species).mends || 0);
    if (more > 0 && a.hp < maxHp(a)) a.hp = Math.min(maxHp(a), a.hp + more * maxHp(a));
    const i = cellOf(w, a);
    if (t.mode === 'camp') {
      // at the caravan's camp with a tether set (campaign/works.js): it stands at the rope, a step this way or that
      const T = w.campaign ? tetherAt(w) : null;
      if (T) {
        const d = Math.hypot(T[0] - a.x, T[1] - a.y), K = CAMP_WORKS.tether.keep;
        if (d > K) approach(w, a, T[0], T[1], PEN.campPace);
        else if (w.rngs.wild() < PEN.stroll) { const ang = w.rngs.wild() * Math.PI * 2; moveToward(w, a, T[0] + Math.cos(ang) * K * CAMP_WORKS.tether.stroll, T[1] + Math.sin(ang) * K * CAMP_WORKS.tether.stroll, PEN.strollPace); }
        return;
      }
      if (w.nav.get('camp')[i] > PEN.campNear) follow(w, a, 'camp', PEN.campPace);
      else if (w.rngs.wild() < PEN.stroll) { const ang = w.rngs.wild() * Math.PI * 2; moveToward(w, a, w.camp.x + Math.cos(ang) * PEN.strollR, w.camp.y + Math.sin(ang) * PEN.strollR, PEN.strollPace); }
      return;
    }
    const pen = penOf(w, a);
    if (!pen) return;
    if (t.mode === 'to') { if (approach(w, a, pen.x + pen.w / 2, pen.y + pen.h / 2, PEN.toPen) === null) follow(w, a, 'camp', PEN.toPen); return; }
    if (!t.spot || w.rngs.wild() < PEN.newSpot) t.spot = [pen.x + PEN.margin + w.rngs.wild() * (pen.w - 2 * PEN.margin), pen.y + PEN.margin + w.rngs.wild() * (pen.h - 2 * PEN.margin)];
    if (Math.hypot(t.spot[0] - a.x, t.spot[1] - a.y) > PEN.there) moveToward(w, a, t.spot[0], t.spot[1], PEN.pace);
  },
};
