// Fight back: whoever hurts the nechist and stays close gets it — a leshy fights one on one (the shared `maul` task
// in the `strike` mode), but a rusalka dives and a leshy slips into the thicket when `crowd` colonists close in
// (hide in the `deep` mode; the vanishing itself happens in `pick`). Reads: spirit {dives?, crowd?}.
import {SPECIES} from '../../data/species.js';
import {log} from '../../core/log.js';
import {HOUR} from '../../core/time.js';
import {nearAgents} from '../spatial.js';
import {foeOf, dist, Label} from '../nechist.js';
import {NECHIST} from '../../data/behaviour.js';

export const fightBack = {
  want(w, a, {sp}) {
    const S = sp.spirit, foe = foeOf(w, a);
    if (!foe) return null;
    const crowd = nearAgents(w, a.x, a.y, NECHIST.crowdNear).filter(o => o.faction === 'colony' && !o.dead && dist(o, a) < NECHIST.crowdNear).length;
    if (S.dives || crowd >= (S.crowd || NECHIST.crowd)) return [[{id: 'hide', mode: 'deep', vanish: true}, NECHIST.want.dive, () => (S.dives ? 'ранена: уходит под воду' : 'их много: в чащу')]];
    return [[{id: 'maul', mode: 'strike', target: foe}, NECHIST.want.strike, () => `ранен: бьёт ${foe.name}`]];
  },
  // taken: gone from sight for an hour or two
  pick(w, a, t) {
    if (!t.vanish) return;
    const sp = SPECIES.get(a.species), S = sp.spirit;
    a.hiddenUntil = w.tick + (S.dives ? NECHIST.hidden.dive : NECHIST.hidden.melt) * HOUR; a.hurtBy = null; a.veil = 0;
    log(w, S.dives ? `${Label(sp)} ушла под воду.` : `${Label(sp)} растворился в чаще.`, 'wildlife');
  },
};
