// Healing. Wounds close by themselves slowly (agents/body.js). A wounded colonist with a healer's
// hut goes to lie there (task 'treat'); a colonist working the 'heal' job tends whoever lies there:
//   each tick a patient gets HEAL.rate × the healer's work rate back, HEAL.noHerbs of that without herbs;
//   every HEAL.perHerb of health healed with herbs uses up one herb from the stock.
// With nobody to tend the healer picks herbs (the job's harvest fields, data/jobs.js 'heal').
import {maxHp} from '../agents/agent.js';
import {BUILDINGS} from '../data/buildings.js';
import {cellOf} from '../world/grid.js';
import {colonists} from './query.js';
import {perTick} from '../core/util.js';
import {freeSlot} from './reserve.js';
import {HEAL} from '../data/colony.js';

export {HEAL};   // (data/colony.js)
export const hurt = a => a.hp < maxHp(a) * HEAL.seekBelow;

// The hut's beds are reservations 'bed:<hut id>:<k>' (settlement/reserve.js): a wounded colonist takes
// one before setting out, so nobody walks there to find every bed taken.
// the healer's hut: the one building the wounded lie in (data/buildings.js); systems ask these, not its id
export const HUT = 'healerhut';
export const hutOf = w => w.buildings.find(b => b.key === HUT && b.done);
export const hasHut = w => has(w, HUT);
export const bedsOf = () => BUILDINGS.get(HUT).beds || 2;
export const freeBed = (w, a) => { const b = hutOf(w); return b ? freeSlot(w, 'bed:' + b.id, bedsOf(), a) : null; };

// who lies in the hut now: those lying in a bed of their own
export const patients = w => perTick(w, 'patients', () => colonists(w).filter(a => a.task?.id === 'treat' && a.task.lying && a.task.bed));

// colonists who need the healer: lying in the hut or on their way there
export const waiting = w => colonists(w).filter(a => a.task?.id === 'treat').length;

// one tick of the healer's care, spread over everyone lying in the hut; returns health given
export function tend(w, healer, rate) {
  const ps = patients(w); if (!ps.length) return 0;
  let given = 0;
  for (const p of ps) {
    const herbs = (w.stock.herbs || 0) >= 1 || (w.herbCredit || 0) > 0;
    const amount = Math.min(maxHp(p) - p.hp, HEAL.rate * rate * (herbs ? 1 : HEAL.noHerbs) / Math.max(1, ps.length * 0.6));
    if (amount <= 0) continue;
    p.hp += amount; given += amount;
    p.task.healer = healer.id;
    if (herbs) {
      // herbs are used up as the health they give is spent
      w.herbCredit = (w.herbCredit || 0) - amount;
      if (w.herbCredit <= 0 && (w.stock.herbs || 0) >= 1) { w.stock.herbs -= 1; w.herbCredit += HEAL.perHerb; }
    }
  }
  return given;
}

export const healerHutCell = (w, a) => w.grid.bld[cellOf(w, a)] >= 0 && w.buildings.some(b => b.key === HUT && b.done && b.id === w.grid.bld[cellOf(w, a)]);
