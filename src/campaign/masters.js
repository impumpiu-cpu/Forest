// Masters in the campaign (docs/CAPTIVES.md, stage 3; data/masters.js). The caravan's evening council names a
// master of a craft as the settlement's does: the free member best at it, once the skill its camps taught it
// (m.local.skill) reaches MASTER.min. On the local map a master is a master (campaign/camp.js), and its
// learners — the caravan's captives among them — work beside it there.
import {MASTERS, MASTER} from '../data/masters.js';
import {SKILLS} from '../data/skills.js';

const skillOf = (m, id) => m.local?.skill?.[id] ?? 0;

export function nameCaravanMasters(K, say) {
  const free = K.members.filter(m => m.alive && !m.captive);
  for (const M of MASTERS.all()) {
    if (free.some(m => m.master?.skill === M.id)) continue;
    let best = null;
    for (const m of free) if (!m.master && skillOf(m, M.id) >= MASTER.min && (!best || skillOf(m, M.id) > skillOf(best, M.id))) best = m;
    if (!best) continue;
    best.master = {skill: M.id, since: K.day};
    say(`Совет каравана нарёк мастером-${M.ins}: ${best.name} (${SKILLS.get(M.id).label} — ${Math.round(skillOf(best, M.id) * 100)}).`, 'people', [best.id]);
  }
}
