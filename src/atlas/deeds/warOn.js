// War: a realm whose standing with a neighbour has sunk to DIPLOMACY.warAt declares war — when they border (shared land,
// or towns within the front). Who may: every people but those whose row leaves the deed out (the elves answer a war,
// they do not start one). The war's first move is the declarer's (march.js).
import {cap1} from '../../core/util.js';
import {DIPLOMACY as D} from '../../data/diplomacy.js';
import {newWar} from '../diplomacy.js';
import {realmLabel} from '../realms.js';
import {relationsOf} from './realm.js';
import {WORLD_PEOPLES} from '../../data/peoples.js';
import {SEASONS_PER_YEAR} from '../../data/atlas.js';

const cultOf = realm => WORLD_PEOPLES.get(realm.people)?.warCult || null;


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
    // the cult fights its own kind too: with no realm of its own people at its border, it goes for the nearest of them
    if (C && ctx.r) {
      const kin = relationsOf(a, realm).filter(x => x.other.people === realm.people);
      if (kin.length && !kin.some(x => x.r.border || x.r.war)) {
        const mine = a.towns.filter(t => t.alive && t.realm === realm.id), dist = o => { let d = Infinity; for (const t of mine) for (const u of a.towns) if (u.alive && u.realm === o.id) d = Math.min(d, Math.hypot(t.x - u.x, t.y - u.y)); return d; };
        const near = kin.map(x => [x, dist(x.other)]).filter(([, d]) => d < Infinity).sort((p, q) => p[1] - q[1])[0]?.[0];
        if (near && a.hist.year - (near.r.peaceAt ?? -Infinity) >= C.rest && ctx.r() < C.chance / SEASONS_PER_YEAR) out.push([{kk: near.kk, other: near.other.id, cult: true, far: true}, 1, () => `${realmLabel(a, near.other.id)}: свои, ближе всех`]);
      }
    }
    return out.length ? out : null;
  },
  act(a, realm, plan, ctx = {}) {
    const r = a.rel[plan.kk];
    if (!r || r.war) return null;
    newWar(a, r, realm.id);
    if (plan.cult) {
      const Y = cultOf(realm).years, rnd = ctx.r();   // (a war of the cult is planned only with the stream at hand)
      r.war.cult = {until: a.hist.year + Y[0] + Math.floor(rnd * (Y[1] - Y[0] + 1)), att: r.att, ...(plan.far ? {far: true} : {})};   // (far: no border — its armies march to the nearest town anyway)
      return `Без всякой вражды, просто чтобы подраться: ${realmLabel(a, realm.id)} и ${realmLabel(a, plan.other)} — началась война.`;
    }
    return `${cap1(realmLabel(a, realm.id))} и ${realmLabel(a, plan.other)} не поделили ${r.kin ? 'власть' : 'земли'}: началась война.`;
  },
};
