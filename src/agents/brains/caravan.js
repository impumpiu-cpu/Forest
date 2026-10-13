// Caravan brain: the trader and the guards (pack mules have their own brain, mule.js).
// The visit's phase (settlement/trade.js) says what to do:
//   coming   — the trader walks toward the camp and stops a few cells short of the fire;
//   camp, trading, night — it stays at that spot, the guards stand around it;
//   leaving  — everyone walks off to the map edge.
// Guards answer anyone who goes for the caravan (a wolf, an angry mule); the trader never fights.
// Caravan people bring their own food and bedding: their needs do not run down.
import {SPECIES} from '../../data/species.js';
import {cellOf} from '../../world/grid.js';
import {approach, escapeHeat, nearFire, follow, moveToward} from '../movement.js';
import {nearestHostile} from '../combat.js';
import {TASKS} from '../tasks.js';
import {kill} from '../agent.js';

// how close to the camp fire the caravan sets up (cells along the camp flow field)
const CAMP_AT = 6;

const byId = (w, id) => w.agents.find(o => o.id === id && !o.dead);

function leave(w, a) {
  a.task = {id: 'leave'};
  if (follow(w, a, 'edge') === 'arrived') a.gone = true;
}

export const caravanBrain = {
  id: 'caravan',
  step(w, a) {
    const sp = SPECIES.get(a.species), T = w.grid.temp[cellOf(w, a)];
    if (a.cd > 0) a.cd--;
    if (T > sp.heatHarm) { a.hp -= Math.min(0.006, (T - sp.heatHarm) * 0.00005); if (a.hp <= 0) { kill(w, a, 'огня'); return; } }
    if (T > 50 || nearFire(w, a, 1.5)) { escapeHeat(w, a); return; }
    if (a.hp < (a.maxHp || sp.hp)) a.hp = Math.min(a.maxHp || sp.hp, a.hp + 0.0002);

    const c = w.caravan;
    if (!c || c.id !== a.caravan || c.phase === 'leaving') { leave(w, a); return; }
    const trader = byId(w, c.traderId);

    if (a.role === 'guard') {
      // anyone going for the caravan within reach gets the guards on them
      const e = nearestHostile(w, a, 9) || w.agents.find(o => !o.dead && o.task?.target?.caravan === c.id && (o.task.id === 'maul' || o.task.id === 'chase') && Math.hypot(o.x - a.x, o.y - a.y) < 12);
      if (e) {
        if (a.task?.id !== 'fight' || a.task.target !== e) a.task = {id: 'fight', target: e};
        TASKS.get('fight').step(w, a, a.task);
        if (!a.task) a.task = {id: 'escort'};
        return;
      }
      a.task = {id: 'escort'};
      if (!trader) { leave(w, a); return; }
      const k = a.slot ?? 0, ang = k * Math.PI + 0.8;
      const tx = trader.x + Math.cos(ang) * 1.3, ty = trader.y + Math.sin(ang) * 1.3;
      if (Math.hypot(tx - a.x, ty - a.y) > 0.5 && approach(w, a, tx, ty, Math.hypot(trader.x - a.x, trader.y - a.y) > 4 ? 1.25 : 1) === null) approach(w, a, trader.x, trader.y);
      return;
    }

    // the trader
    if (c.phase === 'coming') {
      a.task = {id: 'travel'};
      const d = w.nav.get('camp')[cellOf(w, a)];
      // wait for the slow mules now and then, so the caravan arrives together
      const late = w.agents.some(o => o.caravan === c.id && !o.dead && Math.hypot(o.x - a.x, o.y - a.y) > 6);
      if (d <= CAMP_AT) { c.arrived = w.tick; c.spot = [a.x, a.y]; return; }
      if (!late && follow(w, a, 'camp', 0.9) === 'none') { c.arrived = w.tick; c.spot = [a.x, a.y]; }
      return;
    }
    a.task = {id: c.phase === 'trading' ? 'stall' : c.phase === 'night' ? 'night' : 'camped'};
    if (c.spot) moveToward(w, a, c.spot[0], c.spot[1], 0.5);
  },
};
