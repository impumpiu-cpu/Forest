// The healing potion (data/potions.js POTION): one with potions in its slot (a.potions) drinks one by itself when its
// health falls below POTION.below while still on its feet — right after the blow (agents/combat.js damage) or at a tick
// of poison or bleeding (agents/body.js stepEffects). The fallen, the dead and the bound drink nothing.
import {maxHp} from './agent.js';
import {log} from '../core/log.js';
import {POTION} from '../data/potions.js';

export function quaff(w, a) {
  if (!(a.potions > 0) || a.dead || a.downed || a.captive || a.hp <= 0) return false;
  const full = maxHp(a);
  if (a.hp >= POTION.below * full) return false;
  a.potions--; a.hp = Math.min(full, a.hp + POTION.heal); a.flash = 4;
  const st = w.chronicle.potions ||= {drunk: 0, ours: 0}; st.drunk++; if (a.faction === 'colony') st.ours++;
  if (a.faction === 'colony' && a.name) log(w, `${a.name} ${a.gender === 'f' ? 'выпила' : 'выпил'} зелье лечения${a.potions ? ` (осталось ${a.potions})` : ''}.`, 'people');
  return true;
}
