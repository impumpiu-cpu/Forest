// Clearing a lair: a town goes against a lair whose territory reaches it (data/peoples.js TOWN_WAR: within the lair's
// radius + `reach`, with the year's chance spread over the seasons) — a calamity's boss's lair is beyond one town
// (atlas/alliance.js). The town's might × TOWN_WAR.might against the lair's strength × its owner's body, with luck on
// both sides: the lair is burnt out, or the town pays `raidLoss` of its people and a work.
import {LAIRS} from '../../data/lairs.js';
import {TOWN_WAR} from '../../data/peoples.js';
import {SEASONS_PER_YEAR} from '../../data/atlas.js';
import {SPECIES} from '../../data/species.js';
import {townFx, might, raidShare, townLabel} from '../towns.js';
import {raidGraves} from '../diplomacy.js';
import {raidSite} from '../sites.js';
import {realmLabel} from '../realms.js';
import {BURNT} from '../peoples.js';
import {scaleOf} from '../tectonics.js';
import {liveTowns} from './realm.js';

const cap1 = s => s[0].toUpperCase() + s.slice(1);

export const clearLair = {
  want(a, realm, {r}) {
    const out = [], k = scaleOf(a);
    for (const l of a.lairs || []) {
      if (!l.alive || l.boss != null || l.hidden) continue;   // a hidden lair must be found first (atlas/deeds/scout.js)
      const L = LAIRS.get(l.kind), reach = (L.radius + TOWN_WAR.reach) * k;
      for (const t of liveTowns(a, realm)) {
        if (Math.hypot(t.x - l.x, t.y - l.y) > reach || r() > TOWN_WAR.chance / SEASONS_PER_YEAR) continue;
        out.push([{town: t.id, lair: l.id}, 1, () => `${L.label} «${l.name}» достаёт до ${t.name}`]);
        break;   // one town of the realm a lair a season
      }
    }
    return out.length ? out : null;
  },
  act(a, realm, plan, {r}) {
    const l = a.lairs.find(x => x.id === plan.lair), t = a.towns.find(x => x.id === plan.town);
    if (!l?.alive || !t?.alive) return null;
    const L = LAIRS.get(l.kind), owner = SPECIES.get(L.species), s = owner.special, W = TOWN_WAR;
    const fx = townFx(t), town = might(t, fx) * W.might * (W.luck[0] + W.luck[1] * r()), beast = l.strength * ((s.S[0] + s.S[1]) / 2 + (s.E[0] + s.E[1]) / 2) * (W.luck[0] + W.luck[1] * r());
    if (town > beast) {
      l.alive = false; l.died = a.hist.year; l.clearedBy = t.id;
      return `${cap1(realmLabel(a, realm.id))} из ${townLabel(t, 2)} ${t.name} выжгли ${L.labelAcc || L.label} «${l.name}»: ${owner.plural} больше не тревожат их земли.`;
    }
    const loss = W.raidLoss * raidShare(fx);
    t.pop *= 1 - loss; t.raided = a.hist.year; raidGraves(a, t);
    const burnt = raidSite(a, t, r);
    return `${cap1(owner.plural)} ${L.from} «${l.name}» напали на ${townLabel(t, 1)} ${t.name}: погибло ${Math.round(loss * 100)}% жителей${burnt ? `, ${BURNT[burnt.g]} ${burnt.name}` : ''}.`;
  },
};
