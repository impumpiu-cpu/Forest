// Mule brain: a big grazer that stands its ground. It does not run from people or wolves:
//   - whoever comes close and attacks gets kicked (a heavy, slow blow);
//   - whoever hurts it from afar (an arrow, a sling stone) gets charged: it runs at them and the
//     first blow after the run lands harder; it keeps the grudge for a while, unless they get away;
//   - badly hurt, it limps off, and only then do wolves dare to go for it (data/species.js, weakPrey).
// A pack mule ({owner: id}) walks behind its trader and carries the caravan's crates (a.load units);
// when its trader is gone it heads for the map edge. A wild one grazes and now and then wanders off.
// All numbers come from the species' `mule` block in data/species.js.
import {SPECIES} from '../../data/species.js';
import {TERRAIN} from '../../data/terrain.js';
import {nightness} from '../../core/time.js';
import {cellOf, walkable, inBounds} from '../../world/grid.js';
import {approach, escapeHeat, nearFire, bolt, follow, sprintMul, recover, shunsHeat} from '../movement.js';
import {damage} from '../combat.js';
import {kill, maxHp} from '../agent.js';
import {season} from '../../data/seasons.js';
import {log} from '../../core/log.js';
import {esc} from '../../core/util.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const byId = (w, id) => w.agents.find(o => o.id === id && !o.dead);

// who it is angry with: someone attacking it right now, or whoever hurt it lately and is still near
function foeOf(w, a, M) {
  let foe = null, bd = 3;
  for (const o of w.agents) {
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
  damage(w, a, t, (0.1 + w.rng() * 0.12) * atk.power * (charging ? M.chargeHit : 1));
}

function graze(w, a, sp) {
  const t = a.task?.id === 'graze' ? a.task : (a.task = {id: 'graze'});
  if (!t.spot || w.rng() < 0.006) {
    const ok = new Set((sp.mule?.terrain || ['grass']).map(id => TERRAIN.get(id).code));
    const reach = w.rng() < 0.1 ? 24 : 6;
    let bestV = -Infinity;
    for (let k = 0; k < 10; k++) {
      const x = a.x + (w.rng() * 2 - 1) * reach, y = a.y + (w.rng() * 2 - 1) * reach;
      if (!inBounds(w, x | 0, y | 0)) continue;
      const j = (y | 0) * w.w + (x | 0);
      if (!walkable(w, j) || !ok.has(w.grid.terr[j]) || w.zone[j]) continue;   // keeps off the settlement
      const v = w.grid.fert[j] + Math.min(8, x, y, w.w - x, w.h - y) * 0.1 + w.rng() * 0.3;
      if (v > bestV) { bestV = v; t.spot = [x, y]; }
    }
  }
  if (t.spot && approach(w, a, t.spot[0], t.spot[1], 0.4) !== false) t.spot = null;
}

export const muleBrain = {
  id: 'mule',
  step(w, a) {
    const sp = SPECIES.get(a.species), M = sp.mule, i = cellOf(w, a), T = w.grid.temp[i];
    if (a.cd > 0) a.cd--;
    if (T > sp.heatHarm) { a.hp -= Math.min(0.01, (T - sp.heatHarm) * 0.0001); if (a.hp <= 0) { kill(w, a, 'огня'); return; } }
    if (shunsHeat(w, a, sp, T, 2)) { a.task = {id: 'bolt'}; escapeHeat(w, a, 1.3); return; }

    const foe = foeOf(w, a, M);
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
    if (a.task?.id === 'leave' || w.rng() < M.leaveChance || (sp.hibernates && season(w).id === 'winter')) {
      a.task = {id: 'leave'};
      if (follow(w, a, 'edge') === 'arrived') a.gone = true;
      return;
    }
    if (nightness(w.tick) > 0.75) { a.task = {id: 'rest'}; return; }
    // a herder holding out hay: it stops and lets them come
    if (w.agents.some(o => o.task?.tame === a.id && o.task.calm && (o.x - a.x) ** 2 + (o.y - a.y) ** 2 < 9)) { a.task = {id: 'graze'}; return; }
    graze(w, a, sp);
  },
};
