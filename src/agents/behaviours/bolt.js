// Bolt: run from fire, or from what the species fears (`flee.from` within `flee.radius`); a shot that
// whistled past keeps it running for a while (`spooked`, agents/jobRunners.js). A herd beast trusts
// its herd's lookouts (agents/wildHerd.js): it runs at the herd's alarm by its own nerve and distance.
// Other behaviours offer the task too (scare: a predator from fire or a crowd), with what to run from
// and how fast in the task itself. Reads: flee {radius, sprint, from, stamina}; herd (optional).
import {SPECIES} from '../../data/species.js';
import {escapeHeat, bolt as run, sprintMul, shunsHeat} from '../movement.js';
import {herdOf, herdAlarm, bolts, threatsNear} from '../wildHerd.js';
import {hpShare} from '../agent.js';
import {GRAZE, WANT} from '../../data/behaviour.js';

export const bolt = {
  want(w, a, {sp, T}) {
    if (shunsHeat(w, a, sp, T, GRAZE.fireNear)) return [[{id: 'bolt', mode: 'fire'}, WANT.fire, () => 'огонь рядом']];
    const H = herdOf(w, a);
    if (H) {
      const al = herdAlarm(w, H);
      if ((al && bolts(w, a, al, sp)) || a.spooked > 0) return [[{id: 'bolt', mode: 'herd'}, WANT.threat, () => (al ? 'тревога стада' : 'напуган')]];
      return null;
    }
    if (threatsNear(w, a, sp.flee.radius, sp.flee.from).length || a.spooked > 0) return [[{id: 'bolt'}, WANT.threat, () => 'опасность рядом']];
    return null;
  },
  // a herd beast remembers when it last ran (agents/wildHerd.js stragglers); fire is no alarm of the herd
  enter(w, a, t) { if (t.mode !== 'fire') a.boltAt = w.tick; },
  step(w, a, t) {
    const F = SPECIES.get(a.species).flee;
    if (t.mode === 'fire') { escapeHeat(w, a, t.pace ?? F.sprint); return; }
    // from what another behaviour named (scare): a crowd of people
    if (t.mode === 'from') { run(w, a, t.from.filter(o => !o.dead), sprintMul(a, t.sprint, t.drain)); return; }
    a.spooked = Math.max(0, (a.spooked || 0) - 1);
    if (t.mode === 'herd') {
      const al = herdAlarm(w, herdOf(w, a));
      // a wounded one cannot keep up: it falls behind the herd
      run(w, a, al ? al.threats : threatsNear(w, a, 10, F.from), sprintMul(a, F.sprint, F.stamina) * (GRAZE.hurtPace + (1 - GRAZE.hurtPace) * hpShare(a)));
      return;
    }
    const threats = threatsNear(w, a, F.radius, F.from);
    run(w, a, threats.length ? threats : threatsNear(w, a, 10, F.from), sprintMul(a, F.sprint, F.stamina));
  },
};
