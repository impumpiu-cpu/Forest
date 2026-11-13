// The tasks of raiders and other bands from outside (agents/tasks.js registers them in order): to the stores, away
// with the loot, a torch to a wall, the band's healer and shooter, scouts, the mindless dead.
import {maxHp} from '../agent.js';
import {BUILDINGS} from '../../data/buildings.js';
import {cellOf, distToCell} from '../../world/grid.js';
import {follow, moveToward, approach, recover} from '../movement.js';
import {kindle} from '../combat.js';
import {throwTorch, spendThrow} from '../equipment.js';
import {plunder, lootTotal} from '../../settlement/stock.js';
import {log} from '../../core/log.js';
import {squadOf, noteHome, SQUAD} from '../squad.js';
import {liveById} from '../lookup.js';
import {TACTICS, TASK} from '../../data/behaviour.js';
import {dressWound, stabilize} from '../wounds.js';
import {CONDITIONS} from '../../data/conditions.js';
import {done, fail, mill, campMill} from './common.js';

// a function declaration, so that agents/tasks.js can call it even when this file is the one loaded first
export function raidTasks() {
  return [
    {id: 'assault', label: () => 'идёт к складу', step(w, a) {
      if (follow(w, a, 'camp') !== 'arrived') return;
      const got = plunder(w), took = lootTotal(got);
      if (took > 0.5 && w.tick - w.stats.lastSteal > 40) log(w, 'Налётчики грабят склад.', 'danger');
      if (took > 0) a.loot = got;   // carried off on its back: whoever brings it down takes it back
      w.stats.lastSteal = w.tick; a.looted = true; a.task = {id: 'leave'};
    }},
    // a guard at its spot by the post of a place stormed (agents/squad.js holdPlan): walks there and stands
    {id: 'holdPost', label: () => 'держит логово', step(w, a, t) {
      if (Math.hypot(t.x - a.x, t.y - a.y) <= SQUAD.hold.slack) { recover(a); return; }
      if (approach(w, a, t.x, t.y) === null) { t.x = a.x; t.y = a.y; }   // (no way there: here is its spot)
    }},
    // leaving the map for good: raiders with their loot, and any beast that wanders off (agents/behaviours/leave.js)
    {id: 'leave', label: () => 'уходит', step(w, a, t) {
      recover(a);
      if (follow(w, a, 'edge', t.pace ?? 1) !== 'arrived') return;
      a.gone = true; noteHome(w, a);
      if (a.leads != null) { const l = liveById(w, a.leads); if (l?.ledBy === a.id) l.ledGone = true; }   // the one it leads (agents/behaviours/led.js) is gone with it, whatever the order of their steps
      if (a.loot) { const b = w.behave?.board; if (b) b.lootLost = (b.lootLost || 0) + lootTotal(a.loot); a.loot = null; }   // gone for good
    }},
    // a torch-bearer of a band that came to burn (agents/squad.js): to the camp, then to the building, and
    // a fire under its wall
    {id: 'torch', label: () => 'несёт факел', step(w, a, task) {
      const b = w.buildings.find(x => x.id === task.b && x.done), sq = squadOf(w, a);
      if (!b || !sq || sq.lit != null) { done(w, a); return; }
      if (w.nav.get('camp')[cellOf(w, a)] > TASK.torch.near) { follow(w, a, 'camp'); return; }
      let best = null, bd = Infinity;
      for (const c of b.cells) { const d = Math.hypot((c % w.w) + 0.5 - a.x, ((c / w.w) | 0) + 0.5 - a.y); if (d < bd) { bd = d; best = c; } }
      if (best == null) { done(w, a); return; }
      // a torch in hand flies from as far as it is thrown (quality `thrown`); without one the fire is put to the wall
      const T = throwTorch(a), far = T ? T.range : SQUAD.burnNear;
      if (bd > far) { if (approach(w, a, (best % w.w) + 0.5, ((best / w.w) | 0) + 0.5) === null) fail(w, a, 'к постройке не подойти', 'impossible'); return; }
      if (T) spendThrow(a, T);
      kindle(w, best);
      sq.lit = w.tick;
      log(w, `${a.name} ${T ? (a.gender === 'f' ? 'метнула факел и подожгла' : 'метнул факел и поджёг') : a.gender === 'f' ? 'подожгла' : 'поджёг'} ${BUILDINGS.get(b.key).name.toLowerCase()}! Тушите!`, 'danger', 'notice');
      a.task = {id: 'leave'};
    }},
    // a torch thrown on the way (agents/behaviours/raid.js): at the wall of a wooden building close by, then the band's plan again
    {id: 'hurlTorch', label: () => 'бросает факел', step(w, a, task) {
      const T = throwTorch(a), i = task.cell;
      if (!T || i == null || !w.buildings.some(b => b.done && b.cells.includes(i))) { done(w, a); return; }
      if (distToCell(w, a, i) > T.range) { done(w, a); return; }
      spendThrow(a, T); kindle(w, i);
      const b = w.buildings.find(x => x.cells.includes(i));
      log(w, `${a.name} ${a.gender === 'f' ? 'метнула' : 'метнул'} факел в ${BUILDINGS.get(b.key).name.toLowerCase()}! Тушите!`, 'danger', 'notice');
      done(w, a);
    }},
    // a shooter or a healer of a band steps back from a blade coming at it (agents/tactics.js); a short while, then the
    // band's plan says again
    {id: 'kite', label: () => 'отходит, держит дистанцию', step(w, a, task) {
      const f = liveById(w, task.from);
      task.since ??= w.tick;
      if (!f || f.downed || w.tick - task.since > TACTICS.kiteFor || Math.hypot(f.x - a.x, f.y - a.y) > TACTICS.kite * TACTICS.kiteOut) { a.kitedAt = w.tick; done(w, a); return; }
      const dx = a.x - f.x, dy = a.y - f.y, L = Math.hypot(dx, dy) || 1;
      if (moveToward(w, a, a.x + dx / L * TACTICS.kiteStep, a.y + dy / L * TACTICS.kiteStep) === null) { a.kitedAt = w.tick; done(w, a); }   // a wall at its back: stand and fight (TACTICS.kiteRest)
    }},
    // a band's healer (agents/tactics.js): to the fallen one, dress the wound (agents/wounds.js) — or a potion for one
    // badly hurt
    {id: 'mend', label: t => (t.potion ? 'несёт зелье раненому' : 'перевязывает своего'), step(w, a, task) {
      const b = liveById(w, task.who);
      task.since ??= w.tick;
      // gone, up again, already going home, or too long after it: the healer gives it up
      if (!b || b.gone || b.task?.id === 'leave' || w.tick - task.since > TACTICS.mend.chase || (task.potion ? !(a.potions > 0) || b.downed : !b.downed)) { done(w, a); return; }
      if (Math.hypot(b.x - a.x, b.y - a.y) > TACTICS.mendReach) { task.work = 0; if (approach(w, a, b.x, b.y) === null) fail(w, a, 'к своему не подойти', 'impossible'); return; }
      if ((task.work = (task.work || 0) + 1) < (task.potion ? TACTICS.mend.potionTicks : TACTICS.mend.ticks)) return;
      if (task.potion) { a.potions--; b.hp = Math.min(maxHp(b), b.hp + CONDITIONS.get('potHeal').heal); b.flash = 4; }   // the healing potion of its slot
      else {
        if (b.faction === 'colony') { stabilize(w, a, b); done(w, a); return; }   // one of ours: the colony's own dressing (thoughts, the chronicle)
        dressWound(w, b, a.skill?.medicine || 0); b.task = null;
        b.hp = Math.max(b.hp, TACTICS.mend.standUp * maxHp(b));   // on its feet enough to fight on, not to be sent home at once
        const sq = squadOf(w, b); if (sq && b.fellNoted) { b.fellNoted = false; sq.fallen = Math.max(0, sq.fallen - 1); }   // not a loss of the band any more
        log(w, `${a.name} ${a.gender === 'f' ? 'перевязала' : 'перевязал'} упавшего: ${b.name} снова на ногах.`, 'danger');
      }
      done(w, a);
    }},
    // scouts: come within sight of the camp, look it over, and take the news home
    {id: 'scout', label: () => 'высматривает лагерь', step(w, a, task) {
      const sq = squadOf(w, a);
      if (!sq) { done(w, a); return; }
      if (w.nav.get('camp')[cellOf(w, a)] > SQUAD.scoutNear) { follow(w, a, 'camp', 0.8); return; }
      sq.watched ??= w.tick;
      mill(w, a, task, TASK.mill.scout);
    }},
    // the mindless dead: shamble to the camp and wander there until something living comes close
    {id: 'haunt', label: () => 'бредёт к лагерю', step(w, a, task) {
      if (!w.agents.some(o => o.faction === 'colony' && !o.dead)) { a.task = {id: 'leave'}; return; }   // scan: leavers only: the colony has fallen
      campMill(w, a, task, ...TASK.mill.haunt);
    }},
  ];
}
