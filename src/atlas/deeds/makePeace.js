// Peace: a war that has worn the two down (the attitude back up to DIPLOMACY.peaceAt) or gone on for `longest` years is
// ended by whichever of the two thinks of it first; the attitude settles at `afterPeace`. The red lane: a weary realm
// makes peace before it does anything else this season, and its armies on the march turn home (atlas/diplomacy.js armyDay).
// A realm losing its war (DIPLOMACY.peace, after Emberfall's treaties: its might down to `ratio` of its foe's, or cornered in a
// town or two) sues for peace: a truce of `truce` years, and it pays the winner tribute out of its surplus for `tribute` years.
import {cap1, plural} from '../../core/util.js';
import {DIPLOMACY as D} from '../../data/diplomacy.js';
import {realmLabel} from '../realms.js';
import {relationsOf} from './realm.js';
import {might, townFx} from '../towns.js';

// the might of a realm: its towns' (atlas/towns.js might), and how many towns it holds
const mightOf = (a, id) => { let m = 0, n = 0; for (const t of a.towns || []) if (t.alive && t.realm === id) { m += might(t, townFx(t)); n++; } return [m, n]; };

const yearsWord = y => (y % 10 === 1 && y % 100 !== 11 ? 'года' : 'лет');

export const makePeace = {
  want(a, realm) {
    const out = [];
    for (const {kk, r, other} of relationsOf(a, realm)) {
      if (!r.war) continue;
      const years = a.hist.year - r.war.since;
      if (r.war.cult) { if (a.hist.year >= r.war.cult.until) out.push([{kk, other: other.id}, 1, () => 'подрались — пора и подлечиться']); continue; }   // a war of the greenskins' cult ends when it ends
      if (r.att >= D.peaceAt || years >= D.longest) { out.push([{kk, other: other.id}, 1, () => (years >= D.longest ? `война (${realmLabel(a, other.id)}) идёт ${years} ${yearsWord(years)}` : `устали от войны: ${realmLabel(a, other.id)}`)]); continue; }
      // losing it: sue for peace
      if (years >= D.peace.minYears) {
        const [mine, n] = mightOf(a, realm.id), [theirs] = mightOf(a, other.id);
        if (n > 0 && (mine <= D.peace.ratio * theirs || n <= D.peace.cornered)) out.push([{kk, other: other.id, lose: true}, 1, () => `проигрывают войну: ${realmLabel(a, other.id)} сильнее`]);
      }
    }
    return out.length ? out : null;
  },
  act(a, realm, plan) {
    const r = a.rel[plan.kk];
    if (!r?.war) return null;
    const years = a.hist.year - r.war.since;
    const cult = r.war.cult;
    r.war = null; r.att = cult ? cult.att : D.afterPeace; r.peaceAt = a.hist.year;   // (a war for its own sake leaves no grudge)
    if (cult) return `${cap1(realmLabel(a, realm.id))} и ${realmLabel(a, plan.other)} разошлись после ${years} ${yearsWord(years)} драки — без обид.`;
    if (plan.lose) {
      r.truce = a.hist.year + D.peace.truce; r.owe = {from: realm.id, to: plan.other, until: a.hist.year + D.peace.tribute};
      return `${cap1(realmLabel(a, realm.id))} запросили мира у «${realmLabel(a, plan.other)}» после ${years} ${yearsWord(years)} войны: перемирие на ${D.peace.truce} ${plural(D.peace.truce, 'год', 'года', 'лет')} и дань на ${D.peace.tribute} ${plural(D.peace.tribute, 'год', 'года', 'лет')}.`;
    }
    return `${cap1(realmLabel(a, realm.id))} и ${realmLabel(a, plan.other)} заключили мир после ${years} ${yearsWord(years)} войны.`;
  },
};
