// Liberation (data/slavery.js SLAVE.liberate): the dwarves keep no slaves and go to war over none — but for their own kin.
// A town of a realm of a people that frees its captives (SLAVE.frees) goes against the nearest town of another realm that
// holds its kin as slaves (t.slavesOf, atlas/deeds/captives.js) or a lair that holds them captive (lair.captives), within
// reach: against a realm it is war (the standing falls; a war already on goes on). The town's might against the other's,
// with luck: the freed come to the town as free people; a loss costs the town some of its people.
import {townBeatsLair} from '../lairs.js';
import {cap1} from '../../core/util.js';
import {SLAVE, freesCaptives} from '../../data/slavery.js';
import {addHeads, killShare} from '../population.js';
import {DIPLOMACY as D} from '../../data/diplomacy.js';
import {WORLD_PEOPLES} from '../../data/peoples.js';
import {LAIRS} from '../../data/lairs.js';
import {SPECIES} from '../../data/species.js';
import {SEASONS_PER_YEAR} from '../../data/atlas.js';
import {townLabel} from '../towns.js';
import {fight, meet} from '../diplomacy.js';
import {realmLabel} from '../realms.js';
import {scaleOf} from '../tectonics.js';
import {liveTowns} from './realm.js';

const kin = (held, people) => Math.floor(held?.[people] || 0);

export const liberate = {
  want(a, realm, {r}) {
    if (!freesCaptives(realm.people)) return null;
    const L = SLAVE.liberate, k = scaleOf(a), reach = D.raidReach * L.reach * k, out = [];
    if (r() > L.chance / SEASONS_PER_YEAR) return null;
    for (const t of liveTowns(a, realm)) {
      let best = null, bd = reach;
      for (const o of a.towns) if (o.alive && o.realm !== realm.id && kin(o.slavesOf, realm.people) >= L.least) { const d = Math.hypot(t.x - o.x, t.y - o.y); if (d < bd) { bd = d; best = {town: o.id}; } }
      for (const l of a.lairs || []) if (l.alive && kin(l.captives, realm.people) >= L.least) { const d = Math.hypot(t.x - l.x, t.y - l.y); if (d < bd) { bd = d; best = {lair: l.id}; } }
      if (best) { out.push([{from: t.id, ...best}, 1, () => `${t.name}: рядом в неволе братья-${realm.people === 'dwarves' ? 'дварфы' : 'сородичи'}`]); break; }
    }
    return out.length ? out : null;
  },
  act(a, realm, plan, {r}) {
    const L = SLAVE.liberate, t = a.towns.find(x => x.id === plan.from); if (!t?.alive) return null;
    const P = realm.people, us = cap1(realmLabel(a, realm.id));
    if (plan.town != null) {
      const o = a.towns.find(x => x.id === plan.town); if (!o?.alive) return null;
      const n = kin(o.slavesOf, P); if (!n) return null;
      // against a realm: war, if it is not on already
      const y = a.hist.year, rel = o.realm ? meet(a, realm.id, o.realm, y) : null;
      let begun = '';
      if (rel) { rel.att = Math.max(-5, rel.att - L.att); if (!rel.war) { rel.war = {since: y, battles: 0, razed: 0, turn: realm.id, mustered: null}; rel.wars = (rel.wars || 0) + 1; begun = ` За братьев началась война с ${realmLabel(a, o.realm)}.`; } }
      if (fight(t, r) > fight(o, r)) {
        o.slaves = Math.max(0, (o.slaves || 0) - n); o.slavesOf[P] = 0;
        const home = Math.round(n * L.home); addHeads(a, t, WORLD_PEOPLES.get(P).race, home, 1);
        return `${us} из ${townLabel(t, 2)} ${t.name} пошли освобождать братьев из ${townLabel(o, 2)} ${o.name}${o.realm ? ` (${realmLabel(a, o.realm)})` : ''}: ${home} вернулись свободными.${begun}`;
      }
      killShare(a, t, L.loss, 'war');
      return `${us} из ${townLabel(t, 2)} ${t.name} не смогли отбить своих рабов у ${townLabel(o, 2)} ${o.name}: отступили с потерями.${begun}`;
    }
    const l = (a.lairs || []).find(x => x.id === plan.lair); if (!l?.alive) return null;
    const n = kin(l.captives, P); if (!n) return null;
    const owner = SPECIES.get(LAIRS.get(l.kind).species);
    if (townBeatsLair(t, l, r)) {
      delete l.captives[P];
      const home = Math.round(n * L.home); addHeads(a, t, WORLD_PEOPLES.get(P).race, home, 1);
      return `${us} из ${townLabel(t, 2)} ${t.name} вызволили сородичей из полона в «${l.name}»: ${home} вернулись домой.`;
    }
    killShare(a, t, L.loss, 'war');
    return `${us} из ${townLabel(t, 2)} ${t.name} ходили за пленными братьями в «${l.name}», но ${owner.plural} отбились.`;
  },
};
