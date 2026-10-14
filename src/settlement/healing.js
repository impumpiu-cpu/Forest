// Healing. Wounds close by themselves slowly (agents/body.js). A wounded colonist with a healer's
// hut goes to lie there (task 'treat'); a colonist working the 'heal' job tends whoever lies there:
//   each tick a patient gets HEAL.rate × the healer's work rate back, HEAL.noHerbs of that without herbs;
//   every HEAL.perHerb of health healed with herbs uses up one herb from the stock.
// With nobody to tend the healer picks herbs (the job's harvest fields, data/jobs.js 'heal').
import {BUILDINGS} from '../data/buildings.js';
import {SPECIES} from '../data/species.js';
import {cellOf} from '../world/grid.js';
import {has, colonists} from './query.js';
import {perTick} from '../core/util.js';

export const HEAL = {
  seekBelow: 0.75,  // a colonist this hurt (share of health) goes to the healer's hut…
  until: 0.97,      // …and stays until healed this far
  rate: 0.0022,     // health per tick a patient gets from a healer working at speed 1
  noHerbs: 0.4,     // without herbs the healer manages this share of it
  perHerb: 0.35,    // health healed per herb used
};

const maxHp = a => a.maxHp || SPECIES.get(a.species).hp;
export const hurt = a => a.hp < maxHp(a) * HEAL.seekBelow;

// who lies in the hut now (at most as many as it has beds)
export const patients = w => perTick(w, 'patients', () => {
  if (!has(w, 'healerhut')) return [];
  const beds = BUILDINGS.get('healerhut').beds || 2;
  return colonists(w).filter(a => a.task?.id === 'treat' && a.task.lying).slice(0, beds);
});

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

export const healerHutCell = (w, a) => w.grid.bld[cellOf(w, a)] >= 0 && w.buildings.some(b => b.key === 'healerhut' && b.done && b.id === w.grid.bld[cellOf(w, a)]);
