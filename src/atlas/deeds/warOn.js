// War: a realm whose standing with a neighbour has sunk to DIPLOMACY.warAt declares war — when they border (shared land,
// or towns within the front). Who may: every people but those whose row leaves the deed out (the elves answer a war,
// they do not start one). The war's first move is the declarer's (march.js).
import {DIPLOMACY as D} from '../../data/diplomacy.js';
import {realmLabel} from '../realms.js';
import {relationsOf} from './realm.js';
import {WORLD_PEOPLES} from '../../data/peoples.js';
import {SEASONS_PER_YEAR} from '../../data/atlas.js';

const cultOf = realm => WORLD_PEOPLES.get(realm.people)?.warCult || null;

const cap1 = s => s[0].toUpperCase() + s.slice(1);

export const warOn = {
  want(a, realm, ctx = {}) {
    const out = [], C = cultOf(realm);
    for (const {kk, r, other} of relationsOf(a, realm)) {
      if (r.war || !r.border) continue;
      // the greenskins' cult of war: a fight for its own sake, rested or not, liked or not
      if (C && a.hist.year - (r.peaceAt ?? -Infinity) >= C.rest && ctx.r && ctx.r() < C.chance / SEASONS_PER_YEAR) { out.push([{kk, other: other.id, cult: true}, 1, () => `${realmLabel(a, other.id)}: давно не дрались`]); continue; }
      if (r.att > D.warAt) continue;
      out.push([{kk, other: other.id}, 1, () => `${realmLabel(a, other.id)}: отношение ${r.att.toFixed(1)}, общая граница`]);
    }
    return out.length ? out : null;
  },
  act(a, realm, plan, ctx = {}) {
    const r = a.rel[plan.kk];
    if (!r || r.war) return null;
    r.war = {since: a.hist.year, battles: 0, razed: 0, turn: realm.id, mustered: null}; r.wars++;
    if (plan.cult) {
      const Y = cultOf(realm).years, rnd = ctx.r();   // (a war of the cult is planned only with the stream at hand)
      r.war.cult = {until: a.hist.year + Y[0] + Math.floor(rnd * (Y[1] - Y[0] + 1)), att: r.att};
      return `Без всякой вражды, просто чтобы подраться: ${realmLabel(a, realm.id)} и ${realmLabel(a, plan.other)} — началась война.`;
    }
    return `${cap1(realmLabel(a, realm.id))} и ${realmLabel(a, plan.other)} не поделили ${r.kin ? 'власть' : 'земли'}: началась война.`;
  },
};
