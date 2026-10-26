// War: a realm whose standing with a neighbour has sunk to DIPLOMACY.warAt declares war — when they border (shared land,
// or towns within the front). Who may: every people but those whose row leaves the deed out (the elves answer a war,
// they do not start one). The war's first move is the declarer's (march.js).
import {DIPLOMACY as D} from '../../data/diplomacy.js';
import {realmLabel} from '../realms.js';
import {relationsOf} from './realm.js';

const cap1 = s => s[0].toUpperCase() + s.slice(1);

export const warOn = {
  want(a, realm) {
    const out = [];
    for (const {kk, r, other} of relationsOf(a, realm)) {
      if (r.war || r.att > D.warAt || !r.border) continue;
      out.push([{kk, other: other.id}, 1, () => `${realmLabel(a, other.id)}: отношение ${r.att.toFixed(1)}, общая граница`]);
    }
    return out.length ? out : null;
  },
  act(a, realm, plan) {
    const r = a.rel[plan.kk];
    if (!r || r.war) return null;
    r.war = {since: a.hist.year, battles: 0, razed: 0, turn: realm.id, mustered: null}; r.wars++;
    return `${cap1(realmLabel(a, realm.id))} и ${realmLabel(a, plan.other)} не поделили ${r.kin ? 'власть' : 'земли'}: началась война.`;
  },
};
