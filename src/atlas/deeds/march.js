// March: in a war the realms take turns to muster an army at the front — the nearest pair of their towns, within
// DIPLOMACY.front — and march on the other's town (atlas/diplomacy.js muster, the army's siege and assault); one army of a
// war at a time, and a realm musters for one war no more than once in ARMY.everyYears years.
import {ARMY} from '../../data/parties.js';
import {muster} from '../diplomacy.js';
import {realmLabel} from '../realms.js';
import {relationsOf, armyOut} from './realm.js';

export const march = {
  want(a, realm) {
    const out = [];
    for (const {kk, r, other} of relationsOf(a, realm)) {
      const W = r.war;
      if (!W || !r.front || W.turn !== realm.id || armyOut(a, kk)) continue;
      if (W.mustered != null && a.hist.year - W.mustered < ARMY.everyYears) continue;
      const [t, o] = r.front, mine = a.towns.find(x => x.id === t)?.realm === realm.id ? [t, o] : [o, t];
      out.push([{kk, from: mine[0], target: mine[1], other: other.id}, 1, () => `война: ${realmLabel(a, other.id)} — наш ход`]);
    }
    return out.length ? out : null;
  },
  act(a, realm, plan, {r, say}) {
    const rel = a.rel[plan.kk], t = a.towns.find(x => x.id === plan.from), target = a.towns.find(x => x.id === plan.target);
    if (!rel?.war || !t?.alive || !target?.alive) return null;
    rel.war.turn = plan.other; rel.war.mustered = a.hist.year;   // the other's move next, whether the army came together or not
    muster(a, t, target, plan.kk, r, say);
    return null;
  },
};
