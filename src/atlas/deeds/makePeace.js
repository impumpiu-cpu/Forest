// Peace: a war that has worn the two down (the attitude back up to DIPLOMACY.peaceAt) or gone on for `longest` years is
// ended by whichever of the two thinks of it first; the attitude settles at `afterPeace`. The red lane: a weary realm
// makes peace before it does anything else this season, and its armies on the march turn home (atlas/diplomacy.js armyDay).
import {DIPLOMACY as D} from '../../data/diplomacy.js';
import {realmLabel} from '../realms.js';
import {relationsOf} from './realm.js';

const cap1 = s => s[0].toUpperCase() + s.slice(1);
const yearsWord = y => (y % 10 === 1 && y % 100 !== 11 ? 'года' : 'лет');

export const makePeace = {
  want(a, realm) {
    const out = [];
    for (const {kk, r, other} of relationsOf(a, realm)) {
      if (!r.war) continue;
      const years = a.hist.year - r.war.since;
      if (r.att >= D.peaceAt || years >= D.longest) out.push([{kk, other: other.id}, 1, () => (years >= D.longest ? `война (${realmLabel(a, other.id)}) идёт ${years} ${yearsWord(years)}` : `устали от войны: ${realmLabel(a, other.id)}`)]);
    }
    return out.length ? out : null;
  },
  act(a, realm, plan) {
    const r = a.rel[plan.kk];
    if (!r?.war) return null;
    const years = a.hist.year - r.war.since;
    r.war = null; r.att = D.afterPeace;
    return `${cap1(realmLabel(a, realm.id))} и ${realmLabel(a, plan.other)} заключили мир после ${years} ${yearsWord(years)} войны.`;
  },
};
