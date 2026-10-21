// Mule brain: a big grazer that stands its ground. It does not run from people or wolves:
//   - whoever comes close and attacks gets kicked (a heavy, slow blow);
//   - whoever hurts it from afar (an arrow, a sling stone) gets charged: it runs at them and the
//     first blow after the run lands harder; it keeps the grudge for a while, unless they get away;
//   - badly hurt, it limps off, and only then do wolves dare to go for it (data/species.js, weakPrey).
// A pack mule ({owner: id}) walks behind its trader and carries the caravan's crates (a.load units);
// when its trader is gone it heads for the map edge. A wild one grazes and now and then wanders off.
// All numbers come from the species' `mule` block in data/species.js.
// An elk lives in a small herd (agents/wildHerd.js): it grazes on the herd's pasture; when one of the
// herd is attacked, a bold bull (its own nerve) goes for the attacker, the rest draw off; at the herd's
// alarm they stand alert and step away from whatever comes too close.
import {SPECIES} from '../../data/species.js';
import {grazeCodes} from '../../data/terrain.js';
import {nightness} from '../../core/time.js';
import {cellOf, walkable, inBounds, inMap} from '../../world/grid.js';
import {approach, escapeHeat, nearFire, bolt, follow, sprintMul, recover, shunsHeat, sameLand} from '../movement.js';
import {damage} from '../combat.js';
import {kill, maxHp} from '../agent.js';
import {season} from '../../data/seasons.js';
import {log} from '../../core/log.js';
import {esc} from '../../core/util.js';
import {tempAt} from '../../world/heat.js';
import {liveById} from '../lookup.js';
import {herdOf, herdAlarm, toPatch, nerveOf, calmHerders} from '../wildHerd.js';
import {hpShare} from '../agent.js';
// a bull this bold (agents/wildHerd.js nerve) stands up for its herd
const BULL = 1.15;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const byId = liveById;

// who it is angry with: someone attacking it right now, or whoever hurt it lately and is still near
function foeOf(w, a, M) {
  let foe = null, bd = 3;
  for (const o of w.agents) {   // scan: mules and boars only, a handful per map
    if (o === a || o.dead || o.task?.target !== a || !(o.task.id === 'maul' || o.task.id === 'chase' || o.task.id === 'fight')) continue;
    const d = dist(a, o); if (d < bd) { bd = d; foe = o; }
  }
  if (foe) return foe;
  const h = a.hurtBy;
  if (!h || w.tick - h.tick > M.grudge) return null;
  const o = byId(w, h.id);
  return o && dist(a, o) < M.giveUp ? o : null;
}

// a kick: the species' blow, harder at the end of a charge
function kick(w, a, t, M, charging) {
  if (a.cd > 0) return;
  const atk = SPECIES.get(a.species).attack;
  a.cd = atk.cooldown; a.flash = 4;
  damage(w, a, t, (0.1 + w.rngs.wild() * 0.12) * atk.power * (charging ? M.chargeHit : 1));
}

function graze(w, a, sp) {
  const t = a.task?.id === 'graze' ? a.task : (a.task = {id: 'graze'});
  if (!t.spot || w.rngs.wild() < 0.006) {
    const ok = grazeCodes(sp.mule?.terrain || ['grass']);
    const reach = w.rngs.wild() < 0.1 ? 24 : 6;
    let bestV = -Infinity;
    for (let k = 0; k < 10; k++) {
      const x = a.x + (w.rngs.wild() * 2 - 1) * reach, y = a.y + (w.rngs.wild() * 2 - 1) * reach;
      if (!inMap(w, x, y)) continue;
      const j = (y | 0) * w.w + (x | 0);
      if (!walkable(w, j) || !ok.has(w.grid.terr[j]) || w.zone[j] || !sameLand(w, a, j)) continue;   // keeps off the settlement
      const v = w.grid.fert[j] + Math.min(8, x, y, w.w - x, w.h - y) * 0.1 + w.rngs.wild() * 0.3;
      if (v > bestV) { bestV = v; t.spot = [x, y]; }
    }
  }
  if (t.spot && approach(w, a, t.spot[0], t.spot[1], 0.4) !== false) t.spot = null;
}

export const muleBrain = {
  id: 'mule',
  step(w, a) {
    const sp = SPECIES.get(a.species), M = sp.mule, i = cellOf(w, a), T = tempAt(w, i);
    if (a.cd > 0) a.cd--;
    if (T > sp.heatHarm) { a.hp -= Math.min(0.01, (T - sp.heatHarm) * 0.0001); if (a.hp <= 0) { kill(w, a, 'огня'); return; } }
    if (shunsHeat(w, a, sp, T, 2)) { a.task = {id: 'bolt'}; escapeHeat(w, a, 1.3); return; }

    const H = herdOf(w, a);
    // a bold, healthy bull stands up for one of its herd under attack
    let foe = foeOf(w, a, M);
    if (!foe && H && nerveOf(w, a) >= BULL && hpShare(a) > 0.6) {
      for (const id of H.members) {
        const m = id !== a.id ? byId(w, id) : null;
        const f = m && dist(m, a) < 12 ? foeOf(w, m, M) : null;
        if (f) { foe = f; if (!a.defends) { a.defends = m.id; } break; }
      }
    }
    if (!foe) a.defends = null;
    if (foe) {
      const d = dist(a, foe);
      // badly hurt: limp away, but still kick whoever is right at its flank
      if (a.hp < maxHp(a) * M.fleeBelow && d > M.kickRange) { a.task = {id: 'bolt'}; bolt(w, a, [foe], 0.9); return; }
      const t = a.task?.id === 'maul' && a.task.target === foe ? a.task : (a.task = {id: 'maul', target: foe, mule: true});
      if (d > M.kickRange) {
        if (a.hurtBy?.far && d > M.chargeFrom && !t.charging) {
          t.charging = true;
          if (foe.faction === 'colony') log(w, `${sp.label[0].toUpperCase() + sp.label.slice(1)} несётся на <b>${esc(foe.name)}</b>: стрелять в него было ошибкой.`, 'danger', 'notice');
        }
        if (approach(w, a, foe.x, foe.y, t.charging ? sprintMul(a, M.charge, 0.004) : 1.15) === null) a.hurtBy = null;   // cannot get there: forget it
      } else { kick(w, a, foe, M, t.charging); t.charging = false; }
      return;
    }
    recover(a);
    if (a.hp < maxHp(a)) a.hp = Math.min(maxHp(a), a.hp + 0.00025 * maxHp(a));   // wounds close slowly

    // a pack mule walks behind its trader; without one it goes home
    if (a.owner != null) {
      const o = byId(w, a.owner);
      if (!o) { a.task = {id: 'leave'}; if (follow(w, a, 'edge') === 'arrived') a.gone = true; return; }
      a.task = {id: 'pack'};
      const k = a.slot ?? 0, ang = 2.4 + k * 0.9;
      const tx = o.x + Math.cos(ang) * 1.6, ty = o.y + Math.sin(ang) * 1.6;
      if (Math.hypot(tx - a.x, ty - a.y) > 0.6 && approach(w, a, tx, ty, dist(a, o) > 4 ? 1.3 : 1) === null) approach(w, a, o.x, o.y, 1.2);
      return;
    }

    // a bear goes to its den for the winter
    if (a.task?.id === 'leave' || w.rngs.wild() < M.leaveChance || (sp.hibernates && season(w).id === 'winter')) {
      a.task = {id: 'leave'};
      if (follow(w, a, 'edge') === 'arrived') a.gone = true;
      return;
    }
    if (nightness(w) > 0.75) { a.task = {id: 'rest'}; return; }
    // a herder holding out hay: it stops and lets them come
    if (calmHerders(w).some(o => o.task.tame === a.id && (o.x - a.x) ** 2 + (o.y - a.y) ** 2 < 9)) { a.task = {id: 'graze'}; return; }
    if (H) {
      // the herd's alarm: stand alert, step away from what comes too close (an elk does not bolt)
      const al = herdAlarm(w, H);
      if (al) {
        const near = al.threats.filter(o => dist(a, o) < sp.herd.alert / nerveOf(w, a));
        if (near.length) { a.task = {id: 'drawOff'}; bolt(w, a, near, 0.8); } else a.task = {id: 'alert'};
        return;
      }
      const t = a.task?.id === 'graze' ? a.task : (a.task = {id: 'graze'});
      toPatch(w, a, H, t, 0.4, approach);
      return;
    }
    graze(w, a, sp);
  },
};
